from __future__ import annotations

import json
from typing import Any

from . import live, safety
from .config import get_settings
from .ledger import get_ledger
from .onboard import _banned_match
from .store import RecordCache, now_iso, sha256

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


def record(farm_id: str, event: dict[str, Any], recorded_by: str) -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None:
        raise KeyError(farm_id)
    spec = loaded[1]["contract"] or {}
    known = {p["id"]: p for p in spec.get("parcels", [])}
    unknown = sorted(set(event["parcels"]) - set(known))
    if unknown:
        raise ValueError(f"unknown parcel {unknown[0]}")
    product, active, method = event["product"], event.get("active_ingredient"), event["method"]
    checks = {
        pid: verdict(known[pid].get("standard"), product, active, method)
        for pid in event["parcels"]
    }
    out = {
        **event,
        "farm_id": farm_id,
        "recorded_by": recorded_by,
        "recorded_at": now_iso(),
        "checks": checks,
        "blocks_organic": sorted(p for p, c in checks.items() if c["result"] == "blocked"),
    }
    key = f"{farm_id}|{event['store']}|{event['applied_at']}|{event['product']}"
    digest = sha256(json.dumps(out, sort_keys=True).encode("utf-8"))
    _STORE.put("fumigation", key, out, f"agriquill:fumigation/{farm_id}", digest, None)
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
    return out


def history(farm_id: str) -> list[dict[str, Any]]:
    rows = [r for r in _STORE.items("fumigation") if r.get("farm_id") == farm_id]
    return sorted(rows, key=lambda r: r["applied_at"], reverse=True)
