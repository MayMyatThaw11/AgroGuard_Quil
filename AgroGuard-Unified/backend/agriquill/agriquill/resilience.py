from __future__ import annotations

import random
import threading
import time
from collections.abc import Callable
from typing import TypeVar

import httpx

from . import obs

T = TypeVar("T")

BASE_S = 0.5
CAP_S = 20.0
TRANSIENT_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})


class CircuitOpen(Exception):
    pass


def transient(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in TRANSIENT_STATUS
    return isinstance(exc, (httpx.TransportError, ConnectionError, TimeoutError, EOFError))


def retry(
    fn: Callable[[], T],
    attempts: int = 3,
    is_transient: Callable[[Exception], bool] = transient,
    sleep: Callable[[float], None] | None = None,
) -> T:
    pause = sleep or time.sleep
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:
            if attempt == attempts - 1 or not is_transient(exc):
                raise
            delay = min(CAP_S, BASE_S * 2**attempt)
            pause(delay * random.random() if delay else 0.0)
    raise RuntimeError("unreachable")


class Breaker:
    def __init__(self, threshold: int = 5, cooldown_s: float = 60.0, name: str = "outside") -> None:
        self.name = name
        self.threshold = threshold
        self.cooldown_s = cooldown_s
        self._failures = 0
        self._opened_at: float | None = None
        self._lock = threading.Lock()

    def call(self, fn: Callable[[], T], counts: Callable[[Exception], bool] = transient) -> T:
        with self._lock:
            if self._opened_at is not None:
                if time.monotonic() - self._opened_at < self.cooldown_s:
                    raise CircuitOpen("circuit open after repeated failures; try again later")
                self._opened_at = None
        try:
            result = fn()
        except Exception as exc:
            if counts(exc):
                with self._lock:
                    self._failures += 1
                    if self._failures >= self.threshold:
                        self._opened_at = time.monotonic()
            raise
        with self._lock:
            self._failures = 0
        return result

    def state(self) -> dict[str, object]:
        with self._lock:
            opened = self._opened_at
            if opened is not None and time.monotonic() - opened < self.cooldown_s:
                return {
                    "state": "open",
                    "failures": self._failures,
                    "retry_in_s": round(self.cooldown_s - (time.monotonic() - opened), 1),
                }
            return {"state": "closed", "failures": self._failures, "retry_in_s": 0.0}

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            opened, failures = self._opened_at, self._failures
            now = time.monotonic()
        if opened is not None:
            state = "open" if now - opened < self.cooldown_s else "half-open"
        else:
            state = "half-open" if failures >= self.threshold else "closed"
        return {
            "state": state,
            "failures": failures,
            "threshold": self.threshold,
            "opened_at": None if opened is None else round(time.time() - (now - opened), 3),
        }

    def reset(self) -> None:
        with self._lock:
            self._failures = 0
            self._opened_at = None


def guarded(
    breaker: Breaker,
    fn: Callable[[], T],
    attempts: int = 3,
    is_transient: Callable[[Exception], bool] = transient,
) -> T:
    started = time.perf_counter()
    try:
        result = breaker.call(lambda: retry(fn, attempts, is_transient), counts=is_transient)
    except Exception as exc:
        obs.record_outside(breaker.name, (time.perf_counter() - started) * 1000, exc)
        raise
    obs.record_outside(breaker.name, (time.perf_counter() - started) * 1000)
    return result
