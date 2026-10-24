from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
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
    # Protects the agronomist photo-review routes (the queue and labelling). Unset means
    # those routes are off: reviewed labels become training data, so they need a gate.
    review_token: SecretStr | None = None
    # Disease advice lists spray kinds only for diseases an agronomist has signed off. Set this to
    # true to list them for every disease too (still no doses, and never a banned ingredient).
    disease_advice_unreviewed_sprays: bool = True
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
    # The chat tries the local model first and falls back to Gemini when it is not
    # running or fails. Leave AGROGUARD_GEMINI_API_KEY blank until you have one.
    llm_local_enabled: bool = True
    llm_local_endpoint: str = "http://127.0.0.1:11434/v1"
    llm_local_model: str = "gemma4:latest"
    llm_local_timeout_s: float = 120.0
    gemini_api_key: SecretStr | None = None
    gemini_endpoint: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    gemini_model: str = "gemini-2.5-flash"
    openweather_api_key: SecretStr | None = None
    openweather_base_url: str = "https://api.openweathermap.org"

    agriquill_api_url: str = "http://localhost:8010"
    agriquill_bridge_token: SecretStr | None = None
    agriquill_bridge_reporter: str = "agroguard-bridge"

    jwt_secret: SecretStr | None = None
    jwt_ttl_minutes: int = 720
    internal_service_key: SecretStr | None = None
    free_farm_limit: int = 3
    billing_mode: Literal["off", "mock"] = "off"
    pro_period_days: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="AGROGUARD_",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("jwt_secret", "internal_service_key", "gemini_api_key", mode="before")
    @classmethod
    def _blank_secret_is_unset(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("review_token", mode="before")
    @classmethod
    def _blank_review_token_is_unset(cls, value: object) -> object:
        # A blank AGROGUARD_REVIEW_TOKEN= must not look like a configured secret.
        return None if isinstance(value, str) and not value.strip() else value


@lru_cache
def get_settings() -> Settings:
    return Settings()

