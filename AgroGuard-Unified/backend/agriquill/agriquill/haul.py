from __future__ import annotations

import math
import random
import uuid
from typing import Any

from . import market
from .data import weather
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
FLEET = (
    ("motorbike trailer", 150, 2000, 500),
    ("three-wheeler", 500, 3000, 800),
    ("light truck", 2000, 5000, 1200),
    ("six-wheel truck", 8000, 15000, 2500),
)
POSTHARVEST_STATUS = "TO VERIFY against local extension guidance before field use"
PERISHABILITY: dict[str, tuple[int | None, str]] = {
    "tomato": (24, "crates-not-sacks"),
    "chili": (48, "shade-and-air"),
    "vegetables": (24, "crates-not-sacks"),
    "fruit": (48, "crates-not-sacks"),
    "potato": (None, "dry-sacks"),
    "onion": (None, "dry-sacks"),
    "pulses": (None, "dry-sacks"),
    "rice": (None, "dry-sacks"),
    "maize": (None, "dry-sacks"),
}
ROAD_FACTOR = 1.3
SPEED_KMH = 30.0
WAIT_H = 2.0
HOT_NOON_C = 32.0
RAIN_DAY_MM = 20.0
EMPTY_RETURN_X = 1.6
SURCHARGE = 1.15
POOL_KM = 5.0
TERRAIN_REASON = {"hill": "hill-road", "flood": "flood-area"}


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


def vehicle_for(kg: float) -> str | None:
    return next((name for name, cap, _, _ in FLEET if kg <= cap), None)


def freshness(produce: str, km: float, speed_kmh: float = SPEED_KMH, wait_h: float = WAIT_H):
    limit = PERISHABILITY.get(produce, (24, "crates-not-sacks"))[0]
    hours = round(km / speed_kmh + wait_h, 1)
    return {"hours": hours, "max_hours": limit, "ok": limit is None or hours <= limit}


def _weather_day(lat: float, lon: float, day: str) -> dict[str, float] | None:
    hourly = weather.fetch_hourly(lat, lon).get("hourly")
    if not hourly:
        return None
    rain = 0.0
    noon = None
    for i, stamp in enumerate(hourly["time"]):
        if stamp[:10] != day:
            continue
        rain += float(hourly["precipitation"][i] or 0)
        if stamp[11:13] == "12" and hourly["temperature_2m"][i] is not None:
            noon = float(hourly["temperature_2m"][i])
    return None if noon is None else {"noon_c": noon, "rain_mm": rain}


def pickup_window(lat: float, lon: float, day: str) -> dict[str, str | None] | None:
    seen = _weather_day(lat, lon, day)
    if seen is None:
        return None
    if seen["rain_mm"] >= RAIN_DAY_MM:
        return {"action": "move-earlier", "before": None}
    if seen["noon_c"] >= HOT_NOON_C:
        return {"action": "pick-early", "before": "09:00"}
    return None


def estimate_km(
    km: float,
    kg: float,
    produce: str,
    seen: dict[str, float] | None,
    terrain: tuple[str, ...] = (),
    widen_km: float = 0.0,
) -> list[dict[str, Any]]:
    near, far = max(km - widen_km, 0.0), km + widen_km
    wet = seen is not None and seen["rain_mm"] >= RAIN_DAY_MM
    ground = [TERRAIN_REASON[t] for t in terrain if t in TERRAIN_REASON]
    reasons = ["empty-return", *(["rain-day"] if wet else []), *ground]
    extra = SURCHARGE ** (int(wet) + int(bool(ground)))
    rows = []
    for name, cap, base, per_km in FLEET:
        trips = max(1, math.ceil(kg / cap))
        low = trips * (base + per_km * math.ceil(near))
        high = trips * (base + per_km * math.ceil(far) * EMPTY_RETURN_X) * extra
        rows.append(
            {
                "vehicle": name,
                "fits": trips == 1,
                "trips": trips,
                "low_mmk": int(low),
                "high_mmk": int(round(high)),
                "low_per_kg": round(low / kg) if kg else 0,
                "high_per_kg": round(high / kg) if kg else 0,
                "reasons": list(reasons),
            }
        )
    return sorted(rows, key=lambda r: (not r["fits"], r["low_mmk"]))


def estimate(
    origin: tuple[float, float],
    dest: tuple[float, float],
    kg: float,
    produce: str,
    day: str,
    terrain: tuple[str, ...] = (),
    widen_km: float = 0.0,
) -> list[dict[str, Any]]:
    km = market.km_between(*origin, *dest) * ROAD_FACTOR
    return estimate_km(km, kg, produce, _weather_day(*origin, day), terrain, widen_km)


