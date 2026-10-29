from __future__ import annotations

import math
import time
from datetime import UTC, date, datetime
from typing import Any

import httpx

RTFP_URL = "https://microdata.worldbank.org/api/tables/data/fcv/wld_2021_rtfp_v02_m"
PROVIDER = "World Bank Real Time Food Prices (RTFP), modelled monthly estimates by market, open data"
TTL_S = 7 * 24 * 3600.0
TIMEOUT_S = 30.0
COMMODITY = {"rice": "rice", "onion": "onions", "pulses": "pulses"}
UNIT_NOTE = {"rice": "MMK/kg, retail low-quality milled rice", "onions": "MMK/kg", "pulses": "MMK/kg"}
_CACHE: dict[str, tuple[float, Any]] = {}


def clear_cache() -> None:
    _CACHE.clear()


def missing(reason: str) -> dict[str, Any]:
    return {"status": "missing", "field": "price", "reason": reason, "provenance": "unavailable"}


def _fetch(params: dict[str, Any]) -> list[dict[str, Any]]:
    key = repr(sorted(params.items()))
    hit = _CACHE.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    response = httpx.get(RTFP_URL, params=params, timeout=TIMEOUT_S)
    response.raise_for_status()
    rows = response.json().get("data") or []
    _CACHE[key] = (time.time() + TTL_S, rows)
    return rows


def markets() -> list[dict[str, Any]]:
    today = date.today()
    for back in range(4):
        month = (today.month - back - 1) % 12 + 1
        year = today.year - (1 if today.month - back < 1 else 0)
        rows = _fetch({"country": "Myanmar", "price_date": f"{year:04d}-{month:02d}-01", "limit": 1000})
        if rows:
            return rows
    return []


def market_rows(name: str) -> list[dict[str, Any]]:
    return _fetch({"country": "Myanmar", "mkt_name": name, "limit": 1000})


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def nearest_market(lat: float, lon: float) -> tuple[dict[str, Any], float] | None:
    best: tuple[dict[str, Any], float] | None = None
    for row in markets():
        try:
            km = _km(lat, lon, float(row["lat"]), float(row["lon"]))
        except (KeyError, TypeError, ValueError):
            continue
        if best is None or km < best[1]:
            best = (row, km)
    return best


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number > 0 else None


def parse(rows: list[dict[str, Any]], commodity: str) -> list[dict[str, Any]]:
    series = []
    for row in rows:
        close = _number(row.get(f"c_{commodity}"))
        if close is None:
            continue
        series.append(
            {
                "month": row["price_date"],
                "close_mmk": close,
                "low_mmk": _number(row.get(f"l_{commodity}")),
                "high_mmk": _number(row.get(f"h_{commodity}")),
                "trust": _number(row.get(f"trust_{commodity}")),
            }
        )
    return sorted(series, key=lambda p: p["month"])


def change_pct(series: list[dict[str, Any]], months: int) -> float | None:
    if len(series) <= months:
        return None
    now, then = series[-1]["close_mmk"], series[-1 - months]["close_mmk"]
    return round((now - then) / then * 100.0, 1)


def trend(produce: str, lat: float, lon: float) -> dict[str, Any]:
    commodity = COMMODITY.get(produce.strip().lower())
    if commodity is None:
        return missing(f"RTFP has no price series for {produce}")
    try:
        found = nearest_market(lat, lon)
        if found is None:
            return missing("RTFP returned no Myanmar markets")
        market, km = found
        series = parse(market_rows(market["mkt_name"]), commodity)
    except (httpx.HTTPError, ValueError) as exc:
        return missing(f"RTFP unavailable: {exc.__class__.__name__}")
    if not series:
        return missing(f"RTFP has no {commodity} prices for {market['mkt_name']}")
    latest = series[-1]
    return {
        "status": "ok",
        "provenance": "modelled",
        "produce": produce,
        "market": market["mkt_name"],
        "admin1": market.get("adm1_name"),
        "market_km": round(km, 1),
        "as_of": latest["month"],
        "latest_mmk_kg": latest["close_mmk"],
        "change_3m_pct": change_pct(series, 3),
        "trust": latest["trust"],
        "unit": UNIT_NOTE[commodity],
        "months": series[-12:],
        "source": {
            "provider": PROVIDER,
            "url": RTFP_URL,
            "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        },
    }
