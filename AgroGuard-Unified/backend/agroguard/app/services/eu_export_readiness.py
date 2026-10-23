"""Evaluates a lot's actual recorded lab results/certificates against the
EU criteria reference dataset for one fruit/destination. Mirrors the
honesty rules already enforced in app/services/export_quality.py
(compute_quality_gaps): absence of a lab result is always "missing
evidence", never a pass; an unverified legal-criteria row can never produce
a passing status, no matter what the measured value is -- its correct
status is always SOURCE_NOT_VERIFIED until the row itself is independently
confirmed against its source_url and marked `verified` in the reference
dataset.
"""

from datetime import date

from app.db.models.export_lot import ExportCertificate, ExportLabResult, ExportLot
from app.schemas.eu_export_quality import (
    EUCriterionEvaluation,
    EUCriterionReference,
    EUOverallStatus,
    EUReadinessResponse,
)

DISCLAIMER = (
    "Decision-support only. Not a government export permit, customs decision, phytosanitary "
    "certificate, or legal advice. A criterion marked needs_review/unavailable has not been "
    "independently confirmed against its official source and can never be treated as a pass."
)


def _find_lab_result(lot: ExportLot, analyte_or_metric: str) -> ExportLabResult | None:
    candidates = [r for r in lot.lab_results if r.analyte.strip().lower() == analyte_or_metric.strip().lower()]
    if not candidates:
        return None
    def sort_key(r: ExportLabResult) -> date:
        if r.sample_date is not None:
            return r.sample_date
        if r.created_at is not None:
            return r.created_at.date()
        return date.min

    return max(candidates, key=sort_key)


def _has_valid_certificate_of_type(lot: ExportLot, certificate_type: str) -> bool:
    """Only a certificate explicitly recorded as this type, with a stated
    (non-expired) validity date, counts. A certificate of an unrelated type,
    or one with no certificate_type recorded at all (e.g. one saved before
    this field existed), must never be read as satisfying a different
    requirement just because *some* certificate exists on the lot -- and an
    undated certificate (no valid_to) is an unknown, not a pass, matching
    the "never assumed valid with no date on file" rule already documented
    on the ExportCertificate model.
    """
    today = date.today()
    return any(
        c.certificate_type == certificate_type and c.valid_to is not None and c.valid_to >= today
        for c in lot.certificates
    )


