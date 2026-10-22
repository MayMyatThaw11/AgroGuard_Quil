from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

# W2 items whose code path exists but whose missing input cannot be invented here.
BLOCKED: dict[str, dict[str, str]] = {
    "B-TS-7": {
        "title": "ensemble rain forcing",
        "kind": "licence",
        "needs": "Open-Meteo ensemble licence confirmed for this use",
    },
    "B-OP-3": {
        "title": "robust spray slots from ensemble votes",
        "kind": "licence",
        "needs": "B-TS-7 ensemble members",
    },
    "B-TS-10": {
        "title": "Paw San phenology models",
        "kind": "value",
        "needs": "critical photoperiod per Paw San sub-type from DAR",
    },
    "B-AG-4": {
        "title": "Paw San quality windows",
        "kind": "value",
        "needs": "B-TS-10 stages and DAR thresholds",
    },
    "B-AG-5": {
        "title": "per-variety nitrogen soft cap",
        "kind": "value",
        "needs": "a sourced Paw San nitrogen cap",
    },
    "B-AG-6": {
        "title": "drift check for organic plots",
        "kind": "value",
        "needs": "the certifier's buffer distance",
    },
    "B-AG-7": {
        "title": "leaf-wetness blast model",
        "kind": "value",
        "needs": "the published blast model chosen with an agronomist",
    },
    "B-AG-14": {
        "title": "seed-lot genotype record",
        "kind": "value",
        "needs": "lab BADH2 genotype results per seed lot",
    },
    "B-ML-2": {
        "title": "Myanmar field-photo disease model",
        "kind": "photos",
        "needs": "consented, agronomist-labelled field photos",
    },
    "B-ML-3": {
        "title": "abstain when unsure",
        "kind": "photos",
        "needs": "a held-out labelled photo set to set the cut-off",
    },
    "B-TR-1": {
        "title": "daily external anchor of the ledger head",
        "kind": "dependency",
        "needs": "an approved anchoring service or package",
    },
    "B-TR-2": {
        "title": "per-person Ed25519 approval keys",
        "kind": "dependency",
        "needs": "approval to add the cryptography package",
    },
}

# W3 items: a data contract and a replay harness, waiting for one season of pilot data.
SEASON_DAYS = 90
HARNESSES: dict[str, dict[str, Any]] = {
    "B-TS-8": {
        "title": "partial pooling across a cooperative",
        "fields": ["paddy", "date", "depth_cm", "cooperative"],
    },
    "B-TS-9": {
        "title": "closed-loop calibration",
        "fields": ["paddy", "date", "forecast_cm", "observed_cm"],
    },
    "B-AG-8": {
        "title": "leaf blight storm and stem borer rules",
        "fields": ["paddy", "date", "scout_finding", "rain_mm", "wind_ms"],
    },
    "B-OP-5": {
        "title": "cooperative water sharing",
        "fields": ["paddy", "date", "canal_hours", "pump_hours", "depth_cm"],
    },
    "B-ML-4": {
        "title": "active learning queue",
        "fields": ["photo", "date", "label", "model_confidence"],
    },
    "B-ML-5": {
        "title": "weather- and stage-aware diagnosis",
        "fields": ["photo", "date", "label", "stage", "wet_hours"],
    },
    "B-ML-6": {
        "title": "phone-photo grain check",
        "fields": ["lot", "date", "card_photo", "broken_pct_lab"],
    },
    "B-ML-7": {
        "title": "hybrid keyword and embedding search",
        "fields": ["query", "date", "relevant_note"],
    },
    "B-GIS-6": {"title": "GLO-30 slope tiles", "fields": ["point", "date", "surveyed_slope_pct"]},
    "B-TR-3": {
        "title": "lot passport with offline Merkle check",
        "fields": ["lot", "date", "buyer_scan_ok"],
    },
}


def unavailable(item: str) -> dict[str, Any]:
    entry = BLOCKED[item]
    return {
        "item": item,
        "status": "unavailable",
        "reason": f"unavailable: {entry['needs']}",
        **entry,
    }


def replay(item: str, rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Check rows against the item's data contract; scoring waits for one season of them."""
    spec = HARNESSES[item]
    bad = [n for n, row in enumerate(rows) if any(row.get(f) in (None, "") for f in spec["fields"])]
    days = len({str(row["date"])[:10] for row in rows if row.get("date")})
    status = "ready_to_score" if not bad and days >= SEASON_DAYS else "needs_pilot_data"
    return {
        "item": item,
        "status": status,
        "fields": spec["fields"],
        "rows": len(rows),
        "rejected_rows": bad,
        "days_covered": days,
        "reason": None
        if status == "ready_to_score"
        else f"needs one season ({SEASON_DAYS} days) of pilot data with every contract field",
    }


def roadmap() -> dict[str, Any]:
    return {
        "blocked": [unavailable(k) for k in BLOCKED],
        "harnesses": [{"item": k, **v, "status": "needs_pilot_data"} for k, v in HARNESSES.items()],
    }
