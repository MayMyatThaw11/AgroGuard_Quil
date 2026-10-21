from __future__ import annotations

import asyncio
import base64
import binascii
import csv
import hmac
import math
import tempfile
import time
import uuid
import zipfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any, Literal, NamedTuple

from fastapi import APIRouter, Body, Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from .. import (
    agronomy,
    contract,
    crops,
    cropvalue,
    dsl,
    evidence,
    fleet,
    jobs,
    knowledge,
    live,
    ml,
    onboard,
    ops,
    safety,
    sim,
    telemetry,
    twin,
)
from ..config import Settings, get_settings
from ..data import (
    chirps,
    ecocrop,
    fao_pack,
    gfw_forest,
    gfw_marine,
    gleam,
    nasapower,
    pinksheet,
    regions,
)
from ..data.soil import fetch_soil
from ..data.weather import fetch_weather
from ..ledger import Ledger, get_ledger


def _ledger() -> Ledger:
    return get_ledger(get_settings().ledger_path)


ROLES = frozenset({"crew", "manager"})


class Caller(NamedTuple):
    name: str | None
    roles: frozenset[str]
    farms: frozenset[str] | None = None


User = tuple[str, str, frozenset[str], frozenset[str] | None]


def parse_users(raw: str) -> list[User]:
    users: list[User] = []
    for entry in (e.strip() for e in raw.split(";")):
        if not entry:
            continue
        parts = [p.strip() for p in entry.split(":")]
        if len(parts) not in (3, 4) or not parts[0] or not parts[1]:
            raise ValueError("each user is name:code:roles[:farm1,farm2]")
        roles = frozenset(r.strip() for r in parts[2].split(",")) & ROLES
        farms = None
        if len(parts) == 4 and parts[3] != "*":
            farms = frozenset(f.strip() for f in parts[3].split(",") if f.strip())
        users.append((parts[0], parts[1], roles, farms))
    return users


def _user_entries(settings: Settings) -> str:
    sources = [settings.users]
    if settings.is_development:
        sources.append(settings.builtin_user)
    return ";".join(s.get_secret_value() for s in sources if s)


def require_sign_in_configured(settings: Settings) -> None:
    """Refuse to serve outside development with no way to sign in.

    The alternative is an open API that treats every request as a full-access caller.
    """
    if settings.is_development:
        return
    if settings.write_token is None and not _user_entries(settings):
        raise RuntimeError(
            f"AGRIQUILL_ENVIRONMENT is {settings.environment!r} and no sign-in is configured. "
            "Set AGRIQUILL_USERS (or AGRIQUILL_WRITE_TOKEN), or set "
            "AGRIQUILL_ENVIRONMENT=development for local use."
        )


def _same(given: str | None, expected: str) -> bool:
    return given is not None and hmac.compare_digest(given.encode(), expected.encode())


def _reader(
    token: str | None = Header(None, alias="X-AgriQuill-Write-Token"),
) -> Caller | None:
    settings = get_settings()
    try:
        users = parse_users(_user_entries(settings))
    except ValueError as exc:
        raise HTTPException(
            status_code=500, detail="AGRIQUILL_USERS or AGRIQUILL_BUILTIN_USER is malformed"
        ) from exc
    for name, code, roles, farms in users:
        if _same(token, code):
            return Caller(name, roles, farms)
    shared = settings.write_token
    if shared is not None and _same(token, shared.get_secret_value()):
        return Caller(None, ROLES)
    if shared is None and not users:
        if not settings.is_development:
            # Startup refuses this state; guard anyway so a runtime change can't open the API.
            raise HTTPException(status_code=503, detail="server sign-in is not configured")
        return Caller(None, ROLES)
    if token is None:
        return None
    raise HTTPException(status_code=401, detail="this action needs the farm write token")


_READER = Depends(_reader)


def _caller(caller: Caller | None = _READER) -> Caller:
    if caller is None:
        raise HTTPException(status_code=401, detail="this action needs the farm write token")
    return caller


_CALLER = Depends(_caller)


def _public_farms() -> set[str]:
    return {f.strip() for f in get_settings().public_farms.split(",") if f.strip()}


def _all_farms(caller: Caller | None) -> bool:
    return caller is not None and caller.farms is None


def visible(caller: Caller | None, farm_id: str) -> bool:
    if _all_farms(caller) or farm_id in _public_farms():
        return True
    return caller is not None and caller.farms is not None and farm_id in caller.farms


def _denied(caller: Caller | None, farm_id: str) -> HTTPException:
    if caller is None:
        return HTTPException(status_code=401, detail=f"sign in to see farm {farm_id}")
    return HTTPException(
        status_code=403, detail=f"this access code has no access to farm {farm_id}"
    )


def _see(caller: Caller | None, farm_id: str) -> None:
    if not visible(caller, farm_id):
        raise _denied(caller, farm_id)


def _own(caller: Caller, farm_id: str) -> None:
    if caller.farms is not None and farm_id not in caller.farms:
        raise _denied(caller, farm_id)


def _device_farms(device_id: str) -> set[str]:
    return live.device_owners().get(device_id, set())


def _crew(caller: Caller = _CALLER) -> Caller:
    if not caller.roles:
        raise HTTPException(status_code=403, detail=f"{caller.name} has no field role")
    return caller


def _manager(caller: Caller = _CALLER) -> Caller:
    if "manager" not in caller.roles:
        raise HTTPException(status_code=403, detail=f"{caller.name} does not have the manager role")
    return caller


def _named(caller: Caller, person: str) -> None:
    if caller.name is not None and caller.name.casefold() != person.strip().casefold():
        raise HTTPException(
            status_code=403, detail=f"this access code belongs to {caller.name}; enter that name"
        )


