from __future__ import annotations

import calendar
import math
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from ..cache import through
from ..config import get_settings
from ..store import RecordCache, log_fetch, missing, sha256, source_ref

GLOFAS = "Copernicus EMS GloFAS v4 river discharge (LISFLOOD, 0.05 deg) via Open-Meteo flood API"
DEM = "Copernicus DEM GLO-90 via Open-Meteo elevation API"
DEM_LE90_M = 4.0
DEM_ACCURACY = "absolute vertical accuracy under 4 m (90 % linear error), Copernicus DEM spec"
EULER = 0.5772156649
MIN_YEARS = 20
MIN_DAYS_PER_YEAR = 330
FORECAST_DAYS = 30
HISTORY_START = "1984-01-01"
HISTORY_TTL_S = 30 * 86400.0
FORECAST_TTL_S = 6 * 3600.0
NEIGHBOUR_DEG = 0.05
HIGH_CHANCE_Q5 = 0.5
WATCH_CHANCE_Q2 = 0.3
EARLY_HARVEST_DAYS = 14
ASSUMPTIONS = {
    "fit": "Gumbel (EV1) by L-moments on annual maxima; can understate rare floods, TO VERIFY",
    "levels": f"High risk: chance of the 5-year flow >= {HIGH_CHANCE_Q5}; watch: chance of the "
    f"2-year flow >= {WATCH_CHANCE_Q2}; TO VERIFY with the national hydrology service",
    "early_harvest_days": f"rice cut up to {EARLY_HARVEST_DAYS} days before maturity, TO VERIFY",
    "limit": "River discharge in a 5 km model cell is not water depth on the field; "
    "embankments, drains and local rain are not modelled",
}
_CACHE = RecordCache()


def gumbel_fit(maxima: list[float]) -> dict[str, float] | None:
    n = len(maxima)
    if n < MIN_YEARS:
        return None
    x = sorted(maxima)
    b0 = sum(x) / n
    b1 = sum(i * v for i, v in enumerate(x)) / (n * (n - 1))
    l2 = 2 * b1 - b0
    alpha = l2 / math.log(2)
    return {"xi": b0 - EULER * alpha, "alpha": alpha, "years": n}


def return_level(fit: dict[str, float], years: float) -> float:
    return fit["xi"] - fit["alpha"] * math.log(-math.log(1 - 1 / years))


def annual_maxima(
    times: list[str], values: list[float | None], min_days: int = MIN_DAYS_PER_YEAR
) -> list[dict[str, Any]]:
    by_year: dict[int, list[tuple[float, int]]] = {}
    for t, v in zip(times, values, strict=True):
        if v is not None:
            by_year.setdefault(int(t[:4]), []).append((v, int(t[5:7])))
    out = []
    for year, days in sorted(by_year.items()):
        if len(days) >= min_days:
            peak, month = max(days)
            out.append({"year": year, "max": peak, "month": month})
    return out


def exceedance(
    times: list[str], members: dict[str, list[float | None]], level: float
) -> dict[str, Any]:
    firsts = []
    for series in members.values():
        hit = next(
            (t for t, v in zip(times, series, strict=True) if v is not None and v > level), None
        )
        if hit:
            firsts.append(hit)
    n = len(members)
    return {
        "members": n,
        "above": len(firsts),
        "chance": round(len(firsts) / n, 3) if n else None,
        "first_date": min(firsts) if firsts else None,
    }


def risk_level(chance_q2: float | None, chance_q5: float | None) -> str:
    if chance_q2 is None or chance_q5 is None:
        return "unknown"
    if chance_q5 >= HIGH_CHANCE_Q5:
        return "high"
    if chance_q2 >= WATCH_CHANCE_Q2:
        return "watch"
    return "low"


