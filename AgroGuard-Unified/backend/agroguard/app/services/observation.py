import logging
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models.field import Field
from app.db.models.sensor_device import SensorDevice
from app.db.models.sensor_observation import SensorObservation
from app.schemas.sensor_observation import IngestObservationRequest, ObservationResponse
from app.services.assessment import recompute_assessment

logger = logging.getLogger(__name__)

_PLAUSIBLE_RANGES = {
    "temperature": (-10.0, 60.0),
    "humidity": (0.0, 100.0),
    "soil_moisture": (0.0, 100.0),
    "ph": (0.0, 14.0),
    "light": (0.0, 100.0),
}

_SCENARIO_VALUES = {
    "dry_soil": {
        "temperature": 32.0,
        "humidity": 45.0,
        "soil_moisture": 15.0,
        "ph": 6.5,
        "light": 90.0,
    },
    "heat_stress": {
        "temperature": 42.0,
        "humidity": 30.0,
        "soil_moisture": 30.0,
        "ph": 6.8,
        "light": 95.0,
    },
    "ideal": {
        "temperature": 26.0,
        "humidity": 65.0,
        "soil_moisture": 60.0,
        "ph": 6.5,
        "light": 75.0,
    },
    "waterlogged": {
        "temperature": 28.0,
        "humidity": 85.0,
        "soil_moisture": 95.0,
        "ph": 5.8,
        "light": 50.0,
    },
    "cold_snap": {
        "temperature": 8.0,
        "humidity": 75.0,
        "soil_moisture": 70.0,
        "ph": 6.2,
        "light": 40.0,
    },
}


def validate_reading(field: str, value: float | None) -> float | None:
    if value is None:
        return None
    lo, hi = _PLAUSIBLE_RANGES[field]
    if not (lo <= value <= hi):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field} value {value} is outside plausible range [{lo}, {hi}]",
        )
    return value


def validate_observation(payload: IngestObservationRequest) -> None:
    for field in ("temperature", "humidity", "soil_moisture", "ph", "light"):
        validate_reading(field, getattr(payload, field))


async def ingest_observation(
    session: AsyncSession,
    payload: IngestObservationRequest,
) -> ObservationResponse:
    device = await session.get(SensorDevice, payload.device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    existing = await session.execute(
        select(SensorObservation).where(SensorObservation.event_id == payload.event_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Observation with event_id '{payload.event_id}' already exists",
        )

    validate_observation(payload)

    observation = SensorObservation(
        device_id=payload.device_id,
        event_id=payload.event_id,
        temperature=payload.temperature,
        humidity=payload.humidity,
        soil_moisture=payload.soil_moisture,
        ph=payload.ph,
        light=payload.light,
        recorded_at=payload.recorded_at or datetime.now(UTC),
    )
    session.add(observation)
    device.last_seen_at = datetime.now(UTC)
    device.is_stale = False

    await session.commit()
    await session.refresh(observation)

    field = await session.get(Field, device.field_id)
    assessment = None
    delivery = None
    if field:
        assessment, _, delivery = await recompute_assessment(session, field)

    await _bridge_to_agriquill(payload)

    return ObservationResponse(
        id=observation.id,
        device_id=observation.device_id,
        event_id=observation.event_id,
        temperature=observation.temperature,
        humidity=observation.humidity,
        soil_moisture=observation.soil_moisture,
        ph=observation.ph,
        light=observation.light,
        recorded_at=observation.recorded_at,
        health_score=assessment.health_score if assessment else None,
        assessment_status=assessment.status if assessment else None,
        alert_status=delivery.status if delivery else None,
    )


def simulate_scenario(device: SensorDevice, scenario: str) -> IngestObservationRequest:
    values = _SCENARIO_VALUES.get(scenario)
    if not values:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown scenario '{scenario}'. Choose from: {list(_SCENARIO_VALUES.keys())}",
        )
    return IngestObservationRequest(
        device_id=device.id,
        event_id=f"sim_{scenario}_{datetime.now(UTC).isoformat()}",
        **values,
    )


async def check_stale(device: SensorDevice) -> bool:
    if device.last_seen_at is None:
        return False
    stale_threshold = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=30)
    last_seen = device.last_seen_at.replace(tzinfo=None)
    return last_seen < stale_threshold


# --- AgriQill telemetry bridge -------------------------------------------
# Forwards each ingested AgroGuard sensor reading into AgriQill's telemetry
# store, over HTTP, using AgriQill's existing crew-write auth
# (`X-AgriQuill-Write-Token` + a named `reporter` — see
# backend/agriquill/agriquill/api/main.py `_reader`/`_named`). A caller
# authenticating with a *shared* write token has no `name` set, so
# `_named()`'s "reporter must match the caller's own name" check is a no-op
# for it — the existing design already accommodates a service identity like
# this, it doesn't need a new auth mechanism.
#
# Owner decision taken as the default here: authenticate as a dedicated
# AGRIQUILL_USERS entry (e.g. `agroguard-bridge:<token>:crew`) rather than
# the blanket AGRIQUILL_WRITE_TOKEN, so the bridge only ever gets the `crew`
# role (it can submit readings, never contracts/manager actions) and is
# individually revocable/auditable in AgriQill's logs without affecting any
# other integration that might later share the write token. If that
# trade-off is wrong for this deployment, swap the credential in
# `AGROGUARD_AGRIQUILL_BRIDGE_TOKEN`/AgriQill's `AGRIQUILL_USERS` — no code
# change needed either way, both paths use the same header.
#
# Disabled by default (same "blank key -> fail soft" convention as the LLM
# and weather integrations): with no token configured, this is a no-op.
# Best-effort — a bridge failure is logged, never raised, so it can't break
# AgroGuard's own ingestion response.
async def _bridge_to_agriquill(payload: IngestObservationRequest) -> None:
    settings = get_settings()
    if settings.agriquill_bridge_token is None:
        return
    values = {
        key: value
        for key, value in (
            ("temperature_c", payload.temperature),
            ("humidity_pct", payload.humidity),
        )
        if value is not None
    }
    if not values:
        return
    moment = payload.recorded_at or datetime.now(UTC)
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                f"{settings.agriquill_api_url}/api/v1/agriquill/telemetry/readings",
                json={
                    "device_id": f"agroguard:{payload.device_id}",
                    "observed_at": moment.isoformat(),
                    "values": values,
                    "reporter": settings.agriquill_bridge_reporter,
                },
                headers={
                    "X-AgriQuill-Write-Token": settings.agriquill_bridge_token.get_secret_value()
                },
            )
            response.raise_for_status()
    except httpx.HTTPError:
        logger.warning(
            "AgriQill telemetry bridge failed for device %s", payload.device_id, exc_info=True
        )
