from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from . import mixfarm, waterplan
from .config import get_settings
from .data import weather

HORIZON_DAYS = 14
DEFAULT_START_SHARE = 0.9
DEFAULT_MIN_CM = 30.0
_BODY = Body(...)


def require_planner() -> None:
    if not get_settings().farm_market_enabled:
        raise HTTPException(status_code=404, detail="Not found")


def _daily(lat: float, lon: float) -> list[dict[str, Any]]:
    got = weather.fetch_hourly(lat, lon, past_days=0, forecast_days=HORIZON_DAYS)
    hourly = got.get("hourly")
    if not hourly:
        raise LookupError("the weather service did not answer")
    rows = weather.daily_from_hourly(hourly)
    return [{"date": r["date"], "rain_mm": r["rain_mm"], "et0_mm": r["et0_mm"]} for r in rows][
        :HORIZON_DAYS
    ]


def _valid_farm(body: dict[str, Any]) -> dict[str, Any]:
    try:
        area = float(body["area_ha"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="area_ha is required") from exc
    if not 0 < area <= 10:
        raise HTTPException(status_code=422, detail="area_ha must be above 0 and at most 10")
    return {**body, "area_ha": area}


def water_plan(
    days: list[dict[str, Any]],
    area_ha: float,
    perimeter_m: float | None,
    soil: str,
    depth_cm: float,
    start_cm: float | None,
    min_cm: float,
    pump_l_s: float,
    pump_hours: float,
    source_m: float | None,
    head_m: float,
    max_loss_m: float,
) -> dict[str, Any]:
    perimeter = perimeter_m or 4.0 * (area_ha * 10000.0) ** 0.5
    trench = waterplan.size_trench(area_ha, perimeter, mixfarm.TRENCH_SHARE, depth_cm / 100.0)
    start = depth_cm * DEFAULT_START_SHARE if start_cm is None else start_cm
    low, high = waterplan.SEEPAGE_MM_DAY.get(soil, waterplan.SEEPAGE_MM_DAY["loam"])
    runs = {
        "wet_soil": waterplan.simulate_level(days, start, low, full_cm=depth_cm),
        "dry_soil": waterplan.simulate_level(days, start, high, full_cm=depth_cm),
    }
    worst = runs["dry_soil"]
    hit = waterplan.first_below(worst, min_cm)
    need = waterplan.refill_m3(worst[-1]["level_cm"], start, trench["surface_m2"]) if worst else 0.0
    plan: dict[str, Any] = {
        "trench": trench,
        "start_cm": start,
        "min_cm": min_cm,
        "seepage_mm_day": {"low": low, "high": high, "soil": soil},
        "runs": runs,
        "first_below": hit,
        "refill": {
            "m3": round(need, 2),
            "pump_days": round(waterplan.refill_days(need, pump_l_s, pump_hours), 2),
        },
        "evaporation": {"kc": waterplan.OPEN_WATER_KC, "source": waterplan.OPEN_WATER_KC_SOURCE},
        "status": waterplan.STATUS,
    }
    if source_m:
        plan["pipeline"] = {
            "length_m": source_m,
            "pipe": waterplan.pipe_size(pump_l_s, source_m, max_loss_m),
            "pump_kw": round(waterplan.pump_kw(pump_l_s, head_m), 3),
            "head_m": head_m,
        }
    return plan


def build(reader_dep: Any) -> APIRouter:
    r = APIRouter(prefix="/planner", dependencies=[Depends(require_planner)])

    @r.get("/catalogue")
    async def catalogue(caller: Any = reader_dep) -> dict[str, Any]:
        return {
            "status": mixfarm.STATUS,
            "species": [{"id": k, **v} for k, v in mixfarm.SPECIES.items()],
        }

    @r.post("/suggest")
    async def suggest(
        body: dict[str, Any] = _BODY, caller: Any = reader_dep
    ) -> list[dict[str, Any]]:
        return mixfarm.suggest(_valid_farm(body))

    @r.get("/water")
    async def water(
        lat: float = Query(..., ge=-90, le=90),
        lon: float = Query(..., ge=-180, le=180),
        area_ha: float = Query(..., gt=0, le=10),
        perimeter_m: float | None = Query(None, gt=0),
        soil: str = Query("clay", pattern="^(clay|loam|sandy)$"),
        depth_cm: float = Query(60.0, ge=20, le=150),
        start_cm: float | None = Query(None, ge=0, le=150),
        min_cm: float = Query(DEFAULT_MIN_CM, ge=0, le=150),
        pump_l_s: float = Query(5.0, gt=0, le=100),
        pump_hours: float = Query(4.0, gt=0, le=24),
        source_m: float | None = Query(None, gt=0, le=5000),
        head_m: float = Query(6.0, ge=0, le=100),
        max_loss_m: float = Query(2.0, gt=0, le=50),
        caller: Any = reader_dep,
    ) -> dict[str, Any]:
        try:
            days = await run_in_threadpool(_daily, lat, lon)
        except (LookupError, OSError) as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        try:
            return water_plan(
                days,
                area_ha,
                perimeter_m,
                soil,
                depth_cm,
                start_cm,
                min_cm,
                pump_l_s,
                pump_hours,
                source_m,
                head_m,
                max_loss_m,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return r
