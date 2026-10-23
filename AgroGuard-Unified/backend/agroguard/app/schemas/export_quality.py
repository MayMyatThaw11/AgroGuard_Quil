from datetime import date, datetime
from typing import Literal

from app.schemas.base import APIModel

ReadinessStatus = Literal["INSUFFICIENT_EVIDENCE", "ACTION_REQUIRED", "READY_FOR_REVIEW"]
CriterionStatus = Literal["met", "missing", "untested", "expired"]

# Phase 2: traceability + gap analysis. "contextual" means the evidence is
# real and tied to the lot's field, but not to this specific lot/batch --
# never shown or labeled as lot-specific proof.
EvidenceClass = Literal["lot_specific", "contextual"]
ComparisonOperator = Literal["<=", ">=", "<", ">", "==", "range"]
GapStatus = Literal[
    "MEETS_DOCUMENTED_REQUIREMENT",
    "OUTSIDE_DOCUMENTED_REQUIREMENT",
    "MISSING_MEASUREMENT",
    "UNVERIFIED_REQUIREMENT",
    "UNIT_OR_SCOPE_MISMATCH",
    "EXPIRED_OR_UNCONFIRMED_EVIDENCE",
    "NOT_APPLICABLE",
]
LinkageStatus = Literal["implemented", "possible_with_verified_identity", "blocked_missing_data", "blocked_missing_auth", "not_applicable"]


class ExportLotCreateRequest(APIModel):
    field_id: int
    crop_name: str
    fruit_code: str | None = None
    variety: str | None = None
    harvest_date: date | None = None
    harvest_moisture_pct: float | None = None
    storage_type: str | None = None
    storage_started_at: date | None = None
    milling_broken_pct: float | None = None
    milling_class: str | None = None
    notes: str | None = None


class ExportLabResultCreateRequest(APIModel):
    analyte: str
    result_value: float | None = None
    unit: str | None = None
    method: str | None = None
    lab_name: str
    lab_accredited: bool = False
    sample_date: date | None = None
    notes: str | None = None


class ExportCertificateCreateRequest(APIModel):
    issuer: str
    certificate_number: str
    certificate_type: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    notes: str | None = None


class ExportLabResultResponse(APIModel):
    id: int
    lot_id: int
    analyte: str
    result_value: float | None
    unit: str | None
    method: str | None
    lab_name: str
    lab_accredited: bool
    sample_date: date | None
    notes: str | None
    created_at: datetime


class ExportCertificateResponse(APIModel):
    id: int
    lot_id: int
    issuer: str
    certificate_number: str
    certificate_type: str | None
    valid_from: date | None
    valid_to: date | None
    notes: str | None
    created_at: datetime
    # Computed at read time from valid_to vs. today -- never stored, so it
    # can never drift from the actual date on file.
    is_expired: bool | None
    days_until_expiry: int | None


class ExportLotResponse(APIModel):
    id: int
    field_id: int
    crop_name: str
    fruit_code: str | None
    variety: str | None
    harvest_date: date | None
    harvest_moisture_pct: float | None
    storage_type: str | None
    storage_started_at: date | None
    milling_broken_pct: float | None
    milling_class: str | None
    notes: str | None
    created_at: datetime


class ExportLotDetailResponse(ExportLotResponse):
    lab_results: list[ExportLabResultResponse] = []
    certificates: list[ExportCertificateResponse] = []


class ReadinessCriterion(APIModel):
    id: str
    label: str
    status: CriterionStatus
    detail: str


class ExportReadinessResponse(APIModel):
    lot_id: int
    status: ReadinessStatus
    criteria: list[ReadinessCriterion]


# --- Phase 2: traceability ---


class TraceabilityFieldInfo(APIModel):
    id: int
    name: str
    latitude: float
    longitude: float
    region_code: str | None


class ContextualObservation(APIModel):
    """A real SensorObservation row for the lot's field, within the
    traceability time window -- never claimed as specific to this lot,
    only to the field it came from.
    """

    evidence_class: EvidenceClass = "contextual"
    observation_id: int
    recorded_at: datetime
    temperature: float | None
    humidity: float | None
    soil_moisture: float | None
    ph: float | None
    light: float | None


class ContextualAssessment(APIModel):
    evidence_class: EvidenceClass = "contextual"
    assessment_id: int
    created_at: datetime
    status: str
    health_score: float
    primary_risk: str | None


class BlockedLinkage(APIModel):
    record_type: str
    status: LinkageStatus
    reason: str


class ExportTraceabilityResponse(APIModel):
    lot_id: int
    field: TraceabilityFieldInfo
    window_start: date | None
    window_end: date | None
    window_note: str
    contextual_observations: list[ContextualObservation]
    contextual_assessments: list[ContextualAssessment]
    blocked_linkages: list[BlockedLinkage]


# --- Phase 2: quality gap analysis ---


class ExportQualityCriterionCreateRequest(APIModel):
    analyte: str
    unit: str
    operator: ComparisonOperator
    threshold_value: float
    threshold_value_max: float | None = None
    source_name: str
    source_date: date | None = None
    verified: bool = False
    verified_note: str | None = None


class ExportQualityCriterionResponse(APIModel):
    id: int
    lot_id: int
    analyte: str
    unit: str
    operator: ComparisonOperator
    threshold_value: float
    threshold_value_max: float | None
    source_name: str
    source_date: date | None
    verified: bool
    verified_note: str | None
    created_at: datetime


class QualityGapResult(APIModel):
    criterion_id: int
    analyte: str
    status: GapStatus
    reason_code: str
    detail: str
    measured_value: float | None
    measured_unit: str | None
    measured_at: date | None
    criterion_value: float
    criterion_value_max: float | None
    criterion_unit: str
    criterion_source: str
    criterion_verified: bool
    suggested_next_action: str | None


class ExportQualityGapResponse(APIModel):
    lot_id: int
    results: list[QualityGapResult]
    disclaimer: str
