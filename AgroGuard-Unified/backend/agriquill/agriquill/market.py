from __future__ import annotations

import math
import time
import uuid
from datetime import date, timedelta
from typing import Any

from . import baseline
from .data import prices
from .store import RecordCache, connect, now_iso

_STORE = RecordCache("contracts.sqlite")
URL = "agriquill://market"
LISTING, PREORDER, OFFER, BUYER = "listing", "preorder", "offer", "buyer"

PRODUCE: dict[str, str] = {
    "rice": "rice",
    "maize": "maize",
    "pulses": "veg",
    "onion": "veg",
    "tomato": "veg",
    "chili": "veg",
    "potato": "veg",
    "vegetables": "veg",
    "fruit": "fruit",
}
YIELD_T_HA: dict[str, float] = {
    "rice": 4.0,
    "maize": 4.0,
    "pulses": 1.2,
    "onion": 15.0,
    "tomato": 25.0,
    "chili": 1.5,
    "potato": 15.0,
    "vegetables": 15.0,
    "fruit": 10.0,
}
YIELD_STATUS = (
    "TO VERIFY: typical yields used only to cap a listing, replaced by FAO official yields"
)
STORABLE = frozenset({"rice", "maize", "pulses", "onion", "potato"})
BULK_KINDS = frozenset({"cooperative", "processor", "restaurant", "factory", "msme"})
DIRECT_KINDS = frozenset({"household", "retail"})
WINDOW_DAYS = 14
NEARBY_KM = 60.0
LISTING_CAP_FACTOR = 1.5
UNVERIFIED_WEIGHT = 0.5
SHORT_BELOW, GLUT_ABOVE = 0.8, 1.25
PLANTING_AHEAD_DAYS = 45
PRICE_FELL_PCT = -10.0
CACHE_TTL_S = 60.0
MAX_KG = 1_000_000
_OUTLOOKS: dict[str, tuple[float, dict[str, Any]]] = {}


def clear_cache() -> None:
    _OUTLOOKS.clear()


def _purge(town: str, produce: str) -> None:
    for key in [k for k in _OUTLOOKS if k.startswith(f"{town.lower()}|{produce}|")]:
        _OUTLOOKS.pop(key, None)


def _day(value: Any, field: str) -> date:
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise ValueError(f"{field} must be a date (YYYY-MM-DD)") from exc