_AS_CREW = Depends(_crew)
_AS_MANAGER = Depends(_manager)
WRITE = [_CALLER]
MANAGER = [_AS_MANAGER]
_JOBS: dict[str, dict[str, Any]] = {}
_TWIN_TASKS = twin.TaskStore()
_TASKS_BODY = Body(...)
_START = Query(...)
_END = Query(...)
_DAY = Query(..., alias="date")

router = APIRouter(prefix="/agriquill")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/auth/me")
async def auth_me(caller: Caller = _CALLER) -> dict[str, Any]:
    settings = get_settings()
    required = settings.write_token is not None or bool(_user_entries(settings))
    farms = sorted(caller.farms) if caller.farms is not None else None
    return {
        "name": caller.name,
        "roles": sorted(caller.roles),
        "farms": farms,
        "sign_in_required": required,
    }


@router.get("/data/health")
async def data_health() -> dict[str, Any]:
    breakers = {
        "gfw_forest": gfw_forest._BREAKER,
        "global_fishing_watch": gfw_marine._BREAKER,
        "gleam": gleam._BREAKER,
    }
    return {name: breaker.state() for name, breaker in breakers.items()}


@router.get("/territory-profile")
async def territory_profile(
    lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)
) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        soil, weather = await asyncio.gather(fetch_soil(lat, lon), fetch_weather(lat, lon))
    except Exception as exc:  # upstream outage surfaces as 502 with detail
        raise HTTPException(status_code=502, detail=f"upstream failed: {exc}") from exc
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    return {
        "location": {"latitude": lat, "longitude": lon, "country_code": "MM"},
        "soil_profile": soil,
        "weather_forecast": weather,
        "latency_ms": elapsed_ms,
        "cached_target_ms": 800,
    }


class LintReq(BaseModel):
    script_content: str


@router.post("/dsl/lint")
async def dsl_lint(req: LintReq) -> dict[str, Any]:
    return dsl.lint(req.script_content)


class SimReq(BaseModel):
    parcel_id: str = Field(min_length=1)
    engine: str = "analytic-logistic-fixture"
    simulation_days: int = Field(default=120, ge=1, le=365)
    management_override: dict[str, Any] | None = None


@router.post("/sim/run", status_code=202, dependencies=WRITE)
async def sim_run(req: SimReq) -> dict[str, Any]:
    task_id = f"sim_task_{uuid.uuid4().hex[:12]}"
    started = time.perf_counter()
    result = sim.simulate(parcel_id=req.parcel_id, days=req.simulation_days)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    _JOBS[task_id] = {
        "task_id": task_id,
        "status": "COMPLETED",
        "result": result,
        "elapsed_ms": elapsed_ms,
        "design_target_ms": 250,
    }
    _ledger().append(
        "sim_run", {"task_id": task_id, "parcel_id": req.parcel_id, "days": req.simulation_days}
    )
    return {
        "task_id": task_id,
        "status": "COMPLETED",
        "check_status_url": f"/api/v1/agriquill/sim/status/{task_id}",
    }


