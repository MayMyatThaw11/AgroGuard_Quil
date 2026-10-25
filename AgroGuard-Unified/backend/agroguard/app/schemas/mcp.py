from typing import Any, Literal

from pydantic import BaseModel, Field


class MCPServerStatus(BaseModel):
    name: str
    transport: Literal["stdio", "http"]
    target: str
    ok: bool
    tool_count: int | None = None
    detail: str = ""


class MCPToolCallRequest(BaseModel):
    arguments: dict[str, Any] = Field(default_factory=dict)


class MCPToolCallResponse(BaseModel):
    server: str
    tool: str
    is_error: bool = False
    text: str = ""
    result: dict[str, Any] = {}
