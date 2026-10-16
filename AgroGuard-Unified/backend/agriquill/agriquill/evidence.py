from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class Provenance(StrEnum):
    MEASURED = "MEASURED"
    LAB_ANALYZED = "LAB_ANALYZED"
    OFFICIAL_RECORD = "OFFICIAL_RECORD"
    RETRIEVED = "RETRIEVED"
    ESTIMATED = "ESTIMATED"
    DERIVED = "DERIVED"
    ASSIMILATED = "ASSIMILATED"
    SIMULATED = "SIMULATED"
    USER_REPORTED = "USER_REPORTED"


class QualityFlag(StrEnum):
    VALID = "VALID"
    SUSPECT = "SUSPECT"
    INVALID = "INVALID"
    MISSING = "MISSING"
    OUT_OF_RANGE = "OUT_OF_RANGE"
    STALE = "STALE"
    CONFLICT = "CONFLICT"


class EvidenceRef(BaseModel):
    evidence_id: str = Field(min_length=1)
    tenant_id: str = Field(min_length=1)
    field_id: str = Field(min_length=1)
    variable: str = Field(min_length=1)
    value: float
    unit: str = Field(min_length=1, description="No unitless operational values")
    provenance: Provenance
    source_id: str = Field(min_length=1)
    retrieved_at: str = Field(min_length=1)
    quality_flag: QualityFlag = QualityFlag.VALID


def validate_evidence(payload: dict[str, Any]) -> dict[str, Any]:
    """Fail-closed validator: unitless, unknown provenance, or missing keys -> INVALID."""
    errors: list[str] = []
    required = (
        "evidence_id",
        "tenant_id",
        "field_id",
        "variable",
        "value",
        "unit",
        "provenance",
        "source_id",
        "retrieved_at",
    )
    for key in required:
        if key not in payload or payload[key] in (None, ""):
            errors.append(f"missing:{key}")
    unit = str(payload.get("unit", "")).strip()
    if not unit:
        errors.append("unitless")
    prov = str(payload.get("provenance", ""))
    if prov and prov not in {p.value for p in Provenance}:
        errors.append(f"unknown-provenance:{prov}")
    try:
        ref = EvidenceRef(**payload)
    except Exception as exc:  # keep fail-closed with reason
        errs = errors + [str(exc)]
        return {"valid": False, "quality_flag": QualityFlag.INVALID.value, "errors": errs}
    if errors:
        return {"valid": False, "quality_flag": QualityFlag.INVALID.value, "errors": errors}
    return {"valid": True, "quality_flag": ref.quality_flag.value, "errors": []}


def passport_status(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarise known / missing / stale / conflicted for Field Evidence Passport."""
    known = sum(1 for i in items if i.get("quality_flag") == "VALID")
    stale = sum(1 for i in items if i.get("quality_flag") == "STALE")
    conflict = sum(1 for i in items if i.get("quality_flag") == "CONFLICT")
    missing = sum(1 for i in items if i.get("quality_flag") == "MISSING")
    return {
        "known": known,
        "stale": stale,
        "conflicted": conflict,
        "missing": missing,
        "total": len(items),
    }
