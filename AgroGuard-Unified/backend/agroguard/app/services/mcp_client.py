from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from httpx import AsyncClient, HTTPStatusError

from app.core.config import MCPServerConfig

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "2024-11-05"
CLIENT_INFO = {"name": "agroguard", "version": "0.1.0"}


class MCPError(Exception):
    """The MCP server could not be reached, or answered a JSON-RPC error."""


def _request_payload(req_id: int, method: str, params: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}


def _notification(method: str) -> dict[str, str]:
    return {"jsonrpc": "2.0", "method": method}


def _unwrap(message: dict[str, Any], req_id: int) -> dict[str, Any]:
    if message.get("id") != req_id:
        raise MCPError(f"MCP reply id {message.get('id')!r} does not match {req_id}")
    error = message.get("error")
    if error is not None:
        raise MCPError(f"MCP error {error.get('code')}: {error.get('message')}")
    return message.get("result") or {}


class _StdioSession:
    """One spawned MCP server process speaking line-delimited JSON-RPC on stdio."""

    def __init__(self, cfg: MCPServerConfig) -> None:
        self.cfg = cfg
        self.proc: asyncio.subprocess.Process | None = None
        self.loop: asyncio.AbstractEventLoop | None = None
        self.next_id = 0

    @property
    def dead(self) -> bool:
        return self.proc is None or self.proc.returncode is not None

    async def start(self) -> None:
        if not self.cfg.command:
            raise MCPError(f"MCP server {self.cfg.name!r} has no command to run")
        try:
            self.proc = await asyncio.create_subprocess_exec(
                *self.cfg.command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
        except OSError as exc:
            raise MCPError(f"MCP server {self.cfg.name!r} could not be started: {exc}") from exc
        self.loop = asyncio.get_running_loop()
        try:
            await self.request(
                "initialize",
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": CLIENT_INFO,
                },
            )
            await self.send(_notification("notifications/initialized"))
        except Exception:
            await self.stop()
            raise

    async def stop(self) -> None:
        proc, self.proc = self.proc, None
        if proc is None:
            return
        if proc.returncode is None:
            proc.kill()
            try:
                await asyncio.wait_for(proc.wait(), 5)
            except TimeoutError:
                logger.warning("MCP server %s did not exit after kill", self.cfg.name)
        transport = getattr(proc, "_transport", None)
        if transport is not None:
            transport.close()  # release the pipes while this event loop still runs
    async def send(self, payload: dict[str, Any]) -> None:
        if self.dead or self.proc is None or self.proc.stdin is None:
            raise MCPError(f"MCP server {self.cfg.name!r} is not running")
        self.proc.stdin.write((json.dumps(payload) + "\n").encode())
        await self.proc.stdin.drain()

    async def request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self.next_id += 1
        req_id = self.next_id
        await self.send(_request_payload(req_id, method, params))
        if self.proc is None or self.proc.stdout is None:
            raise MCPError(f"MCP server {self.cfg.name!r} has no stdout")
        while True:
            try:
                line = await asyncio.wait_for(
                    self.proc.stdout.readline(), timeout=self.cfg.timeout_s
                )
            except TimeoutError as exc:
                raise MCPError(
                    f"MCP server {self.cfg.name!r} timed out after {self.cfg.timeout_s}s"
                ) from exc
            if not line:
                raise MCPError(f"MCP server {self.cfg.name!r} closed its output")
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if message.get("id") is None:
                continue  # a server notification or log line, not our reply
            if message.get("id") != req_id:
                continue  # a stale reply to an earlier timed-out request
            return _unwrap(message, req_id)


class _HttpState:
    def __init__(self) -> None:
        self.session_id: str | None = None
        self.next_id = 0
        self.initialized = False


_sessions: dict[str, _StdioSession] = {}
_locks: dict[str, asyncio.Lock] = {}
_http: dict[str, _HttpState] = {}


def reset_sessions() -> None:
    """Forget cached transports; tests use it because sessions bind to one event loop."""
    _sessions.clear()
    _locks.clear()
    _http.clear()


async def aclose_sessions() -> None:
    """Stop every cached server process before its event loop goes away."""
    for session in list(_sessions.values()):
        await session.stop()
    reset_sessions()


