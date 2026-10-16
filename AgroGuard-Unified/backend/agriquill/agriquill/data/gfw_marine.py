from __future__ import annotations

import hashlib
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from ..config import get_settings
from ..resilience import Breaker, CircuitOpen, guarded
from ..store import RecordCache, log_fetch, missing, sha256, source_ref
from .gfw_forest import circle

PROVIDER = "Global Fishing Watch API v3"
RADIUS_KM = (1.0, 100.0)
MAX_DAYS = 366
PAGE = 100
MAX_EVENTS = 200
RESULT_TTL_S = 6 * 3600.0
EFFORT = "public-global-fishing-effort:latest"
EVENTS = "public-global-fishing-events:latest"
IDENTITY = "public-global-vessel-identity:latest"
SCOPE = (
    "AIS-derived apparent fishing activity from public Global Fishing Watch datasets. Vessels "
    "that do not broadcast AIS are not seen here, and apparent fishing is not proof of illegal "
    "fishing. Salinity intrusion is not measured by this source."
)
_CACHE = RecordCache()
_CLIENT: list[httpx.Client] = []
_BREAKER = Breaker(threshold=5, cooldown_s=60.0)


class MarineError(Exception):
    pass


def _client() -> httpx.Client:
    if not _CLIENT:
        _CLIENT.append(httpx.Client(timeout=90.0, follow_redirects=True))
    return _CLIENT[0]


def _headers() -> dict[str, str]:
    token = get_settings().global_fishing_watch_token
    if token is None:
        raise MarineError("AGRIQUILL_GLOBAL_FISHING_WATCH_TOKEN is not set")
    return {"Authorization": f"Bearer {token.get_secret_value()}"}


def _call(
    method: str,
    path: str,
    key: str,
    client: httpx.Client | None,
    params: dict[str, Any],
    body: dict[str, Any] | None,
) -> dict[str, Any]:
    own = client or _client()
    cache_key = hashlib.sha256((method + path + key).encode()).hexdigest()
    hit = _CACHE.get("gfw_marine", cache_key)
    if hit is not None and not hit["stale"]:
        return hit["payload"] | {"cached": True}
    url = get_settings().global_fishing_watch_api + path

    def send() -> httpx.Response:
        response = own.request(method, url, headers=_headers(), params=params, json=body)
        response.raise_for_status()
        return response

    try:
        response = guarded(_BREAKER, send)
        data = response.json()
    except (httpx.HTTPError, MarineError, CircuitOpen, ValueError) as exc:
        reason = f"Global Fishing Watch unavailable: {type(exc).__name__}"
        if isinstance(exc, httpx.HTTPStatusError):
            reason += f" HTTP {exc.response.status_code}"
        if hit is not None:
            return hit["payload"] | {"cached": True, "stale": True, "stale_reason": reason}
        return {"data": None, "source": None, "reason": reason}
    digest = sha256(response.content)
    stamp = datetime.now(UTC).isoformat(timespec="seconds")
    payload = {"data": data, "source": source_ref(PROVIDER, url, stamp, digest), "reason": None}
    _CACHE.put("gfw_marine", cache_key, payload, url, digest, RESULT_TTL_S)
    log_fetch("gfw_marine", cache_key, digest)
    return payload


def _window(start: date, end: date) -> None:
    if end < start:
        raise ValueError("end is before start")
    if (end - start).days >= MAX_DAYS:
        raise ValueError(f"at most {MAX_DAYS} days per request")


