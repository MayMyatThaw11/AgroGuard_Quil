import json

import httpx
import pytest

from app.core.config import get_settings
from app.services import llm, topic_guard
from app.services.llm import stream_chat
from app.services.topic_guard import REFUSAL_EN

LOCAL_HOST = "127.0.0.1"
GEMINI_HOST = "generativelanguage.googleapis.com"


class FakeModels:
    def __init__(self) -> None:
        self.local_mode = "ok"
        self.gemini_mode = "ok"
        self.label = "FARMING"
        self.calls: list[tuple[str, str]] = []
        self.auth: dict[str, str | None] = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        body = json.loads(request.content)
        is_guard = "topic filter" in body["messages"][0]["content"]
        self.calls.append((host, "guard" if is_guard else "chat"))
        self.auth[host] = request.headers.get("authorization")
        if host == LOCAL_HOST:
            if self.local_mode == "down":
                raise httpx.ConnectError("connection refused", request=request)
            if self.local_mode == "error":
                return httpx.Response(500)
        if host == GEMINI_HOST and self.gemini_mode == "gone" and not is_guard:
            return httpx.Response(404)
        if is_guard:
            return httpx.Response(200, json={"choices": [{"message": {"content": self.label}}]})
        text = "Local answer." if host == LOCAL_HOST else "Gemini answer."
        chunk = {"choices": [{"delta": {"content": text}}]}
        return httpx.Response(200, text=f"data: {json.dumps(chunk)}\n\ndata: [DONE]\n\n")

    def hosts(self, kind: str) -> list[str]:
        return [host for host, what in self.calls if what == kind]


@pytest.fixture
def models(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AGROGUARD_LLM_LOCAL_ENABLED", "true")
    monkeypatch.setenv("AGROGUARD_LLM_LOCAL_MODEL", "gemma4:latest")
    monkeypatch.setenv("AGROGUARD_GEMINI_API_KEY", "gemini-test-key")
    monkeypatch.setenv("AGROGUARD_LLM_API_KEY", "")
    get_settings.cache_clear()
    fake = FakeModels()
    transport = httpx.MockTransport(fake.handler)

    def client(**kwargs):
        return httpx.AsyncClient(transport=transport, **kwargs)

    monkeypatch.setattr(topic_guard, "AsyncClient", client)
    monkeypatch.setattr(llm, "AsyncClient", client)
    yield fake
    get_settings.cache_clear()


async def _ask(text: str = "When should I plant rice?") -> tuple[str, list[str]]:
    used: list[str] = []
    messages = [{"role": "user", "content": text}]
    reply = "".join([c async for c in stream_chat(messages, "en", used.append)])
    return reply, used


@pytest.mark.asyncio
async def test_local_model_answers_first_and_gemini_is_not_called(models) -> None:
    reply, used = await _ask()
    assert reply == "Local answer."
    assert used == ["Local · gemma4:latest"]
    assert GEMINI_HOST not in {host for host, _ in models.calls}
    assert models.auth[LOCAL_HOST] is None


@pytest.mark.asyncio
async def test_gemini_answers_when_the_local_model_is_not_running(models) -> None:
    models.local_mode = "down"
    reply, used = await _ask()
    assert reply == "Gemini answer."
    assert used == ["Gemini · gemini-2.5-flash"]
    assert models.auth[GEMINI_HOST] == "Bearer gemini-test-key"


@pytest.mark.asyncio
async def test_gemini_answers_when_the_local_model_returns_an_error(models) -> None:
    models.local_mode = "error"
    reply, used = await _ask()
    assert reply == "Gemini answer."
    assert used == ["Gemini · gemini-2.5-flash"]


@pytest.mark.asyncio
async def test_off_topic_question_is_refused_once_without_trying_gemini(models) -> None:
    models.label = "OTHER"
    reply, used = await _ask("Who won the football match?")
    assert reply == REFUSAL_EN
    assert used == []
    assert models.hosts("chat") == []


@pytest.mark.asyncio
async def test_clear_message_when_local_is_down_and_no_gemini_key(
    models, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AGROGUARD_GEMINI_API_KEY", "")
    get_settings.cache_clear()
    models.local_mode = "down"
    reply, used = await _ask()
    assert used == []
    assert "Ollama" in reply and "AGROGUARD_GEMINI_API_KEY" in reply


@pytest.mark.asyncio
async def test_without_a_local_model_gemini_is_used_directly(
    models, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AGROGUARD_LLM_LOCAL_ENABLED", "false")
    get_settings.cache_clear()
    reply, used = await _ask()
    assert reply == "Gemini answer."
    assert LOCAL_HOST not in {host for host, _ in models.calls}
    assert used == ["Gemini · gemini-2.5-flash"]


@pytest.mark.asyncio
async def test_message_names_the_reason_when_gemini_also_fails(models) -> None:
    models.local_mode = "down"
    models.gemini_mode = "gone"
    reply, used = await _ask()
    assert used == []
    assert "local: ConnectError" in reply
    assert "gemini: HTTP 404" in reply
    assert "check its key and model name" in reply
