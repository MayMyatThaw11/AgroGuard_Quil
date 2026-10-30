from __future__ import annotations

from datetime import date
from typing import Any

from . import haul, market, season_match

REACH_KM = 300.0
KINDS = frozenset({"processor", "restaurant", "cooperative"})
NO_REACH_OPTIONS = ("list-anyway", "alert")


def _road_km(lat: float, lon: float, place: dict[str, Any]) -> float:
    return round(market.km_between(lat, lon, place["lat"], place["lon"]) * haul.ROAD_FACTOR, 1)


def processors(
    produce: str, lat: float, lon: float, on: date, today: date | None = None
) -> list[dict[str, Any]]:
    today = today or date.today()
    rows = []
    for p in market.preorders():
        if (
            p["status"] != "open"
            or p["channel"] != "bulk"
            or p["buyer_kind"] not in KINDS
            or p["produce"] != produce
            or date.fromisoformat(p["needed_by"]) < today
        ):
            continue
        km = _road_km(lat, lon, p)
        if km <= REACH_KM:
            rows.append(
                {
                    "source": "preorder",
                    "buyer_kind": p["buyer_kind"],
                    "account_name": p.get("buyer_name"),
                    "town": p["town"],
                    "road_km": km,
                    "wants": {
                        "kg": p["qty_kg"],
                        "grade": None,
                        "months": [date.fromisoformat(p["needed_by"]).month],
                    },
                    "accepts_grade": None,
                }
            )
    for o in season_match._orders():
        left = o["total_kg"] - season_match.reserved_kg(o["id"])
        if (
            o["status"] != "open"
            or o["buyer_kind"] not in KINDS
            or o["produce"] != produce
            or left <= 0
        ):
            continue
        km = _road_km(lat, lon, o)
        if km <= REACH_KM:
            rows.append(
                {
                    "source": "season-order",
                    "order_id": o["id"],
                    "buyer_kind": o["buyer_kind"],
                    "account_name": o.get("buyer_name"),
                    "town": o["town"],
                    "road_km": km,
                    "wants": {"kg": left, "grade": o["grade"], "months": o["delivery_months"]},
                    "accepts_grade": o["grade"] == "any",
                }
            )
    return sorted(rows, key=lambda r: r["road_km"])


def no_reach_options(produce: str) -> list[str]:
    storage = ["storage"] if produce in market.STORABLE else []
    return [*storage, *NO_REACH_OPTIONS]


def surplus(
    produce: str,
    lat: float,
    lon: float,
    on: date,
    today: date | None = None,
    radius_km: float = REACH_KM,
) -> list[dict[str, Any]]:
    towns = {x["town"] for x in market.listings() if x["produce"] == produce}
    rows = []
    for town in towns:
        here = market._balance(town, produce, on)
        if here["level"] not in ("glut", "no-buyers") or not here["centre"]:
            continue
        km = _road_km(lat, lon, {"lat": here["centre"][0], "lon": here["centre"][1]})
        if km <= radius_km:
            rows.append(
                {
                    "town": town,
                    "km": km,
                    "level": here["level"],
                    "supply_kg": here["supply_kg"],
                    "listings": here["listings"],
                }
            )
    return sorted(rows, key=lambda r: r["km"])
