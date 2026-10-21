"""Water-weather API endpoints (saved-field and by-location modes). All
NASA calls are mocked at the service boundary: these tests never reach
NASA.
"""

import uuid
from datetime import date

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.api.v1.endpoints import water_weather
from app.db.models.field import Field
from app.db.session import engine, session_factory
from app.main import app
from app.services.nasa_power import (
    DailyWeatherDay,
    DailyWeatherResult,
    InvalidRequestError,
    NasaPowerUnavailableError,
)

pytestmark = pytest.mark.asyncio


async def _make_field(latitude: float = 19.0, longitude: float = 96.0) -> int:
    async with session_factory() as session:
        field = Field(
            name=f"Water Weather Test Field {uuid.uuid4()}",
            latitude=latitude,
            longitude=longitude,
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
    await engine.dispose()


async def _table_counts() -> dict[str, int]:
    async with session_factory() as session:
        counts = {}
        for table in ("sensor_observations", "assessments", "alerts"):
            result = await session.execute(text(f'SELECT COUNT(*) FROM "{table}"'))  # noqa: S608
            counts[table] = result.scalar_one()
        return counts


async def _fake_fetch(*args, **kwargs):
    return _fake_result()


def _fake_result(latitude=16.87, longitude=96.19, start=date(2026, 1, 1), end=date(2026, 1, 1)):
    return DailyWeatherResult(
        latitude=latitude,
        longitude=longitude,
        start=start,
        end=end,
        days=[
            DailyWeatherDay(
                day=start,
                temperature=26.1,
                relative_humidity=68.0,
                precipitation=0.0,
                solar_radiation=17.5,
            )
        ],
        warnings=[],
    )


@pytest_asyncio.fixture
async def api():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def test_saved_field_mode_returns_labeled_response(monkeypatch, api) -> None:
    field_id = await _make_field(16.87, 96.19)
    try:
        monkeypatch.setattr(
            water_weather, "fetch_daily_weather", _fake_fetch
        )
        response = await api.get(
            f"/api/v1/fields/{field_id}/water-weather",
            params={"start": "2026-01-01", "end": "2026-01-01"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["locationMode"] == "saved_field"
        assert body["fieldId"] == field_id
        assert body["source"] == "NASA POWER"
        assert body["timeConvention"] == "NASA POWER local solar time"
        assert body["units"]["solar_radiation"] == "MJ/m2/day"
        assert body["days"][0]["temperature"] == 26.1
    finally:
        await _delete_field(field_id)


async def test_saved_field_mode_missing_field_returns_404(api) -> None:
    response = await api.get(
        "/api/v1/fields/9999999/water-weather",
        params={"start": "2026-01-01", "end": "2026-01-01"},
    )
    assert response.status_code == 404
    # See tests/test_water_forecast.py for why this is required on Windows.
    await engine.dispose()


async def test_saved_field_with_invalid_stored_coordinates_is_a_server_error(monkeypatch, api) -> None:
    field_id = await _make_field(latitude=999.0, longitude=0.0)
    try:
        response = await api.get(
            f"/api/v1/fields/{field_id}/water-weather",
            params={"start": "2026-01-01", "end": "2026-01-01"},
        )
        assert response.status_code == 500
    finally:
        await _delete_field(field_id)


async def test_by_location_mode_returns_device_location_label(monkeypatch, api) -> None:
    async def fake(*a, **k):
        return _fake_result()

    monkeypatch.setattr(water_weather, "fetch_daily_weather", fake)
    response = await api.post(
        "/api/v1/water-weather/by-location",
        json={
            "latitude": 16.87,
            "longitude": 96.19,
            "startDate": "2026-01-01",
            "endDate": "2026-01-01",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["locationMode"] == "device_location"
    assert body["fieldId"] is None


async def test_by_location_mode_rejects_out_of_range_latitude(api) -> None:
    response = await api.post(
        "/api/v1/water-weather/by-location",
        json={
            "latitude": 200.0,
            "longitude": 0.0,
            "startDate": "2026-01-01",
            "endDate": "2026-01-01",
        },
    )
    assert response.status_code == 422


async def test_invalid_date_range_from_service_becomes_422(monkeypatch, api) -> None:
    def fake(*a, **k):
        raise InvalidRequestError("date range may not exceed 366 days")

    monkeypatch.setattr(water_weather, "fetch_daily_weather", fake)
    response = await api.post(
        "/api/v1/water-weather/by-location",
        json={
            "latitude": 16.87,
            "longitude": 96.19,
            "startDate": "2020-01-01",
            "endDate": "2021-06-01",
        },
    )
    assert response.status_code == 422


async def test_nasa_outage_becomes_502(monkeypatch, api) -> None:
    def fake(*a, **k):
        raise NasaPowerUnavailableError("NASA POWER is not reachable right now.")

    monkeypatch.setattr(water_weather, "fetch_daily_weather", fake)
    response = await api.post(
        "/api/v1/water-weather/by-location",
        json={
            "latitude": 16.87,
            "longitude": 96.19,
            "startDate": "2026-01-01",
            "endDate": "2026-01-01",
        },
    )
    assert response.status_code == 502
    assert "NASA POWER" in response.json()["detail"]


async def test_by_location_mode_never_mutates_any_field(monkeypatch, api) -> None:
    field_id = await _make_field(16.87, 96.19)
    try:
        monkeypatch.setattr(water_weather, "fetch_daily_weather", _fake_fetch)
        before = await api.get(f"/api/v1/fields/{field_id}/current-status")
        assert before.status_code == 200

        await api.post(
            "/api/v1/water-weather/by-location",
            json={
                "latitude": 1.0,
                "longitude": 2.0,
                "startDate": "2026-01-01",
                "endDate": "2026-01-01",
            },
        )

        async with session_factory() as session:
            field = await session.get(Field, field_id)
            assert field.latitude == 16.87
            assert field.longitude == 96.19
    finally:
        await _delete_field(field_id)


async def test_weather_calls_do_not_write_sensor_or_alert_tables(monkeypatch, api) -> None:
    field_id = await _make_field(16.87, 96.19)
    try:
        monkeypatch.setattr(water_weather, "fetch_daily_weather", _fake_fetch)
        before = await _table_counts()

        await api.get(
            f"/api/v1/fields/{field_id}/water-weather",
            params={"start": "2026-01-01", "end": "2026-01-01"},
        )
        await api.post(
            "/api/v1/water-weather/by-location",
            json={
                "latitude": 16.87,
                "longitude": 96.19,
                "startDate": "2026-01-01",
                "endDate": "2026-01-01",
            },
        )

        after = await _table_counts()
        assert before == after
    finally:
        await _delete_field(field_id)


async def test_summary_endpoint_returns_aggregates_and_no_db_writes(monkeypatch, api) -> None:
    field_id = await _make_field(16.87, 96.19)
    try:
        monkeypatch.setattr(water_weather, "fetch_daily_weather", _fake_fetch)
        before = await _table_counts()

        response = await api.post(
            "/api/v1/water-weather/summary/by-location",
            json={"latitude": 16.87, "longitude": 96.19, "startDate": "2026-01-01", "endDate": "2026-01-01"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["totalDays"] == 1
        assert body["totalPrecipitationMm"] == 0.0
        assert body["precipitationCoverageComplete"] is True
        assert body["meanTemperatureC"] == 26.1
        assert body["timeConvention"] == "NASA POWER local solar time"

        after = await _table_counts()
        assert before == after
    finally:
        await _delete_field(field_id)


async def test_summary_endpoint_nasa_outage_becomes_502(monkeypatch, api) -> None:
    def fake(*a, **k):
        raise NasaPowerUnavailableError("NASA POWER is not reachable right now.")

    monkeypatch.setattr(water_weather, "fetch_daily_weather", fake)
    response = await api.post(
        "/api/v1/water-weather/summary/by-location",
        json={"latitude": 16.87, "longitude": 96.19, "startDate": "2026-01-01", "endDate": "2026-01-01"},
    )
    assert response.status_code == 502


async def test_summary_endpoint_invalid_dates_become_422(monkeypatch, api) -> None:
    response = await api.post(
        "/api/v1/water-weather/summary/by-location",
        json={"latitude": 16.87, "longitude": 96.19, "startDate": "2026-01-10", "endDate": "2026-01-01"},
    )
    assert response.status_code == 422


async def test_water_scenarios_still_unavailable_after_weather_feature_added(monkeypatch, api) -> None:
    field_id = await _make_field()
    try:
        response = await api.post(f"/api/v1/fields/{field_id}/water-scenarios", json={})
        assert response.status_code == 200
        assert response.json()["status"] == "unavailable"
    finally:
        await _delete_field(field_id)
