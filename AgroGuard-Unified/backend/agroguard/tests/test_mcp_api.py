import json

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.endpoints.mcp import router as mcp_router
from app.core.config import get_settings
from app.services import mcp_client
from tests.fake_mcp_server import command

app = FastAPI()
app.include_router(mcp_router, prefix="/api/v1")


def _configure(monkeypatch: pytest.MonkeyPatch, servers: list[dict]) -> None:
    monkeypatch.setenv("AGROGUARD_MCP_SERVERS", json.dumps(servers))
    get_settings.cache_clear()


@pytest_asyncio.fixture(autouse=True)
async def farmmap_server(monkeypatch: pytest.MonkeyPatch):
    _configure(monkeypatch, [{"name": "farmmap", "command": command(), "timeout_s": 10}])
    mcp_client.reset_sessions()
    yield
    await mcp_client.aclose_sessions()
    get_settings.cache_clear()


async def get(path: str):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def post(path: str, body: dict):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(path, json=body)


@pytest.mark.asyncio
async def test_servers_lists_the_configured_server_and_reaches_it() -> None:
    response = await get("/api/v1/mcp/servers")
    assert response.status_code == 200
    [server] = response.json()
    assert server["name"] == "farmmap"
    assert server["transport"] == "stdio"
    assert server["ok"] is True
    assert server["tool_count"] == 1


@pytest.mark.asyncio
async def test_tools_lists_what_the_server_publishes() -> None:
    response = await get("/api/v1/mcp/servers/farmmap/tools")
    assert response.status_code == 200
    assert [tool["name"] for tool in response.json()] == ["echo"]


@pytest.mark.asyncio
async def test_call_tool_returns_the_text_and_the_raw_result() -> None:
    response = await post(
        "/api/v1/mcp/servers/farmmap/tools/echo", {"arguments": {"text": "harvest"}}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["server"] == "farmmap"
    assert body["tool"] == "echo"
    assert body["is_error"] is False
    assert body["text"] == "harvest"
    assert body["result"]["content"][0]["text"] == "harvest"


@pytest.mark.asyncio
async def test_an_unconfigured_server_name_is_a_404() -> None:
    assert (await get("/api/v1/mcp/servers/nope/tools")).status_code == 404
    response = await post("/api/v1/mcp/servers/nope/tools/echo", {"arguments": {}})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_server_that_cannot_start_is_a_502(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure(
        monkeypatch, [{"name": "broken", "command": ["agroguard-no-such-binary"]}]
    )
    response = await get("/api/v1/mcp/servers/broken/tools")
    assert response.status_code == 502
    assert "could not be started" in response.json()["detail"]


@pytest.mark.asyncio
async def test_no_mcp_servers_configured_means_an_empty_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure(monkeypatch, [])
    response = await get("/api/v1/mcp/servers")
    assert response.status_code == 200
    assert response.json() == []