@router.get("/sim/status/{task_id}")
async def sim_status(task_id: str) -> dict[str, Any]:
    job = _JOBS.get(task_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


class CropPredictReq(BaseModel):
    soil_ph: float = Field(ge=0.0, le=14.0)
    rainfall_mm: float = Field(ge=0.0, le=20000.0)
    temperature_c: float = Field(ge=-20.0, le=60.0)


@router.post("/ml/crop-predict")
async def ml_crop_predict(req: CropPredictReq) -> dict[str, Any]:
    try:
        return ml.crop_predict(req.soil_ph, req.rainfall_mm, req.temperature_c)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class PlantRecommendReq(BaseModel):
    soil_ph: float = Field(ge=0.0, le=14.0)
    rainfall_mm: float = Field(ge=0.0, le=20000.0)
    temperature_c: float = Field(ge=-20.0, le=60.0)
    limit: int = Field(default=3, ge=1, le=10)


@router.post("/ml/plant-recommend")
async def ml_plant_recommend(req: PlantRecommendReq) -> dict[str, Any]:
    try:
        return ml.plant_recommend(req.soil_ph, req.rainfall_mm, req.temperature_c, limit=req.limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class SnapshotReq(BaseModel):
    parcel_id: str = "field_01_paddy"
    day_index: int = Field(default=42, ge=1, le=120)
    season_days: int = Field(default=120, ge=1, le=365)
    scenario_id: str = "demo-awd-baseline"


@router.post("/sim/snapshot")
async def sim_snapshot(req: SnapshotReq) -> dict[str, Any]:
    return sim.build_simulation_snapshot(
        parcel_id=req.parcel_id,
        day_index=req.day_index,
        season_days=req.season_days,
        scenario_id=req.scenario_id,
    )


class ActuationReq(BaseModel):
    target: str = Field(pattern="^(drone|irrigation_valve|sluice_gate)$")
    wind_speed_ms: float | None = None
    declared_inputs: list[str] = []
    parcel_standard: str | None = None
    approval_pin: str | None = None
    operator_confirmed: bool = False
    challenge_token: str | None = None
    requested_minutes: float | None = None
    farm_id: str | None = Field(default=None, max_length=60)


@router.post("/actuation/approve")
async def actuation_approve(req: ActuationReq, caller: Caller = _AS_MANAGER) -> dict[str, Any]:
    if req.farm_id:
        _own(caller, req.farm_id)
    wind = req.wind_speed_ms
    live_wind = await asyncio.to_thread(live.fresh_wind, req.farm_id) if req.farm_id else None
    if live_wind is not None:
        wind = max(wind if wind is not None else 0.0, live_wind["value"])
    verdict = safety.evaluate_actuation(
        req.target,
        wind_speed_ms=wind,
        declared_inputs=req.declared_inputs,
        standard=req.parcel_standard,
        approval_pin=req.approval_pin,
        operator_confirmed=req.operator_confirmed,
        challenge_token=req.challenge_token,
        requested_minutes=req.requested_minutes,
        rate_key=caller.name or "shared-token",
        farm_key=req.farm_id,
    )
    failure = verdict["failure"]
    if failure and failure["code"] == safety.RATE_LIMITED:
        _ledger().append(
            "actuation_rate_limited",
            {
                "target": req.target,
                "caller": caller.name,
                **({"farm_id": req.farm_id} if req.farm_id else {}),
            },
        )
        raise HTTPException(
            status_code=429, detail=failure["detail"], headers={"Retry-After": "60"}
        )
    entry = _ledger().append(
        "actuation_evaluated",
        {
            "status": verdict["status"],
            "target": req.target,
            "failure": verdict["failure"],
            **({"farm_id": req.farm_id} if req.farm_id else {}),
        },
    )
    verdict["ledger_commit_hash"] = entry.hash
    verdict["wind_used"] = {
        "value_ms": wind,
        "source": "on-site anemometer (stricter of live and request)" if live_wind else "request",
        "anemometer": live_wind,
    }
    return verdict


def _entry_visible(caller: Caller | None, entry: dict[str, Any]) -> bool:
    farm_id = entry["payload"].get("farm_id")
    return _all_farms(caller) if farm_id is None else visible(caller, farm_id)


@router.get("/ledger")
async def ledger(caller: Caller | None = _READER) -> dict[str, Any]:
    chain = _ledger()
    entries = [e for e in chain.entries() if _entry_visible(caller, e)]
    return {"valid": chain.verify(), "head": chain.head_hash(), "entries": entries}


class EvidenceReq(BaseModel):
    evidence: dict[str, Any]


@router.post("/evidence/validate")
async def evidence_validate(req: EvidenceReq) -> dict[str, Any]:
    return evidence.validate_evidence(req.evidence)


class PassportReq(BaseModel):
    items: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/evidence/passport")
async def evidence_passport(req: PassportReq) -> dict[str, Any]:
    return evidence.passport_status(req.items)


class EtoReq(BaseModel):
    tmax_c: float
    tmin_c: float
    rh_mean_pct: float = Field(ge=0.0, le=100.0)
    wind2_ms: float = Field(ge=0.0)
    solar_mj_m2_day: float = Field(ge=0.0)
    kc: float | None = Field(default=None, gt=0.0)
    elevation_m: float = Field(default=0.0, ge=-500.0, le=9000.0)
    latitude_deg: float = Field(default=0.0, ge=-90.0, le=90.0)
    day_of_year: int = Field(default=180, ge=1, le=366)


@router.post("/agronomy/eto")
async def agronomy_eto(req: EtoReq) -> dict[str, Any]:
    et0 = agronomy.fao56_eto(
        req.tmax_c,
        req.tmin_c,
        req.rh_mean_pct,
        req.wind2_ms,
        req.solar_mj_m2_day,
        elevation_m=req.elevation_m,
        latitude_rad=math.radians(req.latitude_deg),
        day_of_year=req.day_of_year,
    )
    out: dict[str, Any] = {
        "et0_mm_day": et0,
        "equation": "ETc=Kc x ETo (FAO-56)",
        "aquacrop": agronomy.aquacrop_stub_info(),
    }
    if req.kc is not None:
        out["etc_mm_day"] = agronomy.crop_etc(et0, req.kc)
    return out


@router.get("/ops/crops")
async def ops_crops(country: str | None = None, category: str | None = None) -> dict[str, Any]:
    try:
        items = crops.catalog(country=country, category=category)
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc.args[0])) from exc
    return {
        "countries": crops.ASEAN_COUNTRIES,
        "categories": list(crops.CATEGORIES),
        "crops": items,
    }


class OpsPaddy(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    crop_id: str
    stage: str
    days_since_planting: int = Field(ge=0, le=400)
    area_ha: float = Field(gt=0.0, le=500.0)
    water_depth_cm: list[float] = Field(min_length=7, max_length=400)
    ndvi: list[float] = Field(min_length=5, max_length=400)
    salinity_ds_m: list[float] = Field(default_factory=list, max_length=400)


class OpsWeatherDay(BaseModel):
    rain_mm: float = Field(ge=0.0, le=1000.0)
    temp_c: float = Field(ge=-20.0, le=60.0)
    rh_pct: float = Field(ge=0.0, le=100.0)
    wind_ms: float = Field(ge=0.0, le=80.0)


class OpsAsset(BaseModel):
    id: str = Field(min_length=1, max_length=32)
    kind: str = Field(pattern="^(pump|gate|sluice|drone|tractor|robot)$")
    label: str
    status: str
    serves: list[str] = Field(default_factory=list)


class OpsPlanReq(BaseModel):
    farm_id: str = Field(min_length=1)
    country: str = Field(min_length=2, max_length=2)
    standard: str | None = None
    start_date: date
    paddies: list[OpsPaddy] = Field(min_length=1, max_length=64)
    weather_history: list[OpsWeatherDay] = Field(min_length=7, max_length=400)
    weather_forecast: list[OpsWeatherDay] = Field(min_length=1, max_length=21)
    assets: list[OpsAsset] = Field(default_factory=list)
    threshold_overrides: dict[str, float] = Field(default_factory=dict)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def _location_pair(self) -> OpsPlanReq:
        if (self.lat is None) != (self.lon is None):
            raise ValueError("lat and lon must be sent together")
        return self


@router.post("/ops/plan", dependencies=WRITE)
async def ops_plan(req: OpsPlanReq) -> dict[str, Any]:
    try:
        plan = await asyncio.to_thread(ops.build_plan, req.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc.args[0])) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    location = {"lat": req.lat, "lon": req.lon} if req.lat is not None else None
    entry = _ledger().append(
        "ops_plan",
        {
            "farm_id": req.farm_id,
            "location": location,
            "method": plan["forecast"]["method"],
            "task_count": len(plan["tasks"]),
            "proposed_actuations": sum(1 for t in plan["tasks"] if t["actuation"]),
        },
    )
    return {**plan, "location": location, "ledger_commit_hash": entry.hash}