def advice(
    level: str, flood_date: str | None, planted: date | None, season_days: int | None, today: date
) -> dict[str, Any]:
    if level not in ("high", "watch") or not flood_date:
        return {"action": "none", "text": "No flood flow expected in the next 30 days."}
    if planted is None or not season_days:
        return {
            "action": "protect",
            "text": f"High river flow is possible from {flood_date}. Add the planting date "
            "to check whether the crop can be cut first; meanwhile clear drains and check bunds.",
        }
    mature = planted + timedelta(days=season_days)
    short = (mature - date.fromisoformat(flood_date)).days
    if short <= EARLY_HARVEST_DAYS:
        return {
            "action": "harvest_early",
            "text": f"Plan to harvest before {flood_date}. The crop matures about "
            f"{mature.isoformat()}, "
            + (f"{short} days after that date." if short > 0 else "before that date."),
            "mature": mature.isoformat(),
        }
    return {
        "action": "protect",
        "text": f"High river flow is possible from {flood_date}, {short} days before the crop "
        "matures, too early to cut. Clear drains, check bunds and keep seed for replanting.",
        "mature": mature.isoformat(),
    }


def planting_window(peak_months: list[int], season_days: int | None) -> dict[str, Any] | None:
    if not peak_months or not season_days:
        return None
    counts = Counter(peak_months)
    peak, years = counts.most_common(1)[0]
    plant_by = (peak - 1 - math.ceil(season_days / 30)) % 12 + 1
    return {
        "peak_month": peak,
        "plant_by_month": plant_by,
        "text": f"River flow peaked in {calendar.month_name[peak]} in {years} of "
        f"{len(peak_months)} years. To harvest a {season_days}-day crop before then, plant by "
        f"{calendar.month_name[plant_by]}; check irrigation water for that season.",
    }


def sea_level(elevations: list[float]) -> dict[str, Any]:
    if not elevations:
        return {"mean_m": None, "min_m": None, "max_m": None, "within_dem_error": None}
    mean = round(sum(elevations) / len(elevations), 1)
    return {
        "mean_m": mean,
        "min_m": min(elevations),
        "max_m": max(elevations),
        "within_dem_error": mean <= DEM_LE90_M,
        "accuracy": DEM_ACCURACY,
    }


def _points(lat: float, lon: float) -> list[tuple[float, float]]:
    d = NEIGHBOUR_DEG
    offsets = ((0.0, 0.0), (d, 0.0), (-d, 0.0), (0.0, d), (0.0, -d))
    return [(round(lat + a, 4), round(lon + b, 4)) for a, b in offsets]


def _many(raw: Any) -> list[dict[str, Any]]:
    return raw if isinstance(raw, list) else [raw]


