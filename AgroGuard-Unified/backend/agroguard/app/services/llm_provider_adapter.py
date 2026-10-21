from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any, Literal

from httpx import AsyncClient, HTTPStatusError, RequestError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

ProviderType = Literal["ollama", "openai", "claude", "gemini", "groq", "custom"]

DEFAULT_ENDPOINTS: dict[str, str] = {
    "ollama": "http://localhost:11434/v1",
    "openai": "https://api.openai.com/v1",
    "claude": "https://api.anthropic.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "groq": "https://api.groq.com/openai/v1",
}

DEFAULT_MODELS: dict[str, str] = {
    "ollama": "llama3.1",
    "openai": "gpt-4o-mini",
    "claude": "claude-3-5-haiku-latest",
    "gemini": "gemini-2.0-flash",
    "groq": "llama-3.3-70b-versatile",
}


@dataclass
class ProviderConfig:
    provider: ProviderType = "groq"
    endpoint: str = ""
    api_key: str | None = None
    model: str = ""

    def __post_init__(self) -> None:
        if not self.endpoint:
            self.endpoint = DEFAULT_ENDPOINTS.get(self.provider, "http://localhost:11434/v1")
        if not self.model:
            self.model = DEFAULT_MODELS.get(self.provider, "llama3.1")


def get_default_provider_config() -> ProviderConfig:
    settings = get_settings()
    api_key = settings.llm_api_key.get_secret_value() if settings.llm_api_key else None
    endpoint = settings.llm_endpoint.rstrip("/")
    model = settings.llm_model

    # Determine provider type from endpoint
    provider_type: ProviderType = "groq"
    if "11434" in endpoint or "ollama" in endpoint.lower():
        provider_type = "ollama"
    elif "openai.com" in endpoint:
        provider_type = "openai"
    elif "googleapis.com" in endpoint:
        provider_type = "gemini"
    elif "anthropic.com" in endpoint:
        provider_type = "claude"

    return ProviderConfig(
        provider=provider_type,
        endpoint=endpoint,
        api_key=api_key,
        model=model,
    )


async def ping_provider(config: ProviderConfig) -> dict[str, Any]:
    """Test connectivity and measure round-trip latency to the specified LLM provider."""
    start_time = time.perf_counter()
    endpoint = config.endpoint.rstrip("/")
    url = f"{endpoint}/models" if not endpoint.endswith("/models") else endpoint

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"

    try:
        async with AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers=headers)
            latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
            if resp.status_code in (200, 201):
                data = resp.json()
                models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict)]
                return {
                    "ok": True,
                    "provider": config.provider,
                    "endpoint": endpoint,
                    "model": config.model,
                    "latency_ms": latency_ms,
                    "available_models": models[:8],
                    "message": f"Connected successfully ({latency_ms} ms)",
                }
            elif resp.status_code == 404:
                # Some OpenAI-compatible gateways only support /chat/completions; try a 1-token completion
                test_url = f"{endpoint}/chat/completions"
                test_payload = {
                    "model": config.model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                }
                sub_resp = await client.post(test_url, json=test_payload, headers=headers)
                latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
                if sub_resp.status_code == 200:
                    return {
                        "ok": True,
                        "provider": config.provider,
                        "endpoint": endpoint,
                        "model": config.model,
                        "latency_ms": latency_ms,
                        "message": f"Connected to chat endpoint ({latency_ms} ms)",
                    }
                return {
                    "ok": False,
                    "provider": config.provider,
                    "endpoint": endpoint,
                    "status_code": sub_resp.status_code,
                    "message": f"HTTP {sub_resp.status_code}: {sub_resp.text[:120]}",
                }
            else:
                return {
                    "ok": False,
                    "provider": config.provider,
                    "endpoint": endpoint,
                    "status_code": resp.status_code,
                    "message": f"HTTP {resp.status_code}: {resp.text[:120]}",
                }
    except Exception as e:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
        return {
            "ok": False,
            "provider": config.provider,
            "endpoint": endpoint,
            "latency_ms": latency_ms,
            "message": f"Connection failed: {e}",
        }


async def stream_provider_chat(
    messages: list[dict[str, str]],
    config: ProviderConfig | None = None,
    temperature: float = 0.5,
    max_tokens: int = 1500,
) -> AsyncGenerator[str, None]:
    """Streams chat completions from the configured provider (Ollama, OpenAI, Gemini, Groq, etc.)."""
    cfg = config or get_default_provider_config()
    endpoint = cfg.endpoint.rstrip("/")
    url = f"{endpoint}/chat/completions"

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if cfg.api_key:
        headers["Authorization"] = f"Bearer {cfg.api_key}"

    payload = {
        "model": cfg.model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    try:
        async with AsyncClient(timeout=45.0) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue
    except (HTTPStatusError, RequestError) as e:
        logger.warning("Provider stream failed (%s): %s", cfg.provider, e)
        yield f"\n\n_[Note: Direct LLM streaming unavailable via {cfg.provider} ({e}). Serving verified agricultural knowledge engine analysis below.]_\n\n"
