import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.models.field import Field
from app.db.models.sensor_device import SensorDevice
from app.db.models.sensor_observation import SensorObservation
from app.db.session import engine, session_factory
from app.main import app


async def _make_field_with_device() -> tuple[int, int]:
    async with session_factory() as session:
        field = Field(
            name=f"Water Forecast Test Field {uuid.uuid4()}",
            latitude=19.0,
            longitude=96.0,
        )
        session.add(field)
        await session.flush()

        device = SensorDevice(
            field_id=field.id,
            name="Water Forecast Test Device",
            transport_type="test",
            device_id=f"water-forecast-test-{uuid.uuid4()}",
            is_simulated=True,
        )
        session.add(device)
        await session.commit()
        return field.id, device.id


async def _delete_field(field_id: int) -> None:
    async with session_factory() as session:
        field = await session.get(Field, field_id)
        if field:
            await session.delete(field)
            await session.commit()
    # pytest-asyncio gives each test its own event loop on Windows, but the
    # app's engine/pool is created once at import time and bound to the
    # first loop; asyncpg connections from this test's loop must be closed
    # out before that loop closes, or the next test's loop sees a dead
    # connection during garbage collection ("Event loop is closed").
    await engine.dispose()


async def _add_reading(device_id: int, soil_moisture: float, recorded_at: datetime) -> None:
    async with session_factory() as session:
        session.add(
            SensorObservation(
                device_id=device_id,
                event_id=f"water-forecast-test-{uuid.uuid4()}",
                soil_moisture=soil_moisture,
                recorded_at=recorded_at,
            )
        )
        await session.commit()


@pytest.mark.asyncio
async def test_water_forecast_missing_field_returns_404() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/fields/9999999/water-forecast")

    assert response.status_code == 404
    await engine.dispose()


@pytest.mark.asyncio
async def test_water_forecast_with_zero_readings_is_insufficient() -> None:
    field_id, _device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/fields/{field_id}/water-forecast")

        assert response.status_code == 200
        body = response.json()
        assert body["evidenceStatus"] == "insufficient_data"
        assert body["sampleCount"] == 0
        assert body["points"] == []
        assert body["modelVersion"] is None
        assert body["evaluatedPairs"] is None
        assert body["withinRangeCount"] is None
        assert body["reason"]
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_water_forecast_with_nine_readings_is_still_insufficient() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        base = datetime.now(UTC) - timedelta(hours=9)
        for i in range(9):
            await _add_reading(device_id, 50.0 + i, base + timedelta(hours=i))

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/fields/{field_id}/water-forecast")

        assert response.status_code == 200
        body = response.json()
        assert body["evidenceStatus"] == "insufficient_data"
        assert body["sampleCount"] == 9
        assert body["points"] == []
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_water_forecast_with_ten_readings_computes_persistence_baseline() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        base = datetime.now(UTC) - timedelta(hours=10)
        values = [50.0 + i for i in range(10)]
        for i, value in enumerate(values):
            await _add_reading(device_id, value, base + timedelta(hours=i))

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/fields/{field_id}/water-forecast")

        assert response.status_code == 200
        body = response.json()
        assert body["evidenceStatus"] == "ok"
        assert body["sampleCount"] == 10
        assert body["modelVersion"] == "persistence-v1"
        assert body["horizonHours"] == 24

        last_value = values[-1]
        assert [p["p50"] for p in body["points"]] == [last_value] * len(body["points"])
        assert all(p["p10"] is None and p["p90"] is None for p in body["points"])

        # No validated uncertainty method exists yet, so there is no band to
        # evaluate membership against -- these must stay null, not fabricated.
        assert body["evaluatedPairs"] is None
        assert body["withinRangeCount"] is None
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_water_forecast_ignores_future_and_null_readings_for_baseline() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        base = datetime.now(UTC) - timedelta(hours=20)
        for i in range(10):
            await _add_reading(device_id, 40.0 + i, base + timedelta(hours=i))

        # A null-soil-moisture reading must not count toward sample_count or
        # become the "latest" reading used for the baseline.
        async with session_factory() as session:
            session.add(
                SensorObservation(
                    device_id=device_id,
                    event_id=f"water-forecast-test-{uuid.uuid4()}",
                    soil_moisture=None,
                    temperature=30.0,
                    recorded_at=base + timedelta(hours=10),
                )
            )
            await session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/fields/{field_id}/water-forecast")

        body = response.json()
        assert body["sampleCount"] == 10
        assert body["points"][0]["p50"] == 49.0
    finally:
        await _delete_field(field_id)
