from __future__ import annotations

from collections.abc import Callable
from typing import Any

from . import live, safety
from .config import get_settings
from .ledger import get_ledger
from .onboard import _banned_match
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
METHODS = ("synthetic_chemical", "controlled_atmosphere", "hermetic", "heat", "other")


def verdict(standard: str | None, product: str, active: str | None, method: str) -> dict[str, Any]:
    """Check one storage treatment against the standard's list, the way inputs are checked."""
    name = safety.resolve_standard(standard)
    if name is None:
        return {"result": "no_standard", "standard": None}
    text = f"{product} {active or ''}"
    banned = next((i for i in safety.prohibited_for(name) or () if _banned_match(text, i)), None)
    if banned is not None:
        return {
            "result": "blocked",
            "standard": name,
            "code": "AGRI-E035",
            "item": banned,
            "clause": safety.clause_for(name, banned),
        }
    if method != "synthetic_chemical":
        return {"result": "no_listed_item", "standard": name}
    row = next(
        (r for r in safety.conditional_for(name) if r["item"] == "synthetic_storage_fumigant"),
        None,
    )
    if row is not None:
        return {
            "result": "conditional",
            "standard": name,
            "clause": row["clause"],
            "condition": row["condition"],
        }
    return {
        "result": "unchecked",
        "standard": name,
        "reason": f"no storage fumigant rule recorded for {name}; check with the certifier",
    }


EDITABLE = ("parcels", "active_ingredient", "method")


def _parcels(farm_id: str) -> dict[str, dict[str, Any]]:
    loaded = live.load(farm_id)
    if loaded is None:
        raise KeyError(farm_id)
    spec = loaded[1]["contract"] or {}
    return {p["id"]: p for p in spec.get("parcels", [])}


def _checked(event: dict[str, Any], known: dict[str, dict[str, Any]]) -> dict[str, Any]:
    unknown = sorted(set(event["parcels"]) - set(known))
    if unknown:
        raise ValueError(f"unknown parcel {unknown[0]}")
    product, active, method = event["product"], event.get("active_ingredient"), event["method"]
    checks = {
        pid: verdict(known[pid].get("standard"), product, active, method)
        for pid in event["parcels"]
    }
    return {
        **event,
        "checks": checks,
        "blocks_organic": sorted(p for p, c in checks.items() if c["result"] == "blocked"),
    }


def _key(farm_id: str, event: dict[str, Any]) -> str:
    return f"{farm_id}|{event['store']}|{event['applied_at']}|{event['product']}"


def _rid(event: dict[str, Any]) -> str:
    return record_id(event["store"], event["applied_at"], event["product"])


def _shown(row: dict[str, Any]) -> dict[str, Any]:
    out = {**row, "id": _rid(row)}
    if row.get("voided_at"):
        out["blocks_organic"] = []
    return out


def record(farm_id: str, event: dict[str, Any], recorded_by: str) -> dict[str, Any]:
    checked = _checked(event, _parcels(farm_id))
    out = {**checked, "farm_id": farm_id, "recorded_by": recorded_by, "recorded_at": now_iso()}
    rid = _rid(event)

    def fresh(old: Any) -> dict[str, Any]:
        if old is not None:
            live_row(old, rid)
        return out

    _, digest = _STORE.update(
        "fumigation", _key(farm_id, event), fresh, f"agriquill:fumigation/{farm_id}"
    )
    get_ledger(get_settings().ledger_path).append(
        "fumigation_recorded",
        {
            "farm_id": farm_id,
            "store": event["store"],
            "product": event["product"],
            "blocks_organic": out["blocks_organic"],
            "sha256": digest,
        },
    )
    return _shown(out)


def history(farm_id: str, include_voided: bool = False) -> list[dict[str, Any]]:
    """A voided treatment stays on record but blocks no plot."""
    rows = [
        _shown(r)
        for r in _STORE.items("fumigation", f"{farm_id}|")
        if r.get("farm_id") == farm_id and (include_voided or not r.get("voided_at"))
    ]
    return sorted(rows, key=lambda r: r["applied_at"], reverse=True)


def _find(farm_id: str, rid: str) -> dict[str, Any]:
    found = next((r for r in history(farm_id, include_voided=True) if r["id"] == rid), None)
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
    known = _parcels(farm_id)

    def fix(old: dict[str, Any]) -> dict[str, Any]:
        return {**old, **_checked({**old, **check({**old, **changes})}, known)}

    return _shown(correct_record(_STORE, "fumigation", key, farm_id, rid, fix, reason, by))


def void(farm_id: str, rid: str, reason: str, by: str) -> dict[str, Any]:
    key = _key(farm_id, _find(farm_id, rid))
    return _shown(void_record(_STORE, "fumigation", key, farm_id, rid, reason, by))
