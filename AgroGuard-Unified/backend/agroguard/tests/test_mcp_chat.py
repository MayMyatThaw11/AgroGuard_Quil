import json

import httpx
import pytest
import pytest_asyncio

from app.core.config import get_settings
from app.services import llm, mcp_client, topic_guard
from app.services.llm import stream_chat
from tests.fake_mcp_server import command

MODEL_LABEL = "Local · gemma4:latest"


class FakeChat:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.payloads.append(body)
        if "topic filter" in body["messages"][0]["content"]:
            return httpx.Response(200, json={"choices": [{"message": {"content": "FARMING"}}]})
        if body.get("stream"):
            chunk = {"choices": [{"delta": {"content": "Streamed answer."}}]}
            return httpx.Response(
                200, text=f"data: {json.dumps(chunk)}\n\ndata: [DONE]\n\n"
            )
        if body.get("tools"):
            call = {
                "id": "call-1",
                "type": "function",
                "function": {"name": "echo", "arguments": json.dumps({"text": "ping"})},
            }
            message = {"content": "", "tool_calls": [call]}
            return httpx.Response(200, json={"choices": [{"message": message}]})
        tool_says = [
            m["content"] for m in body["messages"] if m.get("role") == "tool"
        ]
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": f"Tool said: {tool_says[-1]}"}}]},
        )

    def offered_tools(self) -> list[dict]:
        return [p["tools"] for p in self.payloads if p.get("tools")]


@pytest_asyncio.fixture
async def chat(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AGROGUARD_LLM_LOCAL_ENABLED", "true")
    monkeypatch.setenv("AGROGUARD_LLM_LOCAL_MODEL", "gemma4:latest")
    monkeypatch.setenv("AGROGUARD_GEMINI_API_KEY", "")
    monkeypatch.setenv("AGROGUARD_LLM_API_KEY", "")
    monkeypatch.setenv(
        "AGROGUARD_MCP_SERVERS",
        json.dumps([{"name": "farmmap", "command": command(), "timeout_s": 10}]),
    )
    monkeypatch.delenv("AGROGUARD_MCP_CHAT_DENY", raising=False)
    get_settings.cache_clear()
    mcp_client.reset_sessions()
    fake = FakeChat()
    transport = httpx.MockTransport(fake.handler)

    def client(**kwargs):
        return httpx.AsyncClient(transport=transport, **kwargs)

    monkeypatch.setattr(topic_guard, "AsyncClient", client)
    monkeypatch.setattr(llm, "AsyncClient", client)
    monkeypatch.setattr("app.services.mcp_chat.AsyncClient", client)
    yield fake
    await mcp_client.aclose_sessions()
    get_settings.cache_clear()


async def _ask(text: str = "When should I plant rice?") -> tuple[str, list[str]]:
    used: list[str] = []
    messages = [{"role": "user", "content": text}]
    reply = "".join([c async for c in stream_chat(messages, "en", used.append)])
    return reply, used


@pytest.mark.asyncio
async def test_chat_calls_an_mcp_tool_and_answers_with_its_result(chat) -> None:
    reply, used = await _ask()
    assert reply == "Tool said: ping"
    assert used == [MODEL_LABEL]
    offered = chat.offered_tools()
    assert offered
    assert all(
        tool["function"]["name"] == "echo" for tools in offered for tool in tools
    )


@pytest.mark.asyncio
async def test_a_denied_tool_is_never_offered_and_chat_still_answers(
    chat, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AGROGUARD_MCP_CHAT_DENY", '["echo"]')
    get_settings.cache_clear()
    reply, used = await _ask()
    assert reply == "Streamed answer."
    assert used == [MODEL_LABEL]
    assert chat.offered_tools() == []


@pytest.mark.asyncio
async def test_an_unreachable_mcp_server_does_not_break_chat(
    chat, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(
        "AGROGUARD_MCP_SERVERS",
        json.dumps([{"name": "dead", "command": ["agroguard-no-such-binary"]}]),
    )
    get_settings.cache_clear()
    mcp_client.reset_sessions()
    reply, used = await _ask()
    assert reply == "Streamed answer."
    assert used == [MODEL_LABEL]
    assert chat.offered_tools() == []


@pytest.mark.asyncio
async def test_no_mcp_servers_means_the_plain_streaming_path(
    chat, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AGROGUARD_MCP_SERVERS", "[]")
    get_settings.cache_clear()
    reply, used = await _ask()
    assert reply == "Streamed answer."
    assert used == [MODEL_LABEL]
    assert chat.offered_tools() == []
