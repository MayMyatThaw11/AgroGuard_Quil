from __future__ import annotations

import json
import logging
from typing import Any

from httpx import AsyncClient, HTTPStatusError, RequestError

from app.core.config import MCPServerConfig, get_settings
from app.services import mcp_client
from app.services.chat_providers import ChatProvider

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 2
MAX_TOOLS = 24
ANSWER_MAX_TOKENS = 2048


async def _schemas() -> tuple[dict[str, MCPServerConfig], list[dict[str, Any]]]:
    settings = get_settings()
    owners: dict[str, MCPServerConfig] = {}
    tools: list[dict[str, Any]] = []
    for cfg in settings.mcp_servers:
        try:
            listed = await mcp_client.list_tools(cfg)
        except Exception:
            logger.warning(
                "MCP server %s is unreachable; chat continues without its tools",
                cfg.name,
                exc_info=True,
            )
            continue
        for tool in listed:
            name = tool.get("name")
            if not name or name in owners or len(tools) >= MAX_TOOLS:
                continue
            if name in settings.mcp_chat_deny:
                continue
            owners[name] = cfg
            tools.append(
                {
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": tool.get("description") or "",
                        "parameters": tool.get("inputSchema")
                        or {"type": "object", "properties": {}},
                    },
                }
            )
    return owners, tools


async def _complete(
    provider: ChatProvider,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": provider.model,
        "messages": messages,
        "stream": False,
        "temperature": 0.5,
        "max_tokens": ANSWER_MAX_TOKENS,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    async with AsyncClient(timeout=provider.timeout_s) as client:
        response = await client.post(provider.url, json=payload, headers=provider.headers())
    response.raise_for_status()
    choices = response.json().get("choices") or [{}]
    return choices[0].get("message") or {}


async def _run_tool(owners: dict[str, MCPServerConfig], call: dict[str, Any]) -> str:
    function = call.get("function") or {}
    name = function.get("name") or ""
    cfg = owners.get(name)
    if cfg is None:
        return json.dumps({"error": f"tool {name!r} is not available"})
    try:
        arguments = json.loads(function.get("arguments") or "{}")
    except json.JSONDecodeError:
        return json.dumps({"error": "the model sent arguments that are not valid JSON"})
    if not isinstance(arguments, dict):
        return json.dumps({"error": "tool arguments must be a JSON object"})
    try:
        result = await mcp_client.call_tool(cfg, name, arguments)
    except Exception as exc:
        return json.dumps({"error": str(exc)})
    if result.get("isError"):
        return json.dumps({"error": mcp_client.result_text(result) or "the tool reported an error"})
    return mcp_client.result_text(result) or json.dumps(result)


async def answer_with_tools(
    provider: ChatProvider, built_messages: list[dict[str, Any]]
) -> str | None:
    """Answer through the MCP tools when any are configured.

    Returns None when there is nothing to do or the attempt failed, so the
    caller can stream the reply the normal way.
    """
    settings = get_settings()
    if not settings.mcp_servers:
        return None
    owners, tools = await _schemas()
    if not tools:
        return None
    try:
        conversation = list(built_messages)
        for _ in range(MAX_TOOL_ROUNDS):
            message = await _complete(provider, conversation, tools)
            calls = message.get("tool_calls") or []
            if not calls:
                return (message.get("content") or "").strip() or None
            conversation.append(
                {
                    "role": "assistant",
                    "content": message.get("content"),
                    "tool_calls": calls,
                }
            )
            for call in calls:
                conversation.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id") or "",
                        "content": await _run_tool(owners, call),
                    }
                )
        message = await _complete(provider, conversation, None)
        return (message.get("content") or "").strip() or None
    except (HTTPStatusError, RequestError) as error:
        logger.warning("MCP tool chat fell back to streaming (%s)", error)
        return None
    except Exception:
        logger.warning("MCP tool chat failed; falling back to streaming", exc_info=True)
        return None
