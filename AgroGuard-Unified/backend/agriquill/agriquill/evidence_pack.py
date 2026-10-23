from __future__ import annotations

import csv
import hashlib
import html
import io
import json
from datetime import date
from typing import Any

from . import certificates, fumigation, live, lots, safety
from .config import get_settings
from .ledger import get_ledger
from .onboard import _INPUTS, _banned_match

GATE_KINDS = (
    "actuation_evaluated",
    "actuation_rate_limited",
    "proposal_approved",
    "proposal_rejected",
)


def _in_season(stamp: str, start: date | None, end: date | None) -> bool:
    day = date.fromisoformat(stamp[:10])
    return (start is None or day >= start) and (end is None or day <= end)


def build(
    farm_id: str, parcel_id: str, start: date | None = None, end: date | None = None
) -> dict[str, Any]:
    """One plot-season pack from the contract and the ledger, with a hash receipt."""
    loaded = live.load(farm_id)
    verdict = loaded[1] if loaded else None
    spec = verdict["contract"] if verdict else None
    if spec is None:
        raise KeyError(farm_id)
    parcel = next((p for p in spec["parcels"] if p["id"] == parcel_id), None)
    if parcel is None:
        raise KeyError(parcel_id)
    standard = safety.resolve_standard(parcel.get("standard"))
    banned = safety.prohibited_for(standard) or ()
    inputs = []
    rows = _INPUTS.items("input", f"{farm_id}|{parcel_id}|")
    for r in sorted(rows, key=lambda r: r["applied_at"]):
        if not _in_season(r["applied_at"], start, end):
            continue
        hit = next((i for i in banned if _banned_match(str(r.get("product", "")), i)), None)
        inputs.append(
            {
                "applied_at": r["applied_at"],
                "product": r.get("product"),
                "kind": r.get("kind"),
                "banned_item": hit,
                "clause": safety.clause_for(standard, hit) if hit else None,
            }
        )
    ledger = get_ledger(get_settings().ledger_path)
    gates = [
        {
            "timestamp": e["timestamp"],
            "kind": e["kind"],
            "status": e["payload"].get("status"),
            "hash": e["hash"],
        }
        for e in ledger.entries()
        if e["kind"] in GATE_KINDS
        and e["payload"].get("farm_id") == farm_id
        and _in_season(e["timestamp"], start, end)
    ]
    sections = {
        "plot": {
            "farm_id": farm_id,
            "parcel": parcel_id,
            "area_ha": parcel.get("area_ha"),
            "area_ha_source": "parcel area declared in the contract (contract_sha256)"
            if parcel.get("area_ha") is not None
            else None,
            "crop": parcel.get("crop"),
            "standard": standard,
            "season": [start.isoformat() if start else None, end.isoformat() if end else None],
            "contract_sha256": f"sha256:{verdict['sha256']}" if verdict else None,
        },
        "conversion": parcel.get("conversion"),
        "inputs": inputs,
        "certificates": certificates.calendar(farm_id, include_voided=True)["certificates"],
        "fumigations": [
            f for f in fumigation.history(farm_id, include_voided=True) if parcel_id in f["parcels"]
        ],
        "lots": [
            lot
            for lot in lots.farm_lots_raw(farm_id, include_voided=True)
            if parcel_id in lot["parcels"]
        ],
        "gate_history": gates,
    }
    body = json.dumps(sections, sort_keys=True, default=str).encode("utf-8")
    return {
        **sections,
        "receipt": {
            "pack_sha256": "sha256:" + hashlib.sha256(body).hexdigest(),
            "ledger_head": ledger.head_hash(),
            "ledger_intact": ledger.verify(),
            "banned_inputs": sum(1 for i in inputs if i["banned_item"]),
            "weather_gates": "not re-checked here; run the input audit for spray-weather gates",
        },
    }


def _rows(pack: dict[str, Any]) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for section, value in pack.items():
        if isinstance(value, list):
            for n, item in enumerate(value):
                for key, v in item.items():
                    rows.append(
                        (
                            f"{section}[{n}]",
                            key,
                            json.dumps(v, default=str) if isinstance(v, dict | list) else str(v),
                        )
                    )
        elif isinstance(value, dict):
            for key, v in value.items():
                rows.append(
                    (
                        section,
                        key,
                        json.dumps(v, default=str) if isinstance(v, dict | list) else str(v),
                    )
                )
        else:
            rows.append((section, "", str(value)))
    return rows


def to_csv(pack: dict[str, Any]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(("section", "field", "value"))
    writer.writerows(_rows(pack))
    return out.getvalue()


def to_html(pack: dict[str, Any]) -> str:
    plot = pack["plot"]
    body = "".join(
        f"<tr><td>{html.escape(s)}</td><td>{html.escape(k)}</td><td>{html.escape(v)}</td></tr>"
        for s, k, v in _rows(pack)
    )
    title = html.escape(f"Evidence pack {plot['farm_id']} / {plot['parcel']}")
    return (
        f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{title}</title>'
        "<style>body{font:14px system-ui;margin:24px;color:#0f1a14}"
        "table{border-collapse:collapse;width:100%}"
        "td,th{border:1px solid #d1dad5;padding:4px 8px;text-align:left;vertical-align:top}"
        "th{background:#ecf4ef}</style></head><body>"
        f"<h1>{title}</h1><p>Pack {html.escape(pack['receipt']['pack_sha256'])}</p>"
        f"<table><tr><th>Section</th><th>Field</th><th>Value</th></tr>{body}</table></body></html>"
    )
