from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.services.llm_provider_adapter import DEFAULT_ENDPOINTS


@dataclass(frozen=True)
class ChatProvider:
    name: str
    label: str
    endpoint: str
    model: str
    guard_model: str
    api_key: str | None = None
    timeout_s: float = 60.0
    guard_extras: bool = False

    @property
    def url(self) -> str:
        return f"{self.endpoint.rstrip('/')}/chat/completions"

    def headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers


def configured_providers(settings: Settings | None = None) -> list[ChatProvider]:
    """The chat models to try, in order: the local one, then Gemini, then the remote
    provider set by AGROGUARD_LLM_API_KEY. Only the ones that are set up are listed."""
    settings = settings or get_settings()
    providers: list[ChatProvider] = []
    if settings.llm_local_enabled and settings.llm_local_model:
        providers.append(
            ChatProvider(
                name="local",
                label=f"Local · {settings.llm_local_model}",
                endpoint=settings.llm_local_endpoint,
                model=settings.llm_local_model,
                guard_model=settings.llm_local_model,
                timeout_s=settings.llm_local_timeout_s,
            )
        )
    if settings.gemini_api_key is not None:
        providers.append(
            ChatProvider(
                name="gemini",
                label=f"Gemini · {settings.gemini_model}",
                endpoint=settings.gemini_endpoint or DEFAULT_ENDPOINTS["gemini"],
                model=settings.gemini_model,
                guard_model=settings.gemini_model,
                api_key=settings.gemini_api_key.get_secret_value(),
            )
        )
    if settings.llm_api_key is not None and settings.llm_api_key.get_secret_value():
        providers.append(
            ChatProvider(
                name="remote",
                label=f"Remote · {settings.llm_model}",
                endpoint=settings.llm_endpoint,
                model=settings.llm_model,
                guard_model=settings.llm_topic_guard_model,
                api_key=settings.llm_api_key.get_secret_value(),
                guard_extras=True,
            )
        )
    return providers
