import uuid
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.models.field import Field
from app.db.session import engine, session_factory
from app.main import app
from app.services.export_quality import (
    build_evidence_pack_csv,
    certificate_expiry,
    compute_readiness,
)

pytestmark = pytest.mark.asyncio


async def _make_field() -> int:
    async with session_factory() as session:
        field = Field(name=f"Export Quality Test Field {uuid.uuid4()}", latitude=16.8, longitude=96.1)
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


async def test_lot_lifecycle_lab_results_certificates_and_readiness() -> None:
    field_id = await _make_field()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # A brand-new lot with nothing recorded -> INSUFFICIENT_EVIDENCE.
            create_resp = await client.post(
                "/api/v1/export/lots",
                json={"fieldId": field_id, "cropName": "Paw San rice"},
            )
            assert create_resp.status_code == 201
            lot_id = create_resp.json()["id"]

            readiness_resp = await client.get(f"/api/v1/export/lots/{lot_id}/readiness")
            assert readiness_resp.status_code == 200
            readiness = readiness_resp.json()
            assert readiness["status"] == "INSUFFICIENT_EVIDENCE"
            assert all(c["status"] != "met" for c in readiness["criteria"])
            lab_criterion = next(c for c in readiness["criteria"] if c["id"] == "lab_tested")
            assert lab_criterion["status"] == "untested"

            # Add a harvest record + storage via a second lot with those fields.
            full_resp = await client.post(
                "/api/v1/export/lots",
                json={
                    "fieldId": field_id, "cropName": "Paw San rice",
                    "harvestDate": "2026-12-01", "harvestMoisturePct": 22.0,
                    "storageType": "hermetic bag",
                },
            )
            full_lot_id = full_resp.json()["id"]

            lab_resp = await client.post(
                f"/api/v1/export/lots/{full_lot_id}/lab-results",
                json={"analyte": "cadmium", "resultValue": 0.05, "unit": "mg/kg", "labName": "SGS Myanmar", "labAccredited": True},
            )
            assert lab_resp.status_code == 201

            cert_resp = await client.post(
                f"/api/v1/export/lots/{full_lot_id}/certificates",
                json={"issuer": "DOA", "certificateNumber": "DOA-2026-001", "validTo": "2030-01-01"},
            )
            assert cert_resp.status_code == 201

            readiness2 = (await client.get(f"/api/v1/export/lots/{full_lot_id}/readiness")).json()
            assert readiness2["status"] == "READY_FOR_REVIEW"
            assert all(c["status"] == "met" for c in readiness2["criteria"])

            # Evidence pack is a real CSV, not a fabricated summary.
            pack_resp = await client.get(f"/api/v1/export/lots/{full_lot_id}/evidence-pack")
            assert pack_resp.status_code == 200
            assert pack_resp.headers["content-type"].startswith("text/csv")
            assert "cadmium" in pack_resp.text
            assert "DOA-2026-001" in pack_resp.text

            # List + detail endpoints work.
            list_resp = await client.get("/api/v1/export/lots", params={"fieldId": field_id})
            assert list_resp.status_code == 200
            assert len(list_resp.json()) == 2

            detail_resp = await client.get(f"/api/v1/export/lots/{full_lot_id}")
            assert detail_resp.status_code == 200
            detail = detail_resp.json()
            assert len(detail["labResults"]) == 1
            assert len(detail["certificates"]) == 1
    finally:
        await _delete_field(field_id)


async def test_lot_not_found_returns_404() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/export/lots/999999/readiness")
    assert response.status_code == 404
    await engine.dispose()


async def test_lab_result_on_unknown_lot_is_404() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/export/lots/999999/lab-results",
            json={"analyte": "cadmium", "labName": "SGS Myanmar"},
        )
    assert response.status_code == 404
    await engine.dispose()


def test_certificate_expiry_unknown_when_no_valid_to() -> None:
    from app.db.models.export_lot import ExportCertificate

    cert = ExportCertificate(lot_id=1, issuer="DOA", certificate_number="X", valid_to=None)
    is_expired, days = certificate_expiry(cert)
    assert is_expired is None
    assert days is None


def test_certificate_expiry_detects_expired_and_valid() -> None:
    from app.db.models.export_lot import ExportCertificate

    today = date(2026, 6, 1)
    expired = ExportCertificate(lot_id=1, issuer="DOA", certificate_number="X", valid_to=date(2026, 5, 1))
    valid = ExportCertificate(lot_id=1, issuer="DOA", certificate_number="Y", valid_to=date(2026, 7, 1))

    expired_flag, expired_days = certificate_expiry(expired, today)
    valid_flag, valid_days = certificate_expiry(valid, today)

    assert expired_flag is True
    assert expired_days < 0
    assert valid_flag is False
    assert valid_days > 0


def test_readiness_never_returns_approved_or_certified() -> None:
    from app.db.models.export_lot import ExportLot

    lot = ExportLot(
        id=1, field_id=1, crop_name="Paw San rice",
        harvest_date=date.today() - timedelta(days=5), harvest_moisture_pct=20.0,
        storage_type="hermetic bag",
    )
    lot.lab_results = []
    lot.certificates = []
    readiness = compute_readiness(lot)
    assert readiness.status in ("INSUFFICIENT_EVIDENCE", "ACTION_REQUIRED", "READY_FOR_REVIEW")
    assert readiness.status != "APPROVED"
    assert readiness.status != "CERTIFIED"


def test_evidence_pack_marks_untested_when_no_lab_results() -> None:
    from app.db.models.export_lot import ExportLot

    lot = ExportLot(id=1, field_id=1, crop_name="Paw San rice")
    lot.lab_results = []
    lot.certificates = []
    csv_text = build_evidence_pack_csv(lot)
    assert "none on file -- untested" in csv_text
