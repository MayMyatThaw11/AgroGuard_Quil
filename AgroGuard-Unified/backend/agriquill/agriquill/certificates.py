from __future__ import annotations

import json
from datetime import date
from typing import Any

from .config import get_settings
from .ledger import get_ledger
from .store import RecordCache, now_iso, sha256

_STORE = RecordCache("contracts.sqlite")

KINDS: dict[str, str] = {
    "organic": "Organic certificate",
    "gap": "Good Agricultural Practice (ASEAN GAP or a national scheme)",
    "export_licence": "Export licence",
    "exporter_registration": "Exporter registration",
    "china_exporter_registration": "China GACC exporter registration",
    "phytosanitary": "Phytosanitary registration",
    "water_test": "Irrigation water test report",
    "soil_test": "Soil test report",
    "other": "Other document",
}
ALERT_DAYS = (60, 14)
# shortcut: one fixed yearly deadline, TO VERIFY against the current GACC notice before use
YEARLY_DEADLINES: dict[str, tuple[int, int, str]] = {
    "china_exporter_registration": (6, 30, "TO VERIFY"),
}


def add(farm_id: str, cert: dict[str, Any], added_by: str) -> dict[str, Any]:
    key = f"{farm_id}|{cert['kind']}|{cert['number']}"
    record = {**cert, "farm_id": farm_id, "added_by": added_by, "added_at": now_iso()}
    digest = sha256(json.dumps(record, sort_keys=True, default=str).encode("utf-8"))
    _STORE.put("certificate", key, record, f"agriquill:certificate/{farm_id}", digest, None)
    get_ledger(get_settings().ledger_path).append(
        "certificate_recorded",
        {"farm_id": farm_id, "kind": cert["kind"], "expires": cert["expires"], "sha256": digest},
    )
    return record


def _due(cert: dict[str, Any], today: date) -> tuple[date, str]:
    expires = date.fromisoformat(cert["expires"])
    yearly = YEARLY_DEADLINES.get(cert["kind"])
    if yearly is None:
        return expires, "expiry"
    month, day, _ = yearly
    deadline = date(today.year, month, day)
    if deadline < today:
        deadline = date(today.year + 1, month, day)
    return (deadline, "renewal deadline") if deadline < expires else (expires, "expiry")


def alert_level(days_left: int) -> str | None:
    if days_left < 0:
        return "expired"
    if days_left <= ALERT_DAYS[1]:
        return "urgent"
    if days_left <= ALERT_DAYS[0]:
        return "due"
    return None


def calendar(farm_id: str, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    rows = [c for c in _STORE.items("certificate") if c.get("farm_id") == farm_id]
    out = []
    for cert in rows:
        due, what = _due(cert, today)
        days_left = (due - today).days
        yearly = YEARLY_DEADLINES.get(cert["kind"])
        out.append(
            {
                **cert,
                "label": KINDS.get(cert["kind"], cert["kind"]),
                "due": due.isoformat(),
                "due_for": what,
                "days_left": days_left,
                "alert": alert_level(days_left),
                "deadline_status": yearly[2] if yearly and what == "renewal deadline" else None,
            }
        )
    out.sort(key=lambda c: c["days_left"])
    return {
        "farm_id": farm_id,
        "today": today.isoformat(),
        "alert_days": list(ALERT_DAYS),
        "certificates": out,
        "alerts": [c for c in out if c["alert"]],
    }
