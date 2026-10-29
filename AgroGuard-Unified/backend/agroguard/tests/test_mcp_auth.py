import json

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.endpoints.mcp import router as mcp_router
from app.core.config import get_settings
from app.core.security import current_user
from app.services import mcp_client
from tests.fake_mcp_server import command


def build_app(signed_in: bool) -> FastAPI:
    app = FastAPI()
    app.include_router(mcp_router, prefix="/api/v1")
    if signed_in:
        app.dependency_overrides[current_user] = lambda: object()
    return app


@pytest_asyncio.fixture(autouse=True)
async def farmmap_server(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv(
        "AGROGUARD_MCP_SERVERS",
        json.dumps([{"name": "farmmap", "command": command(), "timeout_s": 10}]),
    )
    monkeypatch.setenv("AGROGUARD_MCP_CHAT_DENY", json.dumps(["echo"]))
    get_settings.cache_clear()
    mcp_client.reset_sessions()
    yield
    await mcp_client.aclose_sessions()
    get_settings.cache_clear()


async def call(app: FastAPI, method: str, path: str, body: dict | None = None):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.request(method, path, json=body)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/api/v1/mcp/servers", None),
        ("GET", "/api/v1/mcp/servers/farmmap/tools", None),
        ("POST", "/api/v1/mcp/servers/farmmap/tools/echo", {"arguments": {}}),
    ],
)
async def test_mcp_routes_require_user(method: str, path: str, body: dict | None) -> None:
    response = await call(build_app(signed_in=False), method, path, body)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_mcp_direct_call_refuses_denied_tool() -> None:
    response = await call(
        build_app(signed_in=True),
        "POST",
        "/api/v1/mcp/servers/farmmap/tools/echo",
        {"arguments": {"text": "x"}},
    )
    assert response.status_code == 403
    assert "not allowed" in response.json()["detail"]


@pytest.mark.asyncio
async def test_mcp_direct_call_allows_tool_not_on_deny_list(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGROGUARD_MCP_CHAT_DENY", json.dumps([]))
    get_settings.cache_clear()
    response = await call(
        build_app(signed_in=True),
        "POST",
        "/api/v1/mcp/servers/farmmap/tools/echo",
        {"arguments": {"text": "harvest"}},
    )
    assert response.status_code == 200
