from __future__ import annotations

import asyncio
import threading
import time
from collections import Counter, defaultdict
from collections.abc import Awaitable, Callable, Hashable
from typing import Any, TypeVar

T = TypeVar("T")
EVENTS = ("hit", "miss", "coalesced")

_STATS: defaultdict[str, Counter[str]] = defaultdict(Counter)
_STATS_LOCK = threading.Lock()


def count(source: str, event: str) -> None:
    with _STATS_LOCK:
        _STATS[source][event] += 1


def stats() -> dict[str, dict[str, int]]:
    """Hit, miss and coalesced counts per cache source since start (or the last reset)."""
    with _STATS_LOCK:
        return {name: {e: c[e] for e in EVENTS} for name, c in sorted(_STATS.items())}


def reset_stats() -> None:
    with _STATS_LOCK:
        _STATS.clear()


def _empty(value: Any) -> bool:
    return value is None or (isinstance(value, dict | list | tuple | set | str) and not value)


class _Flight:
    def __init__(self) -> None:
        self.done = threading.Event()
        self.value: Any = None
        self.error: BaseException | None = None


_FLIGHTS: dict[tuple[str, Hashable], _Flight] = {}
_FLIGHTS_LOCK = threading.Lock()


def through(source: str, key: Hashable, read: Callable[[], T | None], fetch: Callable[[], T]) -> T:
    """Cache-aside read that makes one outside call per key at a time.

    `read` returns the fresh cached value or None. `fetch` makes the outside call and stores
    only a good result. Threads that miss while a fetch is running wait and share its result,
    error envelopes and exceptions included, without anything being stored for them.
    """
    found = read()
    if found is not None:
        count(source, "hit")
        return found
    with _FLIGHTS_LOCK:
        flight = _FLIGHTS.get((source, key))
        leader = flight is None
        if flight is None:
            flight = _FLIGHTS[(source, key)] = _Flight()
    if not leader:
        flight.done.wait()
        count(source, "coalesced")
        if flight.error is not None:
            raise flight.error
        return flight.value  # type: ignore[no-any-return]
    try:
        found = read()
        if found is not None:
            count(source, "hit")
            flight.value = found
            return found
        count(source, "miss")
        flight.value = fetch()
        return flight.value  # type: ignore[no-any-return]
    except BaseException as exc:
        flight.error = exc
        raise
    finally:
        with _FLIGHTS_LOCK:
            _FLIGHTS.pop((source, key), None)
        flight.done.set()


class TTLCache:
    """Process-local TTL cache. Empty values are never stored, and concurrent async misses
    for one key share one fetch. Swap for Redis later behind the same interface."""

    def __init__(self, name: str = "memory") -> None:
        self.name = name
        self._store: dict[Hashable, tuple[float, Any]] = {}
        self._pending: dict[Hashable, asyncio.Future[Any]] = {}

    def get(self, key: Hashable) -> Any | None:
        item = self._store.get(key)
        if item is not None and item[0] <= time.monotonic():
            self._store.pop(key, None)
            item = None
        count(self.name, "miss" if item is None else "hit")
        return None if item is None else item[1]

    def set(self, key: Hashable, value: Any, ttl_s: float) -> None:
        if ttl_s <= 0:
            raise ValueError("a cached value needs a positive TTL")
        if not _empty(value):
            self._store[key] = (time.monotonic() + ttl_s, value)

    def delete(self, key: Hashable) -> None:
        self._store.pop(key, None)

    async def get_or_fetch(
        self, key: Hashable, ttl_s: float, fetch: Callable[[], Awaitable[Any]]
    ) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        pending = self._pending.get(key)
        if pending is not None and not pending.done():
            count(self.name, "coalesced")
            return await asyncio.shield(pending)
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending[key] = future
        try:
            value = await fetch()
        except BaseException as exc:
            if isinstance(exc, asyncio.CancelledError):
                future.cancel()
            else:
                future.set_exception(exc)
                future.exception()
            raise
        finally:
            if self._pending.get(key) is future:
                del self._pending[key]
        self.set(key, value, ttl_s)
        future.set_result(value)
        return value

    def clear(self) -> None:
        self._store.clear()
