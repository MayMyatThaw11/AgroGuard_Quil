import json
import logging
import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pymongo import ASCENDING

from app.core.security import verify_token
from app.db.mongo import chat_messages
from app.schemas.chat import (
    CONVERSATION_ID_PATTERN,
    ChatRequest,
    ConversationSummary,
    StoredChatMessage,
)
from app.services.llm import stream_chat

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)

HISTORY_LIMIT = 200
CONVERSATION_LIMIT = 50
TITLE_LENGTH = 60
_indexed = False

ConversationId = Annotated[str, Query(pattern=CONVERSATION_ID_PATTERN)]


def _signed_in_user(authorization: str | None) -> int | None:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        return verify_token(token.strip())
    except HTTPException:
        return None


async def _save_exchange(
    conversation_id: str,
    user_id: int | None,
    language: str,
    question: str,
    answer: str,
) -> None:
    global _indexed
    now = datetime.now(UTC)
    base = {"conversation_id": conversation_id, "user_id": user_id, "language": language}
    try:
        if not _indexed:
            await chat_messages().create_index("conversation_id")
            _indexed = True
        await chat_messages().insert_many(
            [
                {**base, "role": "user", "content": question, "created_at": now},
                {**base, "role": "assistant", "content": answer, "created_at": now},
            ]
        )
    except Exception:
        logger.warning("chat history was not saved", exc_info=True)


@router.post("/chat", status_code=status.HTTP_200_OK, summary="Send a chat message")
async def chat(request: ChatRequest, authorization: Annotated[str | None, Header()] = None):
    messages = [{"role": m.role, "content": m.content} for m in request.messages]
    user_id = _signed_in_user(authorization)
    question = messages[-1]["content"] if messages and messages[-1]["role"] == "user" else None

    async def event_stream():
        answer: list[str] = []
        used: list[str] = []
        async for chunk in stream_chat(messages, request.language, used.append):
            answer.append(chunk)
            yield f"data: {json.dumps({'content': chunk, 'done': False})}\n\n"
        if request.conversation_id and question is not None:
            await _save_exchange(
                request.conversation_id, user_id, request.language, question, "".join(answer)
            )
        done = {"content": "", "done": True, "provider": used[0] if used else None}
        yield f"data: {json.dumps(done)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get(
    "/chat/conversations",
    response_model=list[ConversationSummary],
    summary="Past conversations: the ones named in ids, plus all of a signed-in user's",
)
async def chat_conversations(
    authorization: Annotated[str | None, Header()] = None,
    ids: Annotated[str, Query(max_length=2000)] = "",
):
    wanted = [i for i in ids.split(",") if re.fullmatch(CONVERSATION_ID_PATTERN, i)]
    user_id = _signed_in_user(authorization)
    owners: list[dict] = [{"conversation_id": {"$in": wanted[:CONVERSATION_LIMIT]}}]
    if user_id is not None:
        owners.append({"user_id": user_id})
    pipeline = [
        {"$match": {"$or": owners}},
        {"$sort": {"created_at": 1, "_id": 1}},
        {
            "$group": {
                "_id": "$conversation_id",
                "title": {"$first": "$content"},
                "last_at": {"$max": "$created_at"},
                "questions": {"$sum": {"$cond": [{"$eq": ["$role", "user"]}, 1, 0]}},
            }
        },
        {"$sort": {"last_at": -1}},
        {"$limit": CONVERSATION_LIMIT},
    ]
    try:
        rows = await (await chat_messages().aggregate(pipeline)).to_list(length=CONVERSATION_LIMIT)
    except Exception as exc:
        logger.warning("chat conversations could not be read", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat history database (MongoDB) is not reachable.",
        ) from exc
    return [
        ConversationSummary(
            conversation_id=row["_id"],
            title=row["title"][:TITLE_LENGTH],
            last_at=row["last_at"],
            questions=row["questions"],
        )
        for row in rows
    ]


@router.get(
    "/chat/history",
    response_model=list[StoredChatMessage],
    summary="Saved messages of one conversation, oldest first",
)
async def chat_history(conversation_id: ConversationId):
    try:
        cursor = (
            chat_messages()
            .find(
                {"conversation_id": conversation_id},
                {"_id": 0, "role": 1, "content": 1, "created_at": 1},
            )
            .sort([("created_at", ASCENDING), ("_id", ASCENDING)])
            .limit(HISTORY_LIMIT)
        )
        return await cursor.to_list(length=HISTORY_LIMIT)
    except Exception as exc:
        logger.warning("chat history could not be read", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat history database (MongoDB) is not reachable.",
        ) from exc


@router.delete(
    "/chat/history",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete the saved messages of one conversation",
)
async def delete_chat_history(conversation_id: ConversationId) -> None:
    try:
        await chat_messages().delete_many({"conversation_id": conversation_id})
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chat history database (MongoDB) is not reachable.",
        ) from exc
