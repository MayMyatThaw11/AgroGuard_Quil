import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.db.models.field import Field
from app.db.session import engine, session_factory
from app.main import app


async def _make_field() -> int:
    async with session_factory() as session:
        field = Field(
            name=f"Water Scenario Test Field {uuid.uuid4()}",
            latitude=19.0,
            longitude=96.0,
        )
        session.add(field)
        await session.commit()
        return field.id


async def _delete_field(field_id: int) -> None:
    async with session_factory() as session:
        field = await session.get(Field, field_id)
        if field:
            await session.delete(field)
            await session.commit()
    # See tests/test_water_forecast.py for why this is required on Windows.
    await engine.dispose()


async def _table_count(table: str) -> int:
    async with session_factory() as session:
        result = await session.execute(text(f'SELECT COUNT(*) FROM "{table}"'))  # noqa: S608
        return result.scalar_one()


@pytest.mark.asyncio
async def test_water_scenarios_missing_field_returns_404() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/fields/9999999/water-scenarios", json={})

    assert response.status_code == 404
    await engine.dispose()


@pytest.mark.asyncio
async def test_water_scenarios_default_request_covers_all_choices_and_is_unavailable() -> None:
    field_id = await _make_field()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(f"/api/v1/fields/{field_id}/water-scenarios", json={})

        assert response.status_code == 200
        body = response.json()
        assert body["fieldId"] == field_id
        assert body["status"] == "unavailable"
        assert set(body["requestedScenarios"]) == {"hold", "irrigate", "dry"}
        assert body["measurement"] == "soil_moisture"
        assert body["unit"] == "%"
        assert body["reason"]
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_water_scenarios_accepts_a_subset_of_valid_choices() -> None:
    field_id = await _make_field()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/fields/{field_id}/water-scenarios",
                json={"scenarios": ["irrigate"]},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["requestedScenarios"] == ["irrigate"]
        assert body["status"] == "unavailable"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_water_scenarios_rejects_unknown_choice() -> None:
    field_id = await _make_field()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/fields/{field_id}/water-scenarios",
                json={"scenarios": ["flood"]},
            )

        assert response.status_code == 422
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_water_scenarios_does_not_mutate_sensor_or_assessment_data() -> None:
    field_id = await _make_field()
    try:
        before = {
            table: await _table_count(table)
            for table in ("sensor_observations", "assessments", "alerts", "sensor_devices")
        }

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/v1/fields/{field_id}/water-scenarios",
                json={"scenarios": ["hold", "irrigate", "dry"]},
            )

        assert response.status_code == 200
        after = {
            table: await _table_count(table)
            for table in ("sensor_observations", "assessments", "alerts", "sensor_devices")
        }
        assert before == after
    finally:
        await _delete_field(field_id)
