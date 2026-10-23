"""Export Quality readiness scoring and evidence-pack compilation.

No market/standard-specific rule (China GB limits, EU conversion windows,
ASOA banned-substance lists, etc.) is encoded here -- AgroGuard has no
verified, dated source for any of those yet (see
FRONTEND_BACKEND_DEPENDENCIES.md). Readiness instead checks only whether
real records actually exist: a harvest record, a storage record, at least
one lab result (never assumed clean without one), and at least one
certificate that is not expired. The result is never `READY_FOR_REVIEW`'s
stronger cousins "APPROVED" or "CERTIFIED" -- a human reviewer always makes
that call.
"""

import csv
import io
from datetime import UTC, date, datetime, timedelta

from app.db.models.assessment import Assessment
from app.db.models.export_lot import (
    ExportCertificate,
    ExportLot,
    ExportQualityCriterion,
)
from app.db.models.field import Field
from app.db.models.sensor_observation import SensorObservation
from app.schemas.export_quality import (
    BlockedLinkage,
    ContextualAssessment,
    ContextualObservation,
    ExportCertificateResponse,
    ExportReadinessResponse,
    ExportTraceabilityResponse,
    QualityGapResult,
    ReadinessCriterion,
    TraceabilityFieldInfo,
)

# A spreadsheet application (Excel, LibreOffice, Google Sheets) treats a
# cell starting with one of these characters as a formula. Any free-text
# field a user typed (crop name, notes, lab name, issuer, etc.) is
# "untrusted" for CSV purposes even though it's our own farmer's input --
# prefixing a straight quote neutralizes the formula without changing how
# the value reads to a person opening the file normally.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value) -> str:
    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_PREFIXES):
        return "'" + text
    return text


# Traceability window: how far from the lot's harvest date a real field
# observation/assessment is still shown as plausibly-relevant context.
# Outside this window, nothing is hidden from the data -- it simply isn't
# fetched by `app/api/v1/endpoints/export_quality.py`'s traceability route,
# which uses this same constant.
TRACEABILITY_WINDOW_DAYS = 30


def certificate_expiry(cert: ExportCertificate, today: date | None = None) -> tuple[bool | None, int | None]:
    """Returns (is_expired, days_until_expiry). Both None when valid_to was
    never recorded -- an unknown expiry is never treated as "not expired".
    """
    if cert.valid_to is None:
        return None, None
    today = today or datetime.now(UTC).date()
    days = (cert.valid_to - today).days
    return days < 0, days


def _certificate_response(cert: ExportCertificate, today: date | None = None) -> ExportCertificateResponse:
    is_expired, days = certificate_expiry(cert, today)
    return ExportCertificateResponse(
        id=cert.id,
        lot_id=cert.lot_id,
        issuer=cert.issuer,
        certificate_number=cert.certificate_number,
        certificate_type=cert.certificate_type,
        valid_from=cert.valid_from,
        valid_to=cert.valid_to,
        notes=cert.notes,
        created_at=cert.created_at,
        is_expired=is_expired,
        days_until_expiry=days,
    )


def certificate_responses(certificates: list[ExportCertificate]) -> list[ExportCertificateResponse]:
    today = datetime.now(UTC).date()
    return [_certificate_response(c, today) for c in certificates]


