"""EU fruit export-readiness schemas. Extends the existing Export Quality
Phase 1/2 contract (app/schemas/export_quality.py) without modifying it --
this is a separate, additive readiness view scoped to EU destination rules
for fresh fruit. Never produces an "approved"/"certified" status: see
EUOverallStatus and EUCriterionStatus below.
"""

from datetime import date
from typing import Literal

from app.schemas.base import APIModel

# Mirrors ExportReadinessResponse's three-state model (never a fourth,
# "approved" state) -- see app/schemas/export_quality.py: ReadinessStatus.
EUOverallStatus = Literal["INSUFFICIENT_EVIDENCE", "ACTION_REQUIRED", "READY_FOR_REVIEW"]

EUCriterionStatus = Literal[
    "MEETS_RECORDED_CRITERION",
    "DOES_NOT_MEET_RECORDED_CRITERION",
    "MISSING_EVIDENCE",
    "NOT_APPLICABLE",
    "REQUIRES_HUMAN_REVIEW",
    "SOURCE_NOT_VERIFIED",
]

EUVerificationStatus = Literal["verified", "needs_review", "unavailable"]
EUCriterionType = Literal[
    "pesticide_mrl",
    "contaminant",
    "physical_grade",
    "phytosanitary",
    "market_access",
    "labeling",
    "traceability",
    "documentation",
]


class EUMemberStateEntry(APIModel):
    code: str
    name_en: str
    name_mm: str


class FruitCatalogEntry(APIModel):
    fruit_code: str
    name_en: str
    name_mm: str
    scientific_name: str
    source: str


class EUCriterionReference(APIModel):
    """One row of the EU legal-criteria reference dataset
    (app/data/export_data/eu_fruit_criteria.csv) -- reference knowledge, never a labeled
    training sample and never evidence by itself.
    """

    criterion_id: str
    fruit_code: str
    origin_country: str
    destination_market: str
    member_state: str | None
    product_form: str
    cn_code: str | None
    criterion_type: EUCriterionType
    analyte_or_metric: str
    residue_definition: str | None
    comparison_operator: str | None
    limit_value: float | None
    limit_unit: str | None
    required_evidence: str
    legal_reference: str
    article_or_annex: str | None
    source_url: str
    effective_from: date | None
    effective_to: date | None
    last_verified_at: date | None
    verification_status: EUVerificationStatus


class EURequirementsResponse(APIModel):
    fruit_code: str
    destination_market: str
    member_state: str | None
    requirements: list[EUCriterionReference]
    disclaimer: str


class EUCriterionEvaluation(APIModel):
    criterion_id: str
    criterion_type: EUCriterionType
    analyte_or_metric: str
    status: EUCriterionStatus
    reason_code: str
    detail: str
    measured_value: float | None
    measured_unit: str | None
    limit_value: float | None
    limit_unit: str | None
    legal_reference: str
    source_url: str
    verification_status: EUVerificationStatus
    suggested_next_action: str | None


class EUReadinessResponse(APIModel):
    lot_id: int
    fruit_code: str
    destination_market: str
    member_state: str | None
    status: EUOverallStatus
    criteria: list[EUCriterionEvaluation]
    missing_evidence: list[str]
    disclaimer: str
    lot_crop_name: str
    lot_matches_fruit: bool
    mismatch_warning: str | None


class EUCriteriaImportRow(APIModel):
    """One candidate row submitted for validation -- mirrors the CSV column
    set in app/data/export_data/eu_fruit_criteria.csv. This is never written to the
    reference file or a database automatically; see
    app/services/eu_criteria_importer.py.
    """

    criterion_id: str
    fruit_code: str
    origin_country: str
    destination_market: str
    member_state: str | None = None
    product_form: str
    criterion_type: EUCriterionType
    analyte_or_metric: str
    comparison_operator: str | None = None
    limit_value: float | None = None
    limit_unit: str | None = None
    required_evidence: str
    legal_reference: str
    source_url: str
    verification_status: EUVerificationStatus = "needs_review"


class EUCriteriaImportValidateRequest(APIModel):
    rows: list[EUCriteriaImportRow]


class EUCriteriaImportRowResult(APIModel):
    row_index: int
    criterion_id: str
    accepted: bool
    errors: list[str]
    warnings: list[str]


class EUCriteriaImportValidateResponse(APIModel):
    total_rows: int
    accepted_count: int
    rejected_count: int
    results: list[EUCriteriaImportRowResult]
    note: str
