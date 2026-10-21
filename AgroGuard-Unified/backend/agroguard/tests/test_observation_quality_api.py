import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.models.field import Field
from app.db.models.sensor_device import SensorDevice
from app.db.session import engine, session_factory
from app.main import app

# Seeded crop profile's soil_moisture range (see app/seed.py / live verification).
SOIL_MOISTURE_MIN = 40.0
SOIL_MOISTURE_MAX = 80.0


async def _make_field_with_device() -> tuple[int, int]:
    async with session_factory() as session:
        field = Field(
            name=f"Observation Quality Test Field {uuid.uuid4()}",
            latitude=19.0,
            longitude=96.0,
        )
        session.add(field)
        await session.flush()

        device = SensorDevice(
            field_id=field.id,
            name="Observation Quality Test Device",
            transport_type="test",
            device_id=f"observation-quality-test-{uuid.uuid4()}",
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
    await engine.dispose()


def _quality_of(response_body: dict, factor: str) -> str | None:
    # Evidence isn't returned directly by /observations/ingest; fetch it via
    # the field's current-status, same as the real frontend would.
    for entry in response_body["evidence"]["factors"]:
        if entry["factor"] == factor:
            return entry.get("quality")
    return None


@pytest.mark.asyncio
async def test_single_extreme_reading_still_opens_a_critical_alert_and_is_unconfirmed() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            ingest_response = await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "soilMoisture": 10.0,
                    "ph": 6.3,
                },
            )
            assert ingest_response.status_code == 201
            body = ingest_response.json()
            assert body["assessmentStatus"] == "critical"

            status_response = await client.get(f"/api/v1/fields/{field_id}/current-status")
            assessment = status_response.json()["latestAssessment"]
            assert assessment["status"] == "critical"
            assert _quality_of(assessment, "soil_moisture") == "unconfirmed"

            alerts_response = await client.get(f"/api/v1/fields/{field_id}/alerts")
            alerts = alerts_response.json()
            assert len(alerts) == 1
            assert alerts[0]["status"] == "open"
            assert alerts[0]["severity"] == "critical"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_second_same_direction_reading_is_confirmed_without_changing_alert_lifecycle() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "soilMoisture": 10.0,
                    "ph": 6.3,
                },
            )
            second = await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "soilMoisture": 12.0,
                    "ph": 6.3,
                },
            )
            assert second.status_code == 201

            status_response = await client.get(f"/api/v1/fields/{field_id}/current-status")
            assessment = status_response.json()["latestAssessment"]
            assert assessment["status"] == "critical"
            assert _quality_of(assessment, "soil_moisture") == "confirmed"

            # Alert cooldown dedup only engages once a notification actually
            # reaches "sent" (see app/services/alerting.py), which never
            # happens with Telegram unconfigured here -- a pre-existing
            # quirk, not something Checkpoint C changes. So each critical
            # reading opens its own alert row in this environment; what
            # matters for this checkpoint is that both are still real,
            # correctly-severed, open alerts -- the lifecycle itself is
            # unaffected by the new quality label.
            alerts_response = await client.get(f"/api/v1/fields/{field_id}/alerts")
            alerts = alerts_response.json()
            assert len(alerts) == 2
            assert all(a["status"] == "open" and a["severity"] == "critical" for a in alerts)
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_in_range_reading_has_no_quality_label_and_no_exception() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "soilMoisture": 55.0,
                    "ph": 6.3,
                },
            )
            assert response.status_code == 201
            assert response.json()["assessmentStatus"] == "healthy"

            status_response = await client.get(f"/api/v1/fields/{field_id}/current-status")
            assessment = status_response.json()["latestAssessment"]
            factor = next(
                e for e in assessment["evidence"]["factors"] if e["factor"] == "soil_moisture"
            )
            assert factor["status"] == "within_range"
            assert "quality" not in factor
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_missing_factor_reading_is_safe() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "temperature": 27.0,
                },
            )
            assert response.status_code == 201

            status_response = await client.get(f"/api/v1/fields/{field_id}/current-status")
            assert status_response.status_code == 200
            factor = next(
                e
                for e in status_response.json()["latestAssessment"]["evidence"]["factors"]
                if e["factor"] == "soil_moisture"
            )
            assert factor["status"] == "unknown"
            assert "quality" not in factor
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_implausible_reading_still_returns_422_unchanged() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "soilMoisture": 500.0,
                },
            )
            assert response.status_code == 422
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_duplicate_event_id_still_returns_409_unchanged() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        event_id = f"quality-api-test-{uuid.uuid4()}"
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                "/api/v1/observations/ingest",
                json={"deviceId": device_id, "eventId": event_id, "soilMoisture": 55.0},
            )
            assert first.status_code == 201
            second = await client.post(
                "/api/v1/observations/ingest",
                json={"deviceId": device_id, "eventId": event_id, "soilMoisture": 55.0},
            )
            assert second.status_code == 409
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_missing_device_still_returns_404_unchanged() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/observations/ingest",
            json={
                "deviceId": 9999999,
                "eventId": f"quality-api-test-{uuid.uuid4()}",
                "soilMoisture": 55.0,
            },
        )
    assert response.status_code == 404
    await engine.dispose()


@pytest.mark.asyncio
async def test_acknowledge_and_resolve_lifecycle_unchanged_by_quality_labeling() -> None:
    field_id, device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "soilMoisture": 10.0,
                },
            )
            alerts = (await client.get(f"/api/v1/fields/{field_id}/alerts")).json()
            alert_id = alerts[0]["id"]

            ack = await client.patch(f"/api/v1/alerts/{alert_id}/acknowledge")
            assert ack.status_code == 200
            assert ack.json()["status"] == "acknowledged"

            resolve = await client.patch(f"/api/v1/alerts/{alert_id}/resolve")
            assert resolve.status_code == 200
            assert resolve.json()["status"] == "resolved"
    finally:
        await _delete_field(field_id)


@pytest.mark.asyncio
async def test_backdated_reading_latest_selection_behavior_is_unchanged() -> None:
    """Documents existing behavior: recompute_assessment selects the latest
    observation by insertion id, not recorded_at. A backdated (late) reading
    still becomes "current" the moment it's inserted, even though its event
    time is earlier than an already-stored reading. Checkpoint C does not
    change this -- it's recorded here as a known, separately-flagged issue.
    """
    field_id, device_id = await _make_field_with_device()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # A real-time healthy reading "now".
            await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "soilMoisture": 55.0,
                    "recordedAt": datetime.now(UTC).isoformat(),
                },
            )
            # A backdated critical reading, arriving late, timestamped well
            # before the healthy one above.
            late_response = await client.post(
                "/api/v1/observations/ingest",
                json={
                    "deviceId": device_id,
                    "eventId": f"quality-api-test-{uuid.uuid4()}",
                    "soilMoisture": 10.0,
                    "recordedAt": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
                },
            )
            assert late_response.status_code == 201

            status_response = await client.get(f"/api/v1/fields/{field_id}/current-status")
            # The backdated (later-inserted, earlier-event-time) reading is
            # treated as "current" today -- documenting, not endorsing, this.
            assert status_response.json()["latestAssessment"]["status"] == "critical"
    finally:
        await _delete_field(field_id)
