from __future__ import annotations

import math
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from ..config import get_settings
from ..store import RecordCache, log_fetch, missing, sha256, source_ref

PROVIDER = "NASA POWER (community AG)"
PARAMETERS = ("ALLSKY_SFC_SW_DWN", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "PRECTOTCORR")
FILL = -999.0
RECENT_DAYS = 90
RECENT_TTL_S = 24 * 3600.0
MAX_DAYS = 366 * 5
_CACHE = RecordCache()


def parse(raw: dict[str, Any]) -> dict[str, Any]:
    header = raw.get("header", {})
    fill = float(header.get("fill_value", FILL))
    series = raw["properties"]["parameter"]
    meta = raw.get("parameters", {})
    dates = sorted({d for values in series.values() for d in values})
    days: list[dict[str, Any]] = []
    gaps: list[dict[str, str]] = []
    for stamp in dates:
        day: dict[str, Any] = {"date": f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}"}
        for name in series:
            value = series[name].get(stamp)
            if value is None or float(value) == fill:
                day[name] = None
                gaps.append(missing(f"{name}@{day['date']}", "NASA POWER fill value"))
            else:
                day[name] = float(value)
        days.append(day)
    return {
        "parameters": {
            name: {
                "units": meta.get(name, {}).get("units"),
                "name": meta.get(name, {}).get("longname"),
            }
            for name in series
        },
        "days": days,
        "missing": gaps,
        "elevation_m": _elevation(raw),
        "api_version": header.get("api", {}).get("version"),
        "upstream_sources": header.get("sources", []),
    }


def _elevation(raw: dict[str, Any]) -> float | None:
    coords = raw.get("geometry", {}).get("coordinates", [])
    return float(coords[2]) if len(coords) > 2 and coords[2] is not None else None


def daily(
    lat: float, lon: float, start: date, end: date, client: httpx.Client | None = None
) -> dict[str, Any]:
    if end < start:
        raise ValueError("end is before start")
    if (end - start).days >= MAX_DAYS:
        raise ValueError(f"at most {MAX_DAYS} days per request")
    s = get_settings()
    lat2, lon2 = round(lat, 2), round(lon, 2)
    params = {
        "parameters": ",".join(PARAMETERS),
        "community": "AG",
        "latitude": str(lat2),
        "longitude": str(lon2),
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
    }
    key = f"{lat2}:{lon2}:{params['start']}:{params['end']}"
    url = str(httpx.URL(s.nasa_power_endpoint, params=params))
    cached = _CACHE.get("nasa_power", key)
    if cached and not cached["stale"]:
        return _envelope(cached["payload"], cached, lat2, lon2)
    try:
        own = client or httpx.Client(timeout=s.http_timeout_s)
        try:
            response = own.get(s.nasa_power_endpoint, params=params)
            response.raise_for_status()
        finally:
            if client is None:
                own.close()
        body = response.content
        parsed = parse(response.json())
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        reason = f"NASA POWER unavailable: {type(exc).__name__}"
        if cached:
            out = _envelope(cached["payload"], cached, lat2, lon2)
            out["stale_reason"] = reason
            return out
        return {
            "provider": PROVIDER,
            "location": {"latitude": lat2, "longitude": lon2},
            "days": [],
            "missing": [missing("all", reason)],
            "source": None,
        }
    digest = sha256(body)
    recent = end >= datetime.now(UTC).date() - timedelta(days=RECENT_DAYS)
    _CACHE.put("nasa_power", key, parsed, url, digest, RECENT_TTL_S if recent else None)
    log_fetch("nasa_power", key, digest)
    meta = {
        "url": url,
        "sha256": digest,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "stale": False,
    }
    return _envelope(parsed, meta, lat2, lon2)


def _envelope(
    parsed: dict[str, Any], meta: dict[str, Any], lat: float, lon: float
) -> dict[str, Any]:
    return {
        "provider": PROVIDER,
        "provenance": "RETRIEVED",
        "location": {"latitude": lat, "longitude": lon, "note": "rounded to 0.01 deg"},
        **parsed,
        "stale": meta["stale"],
        "source": source_ref(PROVIDER, meta["url"], meta["retrieved_at"], meta["sha256"]),
    }


def et0(lat: float, lon: float, day: date, client: httpx.Client | None = None) -> dict[str, Any]:
    from ..agronomy import FAO56_SOURCE, fao56_eto

    weather = daily(lat, lon, day, day, client)
    out: dict[str, Any] = {
        "date": day.isoformat(),
        "et0_mm_day": None,
        "provenance": "DERIVED",
        "method": "FAO-56 Penman-Monteith (eq. 6) with RHmean (eq. 19), Ra (eq. 21), Rso (eq. 37), "
        "Rnl (eq. 39); daily NASA POWER inputs at 2 m",
        "method_source": FAO56_SOURCE,
        "inputs": weather.get("days", [None])[0] if weather.get("days") else None,
        "elevation_m": weather.get("elevation_m"),
        "source": weather.get("source"),
        "missing": list(weather.get("missing", [])),
    }
    row = out["inputs"]
    needed = ("T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN")
    if row is None or any(row.get(k) is None for k in needed):
        out["missing"].append(missing("et0_mm_day", "a NASA POWER input is missing for this day"))
        return out
    out["et0_mm_day"] = fao56_eto(
        row["T2M_MAX"],
        row["T2M_MIN"],
        row["RH2M"],
        row["WS2M"],
        row["ALLSKY_SFC_SW_DWN"],
        elevation_m=out["elevation_m"] or 0.0,
        latitude_rad=math.radians(lat),
        day_of_year=day.timetuple().tm_yday,
    )
    return out
