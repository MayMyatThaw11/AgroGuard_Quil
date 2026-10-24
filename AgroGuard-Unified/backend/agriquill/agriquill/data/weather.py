from __future__ import annotations

import datetime as dt
from typing import Any

import httpx

from .. import obs
from ..cache import TTLCache, through
from ..config import get_settings
from ..store import RecordCache, log_fetch, missing, now_iso, sha256, source_ref

_CACHE = TTLCache("openmeteo_daily")
FORECAST_DAYS = 14

_WIND_TO_MS = {
    "km/h": 1 / 3.6,
    "m/s": 1.0,
    "ms": 1.0,
    "mph": 0.44704,
    "kn": 0.514444,
    "kt": 0.514444,
}


def parse_weather(raw: dict[str, Any]) -> dict[str, Any]:
    daily = raw["daily"]
    units = raw["daily_units"]
    times = daily["time"]
    if len(times) != FORECAST_DAYS:
        raise ValueError(f"expected {FORECAST_DAYS} days, got {len(times)}")

    wind_unit = str(units.get("wind_speed_10m_max", ""))
    factor = _WIND_TO_MS.get(wind_unit)
    if factor is None:
        raise ValueError(f"unmapped wind unit {wind_unit!r}")
    precip_unit = str(units.get("precipitation_sum", ""))
    precip_factor = {"mm": 1.0, "inch": 25.4}.get(precip_unit)
    if precip_factor is None:
        raise ValueError(f"unmapped precipitation unit {precip_unit!r}")

    def series(key: str) -> list[float]:
        arr = daily[key]
        if len(arr) != FORECAST_DAYS:
            raise ValueError(f"{key} length mismatch")
        return [float(v) for v in arr]

    tmin = series("temperature_2m_min")
    tmax = series("temperature_2m_max")
    precip = series("precipitation_sum")
    wind = series("wind_speed_10m_max")

    days = []
    for i, d in enumerate(times):
        if not isinstance(d, str) or len(d) != 10:
            raise ValueError(f"bad date {d!r}")
        if tmax[i] < tmin[i]:
            raise ValueError(f"day {d}: max below min")
        days.append(
            {
                "date": d,
                "temp_min_degc": tmin[i],
                "temp_max_degc": tmax[i],
                "precipitation_mm": round(precip[i] * precip_factor, 3),
                "wind_speed_max_ms": round(wind[i] * factor, 3),
                "wind_unit_as_reported": wind_unit,
            }
        )
    return {
        "provider": "open-meteo-jma",
        "latitude": raw["latitude"],
        "longitude": raw["longitude"],
        "forecast_days": FORECAST_DAYS,
        "daily": days,
        "model": raw.get("model"),
    }


HOURLY = (
    "temperature_2m",
    "relative_humidity_2m",
    "wet_bulb_temperature_2m",
    "precipitation",
    "wind_speed_10m",
    "wind_gusts_10m",
    "et0_fao_evapotranspiration",
    "is_day",
)
HOURLY_UNITS = {"temperature_2m": "°C", "precipitation": "mm", "wind_speed_10m": "m/s"}
HOURLY_PROVIDER = "Open-Meteo forecast API (hourly)"
_RECORDS = RecordCache()


def parse_hourly(raw: dict[str, Any]) -> dict[str, Any]:
    hourly = raw["hourly"]
    units = raw.get("hourly_units", {})
    for name, unit in HOURLY_UNITS.items():
        if units.get(name) != unit:
            raise ValueError(f"{name} unit {units.get(name)!r}, expected {unit!r}")
    n = len(hourly["time"])
    series: dict[str, list[Any]] = {"time": list(hourly["time"])}
    for name in HOURLY:
        values = hourly.get(name)
        if values is None:
            values = [None] * n
        if len(values) != n:
            raise ValueError(f"{name} length mismatch")
        series[name] = values
    return {
        "hourly": series,
        "units": {k: units.get(k) for k in HOURLY},
        "timezone": raw.get("timezone"),
        "utc_offset_seconds": raw.get("utc_offset_seconds", 0),
        "elevation_m": raw.get("elevation"),
    }


