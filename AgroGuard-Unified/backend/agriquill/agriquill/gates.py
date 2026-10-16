from __future__ import annotations

import math
from typing import Any

from .config import get_settings

STULL_SOURCE = (
    "Stull 2011, Wet-Bulb Temperature from Relative Humidity and Air Temperature, "
    "J. Appl. Meteor. Climatol. 50, doi:10.1175/JAMC-D-11-0143.1"
)
DEFAULT_GATES = {"max_wind_ms": 5.5, "delta_t_c": (2.0, 8.0), "max_rain_6h_mm": 10.0}
WASHOUT_HOURS = 6
GATED_KINDS = {
    "spray": ("wind", "delta_t", "washout"),
    "flight": ("wind",),
    "any": (),
}


def wet_bulb_stull(t_c: float, rh_pct: float) -> float | None:
    if not (-20.0 <= t_c <= 50.0 and 5.0 <= rh_pct <= 99.0):
        return None
    return (
        t_c * math.atan(0.151977 * math.sqrt(rh_pct + 8.313659))
        + math.atan(t_c + rh_pct)
        - math.atan(rh_pct - 1.676331)
        + 0.00391838 * rh_pct**1.5 * math.atan(0.023101 * rh_pct)
        - 4.686035
    )


def delta_t(t_c: float | None, wet_bulb_c: float | None) -> float | None:
    if t_c is None or wet_bulb_c is None:
        return None
    return round(t_c - wet_bulb_c, 2)


def hour_delta_t(hourly: dict[str, list[Any]], i: int) -> float | None:
    t = hourly["temperature_2m"][i]
    wet = (hourly.get("wet_bulb_temperature_2m") or [None] * (i + 1))[i]
    if wet is None and t is not None and hourly["relative_humidity_2m"][i] is not None:
        wet = wet_bulb_stull(t, hourly["relative_humidity_2m"][i])
    return delta_t(t, wet)


def washout_mm(
    rain: list[float | None], start: int, end: int, hours: int = WASHOUT_HOURS
) -> float | None:
    window = rain[start : end + hours]
    if len(window) < end - start + hours or any(r is None for r in window):
        return None
    return round(sum(r for r in window if r is not None), 2)


def hour_failure(
    hourly: dict[str, list[Any]], i: int, checks: tuple[str, ...], gates: dict[str, Any]
) -> str | None:
    settings = get_settings()
    ceiling = min(float(gates.get("max_wind_ms", 5.5)), settings.wind_ceiling_ms)
    if "delta_t" in checks:
        ceiling = min(ceiling, settings.spray_wind_advisory_ms)
    if "wind" in checks:
        wind = hourly["wind_speed_10m"][i]
        if wind is None or wind != wind or wind < 0:
            return "wind:missing"
        if wind > ceiling:
            return f"wind:{wind}>{ceiling}"
    if "delta_t" in checks:
        lo, hi = gates.get("delta_t_c", DEFAULT_GATES["delta_t_c"])
        dt = hour_delta_t(hourly, i)
        if dt is None:
            return "delta_t:missing"
        if not lo <= dt <= hi:
            return f"delta_t:{dt} outside {lo}..{hi}"
    return None


def window_mask(
    hourly: dict[str, list[Any]], kind: str, gates: dict[str, Any], duration_h: int = 1
) -> list[str | None]:
    checks = GATED_KINDS[kind]
    n = len(hourly["time"])
    per_hour = [hour_failure(hourly, i, checks, gates) for i in range(n)]
    limit = float(gates.get("max_rain_6h_mm", DEFAULT_GATES["max_rain_6h_mm"]))
    out: list[str | None] = []
    for start in range(n):
        end = start + duration_h
        if end > n:
            out.append("horizon:task runs past forecast")
            continue
        failure = next((f for f in per_hour[start:end] if f), None)
        if failure is None and "washout" in checks:
            rain = washout_mm(hourly["precipitation"], start, end)
            if rain is None:
                failure = "washout:6 h after application is beyond the forecast"
            elif rain > limit:
                failure = f"washout:{rain} mm in 6 h>{limit}"
        out.append(failure)
    return out


def nitrogen(applied_kg_ha: float, proposed_kg_ha: float, cap_kg_ha: float) -> dict[str, Any]:
    total = round(applied_kg_ha + proposed_kg_ha, 2)
    return {
        "ok": total <= cap_kg_ha,
        "total_kg_ha": total,
        "cap_kg_ha": cap_kg_ha,
        "remaining_kg_ha": round(max(cap_kg_ha - applied_kg_ha, 0.0), 2),
    }


def marginal_roi(
    gain_value: float | None, input_cost: float | None, min_roi: float
) -> dict[str, Any]:
    if gain_value is None or input_cost is None or input_cost <= 0:
        return {
            "ok": None,
            "roi": None,
            "min_roi": min_roi,
            "reason": "no sourced yield-response curve or input cost; ROI cannot be evaluated",
        }
    roi = round(gain_value / input_cost, 3)
    return {"ok": roi >= min_roi, "roi": roi, "min_roi": min_roi, "reason": None}
