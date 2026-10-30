from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from . import haul, market, season_match
from .data import prices
from .store import RecordCache, now_iso

_STORE = RecordCache("contracts.sqlite")
SAVED = "saved_search"
URL = "agriquill://supply"
DEFAULT_RADIUS_KM = 50.0
MAX_RADIUS_KM = 500.0
OVER_BUDGET = 1.1
ROUNDED_POINT_KM = 1.0
BAND_RANK = {"within": 0, None: 0, "slightly-over": 1}


def _price(listing: dict[str, Any], reference: float | None) -> tuple[float | None, str | None]:
    if listing.get("ask_mmk_kg"):
        return listing["ask_mmk_kg"], "ask"
    return (reference, "reference") if reference else (None, None)


def _band(landed_low: float | None, budget: float | None) -> str | None:
    if landed_low is None or not budget:
        return None
    if landed_low <= budget:
        return "within"
    return "slightly-over" if landed_low <= budget * OVER_BUDGET else "over"


def _row(
    listing: dict[str, Any],
    km: float,
    reference: float | None,
    kg: int | None,
    budget: float | None,
) -> dict[str, Any] | None:
    qty = listing["counted_kg"]
    price, basis = _price(listing, reference)
    options = haul.estimate_km(
        km * haul.ROAD_FACTOR,
        min(kg or qty, qty),
        listing["produce"],
        None,
        widen_km=ROUNDED_POINT_KM,
    )
    best = options[0]
    low = None if price is None else round(price + best["low_per_kg"])
    high = None if price is None else round(price + best["high_per_kg"])
    band = _band(low, budget)
    if band == "over":
        return None
    pid = listing.get("producer_id")
    return {
        "id": listing["id"],
        "farm": listing.get("farmer_name"),
        "town": listing["town"],
        "qty_kg": qty,
        "ready_on": listing["ready_on"],
        "km": round(km, 1),
        "ask_mmk_kg": listing.get("ask_mmk_kg"),
        "price_basis": basis,
        "landed_low": low,
        "landed_high": high,
        "band": band,
        "reliability": season_match.farmer_reliability(pid) if pid else None,
    }


def _order(row: dict[str, Any]) -> tuple[int, float, float]:
    low = row["landed_low"]
    return BAND_RANK[row["band"]], float("inf") if low is None else low, row["km"]


def supply(
    produce: str,
    lat: float,
    lon: float,
    radius_km: float = DEFAULT_RADIUS_KM,
    kg: int | None = None,
    budget_mmk_kg: float | None = None,
    by_date: date | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    if produce not in market.PRODUCE:
        raise ValueError(f"produce must be one of {', '.join(sorted(market.PRODUCE))}")
    reference = prices.trend(produce, lat, lon).get("latest_mmk_kg")
    towns: dict[str, list[dict[str, Any]]] = {}
    for listing in market.listings():
        if listing["produce"] != produce or not listing.get("visible_to_buyers", True):
            continue
        if by_date and listing["ready_on"] > by_date.isoformat():
            continue
        km = market.km_between(lat, lon, listing["lat"], listing["lon"])
        if km > radius_km:
            continue
        row = _row(listing, km, reference, kg, budget_mmk_kg)
        if row:
            towns.setdefault(listing["town"], []).append(row)
    groups = []
    for town, found in towns.items():
        found.sort(key=_order)
        groups.append(
            {
                "town": town,
                "km": min(r["km"] for r in found),
                "kg_ready": sum(r["qty_kg"] for r in found),
                "listings": found,
            }
        )
    groups.sort(key=lambda g: _order(g["listings"][0]))
    return {
        "groups": groups,
        "radius_km": radius_km,
        "reference_price": {"mmk_kg": reference, "label": "reference"} if reference else None,
    }


def save_search(buyer: str, body: dict[str, Any]) -> dict[str, Any]:
    produce = str(body.get("produce") or "").strip().lower()
    if produce not in market.PRODUCE:
        raise ValueError(f"produce must be one of {', '.join(sorted(market.PRODUCE))}")
    radius = float(body.get("radius_km") or DEFAULT_RADIUS_KM)
    if not 0 < radius <= MAX_RADIUS_KM:
        raise ValueError(f"radius_km must be between 0 and {MAX_RADIUS_KM:.0f}")
    budget = body.get("budget_mmk_kg")
    record = {
        "id": f"srch-{uuid.uuid4().hex[:12]}",
        "buyer": buyer,
        "produce": produce,
        "lat": float(body["lat"]),
        "lon": float(body["lon"]),
        "radius_km": radius,
        "kg": int(body["kg"]) if body.get("kg") else None,
        "budget_mmk_kg": float(budget) if budget else None,
        "by_in_days": int(body.get("by_in_days") or 30),
        "created_at": now_iso(),
    }
    return market._save(SAVED, record)


def searches(buyer: str) -> list[dict[str, Any]]:
    return [s for s in _STORE.items(SAVED) if s["buyer"] == buyer]
