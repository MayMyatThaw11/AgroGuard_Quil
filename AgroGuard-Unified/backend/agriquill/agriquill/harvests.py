from __future__ import annotations

from collections.abc import Callable
from typing import Any

from . import live, lots
from .config import get_settings
from .ledger import get_ledger
from .store import (
    RecordCache,
    RecordConflict,
    correct_record,
    editable,
    now_iso,
    void_record,
)

_STORE = RecordCache("contracts.sqlite")
SOURCE = "harvest"
STANDARD_MOISTURE_PCT = 14.0
STANDARD_SOURCE = (
    "Field to Market, Fieldprint Methods 5.0, Eq. 2 (Ys = Y (100 - M) / (100 - Ms)); "
    "rice standard moisture 14 % (https://methods.fieldtomarket.org/yield.html)"
)
BASIS = (
    "dry = fresh x (100 - M) / 100; at 14 % = fresh x (100 - M) / (100 - 14); "
    "M is the moisture at weighing, wet basis, entered by the farmer"
)
EDITABLE = (
    "method",
    "fresh_kg",
    "moisture_pct",
    "cut_area_m2",
    "transplant_date",
    "variety",
    "plan",
)
AREA_FROM_CONTRACT = "contract area (declared, or measured from the boundary)"
AREA_FROM_CUT = "crop-cut area entered by the farmer"


class HarvestConflict(RecordConflict):
    pass


def _key(farm_id: str, parcel: str, harvested_on: str) -> str:
    return f"{farm_id}|{parcel}|{harvested_on}"


def rid(parcel: str, harvested_on: str) -> str:
    return f"{parcel}~{harvested_on}"


def _spec(farm_id: str, parcel: str) -> tuple[dict[str, Any], dict[str, Any]]:
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        raise KeyError(farm_id)
    found = next((p for p in spec["parcels"] if p["id"] == parcel), None)
    if found is None:
        raise ValueError(f"unknown parcel {parcel}")
    return spec, found


def _area(row: dict[str, Any], parcel: dict[str, Any]) -> tuple[float | None, str, str | None]:
    if row["method"] == "crop_cut":
        if not row.get("cut_area_m2"):
            return None, AREA_FROM_CUT, "a crop cut needs the area that was cut, in m2"
        return row["cut_area_m2"] / 10000, AREA_FROM_CUT, None
    area = parcel.get("area_ha")
    if not area:
        return None, AREA_FROM_CONTRACT, f"parcel {parcel['id']} has no area or boundary"
    return float(area), AREA_FROM_CONTRACT, None


def derive(spec: dict[str, Any], parcel: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    area, area_basis, area_reason = _area(row, parcel)
    moisture = row.get("moisture_pct")
    reason = area_reason or (None if moisture is not None else "moisture at weighing unknown")
    dry = at_standard = None
    if reason is None and area and moisture is not None:
        solid = row["fresh_kg"] * (100 - moisture) / area
        dry = round(solid / 100, 1)
        at_standard = round(solid / (100 - STANDARD_MOISTURE_PCT), 1)
    flags: list[str] = []
    limit = lots.estimate_kg(spec, [parcel["id"]]).get("kg")
    if at_standard is not None and area and limit:
        cap = limit * (1 + lots.MASS_TOLERANCE)
        if at_standard * area > cap:
            flags.append(
                f"{round(at_standard * area)} kg at 14 % is over what {parcel['id']} can give: "
                f"{round(cap)} kg (national 5-year high + {lots.MASS_TOLERANCE:.0%}, TO VERIFY)"
            )
    return {
        **row,
        "yield": {
            "dry_kg_ha": dry,
            "kg_ha_14": at_standard,
            "area_ha": round(area, 4) if area else None,
            "area_basis": area_basis,
            "reason": reason,
            "basis": BASIS,
            "standard_moisture_pct": STANDARD_MOISTURE_PCT,
            "standard_source": STANDARD_SOURCE,
        },
        "flags": flags,
        "id": rid(parcel["id"], str(row["harvested_on"])),
        "provenance": "entered by the farmer; yield computed from it",
        "plan_source": "the season plan the farmer ran in the simulator"
        if row.get("plan")
        else None,
    }


def _save(
    farm_id: str,
    parcel: str,
    harvested_on: str,
    change: Callable[[Any], dict[str, Any]],
    event: str,
    detail: dict[str, Any],
) -> dict[str, Any]:
    row, digest = _STORE.update(
        SOURCE, _key(farm_id, parcel, harvested_on), change, f"agriquill:harvest/{farm_id}"
    )
    get_ledger(get_settings().ledger_path).append(
        event, {"farm_id": farm_id, "parcel": parcel, **detail, "sha256": digest}
    )
    return dict(row)


def record(farm_id: str, harvest: dict[str, Any], by: str) -> dict[str, Any]:
    spec, parcel = _spec(farm_id, harvest["parcel"])
    row = derive(
        spec,
        parcel,
        {**harvest, "farm_id": farm_id, "recorded_by": by, "recorded_at": now_iso()},
    )

    def make(old: Any) -> dict[str, Any]:
        if old is not None and not old.get("voided_at"):
            raise HarvestConflict(
                f"a harvest of {harvest['parcel']} on {harvest['harvested_on']} is already "
                "recorded; correct it, or void it and add it again"
            )
        return row

    return _save(
        farm_id,
        harvest["parcel"],
        harvest["harvested_on"],
        make,
        "harvest_recorded",
        {"harvested_on": harvest["harvested_on"], "fresh_kg": harvest["fresh_kg"]},
    )


def correct(
    farm_id: str,
    record_id: str,
    changes: dict[str, Any],
    check: Callable[[dict[str, Any]], dict[str, Any]],
    reason: str,
    by: str,
) -> dict[str, Any]:
    editable(changes, EDITABLE)
    parcel_id, harvested_on = record_id.split("~", 1)
    spec, parcel = _spec(farm_id, parcel_id)

    def fix(old: dict[str, Any]) -> dict[str, Any]:
        return derive(spec, parcel, {**old, **check({**old, **changes})})

    return correct_record(
        _STORE,
        SOURCE,
        _key(farm_id, parcel_id, harvested_on),
        farm_id,
        record_id,
        fix,
        reason,
        by,
    )


def void(farm_id: str, record_id: str, reason: str, by: str) -> dict[str, Any]:
    parcel_id, harvested_on = record_id.split("~", 1)
    return void_record(
        _STORE, SOURCE, _key(farm_id, parcel_id, harvested_on), farm_id, record_id, reason, by
    )


def farm_harvests(farm_id: str, include_voided: bool = False) -> list[dict[str, Any]]:
    rows = [
        h
        for h in _STORE.items(SOURCE, f"{farm_id}|")
        if h.get("farm_id") == farm_id and (include_voided or not h.get("voided_at"))
    ]
    return sorted(rows, key=lambda h: (h["harvested_on"], h["parcel"]), reverse=True)
