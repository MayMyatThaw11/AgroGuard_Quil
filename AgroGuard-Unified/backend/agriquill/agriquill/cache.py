from __future__ import annotations

import time
from collections.abc import Awaitable, Callable, Hashable
from typing import Any


class TTLCache:
    """Process-local TTL cache. The lake of truth for Beta; swap for Redis
    later behind the same interface without touching callers."""

    def __init__(self) -> None:
        self._store: dict[Hashable, tuple[float, Any]] = {}

    def get(self, key: Hashable) -> Any | None:
        item = self._store.get(key)
        if item is None:
            return None
        expiry, value = item
        if expiry <= time.monotonic():
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: Hashable, value: Any, ttl_s: float) -> None:
        self._store[key] = (time.monotonic() + ttl_s, value)

    async def get_or_fetch(
        self, key: Hashable, ttl_s: float, fetch: Callable[[], Awaitable[Any]]
    ) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = await fetch()
        self.set(key, value, ttl_s)
        return value

    def clear(self) -> None:
        self._store.clear()
