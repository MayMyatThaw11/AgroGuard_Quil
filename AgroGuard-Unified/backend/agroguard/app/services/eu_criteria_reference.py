"""Loads the EU legal-criteria reference dataset
(app/data/export_data/eu_fruit_criteria.csv). This is reference knowledge about what the
law says to check, not a labeled training sample and not evidence of
anything about a specific lot. Every row in the shipped file is currently
`needs_review` or `unavailable` -- no numeric legal threshold here has been
independently verified against the official sources listed in its
source_url, and the readiness evaluator (app/services/eu_export_readiness.py)
must never upgrade a criterion's status based on an unverified row alone.
"""

import csv
from datetime import date
from functools import lru_cache
from pathlib import Path

from app.schemas.eu_export_quality import EUCriterionReference

CRITERIA_PATH = Path(__file__).resolve().parents[1] / "data" / "export_data" / "eu_fruit_criteria.csv"


def _parse_date(value: str) -> date | None:
    return date.fromisoformat(value) if value else None


def _parse_float(value: str) -> float | None:
    return float(value) if value else None


@lru_cache(maxsize=1)
def _load_all() -> list[EUCriterionReference]:
    rows: list[EUCriterionReference] = []
    with open(CRITERIA_PATH, encoding="utf-8-sig", newline="") as f:
        for raw in csv.DictReader(f):
            rows.append(
                EUCriterionReference(
                    criterion_id=raw["criterion_id"],
                    fruit_code=raw["fruit_code"],
                    origin_country=raw["origin_country"],
                    destination_market=raw["destination_market"],
                    member_state=raw["member_state"] or None,
                    product_form=raw["product_form"],
                    cn_code=raw["cn_code"] or None,
                    criterion_type=raw["criterion_type"],
                    analyte_or_metric=raw["analyte_or_metric"],
                    residue_definition=raw["residue_definition"] or None,
                    comparison_operator=raw["comparison_operator"] or None,
                    limit_value=_parse_float(raw["limit_value"]),
                    limit_unit=raw["limit_unit"] or None,
                    required_evidence=raw["required_evidence"],
                    legal_reference=raw["legal_reference"],
                    article_or_annex=raw["article_or_annex"] or None,
                    source_url=raw["source_url"],
                    effective_from=_parse_date(raw["effective_from"]),
                    effective_to=_parse_date(raw["effective_to"]),
                    last_verified_at=_parse_date(raw["last_verified_at"]),
                    verification_status=raw["verification_status"],
                )
            )
    return rows


def get_all_criteria() -> list[EUCriterionReference]:
    return _load_all()


def get_requirements(fruit_code: str, destination_market: str, member_state: str | None) -> list[EUCriterionReference]:
    """Rows applicable to this fruit/destination. A row with no member_state
    recorded applies at the EU-wide level; a row with one set only applies
    when the caller's member_state matches it -- this is never collapsed
    into "applies everywhere" just because a value is missing.
    """
    results = []
    for row in _load_all():
        if row.fruit_code != fruit_code:
            continue
        if row.destination_market != destination_market:
            continue
        if row.member_state is not None and row.member_state != member_state:
            continue
        results.append(row)
    return results
