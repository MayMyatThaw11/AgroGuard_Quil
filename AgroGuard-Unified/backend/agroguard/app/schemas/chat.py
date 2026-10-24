from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

CONVERSATION_ID_PATTERN = r"^[0-9a-fA-F-]{36}$"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    language: Literal["en", "my"] = "en"
    conversation_id: str | None = Field(default=None, pattern=CONVERSATION_ID_PATTERN)


class ConversationSummary(BaseModel):
    conversation_id: str
    title: str
    last_at: datetime
    questions: int


class StoredChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
