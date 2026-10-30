from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from . import cropvalue, live, market, season_match
from .data import ecocrop
from .store import missing

market_open = market.market_open

GAP_RATIO = 0.5
ECOCROP_NAME = {
    "tomato": "Solanum lycopersicum",
    "onion": "Allium cepa",
    "chili": "Capsicum annuum",
    "potato": "Solanum tuberosum",
    "maize": "Zea mays",
    "rice": "Oryza sativa",
    "pulses": "Vigna radiata",
}
FIT = ("suitable", "conditional")


def _contract_parcel(producer: dict[str, Any]) -> dict[str, Any] | None:
    farm_id = producer.get("contract_id")
    loaded = live.load(farm_id) if farm_id else None
    if loaded is None or not loaded[1].get("contract"):
        return None
    spec = loaded[1]["contract"]
    parcel = next((p for p in spec.get("parcels", []) if p.get("planted")), None)
    return None if parcel is None else {"spec": spec, "parcel": parcel}


def ready_on(producer: dict[str, Any], produce: str, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    linked = _contract_parcel(producer)
    if linked:
        days = live._season_days(linked["parcel"].get("crop_id"))
        if days:
            planted = date.fromisoformat(str(linked["parcel"]["planted"]))
            return {"date": (planted + timedelta(days=days)).isoformat(), "source": "season-plan"}
    crop = next((c for c in producer["crops"] if c["produce"] == produce), None)
    if crop is None:
        return missing("ready_on", f"this profile does not grow {produce}")
    month = crop["harvest_month"]
    year = today.year + (1 if date(today.year, month, 15) < today else 0)
    return {"date": date(year, month, 15).isoformat(), "source": "profile-month"}


def expected_kg(producer: dict[str, Any], produce: str) -> dict[str, Any]:
    linked = _contract_parcel(producer)
    if linked:
        parcels = cropvalue.harvest_reference(linked["spec"])["parcels"]
        row = next((p for p in parcels if p["parcel"] == linked["parcel"]["id"]), None)
        if row and row.get("tonnes"):
            low, high = row["tonnes"]
            return {"kg": int((low + high) / 2 * 1000), "source": "national-range"}
    crop = next((c for c in producer["crops"] if c["produce"] == produce), None)
    if crop is None:
        return missing("expected_kg", f"this profile does not grow {produce}")
    from . import baseline, producers

    area = crop["area_ha"] or producers.total_area(producer) / len(producer["crops"])
    official = "kg_ha" in baseline.official_yield(baseline.DEFAULT_COUNTRY, produce)
    return {
        "kg": int(area * market.yield_kg_ha(produce)),
        "source": "fao-official" if official else "typical-yield",
    }


def gap(qty_kg: int, expected: int | None) -> dict[str, int] | None:
    if not expected or GAP_RATIO * expected <= qty_kg <= (1 + GAP_RATIO) * expected:
        return None
    return {"expected_kg": expected}


def grade_route(severity: str | None) -> dict[str, Any]:
    high = (severity or "").lower() == "high"
    return {
        "grade_risk": severity.lower() if severity else None,
        "channel_hint": "processor" if high else None,
        "advice": "processor-for-grade" if high else None,
    }


def what_to_plant(
    site: dict[str, Any], month: int, town: str, today: date | None = None
) -> list[dict[str, Any]]:
    today = today or date.today()
    on = date(today.year + (1 if month < today.month else 0), month, 15)
    rows = []
    for produce, name in ECOCROP_NAME.items():
        crop = ecocrop.get(name)
        fit = ecocrop.screen(crop, site)["verdict"] if crop else None
        if fit not in FIT:
            continue
        wanted = sum(
            o["total_kg"] - season_match.reserved_kg(o["id"])
            for o in season_match._orders()
            if o["produce"] == produce and month in o["delivery_months"] and o["status"] == "open"
        )
        if wanted <= 0 or market._balance(town, produce, on)["level"] == "glut":
            continue
        rows.append({"produce": produce, "agronomy_fit": fit, "demand_kg": wanted, "share": "part"})
    return sorted(rows, key=lambda r: -r["demand_kg"])
