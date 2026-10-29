from __future__ import annotations

import math
import random
import uuid
from typing import Any

from . import market
from .store import RecordCache, now_iso

_STORE = RecordCache("contracts.sqlite")
PICKUP = "pickup"
URL = "agriquill://haul"
BASE_FARE_MMK = 5000
PER_KM_MMK = 1200
FARE_STATUS = "Demo rates, not quotes: an invented light-truck tariff until a real haulier quotes"
STEPS = ("requested", "matched", "en-route", "picked-up", "delivered")
DRIVER_NAMES = (
    "Ko Min Thu",
    "U Zaw Lin",
    "Ko Aung Ko",
    "Ko Htet Naing",
    "U Soe Win",
    "Ko Pyae Sone",
)
VEHICLES = ("light truck", "three-wheeler", "light truck")


class NotSelected(Exception):
    pass


def fare_mmk(km: float) -> int:
    return BASE_FARE_MMK + PER_KM_MMK * math.ceil(km)


def _offer(offer_id: str) -> dict[str, Any]:
    hit = _STORE.get(market.OFFER, offer_id)
    if hit is None:
        raise KeyError(f"no offer {offer_id}")
    return hit["payload"]


def route_km(offer: dict[str, Any]) -> float:
    listing = _STORE.get(market.LISTING, offer["listing_id"])["payload"]
    order = market.get_preorder(offer["preorder_id"])
    return market.km_between(listing["lat"], listing["lon"], order["lat"], order["lon"])


def book_pickup(farmer: str, offer_id: str) -> dict[str, Any]:
    offer = _offer(offer_id)
    if offer["farmer"] != farmer:
        raise PermissionError("only the farmer on this offer can book its pickup")
    if offer["status"] != "selected":
        raise NotSelected("a pickup can be booked only after the buyer selects this offer")
    km = round(route_km(offer), 1)
    pick = random.Random(offer_id)
    drivers = [
        {
            "name": name,
            "vehicle": pick.choice(VEHICLES),
            "eta_min": pick.randint(12, 55),
            "rating": round(pick.uniform(4.2, 4.9), 1),
        }
        for name in pick.sample(DRIVER_NAMES, 3)
    ]
    booking = {
        "booking_id": f"hal-{uuid.uuid4().hex[:10]}",
        "offer_id": offer_id,
        "beta": True,
        "km": km,
        "drivers": drivers,
        "steps": list(STEPS),
        "created_at": now_iso(),
        "fare_mmk": fare_mmk(km),
        "fare_status": FARE_STATUS,
    }
    _STORE.update(PICKUP, offer_id, lambda _old: booking, URL)
    return booking


def pickup_for(offer_id: str) -> dict[str, Any] | None:
    hit = _STORE.get(PICKUP, offer_id)
    return hit["payload"] if hit else None


def farmer_view(booking: dict[str, Any] | None) -> dict[str, Any] | None:
    if booking is None:
        return None
    return {k: v for k, v in booking.items() if k not in ("fare_mmk", "fare_status")}