def _why(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
        return "GloFAS rate limit reached (HTTP 429); try again in a minute"
    return f"GloFAS unavailable: {type(exc).__name__}"


def _cached(
    http: httpx.Client, key: str, params: dict[str, Any], ttl_s: float, out: dict[str, Any]
) -> list[dict[str, Any]]:
    """Fresh copy when due; on a failed refresh the last good copy is served and marked stale."""
    url = get_settings().open_meteo_flood_url

    Rows = tuple[list[dict[str, Any]], dict[str, str] | None]

    def fresh() -> Rows | None:
        hit = _CACHE.get("glofas", key)
        return (list(hit["payload"]), None) if hit is not None and not hit["stale"] else None

    def fetch() -> Rows:
        hit = _CACHE.get("glofas", key)
        try:
            response = http.get(url, params=params)
            response.raise_for_status()
            data = _many(response.json())
        except (httpx.HTTPError, ValueError) as exc:
            if hit is None:
                raise
            note = missing(
                "river_discharge", f"{_why(exc)}; showing data from {hit['retrieved_at']}"
            )
            return list(hit["payload"]), note
        digest = sha256(repr([c["daily"]["river_discharge"][-3:] for c in data]).encode())
        _CACHE.put("glofas", key, data, url, digest, ttl_s)
        log_fetch("glofas", key, digest)
        return data, None

    data, note = through("glofas", key, fresh, fetch)
    if note is not None:
        out["missing"].append(note)
    return list(data)


def site_risk(
    ring_latlon: list[list[float]],
    planted: date | None = None,
    season_days: int | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    corners = ring_latlon[:-1]
    lat = sum(p[0] for p in corners) / len(corners)
    lon = sum(p[1] for p in corners) / len(corners)
    today = datetime.now(UTC).date()
    settings = get_settings()
    own = client is None
    http = client or httpx.Client(timeout=settings.http_timeout_s * 3, follow_redirects=True)
    out: dict[str, Any] = {
        "provider": GLOFAS,
        "assumptions": ASSUMPTIONS,
        "missing": [],
        "provenance": "DERIVED",
    }
    try:
        pts = [(lat, lon), *[(p[0], p[1]) for p in corners]]
        try:
            elev = http.get(
                settings.open_meteo_elevation_url,
                params={
                    "latitude": ",".join(f"{p[0]:.5f}" for p in pts),
                    "longitude": ",".join(f"{p[1]:.5f}" for p in pts),
                },
            )
            elev.raise_for_status()
            out["elevation"] = {**sea_level(list(elev.json()["elevation"])), "provider": DEM}
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            out["elevation"] = sea_level([])
            out["missing"].append(
                missing("elevation", f"elevation unavailable: {type(exc).__name__}")
            )
        cells = _points(lat, lon)
        common = {
            "latitude": ",".join(f"{c[0]}" for c in cells),
            "longitude": ",".join(f"{c[1]}" for c in cells),
            "daily": "river_discharge",
        }
        site = f"{lat:.3f},{lon:.3f}"
        try:
            history = _cached(
                http,
                f"history:{site}",
                {**common, "start_date": HISTORY_START, "end_date": today.isoformat()},
                HISTORY_TTL_S,
                out,
            )
            forecast = _cached(
                http,
                f"forecast:{site}",
                {**common, "ensemble": "true", "forecast_days": FORECAST_DAYS},
                FORECAST_TTL_S,
                out,
            )
        except (httpx.HTTPError, ValueError) as exc:
            out["missing"].append(missing("river_discharge", _why(exc)))
            out["level"] = "unknown"
            return out
        rivers = []
        for cell, past, ahead in zip(cells, history, forecast, strict=True):
            maxima = annual_maxima(past["daily"]["time"], past["daily"]["river_discharge"])
            fit = gumbel_fit([m["max"] for m in maxima])
            flows = [v for v in past["daily"]["river_discharge"] if v is not None]
            members = {k: v for k, v in ahead["daily"].items() if k.startswith("river_discharge")}
            entry: dict[str, Any] = {
                "lat": past.get("latitude", cell[0]),
                "lon": past.get("longitude", cell[1]),
                "km": round(
                    math.hypot(
                        (cell[0] - lat) * 110.574,
                        (cell[1] - lon) * 111.32 * math.cos(math.radians(lat)),
                    ),
                    1,
                ),
                "mean_flow": round(sum(flows) / len(flows), 1) if flows else None,
                "years": len(maxima),
                "fit": fit,
                "peak_months": [m["month"] for m in maxima],
                "high_years": [],
            }
            if fit:
                q2, q5, q10 = (round(return_level(fit, t), 1) for t in (2, 5, 10))
                entry["levels"] = {"q2": q2, "q5": q5, "q10": q10}
                entry["high_years"] = [m["year"] for m in maxima if m["max"] >= q5]
                e2 = exceedance(ahead["daily"]["time"], members, q2)
                e5 = exceedance(ahead["daily"]["time"], members, q5)
                entry["forecast"] = {"q2": e2, "q5": e5}
                entry["level"] = risk_level(e2["chance"], e5["chance"])
            else:
                entry["level"] = "unknown"
                entry["reason"] = (
                    f"needs {MIN_YEARS} complete years of river flow; have {len(maxima)}"
                )
            rivers.append(entry)
        nearest = min(rivers, key=lambda r: r["km"])
        valid = [r for r in rivers if r["mean_flow"] is not None]
        main = max(valid, key=lambda r: r["mean_flow"]) if valid else nearest
        order = {"unknown": 0, "low": 1, "watch": 2, "high": 3}
        worst = max((nearest, main), key=lambda r: order[r["level"]])
        flood_date = (worst.get("forecast") or {}).get("q2", {}).get("first_date")
        if worst["level"] == "high":
            flood_date = worst["forecast"]["q5"]["first_date"]
        out.update(
            {
                "nearest": nearest,
                "main": main,
                "level": worst["level"],
                "flood_date": flood_date,
                "advice": advice(worst["level"], flood_date, planted, season_days, today),
                "planting": planting_window(main["peak_months"], season_days),
                "source": source_ref(
                    GLOFAS,
                    settings.open_meteo_flood_url,
                    datetime.now(UTC).isoformat(timespec="seconds"),
                    sha256(repr(cells).encode()),
                ),
            }
        )
        return out
    finally:
        if own:
            http.close()
