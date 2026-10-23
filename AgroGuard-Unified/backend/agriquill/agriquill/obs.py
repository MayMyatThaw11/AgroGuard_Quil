from __future__ import annotations

import json
import logging
import threading
import time
from bisect import bisect_left
from typing import Any

BUCKETS_MS = (5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0, 5000.0, 10000.0)
METHODS = frozenset({"GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"})
MAX_KEYS = 512
UNMATCHED = "unmatched"
OVERFLOW = "other"

ACCESS = logging.getLogger("agriquill.access")
OUTSIDE = logging.getLogger("agriquill.outside")
_STARTED = time.monotonic()


def _line(logger: logging.Logger, level: int, fields: dict[str, Any]) -> None:
    if logger.isEnabledFor(level):
        logger.log(level, json.dumps(fields, separators=(",", ":")))


class Histogram:
    def __init__(self) -> None:
        self.buckets = [0] * (len(BUCKETS_MS) + 1)
        self.count = 0
        self.sum_ms = 0.0
        self.max_ms = 0.0

    def add(self, ms: float) -> None:
        self.buckets[bisect_left(BUCKETS_MS, ms)] += 1
        self.count += 1
        self.sum_ms += ms
        self.max_ms = max(self.max_ms, ms)

    def percentile(self, q: float) -> float | None:
        """Upper bound of the bucket holding the q-th sample, capped at the largest seen."""
        if not self.count:
            return None
        rank, seen = q * self.count, 0
        for i, n in enumerate(self.buckets):
            seen += n
            if n and seen >= rank:
                bound = BUCKETS_MS[i] if i < len(BUCKETS_MS) else self.max_ms
                return round(min(bound, self.max_ms), 1)
        return round(self.max_ms, 1)

    def summary(self) -> dict[str, Any]:
        return {
            "p50_ms": self.percentile(0.50),
            "p95_ms": self.percentile(0.95),
            "p99_ms": self.percentile(0.99),
            "mean_ms": round(self.sum_ms / self.count, 1) if self.count else None,
            "max_ms": round(self.max_ms, 1),
            "buckets_ms": {
                **{f"le_{b:g}": n for b, n in zip(BUCKETS_MS, self.buckets, strict=False)},
                "inf": self.buckets[-1],
            },
        }


class _Route:
    def __init__(self) -> None:
        self.requests = 0
        self.errors_4xx = 0
        self.errors_5xx = 0
        self.duration = Histogram()


class _Source:
    def __init__(self) -> None:
        self.calls = 0
        self.failures = 0
        self.duration = Histogram()


_LOCK = threading.Lock()
_ROUTES: dict[tuple[str, str], _Route] = {}
_SOURCES: dict[str, _Source] = {}


def _bounded(table: dict[Any, Any], key: Any, overflow: Any, make: type) -> Any:
    found = table.get(key)
    if found is None:
        key = key if len(table) < MAX_KEYS else overflow
        found = table.setdefault(key, make())
    return found


def record_request(
    method: str,
    route: str,
    status: int,
    duration_ms: float,
    request_id: str,
    farm_id: str | None = None,
) -> None:
    method = method.upper() if method.upper() in METHODS else OVERFLOW
    with _LOCK:
        stats: _Route = _bounded(_ROUTES, (method, route), (OVERFLOW, OVERFLOW), _Route)
        stats.requests += 1
        stats.errors_4xx += 400 <= status < 500
        stats.errors_5xx += status >= 500
        stats.duration.add(duration_ms)
    fields: dict[str, Any] = {
        "event": "request",
        "method": method,
        "route": route,
        "status": status,
        "duration_ms": round(duration_ms, 1),
        "request_id": request_id,
    }
    if farm_id:
        fields["farm_id"] = farm_id[:64]
    _line(ACCESS, logging.INFO, fields)


def record_outside(source: str, duration_ms: float, error: BaseException | None = None) -> None:
    with _LOCK:
        stats: _Source = _bounded(_SOURCES, source, OVERFLOW, _Source)
        stats.calls += 1
        stats.failures += error is not None
        stats.duration.add(duration_ms)
    if error is not None:
        fields = {
            "event": "outside_call_failed",
            "source": source,
            "duration_ms": round(duration_ms, 1),
            "error": type(error).__name__,
        }
        _line(OUTSIDE, logging.WARNING, fields)


def routes() -> list[dict[str, Any]]:
    with _LOCK:
        return [
            {
                "method": method,
                "route": route,
                "requests": s.requests,
                "errors_4xx": s.errors_4xx,
                "errors_5xx": s.errors_5xx,
                "error_rate_5xx": round(s.errors_5xx / s.requests, 4) if s.requests else 0.0,
                **s.duration.summary(),
            }
            for (method, route), s in sorted(_ROUTES.items())
        ]


def outside() -> dict[str, dict[str, Any]]:
    with _LOCK:
        return {
            name: {"calls": s.calls, "failures": s.failures, **s.duration.summary()}
            for name, s in sorted(_SOURCES.items())
        }


def uptime_s() -> float:
    return round(time.monotonic() - _STARTED, 1)


def reset() -> None:
    with _LOCK:
        _ROUTES.clear()
        _SOURCES.clear()
