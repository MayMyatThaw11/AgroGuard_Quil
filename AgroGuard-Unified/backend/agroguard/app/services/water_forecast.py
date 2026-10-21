from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.sensor_device import SensorDevice
from app.db.models.sensor_observation import SensorObservation
from app.schemas.water_forecast import ForecastPoint, WaterForecastResponse

# A forecast and reliability count both need enough real history to mean
# anything; below this, there is nothing honest to show.
MIN_OBSERVATIONS = 10

# Naive persistence baseline: the last known soil-moisture reading, held flat
# across the horizon. No uncertainty-quantification method has been
# validated yet, so p10/p90 stay null rather than guessed, and
# evaluated_pairs/within_range_count stay null too -- there's no band to
# test membership against. A future checkpoint that adds a validated
# uncertainty method should populate those once evaluated out-of-sample.
MODEL_VERSION = "persistence-v1"
_HORIZON_OFFSETS_HOURS = (1, 6, 12, 24)


async def get_water_forecast(session: AsyncSession, field_id: int) -> WaterForecastResponse:
    result = await session.execute(
        select(SensorObservation)
        .join(SensorDevice, SensorDevice.id == SensorObservation.device_id)
        .where(
            SensorDevice.field_id == field_id,
            SensorObservation.soil_moisture.is_not(None),
        )
        .order_by(SensorObservation.recorded_at.asc(), SensorObservation.id.asc())
    )
    readings = result.scalars().all()
    sample_count = len(readings)

    if sample_count < MIN_OBSERVATIONS:
        return WaterForecastResponse(
            field_id=field_id,
            evidence_status="insufficient_data",
            reason=(
                f"Only {sample_count} soil-moisture reading(s) recorded for this field; "
                f"at least {MIN_OBSERVATIONS} are needed before a baseline forecast can "
                "be computed."
            ),
            sample_count=sample_count,
            horizon_hours=None,
            points=[],
            model_version=None,
            evaluated_pairs=None,
            within_range_count=None,
        )

    latest = readings[-1]
    base_time = latest.recorded_at
    last_value = latest.soil_moisture

    points = [
        ForecastPoint(at=base_time + timedelta(hours=hours), p50=last_value)
        for hours in _HORIZON_OFFSETS_HOURS
    ]

    return WaterForecastResponse(
        field_id=field_id,
        evidence_status="ok",
        reason=None,
        sample_count=sample_count,
        horizon_hours=_HORIZON_OFFSETS_HOURS[-1],
        points=points,
        model_version=MODEL_VERSION,
        evaluated_pairs=None,
        within_range_count=None,
    )
