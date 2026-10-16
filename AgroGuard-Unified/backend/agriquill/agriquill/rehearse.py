from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, date, datetime, timedelta
from typing import Any

from . import fusion
from .data import regions
from .farmers import lift_volume_m3
from .store import missing

STATUS = "design model, TO VERIFY on field data"
SEASON_RADIUS_KM = 75.0
DRY_CLASSES = frozenset({"moderately dry", "severely dry", "extremely dry"})
SCORE_AFTER = timedelta(hours=6)
METHOD = {
    "engine": "the live Kalman water balance, run forward per option",
    "equation": "D(t+1) = D(t) + rain - ET0 x Kc - percolation",
    "hold": "the forecast band as it stands",
    "act": "from the action day the level is set to the target, then the same daily change; "
    "the band restarts at one tube-reading variance",
    "dry": "the act option with every forecast millimetre of rain from the action day removed; "
    "ET0 kept, so it is a stress case",
    "counting": "act and dry count days at or below the floor from the action day; hold counts "
    "every day",
    "assumptions": fusion.ASSUMPTIONS,
}


def _sigma(p50: float, p90: float) -> float:
    return max((p90 - p50) / fusion.Z90, 0.0)


def _branch(p50: list[float], sigma: list[float], floor: float, start: int = 0) -> dict[str, Any]:
    below = [i for i, v in enumerate(p50) if i >= start and v <= floor]
    return {
        "counted_from_day": start,
        "p10": [round(m - fusion.Z90 * s, 2) for m, s in zip(p50, sigma, strict=True)],
        "p50": [round(m, 2) for m in p50],
        "p90": [round(m + fusion.Z90 * s, 2) for m, s in zip(p50, sigma, strict=True)],
        "days_below_floor": len(below),
        "first_breach_day": below[0] if below else None,
    }


def rehearse(
    band: dict[str, list[float]],
    days: list[dict[str, Any]],
    action_day: int,
    target_cm: float,
    floor_cm: float,
    area_ha: float,
) -> dict[str, Any]:
    n = min(len(band["p50"]), len(days))
    if n == 0:
        raise ValueError("no forecast days to rehearse")
    when = min(max(action_day, 0), n - 1)
    hold_mid = list(band["p50"][:n])
    hold_sigma = [_sigma(m, h) for m, h in zip(hold_mid, band["p90"][:n], strict=True)]
    shift = target_cm - hold_mid[when]
    reset = fusion.DEFAULT_READING_VAR_CM2
    daily_var = fusion.PROCESS_VAR_CM2_PER_H * 24
    act_mid = [v + shift if i >= when else v for i, v in enumerate(hold_mid)]
    act_sigma = [
        math.sqrt(reset + daily_var * (i - when)) if i >= when else s
        for i, s in enumerate(hold_sigma)
    ]
    rain_cm: list[float] = []
    total = 0.0
    for i, day in enumerate(days[:n]):
        total = (0.0 if i == when else total) + float(day.get("rain_mm") or 0.0) / 10.0
        rain_cm.append(total)
    dry_mid = [v - r for v, r in zip(act_mid, rain_cm, strict=True)]
    total = rain_cm[-1]
    return {
        "dates": [d["date"] for d in days[:n]],
        "action_day": when,
        "target_cm": target_cm,
        "floor_cm": floor_cm,
        "lift_cm": round(max(shift, 0.0), 2),
        "water_m3": lift_volume_m3(area_ha, shift),
        "branches": {
            "hold": _branch(hold_mid, hold_sigma, floor_cm),
            "act": _branch(act_mid, act_sigma, floor_cm, when),
            "dry": _branch(dry_mid, act_sigma, floor_cm, when),
        },
        "forecast_rain_mm": round(total * 10.0, 1),
        "method": METHOD,
        "status": STATUS,
    }


def digest(rehearsal: dict[str, Any]) -> str:
    body = json.dumps(rehearsal, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(body).hexdigest()


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def season_context(
    lat: float, lon: float, rows: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    if rows is None:
        rows = regions.region_facts()
    if not rows:
        return {"missing": [missing("season", "no regional data snapshot is built")]}
    near = min(rows, key=lambda r: _km(lat, lon, r["lat"], r["lon"]))
    km = _km(lat, lon, near["lat"], near["lon"])
    if km > SEASON_RADIUS_KM:
        reason = (
            f"nearest regional snapshot ({near['town']}) is {km:.0f} km away, beyond "
            f"{SEASON_RADIUS_KM:.0f} km"
        )
        return {"missing": [missing("season", reason)]}
    evaporation = near.get("evaporation") or {}
    return {
        "town": near["town"],
        "distance_km": round(km, 1),
        "spi3": near["spi3"],
        "spi_class": near["spiClass"],
        "rain_percentile": near["rainPercentile"],
        "rain_period": near["rainPeriod"],
        "rain_30d_mm": near["rain30Mm"],
        "et0_mm_day": near["et0MmDay"],
        "evaporation_ratio": evaporation.get("ratio"),
        "rice_yield_t_ha": near["riceYieldTHa"],
        "rice_yield_year": near["riceYieldYear"],
        "stress_weight": "likely" if near["spiClass"] in DRY_CLASSES else "possible",
        "sources": {
            "rain_and_spi": "CHIRPS v2.0",
            "weather_and_et0": "NASA POWER",
            "evaporation": "GLEAM v4.3",
            "yield": "FAOSTAT QCL",
            "sha256": near["sources"],
        },
        "built_at": near["builtAt"],
    }


def _utc(stamp: str) -> datetime:
    moment = datetime.fromisoformat(stamp)
    return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment.astimezone(UTC)


def score(
    rehearsal: dict[str, Any],
    readings: list[dict[str, Any]],
    end_local: str,
    offset_s: int,
) -> dict[str, Any] | None:
    due = datetime.fromisoformat(end_local).replace(tzinfo=UTC) - timedelta(seconds=offset_s)
    after = [r for r in readings if _utc(r["observed_at"]) >= due + SCORE_AFTER]
    if not after:
        return None
    reading = min(after, key=lambda r: _utc(r["observed_at"]))
    local_day = (_utc(reading["observed_at"]) + timedelta(seconds=offset_s)).date()
    index = (local_day - date.fromisoformat(rehearsal["dates"][0])).days
    if not 0 <= index < len(rehearsal["dates"]):
        return None
    measured = float(reading["value"])

    def against(name: str) -> dict[str, Any]:
        branch = rehearsal["branches"][name]
        return {
            "p50_cm": branch["p50"][index],
            "inside_band": branch["p10"][index] <= measured <= branch["p90"][index],
        }

    act, hold = against("act"), against("hold")
    return {
        "measured_cm": measured,
        "observed_at": reading["observed_at"],
        "reading_sha256": reading.get("sha256"),
        "day": index,
        "predicted_cm": act["p50_cm"],
        "error_cm": round(measured - act["p50_cm"], 2),
        "inside_band": act["inside_band"],
        "hold_p50_cm": hold["p50_cm"],
        "closer_to": "act"
        if abs(measured - act["p50_cm"]) <= abs(measured - hold["p50_cm"])
        else "hold",
        "note": "compared with that day's end-of-day estimate; closer_to=hold suggests the job "
        "did not run as approved",
    }
