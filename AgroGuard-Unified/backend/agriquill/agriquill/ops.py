from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from typing import Any

from . import crops, farmers, forecast, schedule


def build_plan(payload: Mapping[str, Any]) -> dict[str, Any]:
    country = payload["country"]
    if country not in crops.ASEAN_COUNTRIES:
        raise ValueError(f"unknown ASEAN country code {country!r}")
    paddies = payload["paddies"]
    for paddy in paddies:
        crops.get_crop(paddy["crop_id"])
    history = payload["weather_history"]
    future = payload["weather_forecast"]
    start = payload["start_date"]
    if isinstance(start, str):
        start = date.fromisoformat(start)

    result = forecast.forecast(
        [forecast.SeriesInput(p["id"], p["water_depth_cm"]) for p in paddies],
        [w["rain_mm"] for w in history],
        [w["temp_c"] for w in history],
        [w["rain_mm"] for w in future],
        forecast.ForecastConfig(horizon=len(future)),
        payload.get("backtest_rain_issued"),
    )
    plan = farmers.plan_operations(
        [
            farmers.PaddyState(
                p["id"],
                p["crop_id"],
                p["stage"],
                p["days_since_planting"],
                p["area_ha"],
                p["water_depth_cm"],
                p["ndvi"],
                p.get("salinity_ds_m") or (),
            )
            for p in paddies
        ],
        result["series"],
        [farmers.WeatherDay(w["rain_mm"], w["temp_c"], w["rh_pct"], w["wind_ms"]) for w in future],
        [
            farmers.Asset(a["id"], a["kind"], a["label"], a["status"], a.get("serves") or ())
            for a in payload.get("assets") or []
        ],
        start,
        payload.get("standard"),
        payload.get("threshold_overrides") or None,
        payload.get("hourly"),
    )
    out = {"farm_id": payload["farm_id"], "forecast": result, **plan}
    hourly = payload.get("hourly")
    if not hourly:
        out["schedule"] = {"status": "NOT_RUN", "reason": "no hourly forecast supplied"}
        return out
    scheduled = schedule.solve(
        plan["tasks"],
        hourly,
        payload.get("gates_by_paddy"),
        payload.get("durations_h"),
        payload.get("crew"),
    )
    out["tasks"], out["schedule"] = scheduled["tasks"], scheduled["summary"]
    return out
