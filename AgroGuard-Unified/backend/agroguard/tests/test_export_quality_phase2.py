"""Export Quality Phase 2: traceability + verified quality-gap analysis.

See docs/agroguard/EXPORT_QUALITY_PHASE2_IMPLEMENTATION.md for the audit
this implementation is based on, including why farm/auth-scoped tests
(items 2/3 of the brief's test matrix) are reported as not_applicable
rather than faked: AgroGuard has no farm/auth model to test against.
"""

import uuid
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.models.export_lot import ExportLabResult, ExportLot, ExportQualityCriterion
from app.db.models.field import Field
from app.db.session import engine, session_factory
from app.main import app
from app.services.export_quality import build_evidence_pack_csv, compute_quality_gaps

pytestmark = pytest.mark.asyncio


async def _make_field(name_suffix: str = "") -> int:
    async with session_factory() as session:
        field = Field(name=f"Export Phase 2 Test Field {name_suffix} {uuid.uuid4()}", latitude=16.8, longitude=96.1)
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


# --- Quality gap analysis (pure function tests, no DB needed) ---


def _lot_with_lab(analyte: str, value: float | None, unit: str | None, sample_date: date | None = None) -> ExportLot:
    lot = ExportLot(id=1, field_id=1, crop_name="Paw San rice")
    lot.lab_results = [ExportLabResult(
        id=1, lot_id=1, analyte=analyte, result_value=value, unit=unit,
        lab_name="SGS Myanmar", lab_accredited=True, sample_date=sample_date,
    )]
    lot.certificates = []
    return lot


def _criterion(**overrides) -> ExportQualityCriterion:
    defaults = dict(
        id=1, lot_id=1, analyte="cadmium", unit="mg/kg", operator="<=",
        threshold_value=0.2, threshold_value_max=None, source_name="Buyer spec v1",
        source_date=date(2026, 1, 1), verified=True, verified_note=None,
    )
    defaults.update(overrides)
    return ExportQualityCriterion(**defaults)


def test_unverified_criterion_is_always_unverified_requirement() -> None:
    lot = _lot_with_lab("cadmium", 0.05, "mg/kg")
    criterion = _criterion(verified=False)
    results = compute_quality_gaps(lot, [criterion])
    assert results[0].status == "UNVERIFIED_REQUIREMENT"
    # Even though the measurement would pass, an unverified criterion never
    # produces a pass/fail verdict.


def test_missing_lab_result_is_missing_measurement() -> None:
    lot = ExportLot(id=1, field_id=1, crop_name="Paw San rice")
    lot.lab_results = []
    lot.certificates = []
    criterion = _criterion()
    results = compute_quality_gaps(lot, [criterion])
    assert results[0].status == "MISSING_MEASUREMENT"
    assert results[0].suggested_next_action is not None
    assert "upload" in results[0].suggested_next_action.lower()


def test_verified_criterion_within_threshold_meets_requirement() -> None:
    lot = _lot_with_lab("cadmium", 0.05, "mg/kg", date(2026, 6, 1))
    criterion = _criterion(operator="<=", threshold_value=0.2, verified=True)
    results = compute_quality_gaps(lot, [criterion])
    assert results[0].status == "MEETS_DOCUMENTED_REQUIREMENT"


def test_verified_criterion_outside_threshold_is_outside_requirement() -> None:
    lot = _lot_with_lab("cadmium", 0.35, "mg/kg", date(2026, 6, 1))
    criterion = _criterion(operator="<=", threshold_value=0.2, verified=True)
    results = compute_quality_gaps(lot, [criterion])
    assert results[0].status == "OUTSIDE_DOCUMENTED_REQUIREMENT"
    assert results[0].suggested_next_action is not None


def test_unit_mismatch_is_not_numerically_compared() -> None:
    lot = _lot_with_lab("cadmium", 50, "ug/kg", date(2026, 6, 1))  # micrograms, criterion is mg
    criterion = _criterion(unit="mg/kg", verified=True)
    results = compute_quality_gaps(lot, [criterion])
    assert results[0].status == "UNIT_OR_SCOPE_MISMATCH"


def test_range_operator_requires_threshold_max_to_evaluate() -> None:
    lot = _lot_with_lab("moisture", 13.0, "%", date(2026, 6, 1))
    criterion = _criterion(analyte="moisture", unit="%", operator="range", threshold_value=12.0, threshold_value_max=14.0, verified=True)
    results = compute_quality_gaps(lot, [criterion])
    assert results[0].status == "MEETS_DOCUMENTED_REQUIREMENT"

    out_of_range_lot = _lot_with_lab("moisture", 16.0, "%", date(2026, 6, 1))
    results2 = compute_quality_gaps(out_of_range_lot, [criterion])
    assert results2[0].status == "OUTSIDE_DOCUMENTED_REQUIREMENT"


def test_quality_gap_never_produces_a_certification_status() -> None:
    forbidden = {"APPROVED", "CERTIFIED", "EXPORT_APPROVED", "EXPORT_READY", "PASSED", "CLEAN"}
    lot = _lot_with_lab("cadmium", 0.05, "mg/kg", date(2026, 6, 1))
    for verified in (True, False):
        for operator, threshold in (("<=", 0.2), ("<=", 0.01)):
            criterion = _criterion(operator=operator, threshold_value=threshold, verified=verified)
            results = compute_quality_gaps(lot, [criterion])
            assert results[0].status not in forbidden


# --- CSV formula-injection safety ---