@router.get("/fleet/fields")
async def fleet_fields(
    limit: int = Query(100, ge=1, le=fleet.MAX_LIMIT),
    offset: int = Query(0, ge=0),
    region: str | None = Query(None, pattern="^(AY|BG|SG|MD|YG)$"),
    status: str | None = Query(None, pattern="^(ok|watch|alert|offline)$"),
    awd_safe_depth_cm: float | None = Query(None, ge=-30, le=-1),
) -> dict[str, Any]:
    overrides = {"awd_safe_depth_cm": awd_safe_depth_cm} if awd_safe_depth_cm is not None else None
    return fleet.list_fields(
        limit=limit, offset=offset, region=region, status=status, overrides=overrides
    )


@router.get("/farms")
async def twin_farms(count: int = Query(100, ge=1, le=twin.MAX_FARMS)) -> list[dict[str, Any]]:
    return twin.fixture(count)["farms"]


@router.get("/farms/{farm_id}")
async def twin_farm(farm_id: str) -> dict[str, Any]:
    data = twin.fixture(twin.MAX_FARMS)
    farm = next((f for f in data["farms"] if f["id"] == farm_id), None)
    if farm is None:
        raise HTTPException(status_code=404, detail=f"farm {farm_id} not found")
    return {**farm, "machines": [m for m in data["fleet"] if m["farmId"] == farm_id]}


class EcocropScreenReq(BaseModel):
    crop: str = Field(min_length=1, max_length=120)
    mean_temp_c: float | None = Field(None, ge=-60, le=60)
    annual_rain_mm: float | None = Field(None, ge=0, le=15000)
    elevation_m: float | None = Field(None, ge=-500, le=9000)
    soil_ph: float | None = Field(None, ge=0, le=14)


@router.get("/ecocrop/crops")
async def ecocrop_crops(
    q: str | None = Query(None, max_length=120), limit: int = Query(50, ge=1, le=500)
) -> dict[str, Any]:
    store = ecocrop.load()
    return {
        "source": store.get("source"),
        "retrieved_at": store.get("retrieved_at"),
        "crops": ecocrop.search(q, limit),
    }


@router.get("/ecocrop/crops/{key}")
async def ecocrop_crop(key: str) -> dict[str, Any]:
    crop = ecocrop.get(key)
    if crop is None:
        raise HTTPException(status_code=404, detail=f"crop {key} not in the local EcoCrop store")
    return crop


@router.post("/ecocrop/screen")
async def ecocrop_screen(req: EcocropScreenReq) -> dict[str, Any]:
    crop = ecocrop.get(req.crop)
    if crop is None:
        raise HTTPException(status_code=404, detail=f"crop {req.crop} not in the EcoCrop store")
    return ecocrop.screen(crop, req.model_dump(exclude={"crop"}))


@router.get("/fleet")
async def twin_fleet(count: int = Query(100, ge=1, le=twin.MAX_FARMS)) -> list[dict[str, Any]]:
    return twin.fixture(count)["fleet"]


@router.post("/tasks", dependencies=WRITE)
async def twin_post_tasks(body: Any = _TASKS_BODY) -> list[dict[str, Any]]:
    data = twin.fixture(twin.MAX_FARMS)
    farms = {f["id"]: f for f in data["farms"]}
    machines = {m["id"]: m for m in data["fleet"]}
    accepted, issues = twin.validate_tasks(body, farms, machines)
    if issues:
        raise HTTPException(status_code=422, detail=issues)
    recorded = _TWIN_TASKS.record(accepted, datetime.now(UTC))
    _ledger().append(
        "twin_tasks_recorded",
        {"count": len(recorded), "simulated": True, "actuation_emitted": False},
    )
    return recorded


