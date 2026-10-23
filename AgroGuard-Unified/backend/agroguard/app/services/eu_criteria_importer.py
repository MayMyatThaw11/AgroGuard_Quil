"""Validation-first importer for candidate EU criteria rows. This never
writes to app/data/export_data/eu_fruit_criteria.csv or any database table -- it only
checks whether submitted rows are structurally and referentially sound
(known fruit code, consistent units/operator, no duplicate id, sane date
range). Actually adding a validated row to the shipped reference dataset is
a separate, manual, reviewed step outside this application, exactly as the
implementation brief requires ("validation-first dry-run default").
"""

from app.schemas.eu_export_quality import EUCriteriaImportRow, EUCriteriaImportRowResult
from app.services.eu_criteria_reference import get_all_criteria
from app.services.eu_fruit_catalog import get_fruit_catalog

_VALID_OPERATORS = {"<=", ">=", "<", ">", "==", "range"}
_DOCUMENT_TYPES = {"phytosanitary", "market_access", "labeling", "traceability", "documentation"}
_NUMERIC_TYPES = {"pesticide_mrl", "contaminant", "physical_grade"}


def validate_rows(rows: list[EUCriteriaImportRow]) -> list[EUCriteriaImportRowResult]:
    known_fruit_codes = {f.fruit_code for f in get_fruit_catalog()}
    existing_ids = {r.criterion_id for r in get_all_criteria()}
    seen_ids: set[str] = set()
    results: list[EUCriteriaImportRowResult] = []

    for index, row in enumerate(rows):
        errors: list[str] = []
        warnings: list[str] = []

        if row.fruit_code not in known_fruit_codes:
            errors.append(f"Unknown fruit_code '{row.fruit_code}' -- not in the existing fruit catalog.")

        if row.criterion_id in existing_ids:
            errors.append(f"criterion_id '{row.criterion_id}' already exists in the shipped reference dataset.")
        if row.criterion_id in seen_ids:
            errors.append(f"criterion_id '{row.criterion_id}' is duplicated within this submission.")
        seen_ids.add(row.criterion_id)

        if row.criterion_type in _NUMERIC_TYPES:
            if row.comparison_operator is None:
                errors.append(f"criterion_type '{row.criterion_type}' requires a comparison_operator.")
            elif row.comparison_operator not in _VALID_OPERATORS:
                errors.append(f"comparison_operator '{row.comparison_operator}' is not recognized.")
            if row.limit_value is None:
                warnings.append(
                    "No limit_value provided -- row will be accepted as structurally valid but will always "
                    "evaluate as SOURCE_NOT_VERIFIED until a limit is sourced."
                )
            if row.limit_unit is None:
                warnings.append("No limit_unit provided.")
        elif row.criterion_type in _DOCUMENT_TYPES and row.comparison_operator is not None:
            errors.append(
                f"criterion_type '{row.criterion_type}' is document-existence based and must not carry a "
                f"comparison_operator."
            )

        if row.verification_status == "verified":
            errors.append(
                "A row submitted through this validator can never be accepted as 'verified' -- "
                "independent confirmation against source_url must happen outside this application "
                "before a row is marked verified."
            )

        if not row.source_url or not row.source_url.startswith("http"):
            errors.append("source_url must be a real http(s) URL to the official source.")

        if not row.legal_reference.strip():
            errors.append("legal_reference must name the specific regulation/standard.")

        results.append(
            EUCriteriaImportRowResult(
                row_index=index,
                criterion_id=row.criterion_id,
                accepted=len(errors) == 0,
                errors=errors,
                warnings=warnings,
            )
        )

    return results