def test_evidence_pack_escapes_formula_injection_in_free_text() -> None:
    lot = ExportLot(id=1, field_id=1, crop_name="=cmd|'/c calc'!A1", notes="+SUM(A1:A9)")
    lot.lab_results = []
    lot.certificates = []
    lot.quality_criteria = []
    csv_text = build_evidence_pack_csv(lot)
    # The raw formula-triggering prefix must never appear at the start of a
    # field -- it must always be preceded by the escaping quote.
    assert "\n=cmd" not in csv_text
    assert ",=cmd" not in csv_text
    assert "'=cmd" in csv_text
    assert "'+SUM" in csv_text


# --- Live DB: traceability, lot isolation, blocked linkages ---


async def test_traceability_reports_blocked_crop_suggestion_and_fertilizer_linkage() -> None:
    field_id = await _make_field("trace")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            lot_resp = await client.post("/api/v1/export/lots", json={"fieldId": field_id, "cropName": "Paw San rice"})
            lot_id = lot_resp.json()["id"]

            trace_resp = await client.get(f"/api/v1/export/lots/{lot_id}/traceability")
            assert trace_resp.status_code == 200
            data = trace_resp.json()
            assert data["field"]["id"] == field_id

            blocked_types = {b["recordType"]: b["status"] for b in data["blockedLinkages"]}
            assert blocked_types["crop_suggestion"] == "blocked_missing_data"
            assert blocked_types["fertilizer_application"] == "blocked_missing_data"
            assert blocked_types["farm_ownership"] == "blocked_missing_auth"
    finally:
        await _delete_field(field_id)


async def test_traceability_never_mixes_another_fields_observations() -> None:
    field_a = await _make_field("a")
    field_b = await _make_field("b")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            lot_resp = await client.post("/api/v1/export/lots", json={"fieldId": field_a, "cropName": "Paw San rice"})
            lot_id = lot_resp.json()["id"]
            trace_resp = await client.get(f"/api/v1/export/lots/{lot_id}/traceability")
            assert trace_resp.status_code == 200
            assert trace_resp.json()["field"]["id"] == field_a
            assert trace_resp.json()["field"]["id"] != field_b
    finally:
        await _delete_field(field_a)
        await _delete_field(field_b)


async def test_criterion_lifecycle_and_quality_gap_endpoint() -> None:
    field_id = await _make_field("criteria")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            lot_resp = await client.post("/api/v1/export/lots", json={"fieldId": field_id, "cropName": "Paw San rice"})
            lot_id = lot_resp.json()["id"]

            await client.post(
                f"/api/v1/export/lots/{lot_id}/lab-results",
                json={"analyte": "cadmium", "resultValue": 0.05, "unit": "mg/kg", "labName": "SGS Myanmar"},
            )

            crit_resp = await client.post(
                f"/api/v1/export/lots/{lot_id}/criteria",
                json={
                    "analyte": "cadmium", "unit": "mg/kg", "operator": "<=", "thresholdValue": 0.2,
                    "sourceName": "Buyer contract clause 4.2", "verified": True,
                },
            )
            assert crit_resp.status_code == 201

            list_resp = await client.get(f"/api/v1/export/lots/{lot_id}/criteria")
            assert len(list_resp.json()) == 1

            gaps_resp = await client.get(f"/api/v1/export/lots/{lot_id}/quality-gaps")
            assert gaps_resp.status_code == 200
            gaps = gaps_resp.json()
            assert gaps["results"][0]["status"] == "MEETS_DOCUMENTED_REQUIREMENT"
            assert "not a regulatory" in gaps["disclaimer"].lower() or "not a regulatory" in gaps["disclaimer"]
    finally:
        await _delete_field(field_id)


async def test_range_operator_without_max_is_rejected_with_422() -> None:
    field_id = await _make_field("range")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            lot_resp = await client.post("/api/v1/export/lots", json={"fieldId": field_id, "cropName": "Paw San rice"})
            lot_id = lot_resp.json()["id"]
            resp = await client.post(
                f"/api/v1/export/lots/{lot_id}/criteria",
                json={"analyte": "moisture", "unit": "%", "operator": "range", "thresholdValue": 12, "sourceName": "x"},
            )
            assert resp.status_code == 422
    finally:
        await _delete_field(field_id)


async def test_two_lots_on_same_field_keep_separate_lab_results() -> None:
    field_id = await _make_field("isolation")
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            lot1 = (await client.post("/api/v1/export/lots", json={"fieldId": field_id, "cropName": "Paw San rice"})).json()
            lot2 = (await client.post("/api/v1/export/lots", json={"fieldId": field_id, "cropName": "Paw San rice"})).json()

            await client.post(
                f"/api/v1/export/lots/{lot1['id']}/lab-results",
                json={"analyte": "cadmium", "resultValue": 0.05, "unit": "mg/kg", "labName": "SGS Myanmar"},
            )

            lot1_detail = (await client.get(f"/api/v1/export/lots/{lot1['id']}")).json()
            lot2_detail = (await client.get(f"/api/v1/export/lots/{lot2['id']}")).json()
            assert len(lot1_detail["labResults"]) == 1
            assert len(lot2_detail["labResults"]) == 0
    finally:
        await _delete_field(field_id)


async def test_quality_criterion_on_unknown_lot_is_404() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/export/lots/999999/criteria",
            json={"analyte": "cadmium", "unit": "mg/kg", "operator": "<=", "thresholdValue": 0.2, "sourceName": "x"},
        )
    assert response.status_code == 404
    await engine.dispose()
