from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.sensor_device import SensorDevice
from app.db.models.sensor_observation import SensorObservation

# Provisional, unvalidated corroboration window. Reuses the same interval
# already used elsewhere in this codebase for device staleness
# (app/services/observation.py's check_stale), rather than inventing an
# unrelated number -- but it has never been tuned or validated specifically
# for corroboration. TO VERIFY.
CORROBORATION_WINDOW = timedelta(minutes=30)

QualityLabel = Literal["unconfirmed", "confirmed", "contradicted"]
OutOfRangeDirection = Literal["below_range", "above_range"]


async def classify_factor_quality(
    session: AsyncSession,
    *,
    field_id: int,
    factor: str,
    direction: OutOfRangeDirection,
    range_min: float,
    range_max: float,
    recorded_at: datetime,
    exclude_observation_id: int | None,
) -> QualityLabel:
    """Label one out-of-range factor reading against other readings of the
    same factor, from any device on the same field, within a symmetric
    +/- CORROBORATION_WINDOW of its recorded_at (event time, not insertion
    order).

    This measures *agreement among nearby readings*, not sensor health or
    true crop stress: a stuck sensor can repeatedly report the same wrong
    value and would show as "confirmed" here just as a genuine corroborated
    emergency would. Callers must not treat this label as proof of
    anything beyond "other nearby readings agreed or disagreed" -- it must
    never be used to suppress or downgrade an alert.

    Precedence when evidence is mixed: any contradicting reading (within
    range, or out of range in the opposite direction) wins over a
    same-direction confirming one -- disagreement is never silently
    dropped in favor of supporting evidence.
    """
    column = getattr(SensorObservation, factor)
    window_start = recorded_at - CORROBORATION_WINDOW
    window_end = recorded_at + CORROBORATION_WINDOW

    query = (
        select(column)
        .join(SensorDevice, SensorDevice.id == SensorObservation.device_id)
        .where(
            SensorDevice.field_id == field_id,
            column.is_not(None),
            SensorObservation.recorded_at >= window_start,
            SensorObservation.recorded_at <= window_end,
        )
    )
    if exclude_observation_id is not None:
        query = query.where(SensorObservation.id != exclude_observation_id)

    result = await session.execute(query)
    candidate_values = [row[0] for row in result.all()]

    if not candidate_values:
        return "unconfirmed"

    has_contradiction = False
    has_same_direction = False
    for value in candidate_values:
        if range_min <= value <= range_max:
            has_contradiction = True
        elif direction == "below_range" and value < range_min:
            has_same_direction = True
        elif direction == "above_range" and value > range_max:
            has_same_direction = True
        else:
            # Out of range, but in the opposite direction from the
            # triggering reading -- a disagreement, not a confirmation.
            has_contradiction = True

    if has_contradiction:
        return "contradicted"
    if has_same_direction:
        return "confirmed"
    return "unconfirmed"