def fetch_hourly(
    lat: float,
    lon: float,
    past_days: int = 14,
    forecast_days: int = 8,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    s = get_settings()
    lat2, lon2 = round(lat, 2), round(lon, 2)
    params = {
        "latitude": str(lat2),
        "longitude": str(lon2),
        "hourly": ",".join(HOURLY),
        "past_days": str(past_days),
        "forecast_days": str(forecast_days),
        "wind_speed_unit": "ms",
        "timezone": "auto",
    }
    key = f"{lat2}:{lon2}:{past_days}:{forecast_days}"
    url = str(httpx.URL(s.openmeteo_endpoint, params=params))

    def fresh() -> dict[str, Any] | None:
        cached = _RECORDS.get("openmeteo_hourly", key)
        if cached and not cached["stale"]:
            return _hourly_envelope(
                cached["payload"], cached["url"], cached["retrieved_at"], cached
            )
        return None

    def fetch() -> dict[str, Any]:
        cached = _RECORDS.get("openmeteo_hourly", key)
        try:
            own = client or httpx.Client(
                timeout=s.http_timeout_s, transport=obs.TimedTransport("open-meteo")
            )
            try:
                response = own.get(s.openmeteo_endpoint, params=params)
                response.raise_for_status()
            finally:
                if client is None:
                    own.close()
            parsed = parse_hourly(response.json())
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            reason = f"Open-Meteo unavailable: {type(exc).__name__}"
            if cached:
                out = _hourly_envelope(
                    cached["payload"], cached["url"], cached["retrieved_at"], cached
                )
                out["stale_reason"] = reason
                return out
            return {
                "provider": HOURLY_PROVIDER,
                "hourly": None,
                "missing": [missing("hourly", reason)],
                "source": None,
            }
        digest = sha256(response.content)
        _RECORDS.put("openmeteo_hourly", key, parsed, url, digest, s.weather_cache_ttl_s)
        log_fetch("openmeteo_hourly", key, digest)
        meta = {"sha256": digest, "stale": False}
        return _hourly_envelope(parsed, url, now_iso(), meta)

    return through("openmeteo_hourly", key, fresh, fetch)


CURRENT = (
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "rain",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "is_day",
    "visibility",
)
CURRENT_UNITS = {
    "temperature_2m": "°C",
    "precipitation": "mm",
    "wind_speed_10m": "m/s",
    "wind_gusts_10m": "m/s",
}
CURRENT_PROVIDER = "Open-Meteo forecast API (current conditions)"
OPENMETEO_LICENCE = "Open-Meteo free API is non-commercial; commercial use needs a subscription"


def parse_current(raw: dict[str, Any]) -> dict[str, Any]:
    block = raw["current"]
    units = raw.get("current_units", {})
    for name, unit in CURRENT_UNITS.items():
        if units.get(name) != unit:
            raise ValueError(f"{name} unit {units.get(name)!r}, expected {unit!r}")
    values = {name: block.get(name) for name in CURRENT}
    return {
        "current": values,
        "units": {name: units.get(name) for name in CURRENT},
        "time": block["time"],
        "interval_s": block.get("interval"),
        "timezone": raw.get("timezone"),
        "utc_offset_seconds": raw.get("utc_offset_seconds", 0),
        "elevation_m": raw.get("elevation"),
        "missing": [
            missing(name, "not reported by Open-Meteo for this place and time")
            for name, value in values.items()
            if value is None
        ],
    }


def _current_envelope(
    parsed: dict[str, Any], url: str, retrieved_at: str, meta: dict[str, Any]
) -> dict[str, Any]:
    return {
        "provider": CURRENT_PROVIDER,
        "provenance": "RETRIEVED",
        **parsed,
        "stale": meta["stale"],
        "licence": OPENMETEO_LICENCE,
        "source": source_ref(CURRENT_PROVIDER, url, retrieved_at, meta["sha256"]),
    }


def fetch_current(lat: float, lon: float, client: httpx.Client | None = None) -> dict[str, Any]:
    s = get_settings()
    lat2, lon2 = round(lat, 2), round(lon, 2)
    params = {
        "latitude": str(lat2),
        "longitude": str(lon2),
        "current": ",".join(CURRENT),
        "wind_speed_unit": "ms",
        "timezone": "auto",
    }
    key = f"{lat2}:{lon2}"
    url = str(httpx.URL(s.openmeteo_endpoint, params=params))

    def fresh() -> dict[str, Any] | None:
        cached = _RECORDS.get("openmeteo_current", key)
        if cached and not cached["stale"]:
            return _current_envelope(
                cached["payload"], cached["url"], cached["retrieved_at"], cached
            )
        return None

    def fetch() -> dict[str, Any]:
        cached = _RECORDS.get("openmeteo_current", key)
        try:
            own = client or httpx.Client(
                timeout=s.http_timeout_s, transport=obs.TimedTransport("open-meteo")
            )
            try:
                response = own.get(s.openmeteo_endpoint, params=params)
                response.raise_for_status()
            finally:
                if client is None:
                    own.close()
            parsed = parse_current(response.json())
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            detail = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
            reason = f"Open-Meteo unavailable: {detail}"
            if cached:
                out = _current_envelope(
                    cached["payload"], cached["url"], cached["retrieved_at"], cached
                )
                out["stale_reason"] = reason
                return out
            return {
                "provider": CURRENT_PROVIDER,
                "current": None,
                "missing": [missing("current", reason)],
                "source": None,
            }
        digest = sha256(response.content)
        _RECORDS.put("openmeteo_current", key, parsed, url, digest, s.weather_now_ttl_s)
        log_fetch("openmeteo_current", key, digest)
        return _current_envelope(parsed, url, now_iso(), {"sha256": digest, "stale": False})

    return through("openmeteo_current", key, fresh, fetch)


ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive"
ARCHIVE_PROVIDER = "Open-Meteo historical weather API (hourly reanalysis)"


def fetch_archive_hourly(
    lat: float, lon: float, start: dt.date, end: dt.date, client: httpx.Client | None = None
) -> dict[str, Any]:
    s = get_settings()
    lat2, lon2 = round(lat, 2), round(lon, 2)
    params = {
        "latitude": str(lat2),
        "longitude": str(lon2),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "hourly": ",".join(HOURLY),
        "wind_speed_unit": "ms",
        "timezone": "auto",
    }
    key = f"{lat2}:{lon2}:{start}:{end}"
    url = str(httpx.URL(ARCHIVE_ENDPOINT, params=params))
    cached = _RECORDS.get("openmeteo_archive", key)
    if cached and not cached["stale"]:
        return _hourly_envelope(
            cached["payload"], cached["url"], cached["retrieved_at"], cached, ARCHIVE_PROVIDER
        )
    try:
        own = client or httpx.Client(
            timeout=s.http_timeout_s, transport=obs.TimedTransport("open-meteo-archive")
        )
        try:
            response = own.get(ARCHIVE_ENDPOINT, params=params)
            response.raise_for_status()
        finally:
            if client is None:
                own.close()
        parsed = parse_hourly(response.json())
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        return {
            "provider": ARCHIVE_PROVIDER,
            "hourly": None,
            "missing": [missing("hourly", f"Open-Meteo archive unavailable: {type(exc).__name__}")],
            "source": None,
        }
    digest = sha256(response.content)
    _RECORDS.put("openmeteo_archive", key, parsed, url, digest, s.weather_cache_ttl_s)
    log_fetch("openmeteo_archive", key, digest)
    return _hourly_envelope(
        parsed, url, now_iso(), {"sha256": digest, "stale": False}, ARCHIVE_PROVIDER
    )


ARCHIVE_DAILY_PROVIDER = "Open-Meteo historical weather API (daily, ERA5 reanalysis)"
ARCHIVE_DAILY = {
    "tmax_c": "temperature_2m_max",
    "tmin_c": "temperature_2m_min",
    "rain_mm": "precipitation_sum",
    "srad_mj_m2": "shortwave_radiation_sum",
    "et0_mm": "et0_fao_evapotranspiration",
    "wind_ms": "wind_speed_10m_mean",
    "rh_min_pct": "relative_humidity_2m_min",
    "rh_max_pct": "relative_humidity_2m_max",
}
ARCHIVE_DAILY_UNITS = {
    "temperature_2m_max": "°C",
    "precipitation_sum": "mm",
    "shortwave_radiation_sum": "MJ/m²",
    "wind_speed_10m_mean": "m/s",
}


def parse_archive_daily(raw: dict[str, Any]) -> dict[str, Any]:
    units = raw.get("daily_units", {})
    for name, unit in ARCHIVE_DAILY_UNITS.items():
        if units.get(name) != unit:
            raise ValueError(f"{name} unit {units.get(name)!r}, expected {unit!r}")
    daily = raw["daily"]
    days, gaps = [], []
    for i, stamp in enumerate(daily["time"]):
        values = {key: daily[name][i] for key, name in ARCHIVE_DAILY.items()}
        empty = next((ARCHIVE_DAILY[k] for k, v in values.items() if v is None), None)
        if empty:
            gaps.append(missing("weather_day", f"{stamp}: {empty} null"))
            continue
        days.append({"date": stamp, **{k: float(v) for k, v in values.items()}})
    return {
        "days": days,
        "gaps": gaps,
        "elevation_m": raw.get("elevation"),
        "utc_offset_seconds": raw.get("utc_offset_seconds", 0),
    }


def fetch_archive_daily(
    lat: float, lon: float, start: dt.date, end: dt.date, client: httpx.Client | None = None
) -> dict[str, Any]:
    s = get_settings()
    lat2, lon2 = round(lat, 2), round(lon, 2)
    params = {
        "latitude": str(lat2),
        "longitude": str(lon2),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "daily": ",".join(ARCHIVE_DAILY.values()),
        "wind_speed_unit": "ms",
        "timezone": "auto",
    }
    key = f"{lat2}:{lon2}:{start}:{end}"
    url = str(httpx.URL(ARCHIVE_ENDPOINT, params=params))
    cached = _RECORDS.get("openmeteo_archive_daily", key)
    if cached and not cached["stale"]:
        parsed = cached["payload"]
        meta = {
            "sha256": cached["sha256"],
            "retrieved_at": cached["retrieved_at"],
            "url": cached["url"],
        }
    else:
        try:
            own = client or httpx.Client(
                timeout=s.http_timeout_s, transport=obs.TimedTransport("open-meteo-archive")
            )
            try:
                response = own.get(ARCHIVE_ENDPOINT, params=params)
                response.raise_for_status()
            finally:
                if client is None:
                    own.close()
            parsed = parse_archive_daily(response.json())
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            reason = f"Open-Meteo archive unavailable: {type(exc).__name__}"
            return {"days": [], "missing": [missing("weather", reason)], "source": None}
        digest = sha256(response.content)
        _RECORDS.put("openmeteo_archive_daily", key, parsed, url, digest, s.weather_cache_ttl_s)
        log_fetch("openmeteo_archive_daily", key, digest)
        meta = {"sha256": digest, "retrieved_at": now_iso(), "url": url}
    return {
        "provider": ARCHIVE_DAILY_PROVIDER,
        "provenance": "RETRIEVED",
        "days": parsed["days"],
        "elevation_m": parsed["elevation_m"],
        "missing": parsed["gaps"],
        "licence": "Open-Meteo free API is non-commercial; commercial use needs a subscription",
        "source": source_ref(
            ARCHIVE_DAILY_PROVIDER, meta["url"], meta["retrieved_at"], meta["sha256"]
        ),
    }


def _hourly_envelope(
    parsed: dict[str, Any],
    url: str,
    retrieved_at: str,
    meta: dict[str, Any],
    provider: str = HOURLY_PROVIDER,
) -> dict[str, Any]:
    return {
        "provider": provider,
        "provenance": "RETRIEVED",
        **parsed,
        "stale": meta["stale"],
        "missing": [],
        "licence": "Open-Meteo free API is non-commercial; commercial use needs a subscription",
        "source": source_ref(provider, url, retrieved_at, meta["sha256"]),
    }


def daily_from_hourly(hourly: dict[str, list[Any]]) -> list[dict[str, Any]]:
    days: dict[str, dict[str, list[float]]] = {}
    for i, stamp in enumerate(hourly["time"]):
        day = days.setdefault(stamp[:10], {k: [] for k in ("rain", "temp", "rh", "wind", "et0")})
        for key, name in (
            ("rain", "precipitation"),
            ("temp", "temperature_2m"),
            ("rh", "relative_humidity_2m"),
            ("wind", "wind_speed_10m"),
            ("et0", "et0_fao_evapotranspiration"),
        ):
            value = hourly[name][i]
            if value is not None:
                day[key].append(float(value))
    out = []
    for date, values in days.items():
        if not values["temp"] or not values["wind"]:
            continue
        out.append(
            {
                "date": date,
                "hours": len(values["temp"]),
                "rain_mm": round(sum(values["rain"]), 2),
                "temp_c": round(sum(values["temp"]) / len(values["temp"]), 2),
                "rh_pct": round(sum(values["rh"]) / len(values["rh"]), 1) if values["rh"] else 0.0,
                "wind_ms": round(max(values["wind"]), 2),
                "et0_mm": round(sum(values["et0"]), 2),
            }
        )
    return out


async def fetch_weather(lat: float, lon: float) -> dict[str, Any]:
    s = get_settings()
    key = ("weather", round(lat, 5), round(lon, 5))

    async def _do() -> dict[str, Any]:
        params = {
            "latitude": f"{lat:.6f}",
            "longitude": f"{lon:.6f}",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
            "forecast_days": str(FORECAST_DAYS),
            "timezone": "auto",
            "wind_speed_unit": "kmh",
        }
        async with httpx.AsyncClient(timeout=s.http_timeout_s) as client:
            r = await client.get(s.openmeteo_endpoint, params=params)
            r.raise_for_status()
        return parse_weather(r.json())

    return await _CACHE.get_or_fetch(key, s.weather_cache_ttl_s, _do)


def issued_rain(
    lat: float, lon: float, cut: dt.date, horizon: int, client: httpx.Client | None = None
) -> dict[str, Any]:
    """Daily rain as forecast on the cut day: lead k comes from precipitation_previous_day{k}."""
    s = get_settings()
    leads = [f"precipitation_previous_day{k}" for k in range(1, horizon + 1)]
    end = cut + dt.timedelta(days=horizon)
    params = {
        "latitude": f"{lat:.2f}",
        "longitude": f"{lon:.2f}",
        "hourly": ",".join(leads),
        "start_date": (cut + dt.timedelta(days=1)).isoformat(),
        "end_date": end.isoformat(),
        "timezone": "auto",
    }
    own = client or httpx.Client(
        timeout=s.http_timeout_s, transport=obs.TimedTransport("open-meteo-previous-runs")
    )
    try:
        response = own.get(s.open_meteo_previous_runs_url, params=params)
        response.raise_for_status()
        hourly = response.json()["hourly"]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        return {
            "rain_mm": None,
            "missing": [missing("rain_mm", f"previous runs unavailable: {type(exc).__name__}")],
        }
    finally:
        if client is None:
            own.close()
    out: list[float] = []
    for k in range(1, horizon + 1):
        day = (cut + dt.timedelta(days=k)).isoformat()
        values = [
            v for t, v in zip(hourly["time"], hourly[leads[k - 1]], strict=False) if t[:10] == day
        ]
        if len(values) != 24 or any(v is None for v in values):
            return {
                "rain_mm": None,
                "missing": [missing("rain_mm", f"no complete day-{k} forecast for {day}")],
            }
        out.append(round(sum(values), 2))
    return {
        "rain_mm": out,
        "source": "Open-Meteo Previous Runs API",
        "cut": cut.isoformat(),
        "missing": [],
    }