def coastal_vessels(
    lat: float,
    lon: float,
    radius_km: float = 20.0,
    start: date | None = None,
    end: date | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    if not RADIUS_KM[0] <= radius_km <= RADIUS_KM[1]:
        raise ValueError(f"radius_km must be between {RADIUS_KM[0]} and {RADIUS_KM[1]}")
    end = end or datetime.now(UTC).date() - timedelta(days=5)
    start = start or end - timedelta(days=89)
    _window(start, end)
    area = circle(lat, lon, radius_km)
    span = f"{start.isoformat()},{end.isoformat()}"
    effort = _call(
        "POST",
        "/4wings/report",
        f"{area}{span}",
        client,
        {
            "spatial-resolution": "LOW",
            "temporal-resolution": "ENTIRE",
            "group-by": "FLAG",
            "datasets[0]": EFFORT,
            "date-range": span,
            "format": "JSON",
        },
        {"geojson": area},
    )
    events = _fetch_events(area, start, end, client)
    out: dict[str, Any] = {
        "provider": PROVIDER,
        "provenance": "RETRIEVED",
        "location": {"latitude": round(lat, 4), "longitude": round(lon, 4), "radius_km": radius_km},
        "window": {"from": start.isoformat(), "to": end.isoformat()},
        "scope": SCOPE,
        "fishing_effort": _effort(effort),
        "fishing_events": events,
    }
    out["missing"] = out["fishing_effort"]["missing"] + out["fishing_events"]["missing"]
    return out


def _effort(result: dict[str, Any]) -> dict[str, Any]:
    if result["data"] is None:
        return {
            "hours_by_flag": None,
            "total_hours": None,
            "dataset": EFFORT,
            "source": None,
            "missing": [missing("fishing_effort", result["reason"])],
        }
    cells: list[dict[str, Any]] = []
    dataset = EFFORT
    for entry in result["data"].get("entries", []):
        for name, rows in entry.items():
            dataset = name
            cells.extend(rows or [])
    hours: Counter[str] = Counter()
    for cell in cells:
        hours[cell.get("flag") or "unknown"] += float(cell["hours"])
    return {
        "hours_by_flag": {flag: round(h, 1) for flag, h in hours.most_common()},
        "total_hours": round(sum(hours.values()), 1),
        "grid_cells": len(cells),
        "resolution_deg": 0.1,
        "dataset": dataset,
        "source": result["source"],
        "missing": [],
    }


def _fetch_events(
    area: dict[str, Any], start: date, end: date, client: httpx.Client | None
) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    total: int | None = None
    source: dict[str, str] | None = None
    for offset in range(0, MAX_EVENTS, PAGE):
        page = _call(
            "POST",
            "/events",
            f"{area}{start}{end}{offset}",
            client,
            {"limit": PAGE, "offset": offset},
            {
                "datasets": [EVENTS],
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "geometry": area,
            },
        )
        if page["data"] is None:
            if not entries:
                return {
                    "total": None,
                    "dataset": EVENTS,
                    "source": None,
                    "missing": [missing("fishing_events", page["reason"])],
                }
            break
        source = page["source"]
        total = int(page["data"].get("total", 0))
        entries.extend(page["data"].get("entries", []))
        if page["data"].get("nextOffset") is None or len(entries) >= total:
            break
    flags = Counter((e.get("vessel") or {}).get("flag") or "unknown" for e in entries)
    shore = [
        e["distances"]["startDistanceFromShoreKm"]
        for e in entries
        if (e.get("distances") or {}).get("startDistanceFromShoreKm") is not None
    ]
    return {
        "total": total,
        "examined": len(entries),
        "events_by_flag": dict(flags.most_common()),
        "within_12_nm": sum(1 for e in entries if (e.get("regions") or {}).get("eez12Nm")),
        "nearest_to_shore_km": min(shore) if shore else None,
        "truncated": total is not None and total > len(entries),
        "last_examined_event_start": max((e["start"] for e in entries), default=None),
        "dataset": EVENTS,
        "source": source,
        "missing": [],
    }


def vessel_search(
    query: str, limit: int = 10, client: httpx.Client | None = None
) -> dict[str, Any]:
    limit = max(1, min(limit, 25))
    result = _call(
        "GET",
        "/vessels/search",
        f"{query}{limit}",
        client,
        {"query": query, "datasets[0]": IDENTITY, "limit": limit},
        None,
    )
    if result["data"] is None:
        return {
            "provider": PROVIDER,
            "query": query,
            "vessels": [],
            "missing": [missing("vessels", result["reason"])],
            "source": None,
        }
    vessels = []
    for entry in result["data"].get("entries", []):
        info = (entry.get("combinedSourcesInfo") or [{}])[0]
        selected = (entry.get("selfReportedInfo") or [{}])[0]
        vessels.append(
            {
                "vessel_id": info.get("vesselId"),
                "name": selected.get("shipname"),
                "flag": selected.get("flag"),
                "ssvid": selected.get("ssvid"),
                "gear_types": [g.get("name") for g in info.get("geartypes", [])],
                "ship_types": [t.get("name") for t in info.get("shiptypes", [])],
            }
        )
    return {
        "provider": PROVIDER,
        "provenance": "RETRIEVED",
        "query": query,
        "total": result["data"].get("total"),
        "vessels": vessels,
        "dataset": IDENTITY,
        "missing": [] if vessels else [missing("vessels", "no vessel matches")],
        "source": result["source"],
    }
