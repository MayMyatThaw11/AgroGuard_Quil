"""AI Chat history against a real MongoDB (`docker compose up -d mongo`).

Uses a throwaway `agroguard_test` database and skips when MongoDB isn't running.
"""

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from pymongo import AsyncMongoClient
from pymongo.errors import ConnectionFailure

from app.api.v1.endpoints import chat as chat_endpoint
from app.core.config import get_settings
from app.core.security import sign_token
from app.db import mongo
from app.main import app

TEST_DB = "agroguard_test"

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def mongo_db(monkeypatch):
    client = AsyncMongoClient(
        get_settings().mongo_url, serverSelectionTimeoutMS=1500, tz_aware=True
    )
    try:
        await client.admin.command("ping")
    except ConnectionFailure:
        await client.close()
        pytest.skip("MongoDB is not running")
    await client.drop_database(TEST_DB)
    monkeypatch.setattr(mongo, "get_database", lambda: client[TEST_DB])
    monkeypatch.setattr(chat_endpoint, "_indexed", False)

    async def fake_stream(messages, language, on_provider=None):
        yield "Plant in "
        yield "June."

    monkeypatch.setattr(chat_endpoint, "stream_chat", fake_stream)
    yield client[TEST_DB]
    await client.drop_database(TEST_DB)
    await client.close()


@pytest_asyncio.fixture
async def api():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def _ask(api, conversation_id, question, headers=None):
    response = await api.post(
        "/api/v1/chat",
        json={
            "messages": [{"role": "user", "content": question}],
            "language": "en",
            "conversation_id": conversation_id,
        },
        headers=headers or {},
    )
    assert response.status_code == 200
    return response


async def test_each_exchange_is_saved_in_order(mongo_db, api):
    conversation = str(uuid.uuid4())
    await _ask(api, conversation, "When do I plant rice?")
    await _ask(api, conversation, "And beans?")
    history = (
        await api.get("/api/v1/chat/history", params={"conversation_id": conversation})
    ).json()
    assert [m["role"] for m in history] == ["user", "assistant", "user", "assistant"]
    assert history[0]["content"] == "When do I plant rice?"
    assert history[1]["content"] == "Plant in June."
    assert history[2]["content"] == "And beans?"


async def test_conversations_do_not_mix(mongo_db, api):
    first, second = str(uuid.uuid4()), str(uuid.uuid4())
    await _ask(api, first, "one")
    await _ask(api, second, "two")
    history = (await api.get("/api/v1/chat/history", params={"conversation_id": second})).json()
    assert [m["content"] for m in history if m["role"] == "user"] == ["two"]


async def test_no_conversation_id_means_nothing_is_saved(mongo_db, api):
    response = await api.post(
        "/api/v1/chat", json={"messages": [{"role": "user", "content": "hi"}], "language": "en"}
    )
    assert response.status_code == 200
    assert await mongo_db["chat_messages"].count_documents({}) == 0


async def test_signed_in_user_is_recorded(mongo_db, api, monkeypatch):
    monkeypatch.setattr(get_settings(), "jwt_secret", SecretStr("chat-test-secret"))
    conversation = str(uuid.uuid4())
    await _ask(api, conversation, "hello", {"Authorization": f"Bearer {sign_token(7)}"})
    await _ask(api, conversation, "hello again", {"Authorization": "Bearer not-a-token"})
    stored = await mongo_db["chat_messages"].find({"role": "user"}).sort("_id", 1).to_list(10)
    assert [doc["user_id"] for doc in stored] == [7, None]


async def test_history_can_be_deleted(mongo_db, api):
    conversation = str(uuid.uuid4())
    await _ask(api, conversation, "hello")
    deleted = await api.delete("/api/v1/chat/history", params={"conversation_id": conversation})
    assert deleted.status_code == 204
    history = await api.get("/api/v1/chat/history", params={"conversation_id": conversation})
    assert history.json() == []


async def test_bad_conversation_id_is_rejected(mongo_db, api):
    response = await api.get("/api/v1/chat/history", params={"conversation_id": "x"})
    assert response.status_code == 422


async def test_chat_still_answers_when_saving_fails(mongo_db, api, monkeypatch):
    def broken():
        raise RuntimeError("mongo down")

    monkeypatch.setattr(chat_endpoint, "chat_messages", broken)
    response = await _ask(api, str(uuid.uuid4()), "hello")
    assert "Plant in " in response.text and '"done": true' in response.text


async def test_conversation_list_has_title_and_newest_first(mongo_db, api):
    older, newer = str(uuid.uuid4()), str(uuid.uuid4())
    await _ask(api, older, "When do I plant rice?")
    await _ask(api, older, "And beans?")
    await _ask(api, newer, "What is NDVI?")
    listed = (
        await api.get("/api/v1/chat/conversations", params={"ids": f"{older},{newer}"})
    ).json()
    assert [c["conversation_id"] for c in listed] == [newer, older]
    assert listed[1]["title"] == "When do I plant rice?"
    assert listed[1]["questions"] == 2


async def test_conversation_list_only_shows_the_ids_asked_for(mongo_db, api):
    mine, theirs = str(uuid.uuid4()), str(uuid.uuid4())
    await _ask(api, mine, "mine")
    await _ask(api, theirs, "theirs")
    listed = (await api.get("/api/v1/chat/conversations", params={"ids": mine})).json()
    assert [c["title"] for c in listed] == ["mine"]
    assert (await api.get("/api/v1/chat/conversations")).json() == []


async def test_signed_in_user_sees_their_conversations_from_any_browser(mongo_db, api, monkeypatch):
    monkeypatch.setattr(get_settings(), "jwt_secret", SecretStr("chat-test-secret"))
    conversation = str(uuid.uuid4())
    headers = {"Authorization": f"Bearer {sign_token(9)}"}
    await _ask(api, conversation, "from my phone", headers)
    other = {"Authorization": f"Bearer {sign_token(10)}"}
    assert (await api.get("/api/v1/chat/conversations", headers=other)).json() == []
    listed = (await api.get("/api/v1/chat/conversations", headers=headers)).json()
    assert [c["title"] for c in listed] == ["from my phone"]