def _headers(cfg: MCPServerConfig, session_id: str | None) -> dict[str, str]:
    headers = {
        "Accept": "application/json, text/event-stream",
        "Content-Type": "application/json",
        **cfg.headers,
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    return headers


def _decode(status: int, content_type: str, body: str, session_id: str | None) -> dict | None:
    if status in (202, 204) or not body.strip():
        return None
    if "text/event-stream" in content_type:
        message: dict | None = None
        for line in body.splitlines():
            if line.startswith("data: "):
                try:
                    message = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
        if message is None:
            raise MCPError("the MCP server streamed no data")
        return message
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise MCPError(f"the MCP server replied with invalid JSON: {exc}") from exc


async def _http_post(
    cfg: MCPServerConfig, payload: dict[str, Any], state: _HttpState
) -> dict | None:
    async with AsyncClient(timeout=cfg.timeout_s) as client:
        response = await client.post(cfg.url, json=payload, headers=_headers(cfg, state.session_id))
    state.session_id = response.headers.get("mcp-session-id") or state.session_id
    try:
        response.raise_for_status()
    except HTTPStatusError as exc:
        raise MCPError(f"HTTP {response.status_code}: {response.text[:200]}") from exc
    return _decode(
        response.status_code,
        response.headers.get("content-type", ""),
        response.text,
        state.session_id,
    )


async def _http_request(
    cfg: MCPServerConfig, method: str, params: dict[str, Any]
) -> dict[str, Any]:
    state = _http.setdefault(cfg.name, _HttpState())
    if not state.initialized:
        reply = await _http_post(
            cfg,
            _request_payload(
                0,
                "initialize",
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": CLIENT_INFO,
                },
            ),
            state,
        )
        if reply is None:
            raise MCPError(f"MCP server {cfg.name!r} did not answer initialize")
        _unwrap(reply, 0)
        await _http_post(cfg, _notification("notifications/initialized"), state)
        state.next_id = 0
        state.initialized = True
    state.next_id += 1
    req_id = state.next_id
    reply = await _http_post(cfg, _request_payload(req_id, method, params), state)
    if reply is None:
        raise MCPError(f"MCP server {cfg.name!r} sent no reply to {method}")
    try:
        return _unwrap(reply, req_id)
    except MCPError:
        _http.pop(cfg.name, None)  # a stale session: the next call initializes again
        raise


async def _stdio_request(
    cfg: MCPServerConfig, method: str, params: dict[str, Any]
) -> dict[str, Any]:
    lock = _locks.setdefault(cfg.name, asyncio.Lock())
    async with lock:
        session = _sessions.get(cfg.name)
        if session is None or session.dead or session.loop is not asyncio.get_running_loop():
            session = _StdioSession(cfg)
            await session.start()
            _sessions[cfg.name] = session
        try:
            return await session.request(method, params)
        except MCPError:
            await session.stop()
            _sessions.pop(cfg.name, None)
            raise


async def _request(cfg: MCPServerConfig, method: str, params: dict[str, Any]) -> dict[str, Any]:
    if cfg.transport == "http":
        return await _http_request(cfg, method, params)
    return await _stdio_request(cfg, method, params)


async def list_tools(cfg: MCPServerConfig) -> list[dict[str, Any]]:
    result = await _request(cfg, "tools/list", {})
    return list(result.get("tools") or [])


async def call_tool(
    cfg: MCPServerConfig, name: str, arguments: dict[str, Any]
) -> dict[str, Any]:
    return await _request(cfg, "tools/call", {"name": name, "arguments": arguments})


def result_text(result: dict[str, Any]) -> str:
    parts = [
        block.get("text", "")
        for block in result.get("content") or []
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    if not parts and result.get("structuredContent") is not None:
        parts.append(json.dumps(result["structuredContent"]))
    return "".join(parts)


async def ping(cfg: MCPServerConfig) -> dict[str, Any]:
    try:
        tools = await list_tools(cfg)
        return {"ok": True, "tool_count": len(tools), "detail": ""}
    except Exception as exc:  # a probe reports the failure instead of raising it
        return {"ok": False, "tool_count": None, "detail": str(exc)}
