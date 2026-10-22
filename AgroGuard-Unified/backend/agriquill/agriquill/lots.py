from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from . import cropvalue, live
from .config import get_settings
from .ledger import get_ledger
from .store import RecordCache, now_iso, sha256

_STORE = RecordCache("contracts.sqlite")
STORE_MAX_MOISTURE_PCT = 14.0  # dry-to target, BUILD_PLAN B-AG-15
MASS_TOLERANCE = 0.10  # TO VERIFY with the ICS
PAW_SAN_HIGH_T_HA = 3.37  # BUILD_PLAN B-TR-5 farm range 2.6-3.37 t/ha, TO VERIFY


class LotConflict(ValueError):
    pass


def _key(farm_id: str, lot_id: str) -> str:
    return f"{farm_id}|{lot_id}"


def _save(farm_id: str, lot: dict[str, Any], event: str, detail: Mapping[str, Any]) -> None:
    digest = sha256(json.dumps(lot, sort_keys=True).encode("utf-8"))
    _STORE.put("lot", _key(farm_id, lot["id"]), lot, f"agriquill:lot/{farm_id}", digest, None)
    get_ledger(get_settings().ledger_path).append(
        event, {"farm_id": farm_id, "lot": lot["id"], **detail, "sha256": digest}
    )


def get(farm_id: str, lot_id: str) -> dict[str, Any] | None:
    found = _STORE.get("lot", _key(farm_id, lot_id))
    return found["payload"] if found else None


def estimate_kg(spec: dict[str, Any], parcel_ids: list[str]) -> dict[str, Any]:
    """Upper harvest estimate: Paw San range where it applies, else the national 5-year high."""
    reference = {p["parcel"]: p for p in cropvalue.harvest_reference(spec)["parcels"]}
    total, basis = 0.0, []
    for p in spec["parcels"]:
        if p["id"] not in parcel_ids:
            continue
        area = p.get("area_ha")
        if area and "paw san" in str(p.get("crop") or "").lower():
            total += area * PAW_SAN_HIGH_T_HA * 1000
            basis.append(f"{p['id']}: Paw San {PAW_SAN_HIGH_T_HA} t/ha, TO VERIFY")
            continue
        tonnes = (reference.get(p["id"]) or {}).get("tonnes")
        if not tonnes:
            return {"kg": None, "reason": f"no yield estimate for {p['id']}"}
        total += tonnes[1] * 1000
        basis.append(f"{p['id']}: FAOSTAT national 5-year high")
    return {"kg": round(total), "basis": basis}


def record(farm_id: str, lot: dict[str, Any], by: str) -> dict[str, Any]:
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        raise KeyError(farm_id)
    unknown = sorted(set(lot["parcels"]) - {p["id"] for p in spec["parcels"]})
    if unknown:
        raise ValueError(f"unknown parcel {unknown[0]}")
    old = get(farm_id, lot["id"])
    if (
        old
        and old.get("certifier")
        and lot.get("certifier")
        and old["certifier"] != lot["certifier"]
    ):
        raise LotConflict(
            f"lot {lot['id']} is already certified by {old['certifier']}; one lot has one "
            "certification body"
        )
    estimate = estimate_kg(spec, lot["parcels"])
    limit = estimate["kg"] * (1 + MASS_TOLERANCE) if estimate["kg"] else None
    out = {
        **(old or {"moisture": [], "mill": None}),
        **lot,
        "certifier": lot.get("certifier") or (old or {}).get("certifier"),
        "farm_id": farm_id,
        "recorded_by": by,
        "recorded_at": now_iso(),
        "estimate": {
            **estimate,
            "tolerance": MASS_TOLERANCE,
            "limit_kg": round(limit) if limit else None,
        },
    }
    _save(farm_id, out, "harvest", {"parcels": lot["parcels"], "mass_kg": lot["mass_kg"]})
    return with_flags(out)


def add_moisture(farm_id: str, lot_id: str, reading: dict[str, Any], by: str) -> dict[str, Any]:
    lot = get(farm_id, lot_id)
    if lot is None:
        raise KeyError(lot_id)
    lot["moisture"] = sorted(
        [*lot["moisture"], {**reading, "by": by}], key=lambda r: r["measured_at"]
    )
    _save(farm_id, lot, "lot_moisture", {"moisture_pct": reading["moisture_pct"]})
    return with_flags(lot)


def add_mill(farm_id: str, lot_id: str, intake: dict[str, Any], by: str) -> dict[str, Any]:
    lot = get(farm_id, lot_id)
    if lot is None:
        raise KeyError(lot_id)
    lot["mill"] = {**intake, "by": by}
    _save(farm_id, lot, "mill_intake", {"broken_pct": intake["broken_pct"]})
    return with_flags(lot)


def with_flags(lot: dict[str, Any]) -> dict[str, Any]:
    flags = []
    limit = (lot.get("estimate") or {}).get("limit_kg")
    if limit and lot["mass_kg"] > limit:
        flags.append(f"heavier than its plots can give: {lot['mass_kg']} kg over {limit} kg")
    last = lot["moisture"][-1] if lot["moisture"] else None
    if last and last.get("storage") and last["moisture_pct"] > STORE_MAX_MOISTURE_PCT:
        flags.append(
            f"stored at {last['moisture_pct']} % moisture, above {STORE_MAX_MOISTURE_PCT:g} %"
        )
    mill = lot.get("mill")
    if mill:
        cap = mill.get("buyer_max_broken_pct")
        if cap is not None and mill["broken_pct"] > cap:
            flags.append(f"broken {mill['broken_pct']} % is over the buyer's {cap} %")
        top = mill.get("buyer_max_moisture_pct")
        if top is not None and mill.get("moisture_pct") is not None and mill["moisture_pct"] > top:
            flags.append(f"moisture {mill['moisture_pct']} % is over the buyer's {top} %")
    return {**lot, "flags": flags, "moisture_now": last["moisture_pct"] if last else None}


def drying_order(
    lots: list[dict[str, Any]], rain_mm_48h: Mapping[str, float]
) -> list[dict[str, Any]]:
    """Greedy: the wettest lot goes first; the rain its farm faces breaks ties."""
    wet = [
        lot
        for lot in lots
        if lot.get("moisture_now") is not None and lot["moisture_now"] > STORE_MAX_MOISTURE_PCT
    ]
    ranked = sorted(
        wet, key=lambda lot: (-lot["moisture_now"], -rain_mm_48h.get(lot["farm_id"], 0.0))
    )
    return [
        {
            "lot": lot["id"],
            "moisture_pct": lot["moisture_now"],
            "rain_mm_48h": rain_mm_48h.get(lot["farm_id"]),
        }
        for lot in ranked
    ]


def farm_lots_raw(farm_id: str) -> list[dict[str, Any]]:
    return [with_flags(lot) for lot in _STORE.items("lot") if lot.get("farm_id") == farm_id]


def farm_lots(farm_id: str) -> dict[str, Any]:
    rows = farm_lots_raw(farm_id)
    rain: dict[str, float] = {}
    try:
        days = live.build_live(farm_id).get("weather", {}).get("days") or []
        rain[farm_id] = round(sum(d["rain_mm"] for d in days[:2]), 1)
    except (KeyError, ValueError, live.ContractRejected):
        pass
    return {
        "farm_id": farm_id,
        "lots": sorted(rows, key=lambda lot: lot["harvested_on"], reverse=True),
        "drying_order": drying_order(rows, rain),
        "store_max_moisture_pct": STORE_MAX_MOISTURE_PCT,
    }