def _place(body: dict[str, Any]) -> tuple[str, float, float]:
    town = str(body.get("town") or "").strip()
    if not town or len(town) > 80:
        raise ValueError("town is required (up to 80 characters)")
    try:
        lat, lon = float(body["lat"]), float(body["lon"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("lat and lon are required numbers") from exc
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("lat or lon is out of range")
    return town, lat, lon


def _produce(body: dict[str, Any]) -> str:
    produce = str(body.get("produce") or "").strip().lower()
    if produce not in PRODUCE:
        raise ValueError(f"produce must be one of {', '.join(sorted(PRODUCE))}")
    return produce


def _kg(body: dict[str, Any]) -> int:
    try:
        kg = int(body.get("qty_kg"))
    except (TypeError, ValueError) as exc:
        raise ValueError("qty_kg must be a whole number of kg") from exc
    if not 0 < kg <= MAX_KG:
        raise ValueError(f"qty_kg must be between 1 and {MAX_KG:,}")
    return kg


def _save(source: str, record: dict[str, Any]) -> dict[str, Any]:
    _STORE.update(source, record["id"], lambda _old: record, URL)
    return record


def km_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def yield_kg_ha(produce: str) -> float:
    official = baseline.official_yield(baseline.DEFAULT_COUNTRY, produce)
    return official.get("kg_ha") or YIELD_T_HA[produce] * 1000


def counted_kg(produce: str, qty_kg: int, area_ha: float | None) -> int:
    if area_ha is None or area_ha <= 0:
        return qty_kg
    cap = int(area_ha * yield_kg_ha(produce) * LISTING_CAP_FACTOR)
    return min(qty_kg, cap)


def _contributions(raw: Any, kg: int) -> list[dict[str, Any]]:
    if not raw:
        return []
    rows = [
        {"member": str(r.get("member") or "").strip()[:80], "qty_kg": int(r.get("qty_kg") or 0)}
        for r in raw
    ]
    if (
        any(not r["member"] or r["qty_kg"] <= 0 for r in rows)
        or sum(r["qty_kg"] for r in rows) != kg
    ):
        raise ValueError("member amounts must be positive and add up to the listed kg")
    return rows


def post_listing(farmer: str, body: dict[str, Any]) -> dict[str, Any]:
    produce, kg = _produce(body), _kg(body)
    town, lat, lon = _place(body)
    producer_id = body.get("producer_id")
    if producer_id:
        from . import producers

        producers.require_act(farmer, str(producer_id))
    contributions = _contributions(body.get("contributions"), kg)
    area = body.get("area_ha")
    area_ha = float(area) if area not in (None, "") else None
    ask = body.get("ask_mmk_kg")
    record = {
        "id": f"lst-{uuid.uuid4().hex[:12]}",
        "farmer": farmer,
        "farmer_name": body.get("farmer_name"),
        "producer_id": producer_id,
        "contributions": contributions,
        "produce": produce,
        "qty_kg": kg,
        "counted_kg": counted_kg(produce, kg, area_ha),
        "area_ha": area_ha,
        "ready_on": _day(body.get("ready_on"), "ready_on").isoformat(),
        "town": town,
        "lat": lat,
        "lon": lon,
        "ask_mmk_kg": int(ask) if ask not in (None, "") else None,
        "visible_to_buyers": bool(body.get("visible_to_buyers", True)),
        "outcome": None,
        "demo": bool(body.get("demo", False)),
        "created_at": now_iso(),
    }
    _purge(town, produce)
    saved = _save(LISTING, record)
    if producer_id:
        from . import producers

        producers.log_listing(str(producer_id), farmer, saved["id"])
    return saved


def channel_for(buyer_kind: str) -> str:
    if buyer_kind in BULK_KINDS:
        return "bulk"
    if buyer_kind in DIRECT_KINDS:
        return "direct"
    raise ValueError(f"buyer_kind must be one of {', '.join(sorted(BULK_KINDS | DIRECT_KINDS))}")


def post_preorder(buyer: str, buyer_kind: str, body: dict[str, Any]) -> dict[str, Any]:
    produce, kg = _produce(body), _kg(body)
    town, lat, lon = _place(body)
    offer = body.get("price_offer_mmk_kg")
    record = {
        "id": f"pre-{uuid.uuid4().hex[:12]}",
        "buyer": buyer,
        "buyer_name": body.get("buyer_name"),
        "buyer_kind": buyer_kind,
        "channel": channel_for(buyer_kind),
        "produce": produce,
        "qty_kg": kg,
        "needed_by": _day(body.get("needed_by"), "needed_by").isoformat(),
        "town": town,
        "lat": lat,
        "lon": lon,
        "price_offer_mmk_kg": int(offer) if offer not in (None, "") else None,
        "target_listing_ids": list(body.get("target_listing_ids") or []),
        "status": "open",
        "demo": bool(body.get("demo", False)),
        "created_at": now_iso(),
    }
    _purge(town, produce)
    return _save(PREORDER, record)


def mark_buyer_verified(buyer: str) -> None:
    _STORE.update(BUYER, buyer, lambda old: {**(old or {}), "buyer": buyer, "verified": True}, URL)


def buyer_verified(buyer: str) -> bool:
    record = _STORE.get(BUYER, buyer)
    return bool(record and record["payload"].get("verified"))


def listings() -> list[dict[str, Any]]:
    return _STORE.items(LISTING)


def preorders() -> list[dict[str, Any]]:
    return _STORE.items(PREORDER)


def offers() -> list[dict[str, Any]]:
    return _STORE.items(OFFER)


def get_preorder(preorder_id: str) -> dict[str, Any]:
    hit = _STORE.get(PREORDER, preorder_id)
    if hit is None:
        raise KeyError(f"no pre-order {preorder_id}")
    return hit["payload"]


def list_preorders(
    town: str | None = None,
    produce: str | None = None,
    channel: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
) -> list[dict[str, Any]]:
    rows = [
        p
        for p in preorders()
        if p["status"] == "open"
        and (town is None or p["town"].lower() == town.lower())
        and (produce is None or p["produce"] == produce)
        and (channel is None or p["channel"] == channel)
    ]
    rows.sort(key=lambda p: p["created_at"], reverse=True)
    out = []
    for p in rows[:50]:
        item = {k: v for k, v in p.items() if k not in ("lat", "lon")}
        if lat is not None and lon is not None:
            item["km"] = round(km_between(lat, lon, p["lat"], p["lon"]), 1)
        out.append(item)
    return out


def apply(farmer: str, preorder_id: str, body: dict[str, Any]) -> dict[str, Any]:
    order = get_preorder(preorder_id)
    if order["status"] != "open":
        raise ValueError("this pre-order is no longer open")
    hit = _STORE.get(LISTING, str(body.get("listing_id") or ""))
    if hit is None or hit["payload"]["farmer"] != farmer:
        raise PermissionError("that listing is not yours")
    kg = _kg(body)
    record = {
        "id": f"off-{uuid.uuid4().hex[:12]}",
        "preorder_id": preorder_id,
        "listing_id": hit["payload"]["id"],
        "farmer": farmer,
        "buyer": order["buyer"],
        "qty_kg": kg,
        "status": "candidate",
        "created_at": now_iso(),
    }
    return _save(OFFER, record)


def select(buyer: str, preorder_id: str, offer_id: str) -> dict[str, Any]:
    order = get_preorder(preorder_id)
    if order["buyer"] != buyer:
        raise PermissionError("only the buyer who posted this pre-order can select")

    def choose(old: dict[str, Any] | None) -> dict[str, Any]:
        if old is None or old["preorder_id"] != preorder_id:
            raise KeyError(f"no offer {offer_id} on this pre-order")
        return {**old, "status": "selected", "selected_at": now_iso()}

    record, _ = _STORE.update(OFFER, offer_id, choose, URL)
    return record


def _in_window(day: str, on: date) -> bool:
    return abs((date.fromisoformat(day) - on).days) <= WINDOW_DAYS


def _balance(town: str, produce: str, on: date) -> dict[str, Any]:
    town_l = town.lower()
    supply = [
        x
        for x in listings()
        if x["town"].lower() == town_l and x["produce"] == produce and _in_window(x["ready_on"], on)
    ]
    demand = [
        x
        for x in preorders()
        if x["status"] == "open"
        and x["town"].lower() == town_l
        and x["produce"] == produce
        and _in_window(x["needed_by"], on)
    ]
    supply_kg = sum(x["counted_kg"] for x in supply)
    demand_kg = int(
        sum(
            x["qty_kg"] * (1.0 if buyer_verified(x["buyer"]) else UNVERIFIED_WEIGHT) for x in demand
        )
    )
    if demand_kg == 0:
        level, ratio = ("no-buyers" if supply_kg else "no-data"), None
    else:
        ratio = round(supply_kg / demand_kg, 2)
        level = "short" if ratio < SHORT_BELOW else "glut" if ratio > GLUT_ABOVE else "balanced"
    places = supply + demand
    centre = (
        (sum(p["lat"] for p in places) / len(places), sum(p["lon"] for p in places) / len(places))
        if places
        else None
    )
    return {
        "town": town,
        "supply_kg": supply_kg,
        "demand_kg": demand_kg,
        "unmet_kg": max(demand_kg - supply_kg, 0),
        "ratio": ratio,
        "level": level,
        "listings": len(supply),
        "farmers": len({x["farmer"] for x in supply}),
        "buyers": len({x["buyer"] for x in demand}),
        "bulk_orders": sum(1 for x in demand if x["channel"] == "bulk"),
        "centre": centre,
    }


def coverage(listing_count: int, buyer_count: int) -> str:
    if listing_count < 10 or buyer_count < 3:
        return "early"
    return "some" if listing_count <= 30 else "good"


def outlook(town: str, produce: str, on: str, today: date | None = None) -> dict[str, Any]:
    produce = produce.strip().lower()
    if produce not in PRODUCE:
        raise ValueError(f"produce must be one of {', '.join(sorted(PRODUCE))}")
    on_day, today = _day(on, "on"), today or date.today()
    key = f"{town.lower()}|{produce}|{on_day.isoformat()}|{today.isoformat()}"
    hit = _OUTLOOKS.get(key)
    if hit and hit[0] > time.time():
        return hit[1]

    here = _balance(town, produce, on_day)
    towns = {
        x["town"]
        for x in listings() + preorders()
        if x["produce"] == produce and x["town"].lower() != town.lower()
    }
    nearby = []
    if here["centre"]:
        for other in sorted(towns):
            there = _balance(other, produce, on_day)
            if not there["centre"]:
                continue
            km = km_between(*here["centre"], *there["centre"])
            if km <= NEARBY_KM:
                nearby.append(
                    {
                        "town": other,
                        "km": round(km, 1),
                        "level": there["level"],
                        "unmet_kg": there["unmet_kg"],
                    }
                )
    nearby.sort(key=lambda n: n["km"])

    price = (
        prices.trend(produce, *here["centre"])
        if here["centre"]
        else {"field": "price", "reason": "no place known yet"}
    )
    label = coverage(here["listings"], here["buyers"])
    level = here["level"]
    advice: list[dict[str, Any]] = []
    if level == "glut" and here["bulk_orders"]:
        advice.append({"id": "presell-bulk", "params": {"orders": here["bulk_orders"]}})
    for n in nearby:
        if n["unmet_kg"] > 0 and n["level"] in ("short", "balanced"):
            advice.append(
                {
                    "id": "try-nearby",
                    "params": {"town": n["town"], "km": n["km"], "unmet_kg": n["unmet_kg"]},
                }
            )
            break
    if level == "glut" and produce in STORABLE:
        advice.append({"id": "stagger-harvest", "params": {}})
    change = price.get("change_3m_pct") if isinstance(price, dict) else None
    if change is not None and change < PRICE_FELL_PCT:
        advice.append({"id": "price-fell", "params": {"pct": change, "months": 3}})
    if level == "glut" and (on_day - today).days > PLANTING_AHEAD_DAYS:
        advice.append({"id": "plant-other", "params": {"share": "part"}})

    result = {
        "town": town,
        "produce": produce,
        "on": on_day.isoformat(),
        "window_days": WINDOW_DAYS,
        "supply_kg": here["supply_kg"],
        "demand_kg": here["demand_kg"],
        "ratio": here["ratio"],
        "level": level,
        "verdict": f"early-{level}" if label == "early" else level,
        "coverage": {
            "listings": here["listings"],
            "farmers": here["farmers"],
            "buyers": here["buyers"],
            "label": label,
        },
        "price": price,
        "advice": advice,
        "nearby": nearby,
        "baseline": baseline.summary(baseline.DEFAULT_COUNTRY, produce, today),
        "yield_status": YIELD_STATUS,
    }
    _OUTLOOKS[key] = (time.time() + CACHE_TTL_S, result)
    return result


DEMO_TOWNS: tuple[
    tuple[str, float, float, str, tuple[int, ...], tuple[tuple[str, int], ...]], ...
] = (
    ("Nyaungshwe", 20.66, 96.935, "tomato", (1500, 2000, 2500, 3000), (("processor", 2000),)),
    ("Taunggyi", 20.78, 97.03, "tomato", (300,), (("factory", 3000), ("restaurant", 200))),
    (
        "Aungban",
        20.66,
        96.63,
        "potato",
        (800, 800),
        (("factory", 5000), ("processor", 2000), ("household", 20)),
    ),
    (
        "Maubin",
        16.73,
        95.65,
        "rice",
        (2000, 2000, 2000, 2000),
        (("cooperative", 6000), ("retail", 500)),
    ),
    ("Hmawbi", 17.10, 96.05, "tomato", (900, 900), (("restaurant", 400), ("household", 30))),
    ("Taikkyi", 17.32, 95.97, "tomato", (100,), (("processor", 1500),)),
)


DEMO_SEED_VERSION = "2"


def _clear_demo() -> None:
    conn, lock = connect("contracts.sqlite")
    with lock:
        conn.execute(
            "DELETE FROM records WHERE source IN (?, ?) AND json_extract(payload, '$.demo') = 1",
            (LISTING, PREORDER),
        )
        conn.commit()
    clear_cache()


def seed_demo() -> int:
    marker = _STORE.get("demo_seed", "version")
    if marker and marker["payload"].get("version") == DEMO_SEED_VERSION:
        return 0
    _clear_demo()
    _STORE.update("demo_seed", "version", lambda _old: {"version": DEMO_SEED_VERSION}, URL)
    added = 0
    ready = (date.today() + timedelta(days=21)).isoformat()
    for t, (town, lat, lon, produce, supply, demand) in enumerate(DEMO_TOWNS):
        for j, kg in enumerate(supply):
            body = {
                "produce": produce,
                "qty_kg": kg,
                "ready_on": ready,
                "town": town,
                "lat": lat + 0.008 * j,
                "lon": lon - 0.006 * j,
                "demo": True,
                "farmer_name": f"Demo farm {t + 1}.{j + 1}",
            }
            post_listing(f"demo-farmer-{t}-{j}", body)
            added += 1
        for k, (kind, kg) in enumerate(demand):
            buyer = f"demo-buyer-{t}-{k}"
            body = {
                "produce": produce,
                "qty_kg": kg,
                "needed_by": ready,
                "town": town,
                "lat": lat + 0.01,
                "lon": lon + 0.01,
                "demo": True,
                "buyer_name": f"Demo {kind} {t + 1}.{k + 1}",
            }
            post_preorder(buyer, kind, body)
            mark_buyer_verified(buyer)
            added += 1
    return added