class AgentEvidence(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    value: str = Field(max_length=300)
    source: str = Field(min_length=1, max_length=160)


class AgentDecisionReq(BaseModel):
    proposal_id: str = Field(min_length=1, max_length=40)
    agent: str = Field(pattern="^(water|scout|protect|harvest|auditor)$")
    farm_id: str = Field(min_length=1, max_length=40)
    paddy_ids: list[str] = Field(default_factory=list, max_length=16)
    title: str = Field(min_length=1, max_length=200)
    action: str | None = Field(default=None, max_length=60)
    decision: str = Field(pattern="^(approved|rejected)$")
    decided_by: str = Field(min_length=1, max_length=80)
    task_ids: list[str] = Field(default_factory=list, max_length=64)
    evidence: list[AgentEvidence] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def _named_person(self) -> AgentDecisionReq:
        if not self.decided_by.strip():
            raise ValueError("a named person must decide")
        return self


@router.post("/agents/decisions")
async def agent_decision(req: AgentDecisionReq, caller: Caller = _AS_MANAGER) -> dict[str, Any]:
    _own(caller, req.farm_id)
    entry = _ledger().append(
        "agent_decision",
        {**req.model_dump(), "signed_in_as": caller.name, "actuation_emitted": False},
    )
    return {"recorded": True, "ledger_commit_hash": entry.hash}


@router.get("/tasks")
async def twin_get_tasks(since: str | None = Query(None)) -> list[dict[str, Any]]:
    moment = twin.parse_iso(since) if since else None
    if since and moment is None:
        raise HTTPException(status_code=422, detail="since must be an ISO timestamp")
    return _TWIN_TASKS.since(moment)


def _run_view(caller: Caller | None, run: dict[str, Any] | None) -> dict[str, Any] | None:
    if run is None or run["job"] != jobs.WATCH_JOB or not isinstance(run.get("result"), dict):
        return run
    farms = {k: v for k, v in run["result"].items() if visible(caller, k)}
    return {**run, "result": farms}


@router.get("/jobs")
async def jobs_list(caller: Caller | None = _READER) -> dict[str, Any]:
    listed = [{**j, "last_run": _run_view(caller, j["last_run"])} for j in jobs.catalog()]
    return {"jobs": listed, "scheduler_interval_s": get_settings().job_interval_s}


@router.post("/jobs/{name}/run", status_code=202, dependencies=MANAGER)
async def jobs_run(name: str) -> dict[str, Any]:
    try:
        return jobs.start(name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"unknown job {name}") from exc


@router.get("/jobs/status/{run_id}")
async def jobs_status(run_id: str, caller: Caller | None = _READER) -> dict[str, Any]:
    run = _run_view(caller, jobs.status(run_id))
    if run is None:
        raise HTTPException(status_code=404, detail="Job run not found")
    return run


@router.get("/faostat/qcl")
async def faostat_qcl(
    country: str = Query(..., min_length=2, max_length=60),
    item: str = Query(..., min_length=1, max_length=80),
    element: str | None = Query(None, max_length=60),
    year_from: int | None = Query(None, ge=1961, le=2100),
    year_to: int | None = Query(None, ge=1961, le=2100),
    live: bool = False,
) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(
            fao_pack.faostat_qcl, country, item, element, year_from, year_to, live
        )
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc.args[0])) from exc


@router.get("/fao/crop-calendar")
async def fao_crop_calendar(
    country: str = Query(..., min_length=2, max_length=60),
    crop: str | None = Query(None, max_length=60),
) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(fao_pack.crop_calendar, country, crop)
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc.args[0])) from exc


