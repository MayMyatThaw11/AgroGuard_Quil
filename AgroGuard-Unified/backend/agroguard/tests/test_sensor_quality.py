import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.db.models.field import Field
from app.db.models.sensor_device import SensorDevice
from app.db.models.sensor_observation import SensorObservation
from app.db.session import engine, session_factory
from app.services.sensor_quality import classify_factor_quality

RANGE_MIN = 40.0
RANGE_MAX = 80.0
BASE_TIME = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


async def _make_field_with_devices(device_count: int = 1) -> tuple[int, list[int]]:
    async with session_factory() as session:
        field = Field(
            name=f"Sensor Quality Test Field {uuid.uuid4()}",
            latitude=19.0,
            longitude=96.0,
        )
        session.add(field)
        await session.flush()

        device_ids = []
        for i in range(device_count):
            device = SensorDevice(
                field_id=field.id,
                name=f"Sensor Quality Test Device {i}",
                transport_type="test",
                device_id=f"sensor-quality-test-{uuid.uuid4()}",
                is_simulated=True,
            )
            session.add(device)
            await session.flush()
            device_ids.append(device.id)

        await session.commit()
        return field.id, device_ids


async def _delete_field(field_id: int) -> None:
    async with session_factory() as session:
        field = await session.get(Field, field_id)
        if field:
            await session.delete(field)
            await session.commit()
    # See tests/test_water_forecast.py for why this is required on Windows.
    await engine.dispose()


async def _add_reading(device_id: int, soil_moisture: float, recorded_at: datetime) -> int:
    async with session_factory() as session:
        observation = SensorObservation(
            device_id=device_id,
            event_id=f"sensor-quality-test-{uuid.uuid4()}",
            soil_moisture=soil_moisture,
            recorded_at=recorded_at,
        )
        session.add(observation)
        await session.commit()
        await session.refresh(observation)
        return observation.id


async def _classify(field_id: int, direction: str, recorded_at: datetime, exclude_id: int | None):
    async with session_factory() as session:
        return await classify_factor_quality(
            session,
            field_id=field_id,
            factor="soil_moisture",
            direction=direction,
            range_min=RANGE_MIN,
            range_max=RANGE_MAX,
            recorded_at=recorded_at,
            exclude_observation_id=exclude_id,
        )


@pytest.mark.asyncio
async def test_first_extreme_reading_with_no_others_is_unconfirmed() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        obs_id = await _add_reading(device_id, 10.0, BASE_TIME)
        label = await _classify(field_id, "below_range", BASE_TIME, obs_id)
        assert label == "unconfirmed"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_same_direction_reading_within_window_is_confirmed() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        trigger_id = await _add_reading(device_id, 10.0, BASE_TIME)
        await _add_reading(device_id, 12.0, BASE_TIME + timedelta(minutes=10))
        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "confirmed"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_in_range_reading_within_window_contradicts() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        trigger_id = await _add_reading(device_id, 10.0, BASE_TIME)
        await _add_reading(device_id, 55.0, BASE_TIME + timedelta(minutes=5))
        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "contradicted"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_opposite_direction_extreme_reading_contradicts() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        trigger_id = await _add_reading(device_id, 10.0, BASE_TIME)
        await _add_reading(device_id, 95.0, BASE_TIME + timedelta(minutes=5))
        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "contradicted"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_mixed_evidence_prefers_contradicted_over_confirmed() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        trigger_id = await _add_reading(device_id, 10.0, BASE_TIME)
        await _add_reading(device_id, 12.0, BASE_TIME + timedelta(minutes=3))  # same-direction
        await _add_reading(device_id, 55.0, BASE_TIME + timedelta(minutes=-3))  # contradicts
        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "contradicted"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_exactly_thirty_minute_boundary_counts_as_within_window() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        trigger_id = await _add_reading(device_id, 10.0, BASE_TIME)
        await _add_reading(device_id, 12.0, BASE_TIME + timedelta(minutes=30))
        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "confirmed"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_just_outside_thirty_minute_window_is_excluded() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        trigger_id = await _add_reading(device_id, 10.0, BASE_TIME)
        await _add_reading(device_id, 12.0, BASE_TIME + timedelta(minutes=30, seconds=1))
        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "unconfirmed"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_null_factor_value_is_ignored_as_a_candidate() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        trigger_id = await _add_reading(device_id, 10.0, BASE_TIME)
        async with session_factory() as session:
            session.add(
                SensorObservation(
                    device_id=device_id,
                    event_id=f"sensor-quality-test-{uuid.uuid4()}",
                    soil_moisture=None,
                    temperature=30.0,
                    recorded_at=BASE_TIME + timedelta(minutes=5),
                )
            )
            await session.commit()

        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "unconfirmed"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_second_device_on_same_field_can_corroborate() -> None:
    field_id, (device_a, device_b) = await _make_field_with_devices(2)
    try:
        trigger_id = await _add_reading(device_a, 10.0, BASE_TIME)
        await _add_reading(device_b, 11.0, BASE_TIME + timedelta(minutes=5))
        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "confirmed"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_backdated_reading_within_window_still_corroborates() -> None:
    field_id, (device_id,) = await _make_field_with_devices(1)
    try:
        trigger_id = await _add_reading(device_id, 10.0, BASE_TIME)
        # Inserted after the trigger reading, but event-timed *before* it.
        await _add_reading(device_id, 11.0, BASE_TIME - timedelta(minutes=10))
        label = await _classify(field_id, "below_range", BASE_TIME, trigger_id)
        assert label == "confirmed"
    finally:
        await _delete_field(field_id)