def _evaluate_one(criterion: EUCriterionReference, lot: ExportLot) -> EUCriterionEvaluation:
    base = {
        "criterion_id": criterion.criterion_id,
        "criterion_type": criterion.criterion_type,
        "analyte_or_metric": criterion.analyte_or_metric,
        "limit_value": criterion.limit_value,
        "limit_unit": criterion.limit_unit,
        "legal_reference": criterion.legal_reference,
        "source_url": criterion.source_url,
        "verification_status": criterion.verification_status,
    }

    # An unverified/unavailable legal-criteria row can never yield a pass --
    # this check comes first and overrides every other branch below.
    if criterion.verification_status != "verified":
        return EUCriterionEvaluation(
            **base,
            status="SOURCE_NOT_VERIFIED",
            reason_code="criterion_not_independently_verified",
            detail=(
                f"This requirement's exact current legal text/value has not been independently "
                f"confirmed against {criterion.source_url} in this application. Treat as unresolved, "
                f"not as a pass or a fail."
            ),
            measured_value=None,
            measured_unit=None,
            suggested_next_action=f"Confirm current text/value at {criterion.source_url} and mark verified.",
        )

    if criterion.comparison_operator is None:
        # An exemption claim is the logical opposite of a missing document:
        # the cited regulation says NO certificate is required for this
        # specific rule at all, for this commodity/origin. It must never be
        # evaluated as "missing evidence" regardless of what's on file --
        # that would tell a farmer to go get a certificate the law says
        # they don't need. This never exempts the lot from any OTHER
        # requirement (pesticide MRL, marketing standard, contaminant,
        # customs code), which are evaluated independently below/elsewhere.
        if criterion.analyte_or_metric == "phytosanitary_certificate_exemption":
            return EUCriterionEvaluation(
                **base,
                status="NOT_APPLICABLE",
                reason_code="exemption_confirmed_in_source",
                detail=(
                    "The cited regulation explicitly exempts this commodity from the "
                    "phytosanitary-certificate requirement -- no certificate needs to be "
                    "recorded for this specific rule. Other requirements for this fruit "
                    "still apply separately."
                ),
                measured_value=None,
                measured_unit=None,
                suggested_next_action=None,
            )

        # Document-existence criterion -- no numeric comparison applies.
        # A recorded certificate is only the right evidence for an actual
        # certificate requirement (phytosanitary certificate), and only
        # when it was recorded as that specific type with a stated,
        # unexpired validity date -- an unrelated certificate type, an
        # uncategorized one, or an undated one must never be read as
        # satisfying it. For a marketing-standard or customs-code
        # requirement, no certificate of any kind can satisfy it -- there
        # is no physical-inspection-confirmation or CN-code capture
        # mechanism in this application yet, so those always report
        # missing evidence honestly instead of a false pass.
        is_certificate_requirement = criterion.analyte_or_metric == "phytosanitary_certificate"
        if is_certificate_requirement and _has_valid_certificate_of_type(lot, "phytosanitary"):
            return EUCriterionEvaluation(
                **base,
                status="MEETS_RECORDED_CRITERION",
                reason_code="document_on_file",
                detail="A phytosanitary certificate with a stated, unexpired validity date is on file for this lot.",
                measured_value=None,
                measured_unit=None,
                suggested_next_action=None,
            )
        if is_certificate_requirement:
            return EUCriterionEvaluation(
                **base,
                status="MISSING_EVIDENCE",
                reason_code="document_not_on_file",
                detail=f"No phytosanitary certificate (with a stated, unexpired validity date) on file satisfying: {criterion.required_evidence}",
                measured_value=None,
                measured_unit=None,
                suggested_next_action="Record a phytosanitary certificate for this lot.",
            )
        return EUCriterionEvaluation(
            **base,
            status="MISSING_EVIDENCE",
            reason_code="no_evidence_capture_mechanism_yet",
            detail=(
                f"This requirement is checked by physical inspection or a customs reference, not a lab "
                f"result or certificate -- AgroGuard has no field to record that confirmation yet: "
                f"{criterion.required_evidence}"
            ),
            measured_value=None,
            measured_unit=None,
            suggested_next_action="Confirm this requirement yourself before export; AgroGuard cannot record this check yet.",
        )

    result = _find_lab_result(lot, criterion.analyte_or_metric)
    if result is None or result.result_value is None:
        return EUCriterionEvaluation(
            **base,
            status="MISSING_EVIDENCE",
            reason_code="no_lab_result_on_file",
            detail=f"No lab result recorded for analyte '{criterion.analyte_or_metric}'.",
            measured_value=None,
            measured_unit=None,
            suggested_next_action="Record a lab result for this analyte.",
        )

    if criterion.limit_unit and result.unit and result.unit.strip().lower() != criterion.limit_unit.strip().lower():
        return EUCriterionEvaluation(
            **base,
            status="REQUIRES_HUMAN_REVIEW",
            reason_code="unit_mismatch",
            detail=f"Recorded result unit '{result.unit}' does not match criterion unit '{criterion.limit_unit}'.",
            measured_value=result.result_value,
            measured_unit=result.unit,
            suggested_next_action="Confirm unit conversion with the lab before comparing.",
        )

    if criterion.limit_value is None:
        return EUCriterionEvaluation(
            **base,
            status="SOURCE_NOT_VERIFIED",
            reason_code="no_numeric_limit_on_file",
            detail="This criterion has no numeric limit recorded yet in the reference dataset.",
            measured_value=result.result_value,
            measured_unit=result.unit,
            suggested_next_action=f"Source the current numeric limit from {criterion.source_url}.",
        )

    ops = {
        "<=": lambda v: v <= criterion.limit_value,
        ">=": lambda v: v >= criterion.limit_value,
        "<": lambda v: v < criterion.limit_value,
        ">": lambda v: v > criterion.limit_value,
        "==": lambda v: v == criterion.limit_value,
    }
    op = ops.get(criterion.comparison_operator)
    if op is None:
        return EUCriterionEvaluation(
            **base,
            status="REQUIRES_HUMAN_REVIEW",
            reason_code="unsupported_operator",
            detail=f"Comparison operator '{criterion.comparison_operator}' is not supported by this evaluator.",
            measured_value=result.result_value,
            measured_unit=result.unit,
            suggested_next_action=None,
        )

    meets = op(result.result_value)
    return EUCriterionEvaluation(
        **base,
        status="MEETS_RECORDED_CRITERION" if meets else "DOES_NOT_MEET_RECORDED_CRITERION",
        reason_code="numeric_comparison",
        detail=(
            f"Measured {result.result_value} {result.unit or ''} against recorded limit "
            f"{criterion.comparison_operator} {criterion.limit_value} {criterion.limit_unit or ''}."
        ),
        measured_value=result.result_value,
        measured_unit=result.unit,
        suggested_next_action=None if meets else "Investigate the out-of-range result before export.",
    )


