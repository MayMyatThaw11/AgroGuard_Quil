import json

import httpx
import pytest

from app.core.config import get_settings
from app.services import llm, topic_guard
from app.services.llm import MAX_HISTORY_MESSAGES, stream_chat
from app.services.topic_guard import REFUSAL_EN, REFUSAL_MY


class FakeProvider:
    """Stands in for the Groq API: answers the topic check and the chat stream."""

    def __init__(self, label: str = "FARMING", guard_status: int = 200) -> None:
        self.label = label
        self.guard_status = guard_status
        self.guard_requests: list[dict] = []
        self.chat_requests: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["model"] == get_settings().llm_topic_guard_model:
            self.guard_requests.append(body)
            if self.guard_status != 200:
                return httpx.Response(self.guard_status)
            return httpx.Response(
                200, json={"choices": [{"message": {"content": self.label}}]}
            )
        self.chat_requests.append(body)
        chunk = {"choices": [{"delta": {"content": "Plant in June."}}]}
        return httpx.Response(200, text=f"data: {json.dumps(chunk)}\n\ndata: [DONE]\n\n")


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AGROGUARD_LLM_API_KEY", "test-key")
    get_settings.cache_clear()
    fake = FakeProvider()
    transport = httpx.MockTransport(fake.handler)

    def client(**kwargs):
        return httpx.AsyncClient(transport=transport, **kwargs)

    monkeypatch.setattr(topic_guard, "AsyncClient", client)
    monkeypatch.setattr(llm, "AsyncClient", client)
    yield fake
    get_settings.cache_clear()


async def _collect(messages: list[dict], language: str = "en") -> str:
    return "".join([chunk async for chunk in stream_chat(messages, language)])


@pytest.mark.asyncio
async def test_off_topic_question_is_refused_without_calling_main_model(provider) -> None:
    provider.label = "OTHER"
    reply = await _collect([{"role": "user", "content": "Who won the football match?"}])

    assert reply == REFUSAL_EN
    assert provider.chat_requests == []


@pytest.mark.asyncio
async def test_burmese_off_topic_question_gets_burmese_refusal(provider) -> None:
    provider.label = "OTHER"
    # UI is set to English, but the question is written in Burmese.
    reply = await _collect([{"role": "user", "content": "ဘောလုံးပွဲ ဘယ်သူနိုင်လဲ"}], "en")

    assert reply == REFUSAL_MY


@pytest.mark.asyncio
async def test_farming_question_reaches_main_model_with_guardrail_prompt(provider) -> None:
    reply = await _collect([{"role": "user", "content": "When should I plant rice?"}])

    assert reply == "Plant in June."
    system_prompt = provider.chat_requests[0]["messages"][0]["content"]
    assert "Only answer questions about farming" in system_prompt


@pytest.mark.asyncio
async def test_burmese_prompt_carries_guardrail(provider) -> None:
    await _collect([{"role": "user", "content": "စပါး ဘယ်အချိန်စိုက်ရမလဲ"}], "my")

    system_prompt = provider.chat_requests[0]["messages"][0]["content"]
    assert "အကြောင်းအရာ စည်းမျဉ်းများ" in system_prompt


@pytest.mark.asyncio
async def test_topic_check_sees_earlier_turns_for_follow_ups(provider) -> None:
    await _collect(
        [
            {"role": "user", "content": "Which fertiliser suits maize?"},
            {"role": "assistant", "content": "Urea or NPK 15-15-15."},
            {"role": "user", "content": "What about the second one?"},
        ]
    )

    transcript = provider.guard_requests[0]["messages"][1]["content"]
    assert "Which fertiliser suits maize?" in transcript
    assert "LATEST user message: What about the second one?" in transcript


@pytest.mark.asyncio
async def test_topic_check_failure_falls_back_to_system_prompt(provider) -> None:
    provider.guard_status = 429
    reply = await _collect([{"role": "user", "content": "When should I plant rice?"}])

    assert reply == "Plant in June."


@pytest.mark.asyncio
async def test_topic_check_can_be_disabled(provider, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGROGUARD_LLM_TOPIC_GUARD_ENABLED", "false")
    get_settings.cache_clear()
    provider.label = "OTHER"
    reply = await _collect([{"role": "user", "content": "Tell me a joke"}])

    assert provider.guard_requests == []
    assert reply == "Plant in June."


@pytest.mark.asyncio
async def test_long_history_is_trimmed(provider) -> None:
    history = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"turn {i}"}
        for i in range(31)
    ]
    await _collect(history)

    sent = provider.chat_requests[0]["messages"]
    assert len(sent) == MAX_HISTORY_MESSAGES + 1  # plus the system prompt
    assert sent[-1]["content"] == "turn 30"
