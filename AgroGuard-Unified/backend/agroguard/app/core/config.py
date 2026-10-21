from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AgroGuard API"
    app_version: str = "0.1.0"
    environment: Literal["development", "test", "production"] = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/agroguard"
    )
    initialize_database: bool = False
    # Health updates and their photos are stored in MongoDB (GridFS), separate
    # from the PostgreSQL database used by the rest of the API.
    mongo_url: str = "mongodb://localhost:27017"
    mongo_database: str = "agroguard"
    cors_origins: list[str] = ["http://localhost:5173"]

    telegram_bot_token: SecretStr | None = None
    telegram_chat_id: str | None = None
    telegram_polling_enabled: bool = True

    llm_api_key: SecretStr | None = None
    # Groq's free tier, via its OpenAI-compatible API. Any other
    # OpenAI-compatible /chat/completions provider works by changing these.
    llm_endpoint: str = "https://api.groq.com/openai/v1"
    llm_model: str = "openai/gpt-oss-120b"
    # Small, fast model that screens each chat question for farming relevance
    # before the main model answers. Set llm_topic_guard_enabled=false to rely
    # on the system prompt alone.
    llm_topic_guard_enabled: bool = True
    llm_topic_guard_model: str = "openai/gpt-oss-20b"
    openweather_api_key: SecretStr | None = None
    openweather_base_url: str = "https://api.openweathermap.org"

    agriquill_api_url: str = "http://localhost:8010"
    agriquill_bridge_token: SecretStr | None = None
    agriquill_bridge_reporter: str = "agroguard-bridge"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="AGROGUARD_",
        extra="ignore",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