class _EmptyEvidenceLot:
    """A stand-in used only when the real lot's crop doesn't match the
    requested fruit -- carries the real lot's id but none of its
    lab_results/certificates, so a rice lot's evidence can never be read
    as satisfying a mango requirement (or any other cross-crop mismatch).
    """

    def __init__(self, lot_id: int):
        self.id = lot_id
        self.lab_results: list[ExportLabResult] = []
        self.certificates: list[ExportCertificate] = []


def evaluate_eu_readiness(
    lot: ExportLot,
    fruit_code: str,
    destination_market: str,
    member_state: str | None,
    criteria: list[EUCriterionReference],
) -> EUReadinessResponse:
    from app.services.eu_fruit_catalog import crop_name_matches_fruit

    # A lot recorded through the EU fruit-lot form carries a stable
    # fruit_code set from the catalog itself -- trust that directly rather
    # than re-deriving it from free text. Only a lot with no fruit_code on
    # file (e.g. one entered through the legacy generic form) falls back to
    # the brittle crop_name/variety string match, which can be fooled by a
    # mistyped or ambiguous name -- see the historical "Banana (Sein Ta
    # Lone)" lot, where the variety field (not the crop) carries a name that
    # looks like a different fruit's variety; the crop_name itself still
    # correctly says "Banana", so the string match is right here, but it is
    # not a guarantee for every possible free-text entry.
    if lot.fruit_code is not None:
        lot_matches_fruit = lot.fruit_code == fruit_code
    else:
        lot_matches_fruit = crop_name_matches_fruit(lot.crop_name, fruit_code)
    mismatch_warning = None
    evaluation_lot = lot
    if not lot_matches_fruit:
        evaluation_lot = _EmptyEvidenceLot(lot.id)
        mismatch_warning = (
            f"This record is for '{lot.crop_name}', not {fruit_code}. Select a matching {fruit_code} lot, "
            f"or use general requirements guidance without lot-specific evidence. No lab result or "
            f"certificate from this record was used in the checks below."
        )

    evaluations = [_evaluate_one(c, evaluation_lot) for c in criteria]

    if not evaluations:
        status: EUOverallStatus = "INSUFFICIENT_EVIDENCE"
    elif any(e.status == "DOES_NOT_MEET_RECORDED_CRITERION" for e in evaluations):
        status = "ACTION_REQUIRED"
    elif any(e.status in ("SOURCE_NOT_VERIFIED", "MISSING_EVIDENCE", "REQUIRES_HUMAN_REVIEW") for e in evaluations):
        status = "ACTION_REQUIRED" if any(e.status == "MISSING_EVIDENCE" for e in evaluations) else "INSUFFICIENT_EVIDENCE"
    else:
        status = "READY_FOR_REVIEW"

    missing_evidence = [
        f"{e.criterion_id}: {e.detail}" for e in evaluations if e.status in ("MISSING_EVIDENCE", "SOURCE_NOT_VERIFIED")
    ]

    return EUReadinessResponse(
        lot_id=lot.id,
        fruit_code=fruit_code,
        destination_market=destination_market,
        member_state=member_state,
        status=status,
        criteria=evaluations,
        missing_evidence=missing_evidence,
        disclaimer=DISCLAIMER,
        lot_crop_name=lot.crop_name,
        lot_matches_fruit=lot_matches_fruit,
        mismatch_warning=mismatch_warning,
    )