def _listing(offer: dict[str, Any]) -> dict[str, Any]:
    return _STORE.get(market.LISTING, offer["listing_id"])["payload"]


def pool(offer_id: str) -> dict[str, Any]:
    anchor = _offer(offer_id)
    mine = _listing(anchor)
    members = []
    for other in market.offers():
        if other["buyer"] != anchor["buyer"] or (
            other["status"] != "selected" and other["id"] != offer_id
        ):
            continue
        there = _listing(other)
        near = market.km_between(mine["lat"], mine["lon"], there["lat"], there["lon"])
        if there["ready_on"] == mine["ready_on"] and near <= POOL_KM:
            members.append(other)
    members.sort(key=lambda o: o["created_at"])
    total = sum(o["qty_kg"] for o in members)
    km = round(route_km(anchor), 1)
    fare = estimate_km(km, total, mine["produce"], None)[0]["low_mmk"]
    shares = {o["id"]: round(fare * o["qty_kg"] / total) for o in members}
    shares[members[-1]["id"]] += fare - sum(shares.values())
    return {
        "members": [o["id"] for o in members],
        "total_kg": total,
        "vehicle": vehicle_for(total),
        "km": km,
        "fare_total": fare,
        "share_mmk": shares,
    }


def _delivery(offer: dict[str, Any]) -> dict[str, Any] | None:
    if offer["status"] != "delivered":
        return None
    return {
        "received_kg": offer["received_kg"],
        "rejected_kg": offer["rejected_kg"],
        "reason": offer.get("reason"),
    }


def trip(farmer: str, offer_id: str) -> dict[str, Any]:
    offer = _offer(offer_id)
    if offer["farmer"] != farmer:
        raise PermissionError("only the farmer on this offer can see its trip plan")
    if offer["status"] not in ("selected", "delivered"):
        raise NotSelected("a trip plan is shown only after the buyer selects this offer")
    mine = _listing(offer)
    order = market.get_preorder(offer["preorder_id"])
    km = round(route_km(offer), 1)
    group = pool(offer_id)
    shared = len(group["members"]) > 1
    return {
        "offer_id": offer_id,
        "qty_kg": offer["qty_kg"],
        "km": km,
        "vehicle": vehicle_for(offer["qty_kg"]),
        "when": pickup_window(mine["lat"], mine["lon"], mine["ready_on"]),
        "freshness": freshness(mine["produce"], km),
        "pack": PERISHABILITY.get(mine["produce"], (24, "crates-not-sacks"))[1],
        "storable": mine["produce"] in market.STORABLE,
        "buyer": {
            "name": order.get("buyer_name"),
            "kind": order["buyer_kind"],
            "town": order["town"],
            "lat": order["lat"],
            "lon": order["lon"],
        },
        "pool": (
            {
                "members": len(group["members"]),
                "total_kg": group["total_kg"],
                "vehicle": group["vehicle"],
            }
            if shared
            else None
        ),
        "delivery": _delivery(offer),
        "status": POSTHARVEST_STATUS,
    }


def confirm_delivery(
    buyer: str, offer_id: str, received_kg: Any, rejected_kg: Any, reason: str | None = None
) -> dict[str, Any]:
    offer = _offer(offer_id)
    if offer["buyer"] != buyer:
        raise PermissionError("only the buyer on this offer can confirm its delivery")
    if offer["status"] != "selected":
        raise NotSelected("a delivery can be confirmed only for a selected offer")
    try:
        got, bad = int(received_kg), int(rejected_kg)
    except (TypeError, ValueError) as exc:
        raise ValueError("received_kg and rejected_kg must be whole numbers") from exc
    if got < 0 or bad < 0 or got + bad > market.MAX_KG:
        raise ValueError("received and rejected kg must be zero or more")

    def close(old: dict[str, Any] | None) -> dict[str, Any]:
        return {
            **(old or offer),
            "status": "delivered",
            "received_kg": got,
            "rejected_kg": bad,
            "reason": (reason or "").strip()[:200] or None,
            "delivered_at": now_iso(),
        }

    record, _ = _STORE.update(market.OFFER, offer_id, close, market.URL)
    _STORE.update(
        market.LISTING,
        offer["listing_id"],
        lambda old: {**old, "outcome": "sold" if got > 0 else "unsold"},
        market.URL,
    )
    return record
