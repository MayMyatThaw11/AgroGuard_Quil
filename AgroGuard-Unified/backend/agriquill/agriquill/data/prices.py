from __future__ import annotations

import json
from typing import Any

import httpx

from ..config import get_settings
from ..store import RecordCache, missing, sha256

PATH = "/api/v1/market/prices"
SOURCE = "market_price"
TTL_S = 6 * 3600.0
TIMEOUT_S = 15.0
_CACHE = RecordCache()


def trend(produce: str, lat: float, lon: float, market: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    key = f"{produce.strip().lower()}|{lat:.2f}|{lon:.2f}|{market or ''}"
    hit = _CACHE.get(SOURCE, key)
    if hit and not hit["stale"]:
        return hit["payload"]
    if not settings.agroguard_url:
        return missing("price", "the AgroGuard price service is not configured")
    url = settings.agroguard_url.rstrip("/") + PATH
    params: dict[str, Any] = {"produce": produce, "lat": lat, "lon": lon}
    if market:
        params["market"] = market
    service_key = settings.agroguard_service_key
    headers = {"X-Service-Key": service_key.get_secret_value() if service_key else ""}
    try:
        response = httpx.get(url, params=params, headers=headers, timeout=TIMEOUT_S)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        if hit:
            return {**hit["payload"], "stale": True}
        return missing("price", "the AgroGuard price service did not answer")
    digest = sha256(json.dumps(payload, sort_keys=True).encode())
    _CACHE.put(SOURCE, key, payload, url, digest, TTL_S)
    return payload