def compute_readiness(lot: ExportLot) -> ExportReadinessResponse:
    today = datetime.now(UTC).date()
    criteria: list[ReadinessCriterion] = []

    if lot.harvest_date is not None and lot.harvest_moisture_pct is not None:
        criteria.append(ReadinessCriterion(
            id="harvest_record", label="Harvest record", status="met",
            detail=f"Harvested {lot.harvest_date.isoformat()} at {lot.harvest_moisture_pct}% moisture.",
        ))
    else:
        criteria.append(ReadinessCriterion(
            id="harvest_record", label="Harvest record", status="missing",
            detail="No harvest date and/or moisture reading recorded for this lot.",
        ))

    if lot.storage_type is not None:
        criteria.append(ReadinessCriterion(
            id="storage_record", label="Storage record", status="met",
            detail=f"Stored as: {lot.storage_type}.",
        ))
    else:
        criteria.append(ReadinessCriterion(
            id="storage_record", label="Storage record", status="missing",
            detail="No storage type recorded for this lot.",
        ))

    if lot.lab_results:
        criteria.append(ReadinessCriterion(
            id="lab_tested", label="Lab results", status="met",
            detail=f"{len(lot.lab_results)} lab result(s) on file.",
        ))
    else:
        criteria.append(ReadinessCriterion(
            id="lab_tested", label="Lab results", status="untested",
            detail="No lab result recorded for this lot. Untested, not clean.",
        ))

    if not lot.certificates:
        criteria.append(ReadinessCriterion(
            id="certificate_valid", label="Certificate", status="missing",
            detail="No certificate recorded for this lot.",
        ))
    else:
        expiry_flags = [certificate_expiry(c, today)[0] for c in lot.certificates]
        unexpired_count = sum(1 for flag in expiry_flags if flag is False)
        expired_count = sum(1 for flag in expiry_flags if flag is True)
        if unexpired_count > 0:
            criteria.append(ReadinessCriterion(
                id="certificate_valid", label="Certificate", status="met",
                detail=f"{unexpired_count} certificate(s) currently valid.",
            ))
        elif expired_count > 0:
            criteria.append(ReadinessCriterion(
                id="certificate_valid", label="Certificate", status="expired",
                detail="All certificates on file for this lot have expired.",
            ))
        else:
            criteria.append(ReadinessCriterion(
                id="certificate_valid", label="Certificate", status="missing",
                detail="Certificate(s) on file have no expiry date recorded; cannot confirm validity.",
            ))

    unmet = [c for c in criteria if c.status != "met"]
    if len(unmet) == len(criteria):
        status = "INSUFFICIENT_EVIDENCE"
    elif unmet:
        status = "ACTION_REQUIRED"
    else:
        status = "READY_FOR_REVIEW"

    return ExportReadinessResponse(lot_id=lot.id, status=status, criteria=criteria)