@router.get("/chirps/rainfall")
async def chirps_rainfall(
    lat: float = Query(..., ge=-50, le=50),
    lon: float = Query(..., ge=-180, le=180),
    start: date = _START,
    end: date = _END,
    step: str = Query("monthly", pattern="^(monthly|daily)$"),
) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(chirps.rainfall, lat, lon, start, end, step)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/nasa-power/daily")
async def nasa_power_daily(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    start: date = _START,
    end: date = _END,
) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(nasapower.daily, lat, lon, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/agronomy/et0")
async def agronomy_et0(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    day: date = _DAY,
) -> dict[str, Any]:
    return await asyncio.to_thread(nasapower.et0, lat, lon, day)


@router.get("/regions")
async def regions_list() -> dict[str, Any]:
    return await asyncio.to_thread(regions.listing)


@router.get("/regions/{town}")
async def regions_get(town: str) -> dict[str, Any]:
    out = await asyncio.to_thread(regions.get, town)
    if "built_at" not in out:
        raise HTTPException(status_code=404, detail=out["missing"][0]["reason"])
    return out


@router.get("/farms/{farm_id}/region")
async def farm_region(farm_id: str) -> dict[str, Any]:
    out = await asyncio.to_thread(regions.for_farm, farm_id)
    if "built_at" not in out:
        raise HTTPException(status_code=404, detail=out["missing"][0]["reason"])
    return out


@router.get("/gleam/stress")
async def gleam_stress(
    lat: float = Query(..., ge=-89.95, le=89.95),
    lon: float = Query(..., ge=-179.95, le=179.95),
    year: int | None = Query(None, ge=1980, le=2100),
) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(gleam.stress, lat, lon, year)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/gleam/daily")
async def gleam_daily(
    lat: float = Query(..., ge=-89.95, le=89.95),
    lon: float = Query(..., ge=-179.95, le=179.95),
    start: date = _START,
    end: date = _END,
) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(gleam.daily, lat, lon, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/gfw/forest-compliance")
async def gfw_forest_compliance(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(1.0, ge=0.05, le=25),
) -> dict[str, Any]:
    return await asyncio.to_thread(gfw_forest.compliance, lat, lon, radius_km)


@router.get("/gfw/datasets")
async def gfw_datasets(
    q: str = Query(..., min_length=2, max_length=80), limit: int = Query(10, ge=1, le=50)
) -> dict[str, Any]:
    return await asyncio.to_thread(gfw_forest.search_datasets, q, limit)


@router.get("/gfw/coastal-vessels")
async def gfw_coastal_vessels(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(20.0, ge=1, le=100),
    start: date | None = None,
    end: date | None = None,
) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(gfw_marine.coastal_vessels, lat, lon, radius_km, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/gfw/vessels")
async def gfw_vessels(
    q: str = Query(..., min_length=2, max_length=80), limit: int = Query(10, ge=1, le=25)
) -> dict[str, Any]:
    return await asyncio.to_thread(gfw_marine.vessel_search, q, limit)


def _webhook_token(token: str | None, network: str) -> None:
    """Check the webhook token for one LoRaWAN network.

    Each network has its own token so a leak from one can't forge the other. The
    shared telemetry_webhook_token still works for a network with no token of its own.
    """
    settings = get_settings()
    expected = (
        settings.telemetry_ttn_token if network == "ttn" else settings.telemetry_chirpstack_token
    ) or settings.telemetry_webhook_token
    if expected is None:
        raise HTTPException(status_code=503, detail="telemetry webhook token is not configured")
    if token is None or not hmac.compare_digest(token, expected.get_secret_value()):
        raise HTTPException(status_code=401, detail="invalid telemetry token")


def _require_declared_device(device_id: str, caller: Caller | None = None) -> None:
    """Only sensors a farm contract declares may report, so a made-up ID can't write readings.

    The AgroGuard bridge is the one exception: its own sensors ("agroguard:<id>") are
    on no contract, and only the bridge user may report them.
    """
    if _device_farms(device_id):
        return
    settings = get_settings()
    if (
        caller is not None
        and caller.name == settings.bridge_user
        and device_id.startswith(settings.bridge_device_prefix)
    ):
        return
    raise HTTPException(
        status_code=403, detail=f"sensor {device_id} is not declared on any farm contract"
    )


def _ingest(parsed: tuple[str, str, dict[str, Any]], source: str) -> dict[str, Any]:
    _require_declared_device(parsed[0])
    try:
        return telemetry.ingest(parsed[0], parsed[1], parsed[2], source)
    except telemetry.TelemetryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/telemetry/ttn")
async def telemetry_ttn(
    body: dict[str, Any] = _TASKS_BODY,
    token: str | None = Header(None, alias="X-AgriQuill-Token"),
) -> dict[str, Any]:
    _webhook_token(token, "ttn")
    try:
        parsed = telemetry.parse_ttn(body)
    except telemetry.TelemetryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await asyncio.to_thread(_ingest, parsed, "lorawan:ttn")


@router.post("/telemetry/chirpstack")
async def telemetry_chirpstack(
    body: dict[str, Any] = _TASKS_BODY,
    event: str = Query("up"),
    token: str | None = Header(None, alias="X-AgriQuill-Token"),
) -> dict[str, Any]:
    _webhook_token(token, "chirpstack")
    if event != "up":
        return {"ignored": event}
    try:
        parsed = telemetry.parse_chirpstack(body)
    except telemetry.TelemetryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await asyncio.to_thread(_ingest, parsed, "lorawan:chirpstack")


class ManualReadingReq(BaseModel):
    device_id: str = Field(min_length=1, max_length=120)
    observed_at: str = Field(min_length=10, max_length=40)
    values: dict[str, float] = Field(min_length=1, max_length=8)
    reporter: str = Field(min_length=1, max_length=80)
    photo_base64: str | None = Field(default=None, max_length=2_700_000)


def _manual_reading(req: ManualReadingReq) -> dict[str, Any]:
    evidence = None
    if req.photo_base64:
        try:
            photo = base64.b64decode(req.photo_base64, validate=True)
        except binascii.Error as exc:
            raise telemetry.TelemetryError("photo_base64 is not valid base64") from exc
        evidence = telemetry.save_photo(photo)
    return telemetry.ingest(
        req.device_id, req.observed_at, req.values, "manual", req.reporter, evidence
    )


@router.post("/telemetry/readings")
async def telemetry_manual(req: ManualReadingReq, caller: Caller = _AS_CREW) -> dict[str, Any]:
    if not req.reporter.strip():
        raise HTTPException(status_code=422, detail="a named person must report the reading")
    _named(caller, req.reporter)
    await asyncio.to_thread(_require_declared_device, req.device_id, caller)
    if caller.farms is not None and not _device_farms(req.device_id) & caller.farms:
        raise HTTPException(
            status_code=403, detail=f"sensor {req.device_id} is not on a farm this code can use"
        )
    try:
        return await asyncio.to_thread(_manual_reading, req)
    except telemetry.TelemetryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/telemetry/latest")
async def telemetry_latest(
    device_id: str = Query(..., min_length=1, max_length=120),
    metric: str = Query(..., pattern="^[a-z_]{2,40}$"),
    caller: Caller | None = _READER,
) -> dict[str, Any]:
    if metric not in telemetry.METRICS:
        raise HTTPException(status_code=422, detail=f"unknown metric {metric}")
    if not _all_farms(caller):
        owners = await asyncio.to_thread(_device_farms, device_id)
        if not any(visible(caller, f) for f in owners):
            raise HTTPException(
                status_code=401 if caller is None else 403,
                detail=f"sensor {device_id} is not on a farm this code can see",
            )
    found = await asyncio.to_thread(telemetry.latest, device_id, metric)
    return {
        "reading": found,
        "missing": [] if found else [{"field": metric, "reason": "no reading"}],
    }


class ContractReq(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)
    registered_by: str = Field(default="system", min_length=1, max_length=80)


@router.post("/contracts/verify")
async def contracts_verify(req: ContractReq) -> dict[str, Any]:
    return contract.verify(req.text)


@router.put("/contracts/{farm_id}")
async def contracts_put(
    farm_id: str, req: ContractReq, caller: Caller = _AS_MANAGER
) -> dict[str, Any]:
    _named(caller, req.registered_by)
    _own(caller, farm_id)
    try:
        return await asyncio.to_thread(live.register, farm_id, req.text, req.registered_by)
    except live.ContractRejected as exc:
        raise HTTPException(status_code=422, detail=exc.verdict["diagnostics"]) from exc


@router.get("/contracts/{farm_id}")
async def contracts_get(farm_id: str, caller: Caller | None = _READER) -> dict[str, Any]:
    _see(caller, farm_id)
    loaded = await asyncio.to_thread(live.load, farm_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail="no contract for this farm")
    return {"farm_id": farm_id, "text": loaded[0], **loaded[1]}


def _live_call(fn: Any, farm_id: str) -> dict[str, Any]:
    try:
        return fn(farm_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="no contract for this farm") from exc
    except live.ContractRejected as exc:
        raise HTTPException(status_code=422, detail=exc.verdict["diagnostics"]) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/contracts/{farm_id}/plan")
async def contracts_plan(farm_id: str, caller: Caller | None = _READER) -> dict[str, Any]:
    _see(caller, farm_id)
    out = await asyncio.to_thread(_live_call, live.build_live, farm_id)
    if out.get("status") == "OK":
        out["ledger_commit_hash"] = (
            _ledger()
            .append(
                "ops_plan",
                {
                    "farm_id": farm_id,
                    "contract_sha256": out["contract_sha256"],
                    "tasks": len(out["tasks"]),
                    "schedule": out["schedule"].get("status"),
                },
            )
            .hash
        )
    return out


@router.get("/contracts")
async def contracts_list(caller: Caller | None = _READER) -> dict[str, Any]:
    rows = await asyncio.to_thread(live.listing)
    return {"contracts": [r for r in rows if visible(caller, r["farm_id"])]}


class SiteContractReq(BaseModel):
    osm: str = Field(pattern=r"^(way|relation)/\d{1,12}$")
    name: str = Field(min_length=1, max_length=80)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    area_ha: float = Field(gt=0, le=10_000)
    country_iso2: str = Field(pattern=r"^[A-Z]{2}$")
    crop_id: str = Field(default="rice_lowland", pattern=r"^[a-z_]{2,40}$")
    created_by: str = Field(min_length=1, max_length=80)


@router.post("/contracts/from-site")
async def contracts_from_site(req: SiteContractReq, caller: Caller = _AS_MANAGER) -> dict[str, Any]:
    _named(caller, req.created_by)
    _own(caller, live.site_farm_id(req.osm))
    try:
        return await asyncio.to_thread(
            live.create_from_site, req.model_dump(exclude={"created_by"}), req.created_by
        )
    except live.ContractRejected as exc:
        raise HTTPException(status_code=422, detail=exc.verdict["diagnostics"]) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_CSV_LINES = 5000
BOUNDARY_SUFFIXES = (".kml", ".kmz", ".geojson", ".json")


class OnboardBoundaries(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    text: str | None = None
    base64: str | None = None


class OnboardAsset(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9-]{0,30}$")
    kind: Literal["pump", "drone", "sluice", "gate"]
    label: str = Field(min_length=1, max_length=60)
    serves: list[str] = Field(default_factory=list, max_length=500)


class OnboardReq(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    country: str = Field(pattern=r"^[A-Z]{2}$")
    registered_by: str = Field(min_length=1, max_length=80)
    utc_offset: str | None = Field(default=None, pattern=r"^[+-]\d{2}:\d{2}$")
    standard: str | None = Field(default=None, pattern=r"^[A-Za-z][A-Za-z0-9_]{1,40}$")
    boundaries: OnboardBoundaries | None = None
    fields_csv: str | None = None
    readings_csv: str | None = None
    inputs_csv: str | None = None
    assets: list[OnboardAsset] = Field(default_factory=list, max_length=100)


def _too_big(label: str) -> HTTPException:
    return HTTPException(status_code=413, detail=f"{label} is larger than 2 MB")


def _boundary_bytes(upload: OnboardBoundaries) -> tuple[str, bytes]:
    suffix = Path(upload.filename).suffix.lower()
    if suffix not in BOUNDARY_SUFFIXES:
        raise HTTPException(
            status_code=422, detail="boundaries: the file must end in .kml, .kmz, .geojson or .json"
        )
    if upload.text is not None:
        raw = upload.text.encode("utf-8")
    elif upload.base64 is not None:
        if len(upload.base64) > MAX_UPLOAD_BYTES * 4 // 3 + 4:
            raise _too_big("boundaries")
        try:
            raw = base64.b64decode(upload.base64, validate=True)
        except binascii.Error as exc:
            raise HTTPException(status_code=422, detail="boundaries: base64 is not valid") from exc
    else:
        raise HTTPException(status_code=422, detail="boundaries: send the file as text or base64")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise _too_big("boundaries")
    return suffix, raw


def _sheet_bytes(label: str, text: str) -> bytes:
    raw = text.encode("utf-8")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise _too_big(label)
    if len(text.splitlines()) > MAX_CSV_LINES:
        raise HTTPException(status_code=413, detail=f"{label} has more than {MAX_CSV_LINES} lines")
    return raw


def _onboard_farm(farm_id: str, req: OnboardReq, files: dict[str, bytes]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        paths = {name: Path(tmp) / name for name in files}
        for name, raw in files.items():
            paths[name].write_bytes(raw)
        boundary = next((p for n, p in paths.items() if n.startswith("boundaries")), None)
        rings = onboard.read_boundaries(boundary) if boundary else {}
        fields = onboard.read_fields(paths["fields.csv"]) if "fields.csv" in paths else []
        sources = ", ".join(n for n in files if n.startswith(("boundaries", "fields")))
        assets = [a.model_dump() for a in req.assets]
        text, notes = onboard.build_contract(
            farm_id, req.name, req.country, fields, rings, sources, req.standard, assets
        )
        registered = live.register(farm_id, text, req.registered_by)
        sheets = {
            "readings": onboard.import_readings,
            "inputs": onboard.import_inputs,
        }
        imported = {
            key: importer(farm_id, paths[f"{key}.csv"], req.utc_offset, req.registered_by)
            if f"{key}.csv" in paths
            else None
            for key, importer in sheets.items()
        }
    diagnostics = registered["diagnostics"]
    flagged = [d["message"] for d in diagnostics] + notes
    return {
        "farm_id": farm_id,
        "verdict": {"is_valid": registered["is_valid"], "diagnostics": diagnostics},
        "to_verify": sum("TO VERIFY" in m for m in flagged),
        "notes": notes,
        **imported,
    }


@router.post("/farms/{farm_id}/onboard")
async def farms_onboard(
    farm_id: str, req: OnboardReq, caller: Caller = _AS_MANAGER
) -> dict[str, Any]:
    if not onboard.FARM_ID.match(farm_id):
        raise HTTPException(
            status_code=422,
            detail="farm id: a letter, then letters, digits, - or _ (2-41 characters)",
        )
    _named(caller, req.registered_by)
    _own(caller, farm_id)
    if req.boundaries is None and not req.fields_csv:
        raise HTTPException(status_code=422, detail="give a boundary file, a field sheet, or both")
    files: dict[str, bytes] = {}
    if req.boundaries is not None:
        suffix, raw = _boundary_bytes(req.boundaries)
        files[f"boundaries{suffix}"] = raw
    for key, text in (
        ("fields", req.fields_csv),
        ("readings", req.readings_csv),
        ("inputs", req.inputs_csv),
    ):
        if text:
            files[f"{key}.csv"] = _sheet_bytes(f"{key}_csv", text)
    try:
        return await asyncio.to_thread(_onboard_farm, farm_id, req, files)
    except live.ContractRejected as exc:
        raise HTTPException(status_code=422, detail=exc.verdict["diagnostics"]) from exc
    except (ValueError, KeyError, IndexError, zipfile.BadZipFile, csv.Error) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/regions/{town}/crop-options")
async def region_crop_options(town: str) -> dict[str, Any]:
    return await asyncio.to_thread(cropvalue.options, town)


class HerdReq(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9-]{0,30}$")
    kind: str = Field(pattern="^(fish|shrimp|ducks|poultry|buffalo|cattle|goats)$")
    species: str | None = Field(default=None, max_length=60, pattern=r"^[^\"\n{}]*$")
    count: int = Field(ge=0, le=1_000_000)
    paddy: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,40}$")
    min_water_cm: float | None = Field(default=None, ge=-40, le=30)
    min_oxygen_mg_l: float | None = Field(default=None, ge=0, le=20)
    added_by: str = Field(min_length=1, max_length=80)


@router.post("/contracts/{farm_id}/herds")
async def contracts_add_herd(
    farm_id: str, req: HerdReq, caller: Caller = _AS_MANAGER
) -> dict[str, Any]:
    _named(caller, req.added_by)
    _own(caller, farm_id)
    herd = req.model_dump(exclude={"added_by"})
    try:
        return await asyncio.to_thread(live.add_herd, farm_id, herd, req.added_by)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="no contract for this farm") from exc
    except live.ContractRejected as exc:
        raise HTTPException(status_code=422, detail=exc.verdict["diagnostics"]) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/contracts/{farm_id}/monitoring")
async def contracts_monitoring(farm_id: str, caller: Caller | None = _READER) -> dict[str, Any]:
    _see(caller, farm_id)
    return await asyncio.to_thread(_live_call, live.monitoring, farm_id)


@router.get("/contracts/{farm_id}/satellite")
async def contracts_satellite(
    farm_id: str, days: int = Query(60, ge=10, le=120), caller: Caller | None = _READER
) -> dict[str, Any]:
    _see(caller, farm_id)
    return await asyncio.to_thread(_live_call, lambda f: live.satellite(f, days), farm_id)


@router.get("/contracts/{farm_id}/summary")
async def contracts_summary(farm_id: str, caller: Caller | None = _READER) -> dict[str, Any]:
    _see(caller, farm_id)
    return await asyncio.to_thread(_live_call, live.summary, farm_id)


@router.get("/contracts/{farm_id}/check")
async def contracts_check(farm_id: str, caller: Caller = _CALLER) -> dict[str, Any]:
    _see(caller, farm_id)
    return await asyncio.to_thread(_live_call, onboard.records_check, farm_id)


@router.post("/contracts/{farm_id}/watch")
async def contracts_watch(farm_id: str, caller: Caller = _AS_MANAGER) -> dict[str, Any]:
    _own(caller, farm_id)
    out = await asyncio.to_thread(_live_call, live.watch, farm_id)
    return {"farm_id": farm_id, "proposals": out["proposals"], "status": out["live"]["status"]}


@router.get("/proposals")
async def proposals_list(
    farm_id: str | None = Query(None, max_length=60), caller: Caller | None = _READER
) -> dict[str, Any]:
    if farm_id is not None:
        _see(caller, farm_id)
    rows = await asyncio.to_thread(live.proposals, farm_id)
    return {"proposals": [r for r in rows if visible(caller, r["farm_id"])]}


class ProposalDecisionReq(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    decided_by: str = Field(min_length=1, max_length=80)


@router.post("/proposals/{proposal_id}/decision")
async def proposals_decide(
    proposal_id: str, req: ProposalDecisionReq, caller: Caller = _AS_MANAGER
) -> dict[str, Any]:
    if not req.decided_by.strip():
        raise HTTPException(status_code=422, detail="a named person must decide")
    _named(caller, req.decided_by)
    farm_id = await asyncio.to_thread(live.proposal_farm, proposal_id)
    if farm_id is not None:
        _own(caller, farm_id)
    try:
        return await asyncio.to_thread(live.decide, proposal_id, req.decision, req.decided_by)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="unknown proposal") from exc
    except live.ProposalConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/market/benchmarks")
async def market_benchmarks() -> dict[str, Any]:
    return await asyncio.to_thread(pinksheet.benchmarks)


@router.get("/knowledge/search")
async def knowledge_search(
    q: str = Query(..., min_length=1, max_length=200), limit: int = Query(8, ge=1, le=25)
) -> dict[str, Any]:
    return await asyncio.to_thread(knowledge.search, q, limit)


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    require_sign_in_configured(get_settings())
    async with jobs.background():
        yield


def create_app() -> FastAPI:
    app = FastAPI(title="AgriQill API", version="0.1.0", lifespan=_lifespan)
    app.include_router(router, prefix="/api/v1")

    @app.get("/health")
    async def liveness() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
