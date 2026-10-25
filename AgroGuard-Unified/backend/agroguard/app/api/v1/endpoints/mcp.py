from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import MCPServerConfig, Settings, get_settings
from app.schemas.mcp import (
    MCPServerStatus,
    MCPToolCallRequest,
    MCPToolCallResponse,
)
from app.services import mcp_client
from app.services.mcp_client import MCPError

router = APIRouter(tags=["mcp"])


def _server(settings: Settings, name: str) -> MCPServerConfig:
    for cfg in settings.mcp_servers:
        if cfg.name == name:
            return cfg
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No MCP server named {name!r} is configured.",
    )


def _target(cfg: MCPServerConfig) -> str:
    return cfg.url if cfg.transport == "http" else " ".join(cfg.command)


@router.get(
    "/mcp/servers",
    response_model=list[MCPServerStatus],
    summary="MCP servers this API can reach, and whether each answers",
)
async def mcp_servers(settings: Annotated[Settings, Depends(get_settings)]):
    return [
        MCPServerStatus(
            name=cfg.name,
            transport=cfg.transport,
            target=_target(cfg),
            **(await mcp_client.ping(cfg)),
        )
        for cfg in settings.mcp_servers
    ]


@router.get(
    "/mcp/servers/{name}/tools",
    summary="Tools one MCP server publishes",
)
async def mcp_tools(name: str, settings: Annotated[Settings, Depends(get_settings)]):
    cfg = _server(settings, name)
    try:
        return await mcp_client.list_tools(cfg)
    except MCPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc


@router.post(
    "/mcp/servers/{name}/tools/{tool}",
    response_model=MCPToolCallResponse,
    summary="Call a tool on one MCP server",
)
async def mcp_call_tool(
    name: str,
    tool: str,
    body: MCPToolCallRequest,
    settings: Annotated[Settings, Depends(get_settings)],
):
    cfg = _server(settings, name)
    try:
        result = await mcp_client.call_tool(cfg, tool, body.arguments)
    except MCPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    return MCPToolCallResponse(
        server=name,
        tool=tool,
        is_error=bool(result.get("isError")),
        text=mcp_client.result_text(result),
        result=result,
    )
