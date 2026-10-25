import json

import httpx
import pytest
import pytest_asyncio

from app.core.config import MCPServerConfig
from app.services import mcp_client
from app.services.mcp_client import MCPError
from tests.fake_mcp_server import command


@pytest_asyncio.fixture(autouse=True)
async def clean_sessions():
    mcp_client.reset_sessions()
    yield
    await mcp_client.aclose_sessions()


def stdio_server(name: str = "fake") -> MCPServerConfig:
    return MCPServerConfig(name=name, transport="stdio", command=command(), timeout_s=10)


@pytest.mark.asyncio
async def test_stdio_lists_and_calls_a_tool() -> None:
    cfg = stdio_server()
    tools = await mcp_client.list_tools(cfg)
    assert [tool["name"] for tool in tools] == ["echo"]

    result = await mcp_client.call_tool(cfg, "echo", {"text": "hello"})
    assert result["isError"] is False
    assert mcp_client.result_text(result) == "hello"


@pytest.mark.asyncio
async def test_stdio_unknown_tool_surfaces_the_error() -> None:
    cfg = stdio_server()
    await mcp_client.list_tools(cfg)
    result = await mcp_client.call_tool(cfg, "nope", {})
    assert result["isError"] is True
    assert "unknown tool" in mcp_client.result_text(result)


@pytest.mark.asyncio
async def test_stdio_session_respawns_when_the_server_dies() -> None:
    cfg = stdio_server()
    await mcp_client.list_tools(cfg)
    session = mcp_client._sessions[cfg.name]
    session.proc.kill()
    await session.proc.wait()

    tools = await mcp_client.list_tools(cfg)
    assert [tool["name"] for tool in tools] == ["echo"]


@pytest.mark.asyncio
async def test_stdio_a_command_that_cannot_start_raises() -> None:
    cfg = MCPServerConfig(name="missing", command=["agroguard-no-such-binary"], timeout_s=5)
    with pytest.raises(MCPError):
        await mcp_client.list_tools(cfg)
    assert cfg.name not in mcp_client._sessions


@pytest.mark.asyncio
async def test_stdio_without_a_command_raises() -> None:
    cfg = MCPServerConfig(name="empty")
    with pytest.raises(MCPError, match="no command"):
        await mcp_client.list_tools(cfg)


@pytest.fixture
def use_http(monkeypatch: pytest.MonkeyPatch):
    """Route the client's HTTP transport to an in-process handler."""

    def _use(handler):
        def client(**kwargs):
            return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

        monkeypatch.setattr(mcp_client, "AsyncClient", client)

    return _use


def sse(message: dict) -> httpx.Response:
    body = f"data: {json.dumps(message)}\n\n"
    return httpx.Response(
        200,
        text=body,
        headers={"content-type": "text/event-stream", "mcp-session-id": "s-1"},
    )


@pytest.mark.asyncio
async def test_http_talks_the_streamable_http_dialect(use_http) -> None:
    cfg = MCPServerConfig(
        name="remote", transport="http", url="http://mcp.test/mcp", timeout_s=5
    )

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        method = payload.get("method")
        assert request.headers.get("accept") == "application/json, text/event-stream"
        if method == "initialize":
            assert request.headers.get("mcp-session-id") is None
            return sse(
                {
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {"protocolVersion": "2024-11-05", "serverInfo": {"name": "r"}},
                }
            )
        assert request.headers.get("mcp-session-id") == "s-1"
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "tools/list":
            return sse(
                {
                    "jsonrpc": "2.0",
                    "id": payload["id"],
                    "result": {"tools": [{"name": "soil_query", "description": "soil"}]},
                }
            )
        return sse(
            {
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": {
                    "isError": False,
                    "content": [{"type": "text", "text": "{\"ph\": 6.5}"}],
                },
            }
        )

    use_http(handler)
    tools = await mcp_client.list_tools(cfg)
    assert [tool["name"] for tool in tools] == ["soil_query"]
    result = await mcp_client.call_tool(cfg, "soil_query", {})
    assert json.loads(mcp_client.result_text(result)) == {"ph": 6.5}


@pytest.mark.asyncio
async def test_http_plain_json_reply_works_too(use_http) -> None:
    cfg = MCPServerConfig(name="plain", transport="http", url="http://mcp.test/mcp")

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        if payload.get("method") == "notifications/initialized":
            return httpx.Response(202)
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": payload["id"],
                "result": {"tools": [{"name": "weather_forecast", "description": "wx"}]},
            },
        )

    use_http(handler)
    tools = await mcp_client.list_tools(cfg)
    assert [tool["name"] for tool in tools] == ["weather_forecast"]


@pytest.mark.asyncio
async def test_http_errors_become_mcp_errors(use_http) -> None:
    cfg = MCPServerConfig(name="broken", transport="http", url="http://mcp.test/mcp")
    use_http(lambda request: httpx.Response(500, text="boom"))
    with pytest.raises(MCPError, match="HTTP 500"):
        await mcp_client.list_tools(cfg)


@pytest.mark.asyncio
async def test_ping_reports_reachability_without_raising(use_http) -> None:
    cfg = MCPServerConfig(name="down", transport="http", url="http://mcp.test/mcp")

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    use_http(handler)
    probe = await mcp_client.ping(cfg)
    assert probe["ok"] is False
    assert probe["tool_count"] is None
    assert "refused" in probe["detail"]
