from __future__ import annotations

from collections.abc import Callable
from datetime import date
from typing import Any

from .config import get_settings
from .ledger import get_ledger
from .store import (
    RecordCache,
    correct_record,
    editable,
    live_row,
    now_iso,
    record_id,
    void_record,
)

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


EDITABLE = ("issuer", "country", "issued", "expires")


def _key(farm_id: str, cert: dict[str, Any]) -> str:
    return f"{farm_id}|{cert['kind']}|{cert['number']}"


def _shown(cert: dict[str, Any]) -> dict[str, Any]:
    return {**cert, "id": record_id(cert["kind"], cert["number"])}


def add(farm_id: str, cert: dict[str, Any], added_by: str) -> dict[str, Any]:
    record = {**cert, "farm_id": farm_id, "added_by": added_by, "added_at": now_iso()}
    rid = record_id(cert["kind"], cert["number"])

    def fresh(old: Any) -> dict[str, Any]:
        if old is not None:
            live_row(old, rid)
        return record

    _, digest = _STORE.update(
        "certificate", _key(farm_id, cert), fresh, f"agriquill:certificate/{farm_id}"
    )
    get_ledger(get_settings().ledger_path).append(
        "certificate_recorded",
        {"farm_id": farm_id, "kind": cert["kind"], "expires": cert["expires"], "sha256": digest},
    )
    return _shown(record)


def rows(farm_id: str, include_voided: bool = False) -> list[dict[str, Any]]:
    found = _STORE.items("certificate", f"{farm_id}|")
    return [
        _shown(c)
        for c in found
        if c.get("farm_id") == farm_id and (include_voided or not c.get("voided_at"))
    ]


def _find(farm_id: str, rid: str) -> dict[str, Any]:
    found = next((c for c in rows(farm_id, include_voided=True) if c["id"] == rid), None)
    if found is None:
        raise KeyError(rid)
    return found


def correct(
    farm_id: str,
    rid: str,
    changes: dict[str, Any],
    check: Callable[[dict[str, Any]], dict[str, Any]],
    reason: str,
    by: str,
) -> dict[str, Any]:
    editable(changes, EDITABLE)
    key = _key(farm_id, _find(farm_id, rid))
    row = correct_record(
        _STORE,
        "certificate",
        key,
        farm_id,
        rid,
        lambda old: {**old, **check({**old, **changes})},
        reason,
        by,
    )
    return _shown(row)


def void(farm_id: str, rid: str, reason: str, by: str) -> dict[str, Any]:
    key = _key(farm_id, _find(farm_id, rid))
    return _shown(void_record(_STORE, "certificate", key, farm_id, rid, reason, by))


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


def calendar(
    farm_id: str, today: date | None = None, include_voided: bool = False
) -> dict[str, Any]:
    today = today or date.today()
    out = []
    for cert in rows(farm_id, include_voided):
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
                "alert": None if cert.get("voided_at") else alert_level(days_left),
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