def build_evidence_pack_csv(lot: ExportLot) -> str:
    """A CSV evidence pack: lot record, every lab result, every certificate,
    and the computed readiness criteria -- compiled only from what is
    actually on file, never a fabricated summary.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow(["Export Lot Evidence Pack"])
    writer.writerow(["Generated at (UTC)", datetime.now(UTC).isoformat()])
    writer.writerow([])

    writer.writerow(["Lot"])
    writer.writerow(["field_id", "crop_name", "variety", "harvest_date", "harvest_moisture_pct",
                      "storage_type", "storage_started_at", "milling_broken_pct", "milling_class", "notes"])
    writer.writerow([
        lot.field_id, _csv_safe(lot.crop_name), _csv_safe(lot.variety), lot.harvest_date or "",
        lot.harvest_moisture_pct or "", _csv_safe(lot.storage_type), lot.storage_started_at or "",
        lot.milling_broken_pct or "", _csv_safe(lot.milling_class), _csv_safe(lot.notes),
    ])
    writer.writerow([])

    writer.writerow(["Lab Results"])
    writer.writerow(["analyte", "result_value", "unit", "method", "lab_name", "lab_accredited", "sample_date", "notes"])
    for r in lot.lab_results:
        writer.writerow([_csv_safe(r.analyte), r.result_value if r.result_value is not None else "", _csv_safe(r.unit),
                          _csv_safe(r.method), _csv_safe(r.lab_name), r.lab_accredited, r.sample_date or "", _csv_safe(r.notes)])
    if not lot.lab_results:
        writer.writerow(["(none on file -- untested)"])
    writer.writerow([])

    writer.writerow(["Certificates"])
    writer.writerow(["issuer", "certificate_number", "valid_from", "valid_to", "is_expired", "notes"])
    today = datetime.now(UTC).date()
    for c in lot.certificates:
        is_expired, _ = certificate_expiry(c, today)
        writer.writerow([_csv_safe(c.issuer), _csv_safe(c.certificate_number), c.valid_from or "", c.valid_to or "",
                          "" if is_expired is None else is_expired, _csv_safe(c.notes)])
    if not lot.certificates:
        writer.writerow(["(none on file)"])
    writer.writerow([])

    readiness = compute_readiness(lot)
    writer.writerow(["Readiness", readiness.status])
    writer.writerow(["criterion", "status", "detail"])
    for crit in readiness.criteria:
        writer.writerow([crit.label, crit.status, _csv_safe(crit.detail)])
    writer.writerow([])

    writer.writerow(["Quality Gap Analysis (Phase 2) -- buyer-specification comparisons only, never a regulatory verdict"])
    writer.writerow(["analyte", "status", "measured_value", "measured_unit", "criterion_value", "criterion_unit",
                      "criterion_source", "criterion_verified", "detail"])
    gap_results = compute_quality_gaps(lot, lot.quality_criteria)
    for g in gap_results:
        writer.writerow([
            _csv_safe(g.analyte), g.status, g.measured_value if g.measured_value is not None else "",
            _csv_safe(g.measured_unit), g.criterion_value, _csv_safe(g.criterion_unit),
            _csv_safe(g.criterion_source), g.criterion_verified, _csv_safe(g.detail),
        ])
    if not gap_results:
        writer.writerow(["(no quality criteria recorded for this lot)"])
    writer.writerow([])

    writer.writerow(["NOTE: This evidence pack is a compilation of records on file. It is NOT a certification, "
                      "export approval, or guarantee of compliance with any standard or buyer specification."])

    return buffer.getvalue()


def compute_quality_gaps(lot: ExportLot, criteria: list[ExportQualityCriterion]) -> list[QualityGapResult]:
    """Compares each criterion against the lot's own lab results. A
    criterion is matched to a lab result by analyte name (case-insensitive)
    -- the newest matching result is used. Never fabricates a measurement,
    never treats an unverified buyer specification as grounds for a
    MEETS/OUTSIDE verdict, and never produces a regulatory compliance
    statement.
    """
    results: list[QualityGapResult] = []
    for criterion in criteria:
        matching = [r for r in lot.lab_results if r.analyte.strip().lower() == criterion.analyte.strip().lower()]
        matching.sort(key=lambda r: r.sample_date or date.min, reverse=True)
        latest = matching[0] if matching else None

        if not criterion.verified:
            results.append(QualityGapResult(
                criterion_id=criterion.id, analyte=criterion.analyte, status="UNVERIFIED_REQUIREMENT",
                reason_code="criterion_not_verified",
                detail=(
                    f"'{criterion.source_name}' has not been marked verified. This is a buyer specification, "
                    "not a governed standard -- AgroGuard has no approval workflow for criteria yet, so an "
                    "unverified entry can never produce a pass/fail comparison."
                ),
                measured_value=latest.result_value if latest else None,
                measured_unit=latest.unit if latest else None,
                measured_at=latest.sample_date if latest else None,
                criterion_value=criterion.threshold_value, criterion_value_max=criterion.threshold_value_max,
                criterion_unit=criterion.unit, criterion_source=criterion.source_name,
                criterion_verified=criterion.verified,
                suggested_next_action=f"Confirm whether '{criterion.source_name}' applies to this lot and mark it verified if so.",
            ))
            continue

        if latest is None:
            results.append(QualityGapResult(
                criterion_id=criterion.id, analyte=criterion.analyte, status="MISSING_MEASUREMENT",
                reason_code="no_lab_result_for_analyte",
                detail=f"No lab result recorded for '{criterion.analyte}' on this lot.",
                measured_value=None, measured_unit=None, measured_at=None,
                criterion_value=criterion.threshold_value, criterion_value_max=criterion.threshold_value_max,
                criterion_unit=criterion.unit, criterion_source=criterion.source_name,
                criterion_verified=criterion.verified,
                suggested_next_action=f"Upload a lab test report for '{criterion.analyte}' on this lot.",
            ))
            continue

        if latest.result_value is None:
            results.append(QualityGapResult(
                criterion_id=criterion.id, analyte=criterion.analyte, status="MISSING_MEASUREMENT",
                reason_code="lab_result_has_no_value",
                detail=f"A lab result for '{criterion.analyte}' exists but has no numeric value recorded.",
                measured_value=None, measured_unit=latest.unit, measured_at=latest.sample_date,
                criterion_value=criterion.threshold_value, criterion_value_max=criterion.threshold_value_max,
                criterion_unit=criterion.unit, criterion_source=criterion.source_name,
                criterion_verified=criterion.verified,
                suggested_next_action=f"Ask the lab for the numeric result value for '{criterion.analyte}'.",
            ))
            continue

        if (latest.unit or "").strip().lower() != criterion.unit.strip().lower():
            results.append(QualityGapResult(
                criterion_id=criterion.id, analyte=criterion.analyte, status="UNIT_OR_SCOPE_MISMATCH",
                reason_code="unit_mismatch",
                detail=f"Lab result is in '{latest.unit or 'an unspecified unit'}', criterion is in '{criterion.unit}' -- not compared.",
                measured_value=latest.result_value, measured_unit=latest.unit, measured_at=latest.sample_date,
                criterion_value=criterion.threshold_value, criterion_value_max=criterion.threshold_value_max,
                criterion_unit=criterion.unit, criterion_source=criterion.source_name,
                criterion_verified=criterion.verified,
                suggested_next_action="Ask the lab to report in the criterion's unit, or confirm the correct conversion with a specialist.",
            ))
            continue

        value = latest.result_value
        meets = {
            "<=": value <= criterion.threshold_value,
            ">=": value >= criterion.threshold_value,
            "<": value < criterion.threshold_value,
            ">": value > criterion.threshold_value,
            "==": value == criterion.threshold_value,
            "range": criterion.threshold_value_max is not None and criterion.threshold_value <= value <= criterion.threshold_value_max,
        }.get(criterion.operator)

        if meets is None:
            results.append(QualityGapResult(
                criterion_id=criterion.id, analyte=criterion.analyte, status="UNIT_OR_SCOPE_MISMATCH",
                reason_code="invalid_operator_or_range",
                detail=f"Criterion operator '{criterion.operator}' could not be evaluated (range criteria need threshold_value_max).",
                measured_value=value, measured_unit=latest.unit, measured_at=latest.sample_date,
                criterion_value=criterion.threshold_value, criterion_value_max=criterion.threshold_value_max,
                criterion_unit=criterion.unit, criterion_source=criterion.source_name,
                criterion_verified=criterion.verified,
                suggested_next_action="Re-check how this criterion was entered.",
            ))
            continue

        if meets:
            results.append(QualityGapResult(
                criterion_id=criterion.id, analyte=criterion.analyte, status="MEETS_DOCUMENTED_REQUIREMENT",
                reason_code="within_threshold",
                detail=f"{value} {latest.unit} {criterion.operator} {criterion.threshold_value} {criterion.unit} ({criterion.source_name}).",
                measured_value=value, measured_unit=latest.unit, measured_at=latest.sample_date,
                criterion_value=criterion.threshold_value, criterion_value_max=criterion.threshold_value_max,
                criterion_unit=criterion.unit, criterion_source=criterion.source_name,
                criterion_verified=criterion.verified,
                suggested_next_action=None,
            ))
        else:
            results.append(QualityGapResult(
                criterion_id=criterion.id, analyte=criterion.analyte, status="OUTSIDE_DOCUMENTED_REQUIREMENT",
                reason_code="outside_threshold",
                detail=f"{value} {latest.unit} does not satisfy {criterion.operator} {criterion.threshold_value} {criterion.unit} ({criterion.source_name}).",
                measured_value=value, measured_unit=latest.unit, measured_at=latest.sample_date,
                criterion_value=criterion.threshold_value, criterion_value_max=criterion.threshold_value_max,
                criterion_unit=criterion.unit, criterion_source=criterion.source_name,
                criterion_verified=criterion.verified,
                suggested_next_action=f"Ask an accredited specialist to review this '{criterion.analyte}' finding before proceeding.",
            ))

    return results


def build_traceability_response(
    lot: ExportLot,
    field: Field,
    observations: list[SensorObservation],
    assessments: list[Assessment],
) -> ExportTraceabilityResponse:
    """Pure shaping function -- the caller (the endpoint) already fetched
    the field-scoped, time-windowed rows; this only labels them. Crop
    Suggestion and Fertilizer Management linkages are reported as
    `blocked_missing_data` rather than silently omitted: neither feature
    persists any record in AgroGuard's backend today (Crop Suggestion is
    computed and returned without a DB write; Fertilizer Management has no
    backend at all -- confirmed by reading both, not assumed), so there is
    nothing real to link.
    """
    window_start = window_end = None
    if lot.harvest_date is not None:
        window_start = lot.harvest_date - timedelta(days=TRACEABILITY_WINDOW_DAYS)
        window_end = lot.harvest_date + timedelta(days=TRACEABILITY_WINDOW_DAYS)
        window_note = (
            f"Showing field-level observations and assessments within {TRACEABILITY_WINDOW_DAYS} days of the "
            "recorded harvest date. These are real records from this field, not records scoped to this specific lot."
        )
    else:
        window_note = (
            "No harvest date recorded for this lot, so no time window could be applied. Showing the field's most "
            "recent observations and assessments instead -- real records from this field, not scoped to this lot."
        )

    return ExportTraceabilityResponse(
        lot_id=lot.id,
        field=TraceabilityFieldInfo(
            id=field.id, name=field.name, latitude=field.latitude, longitude=field.longitude,
            region_code=field.region_code,
        ),
        window_start=window_start, window_end=window_end, window_note=window_note,
        contextual_observations=[
            ContextualObservation(
                observation_id=o.id, recorded_at=o.recorded_at, temperature=o.temperature, humidity=o.humidity,
                soil_moisture=o.soil_moisture, ph=o.ph, light=o.light,
            ) for o in observations
        ],
        contextual_assessments=[
            ContextualAssessment(
                assessment_id=a.id, created_at=a.created_at, status=a.status, health_score=a.health_score,
                primary_risk=a.primary_risk,
            ) for a in assessments
        ],
        blocked_linkages=[
            BlockedLinkage(
                record_type="crop_suggestion", status="blocked_missing_data",
                reason="Crop Suggestion computes and returns a result without writing it to the database "
                       "(confirmed: no persistence model exists) -- there is no saved record to link.",
            ),
            BlockedLinkage(
                record_type="fertilizer_application", status="blocked_missing_data",
                reason="Fertilizer Management has no backend in AgroGuard today (confirmed: zero matches for "
                       "'fertiliz' in backend/agroguard) -- a fertilizer recommendation is a suggestion only, "
                       "never evidence that anything was actually applied.",
            ),
            BlockedLinkage(
                record_type="farm_ownership", status="blocked_missing_auth",
                reason="AgroGuard has no authentication or farm-ownership model (confirmed: no User model, no "
                       "JWT/session auth, fields has no owner_id) -- cross-farm access cannot be enforced, so no "
                       "farm-scoped write/association endpoint is exposed; see docs/agroguard/"
                       "EXPORT_QUALITY_PHASE2_IMPLEMENTATION.md.",
            ),
        ],
    )
