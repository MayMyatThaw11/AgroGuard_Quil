from __future__ import annotations

import calendar
from datetime import date
from typing import Any

from .safety import resolve_standard

RULES: dict[str, dict[str, Any]] = {
    "EU_2018_848": {
        "months": 24,
        "anchor": "sowing",
        "clause": "Regulation (EU) 2018/848 Annex II Part I 1.7.1",
        "source_url": "http://publications.europa.eu/resource/celex/32018R0848",
        "retrieved": "2026-10-22",
        "status": "fetched",
    },
    "USDA_NOP": {
        "months": 36,
        "anchor": "harvest",
        "clause": "7 CFR 205.202(b)",
        "source_url": "https://www.ecfr.gov/current/title-7/section-205.202",
        "retrieved": "2026-10-22",
        "status": "fetched",
    },
    "ASEAN_ORGANIC_ASOA": {
        "months": 12,
        "anchor": "sowing",
        "clause": "ASOA text not fetched",
        "source_url": "",
        "retrieved": "",
        "status": "TO VERIFY",
    },
}


def add_months(day: date, months: int) -> date:
    total = day.month - 1 + months
    year, month = day.year + total // 12, total % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def _iso(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


def check(
    standard: str | None, start: Any, sown: Any = None, harvest: Any = None
) -> dict[str, Any]:
    """Whether a plot may sell its crop as organic under one standard's conversion anchor."""
    name = resolve_standard(standard)
    rule = RULES.get(name or "")
    out: dict[str, Any] = {"standard": name, "qualifies": None, "earliest": None, "reason": None}
    if rule is None:
        out["reason"] = f"no conversion rule recorded for standard {name!r}"
        return out
    out.update({k: rule[k] for k in ("months", "anchor", "clause", "source_url", "status")})
    begun = _iso(start)
    if begun is None:
        out["qualifies"] = False
        out["reason"] = "no conversion start date recorded"
        return out
    earliest = add_months(begun, rule["months"])
    out["earliest"] = earliest.isoformat()
    anchor = _iso(sown if rule["anchor"] == "sowing" else harvest)
    if anchor is None:
        out["reason"] = f"{rule['anchor']} date missing, so the {rule['clause']} anchor is unknown"
        return out
    out["qualifies"] = anchor >= earliest
    if not out["qualifies"]:
        out["reason"] = (
            f"{rule['anchor']} on {anchor.isoformat()} is before {earliest.isoformat()}, "
            f"{rule['months']} months after conversion began"
        )
    return out
