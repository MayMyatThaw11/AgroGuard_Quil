from __future__ import annotations

import calendar
import statistics
import uuid
from datetime import date
from typing import Any

from . import haul, market, producers
from .data import prices
from .store import RecordCache, now_iso

_STORE = RecordCache("contracts.sqlite")
ORDER, RESERVE = "season_order", "season_reserve"
OFFERS = (
    "pays-within-3d",
    "pays-within-7d",
    "provides-pickup",
    "provides-crates",
    "advance-inputs",
)
NEEDS = ("weekly-supply", "sorted-grade", "exact-date")
PRICE_KINDS = ("fixed", "floor", "town-plus")
GRADES = ("any", "sorted")
MATCH_KM = 150.0
AREA_SHARE_MIN = 0.1
STRONG_AT, GOOD_AT = 4, 2
WANT_MET_BY = {
    "cash-at-harvest": ("pays-within-3d", "pays-within-7d"),
    "pickup-needed": ("provides-pickup",),
    "inputs-needed": ("advance-inputs",),
}
NEED_MET_BY = {"weekly-supply": "weekly-delivery", "sorted-grade": "grade-sorting"}
INTENT_STATUS = (
    "Not binding: a season intent, not an order. It becomes a normal offer in the delivery month."
)


def fit_word(reasons: int) -> str:
    return "strong" if reasons >= STRONG_AT else "good" if reasons >= GOOD_AT else "weak"


def _months(raw: Any) -> list[int]:
    try:
        months = sorted({int(m) for m in raw or []})
    except (TypeError, ValueError) as exc:
        raise ValueError("delivery_months must be month numbers 1 to 12") from exc
    if not months or months[0] < 1 or months[-1] > 12:
        raise ValueError("delivery_months must be month numbers 1 to 12")
    return months


def _price(raw: Any) -> dict[str, Any]:
    raw = raw or {}
    kind = str(raw.get("kind") or "fixed")
    if kind not in PRICE_KINDS:
        raise ValueError(f"price kind must be one of {', '.join(PRICE_KINDS)}")
    out: dict[str, Any] = {"kind": kind}
    key = "plus_pct" if kind == "town-plus" else "mmk_kg"
    if raw.get(key) not in (None, ""):
        out[key] = int(raw[key])
    return out


def post_order(buyer: str, buyer_kind: str, body: dict[str, Any]) -> dict[str, Any]:
    market.channel_for(buyer_kind)
    town, lat, lon = market._place(body)
    grade = str(body.get("grade") or "any")
    if grade not in GRADES:
        raise ValueError("grade must be any or sorted")
    record = {
        "id": f"sord-{uuid.uuid4().hex[:12]}",
        "buyer": buyer,
        "buyer_name": body.get("buyer_name"),
        "buyer_kind": buyer_kind,
        "produce": market._produce(body),
        "total_kg": market._kg({"qty_kg": body.get("total_kg")}),
        "delivery_months": _months(body.get("delivery_months")),
        "town": town,
        "lat": lat,
        "lon": lon,
        "price": _price(body.get("price")),
        "grade": grade,
        "offers": producers._flags(body.get("offers"), OFFERS, "offers"),
        "needs": producers._flags(body.get("needs"), NEEDS, "needs"),
        "status": "open",
        "created_at": now_iso(),
    }
    return market._save(ORDER, record)


def _orders() -> list[dict[str, Any]]:
    return _STORE.items(ORDER)


def _reserves(order_id: str | None = None) -> list[dict[str, Any]]:
    return [r for r in _STORE.items(RESERVE) if order_id is None or r["order_id"] == order_id]


def _order(order_id: str) -> dict[str, Any]:
    hit = _STORE.get(ORDER, order_id)
    if hit is None:
        raise KeyError(f"no season order {order_id}")
    return hit["payload"]


def reserved_kg(order_id: str) -> int:
    return sum(r["kg"] for r in _reserves(order_id))


def _day(value: Any) -> date:
    return date.fromisoformat(str(value)[:10])


def _on(months: list[int], today: date) -> date:
    return min(date(today.year + (1 if m < today.month else 0), m, 15) for m in months)


def _crop_kg(record: dict[str, Any], produce: str) -> int:
    crops = record["crops"]
    crop = next((c for c in crops if c["produce"] == produce), None)
    if crop is None:
        return 0
    area = crop["area_ha"] or producers.total_area(record) / len(crops)
    return int(area * market.yield_kg_ha(produce))


def _price_reason(order: dict[str, Any]) -> dict[str, Any] | None:
    price = order["price"]
    if price["kind"] == "town-plus":
        pct = price.get("plus_pct") or 0
        return {"id": "price", "params": {"pct": pct}} if pct > 0 else None
    offered = price.get("mmk_kg")
    ref = prices.trend(order["produce"], order["lat"], order["lon"]).get("latest_mmk_kg")
    if not offered or not ref or offered < ref:
        return None
    return {"id": "price", "params": {"pct": round((offered / ref - 1) * 100)}}


def _needs_met(order: dict[str, Any], record: dict[str, Any]) -> list[dict[str, Any]]:
    wants, offers = record.get("wants", []), record.get("can_offer", [])
    met = []
    for want in wants:
        by = next((o for o in WANT_MET_BY.get(want, ()) if o in order["offers"]), None)
        if by:
            met.append({"id": "needs-met", "params": {"need": want, "by": by}})
    met += [
        {"id": "needs-met", "params": {"need": n, "by": n}}
        for n in order["needs"]
        if NEED_MET_BY.get(n) in offers
    ]
    return met


def _reasons(
    order: dict[str, Any], record: dict[str, Any], remaining: int, today: date
) -> tuple[list[dict[str, Any]], float]:
    reasons: list[dict[str, Any]] = []
    km = market.km_between(record["lat"], record["lon"], order["lat"], order["lon"])
    if km <= MATCH_KM:
        reasons.append({"id": "location", "params": {"km": round(km, 1)}})
    expected = _crop_kg(record, order["produce"])
    if expected and expected >= remaining * AREA_SHARE_MIN:
        share = min(100, round(expected / remaining * 100))
        reasons.append({"id": "area", "params": {"kg": expected, "share_pct": share}})
    price = _price_reason(order)
    if price:
        reasons.append(price)
    home = record.get("township") or record.get("village")
    if home:
        on = _on(order["delivery_months"], today)
        here = market._balance(home, order["produce"], on)["level"]
        there = market._balance(order["town"], order["produce"], on)["level"]
        if here in ("glut", "no-buyers") and there == "short":
            reasons.append({"id": "demand", "params": {"from": here, "to": there}})
    return reasons + _needs_met(order, record), km


def matches(actor: str, producer_id: str, today: date | None = None) -> list[dict[str, Any]]:
    record = producers.require_act(actor, producer_id)
    today = today or date.today()
    grown = {c["produce"] for c in record["crops"]}
    rank = {"strong": 0, "good": 1, "weak": 2}
    rows = []
    for order in _orders():
        remaining = order["total_kg"] - reserved_kg(order["id"])
        if order["status"] != "open" or order["produce"] not in grown or remaining <= 0:
            continue
        reasons, km = _reasons(order, record, remaining, today)
        rows.append(
            {
                "order_id": order["id"],
                "produce": order["produce"],
                "buyer_name": order["buyer_name"],
                "buyer_kind": order["buyer_kind"],
                "total_kg": order["total_kg"],
                "remaining_kg": remaining,
                "delivery_months": order["delivery_months"],
                "town": order["town"],
                "km": round(km, 1),
                "price": order["price"],
                "grade": order["grade"],
                "offers": order["offers"],
                "needs": order["needs"],
                "reasons": reasons,
                "fit": fit_word(len(reasons)),
                "buyer_reliability": buyer_reliability(order["buyer"]),
                "my_reserved_kg": sum(
                    r["kg"] for r in _reserves(order["id"]) if r["producer_id"] == producer_id
                ),
                "status": INTENT_STATUS,
            }
        )
    return sorted(rows, key=lambda r: (rank[r["fit"]], r["km"]))


def reserve(actor: str, producer_id: str, order_id: str, kg: Any) -> dict[str, Any]:
    producers.require_act(actor, producer_id)
    order = _order(order_id)
    amount = market._kg({"qty_kg": kg})
    if order["status"] != "open" or amount > order["total_kg"] - reserved_kg(order_id):
        raise ValueError("that is more than this season order still needs")
    record = {
        "id": f"res-{uuid.uuid4().hex[:12]}",
        "order_id": order_id,
        "producer_id": producer_id,
        "farmer": actor,
        "kg": amount,
        "status": "intent",
        "created_at": now_iso(),
    }
    return market._save(RESERVE, record)


def _month_preorder(order: dict[str, Any], today: date) -> dict[str, Any]:
    tag = f"{today.year}-{today.month:02d}"
    found = next(
        (
            p
            for p in market.preorders()
            if p.get("season_order_id") == order["id"] and p.get("month") == tag
        ),
        None,
    )
    if found:
        return found
    last = calendar.monthrange(today.year, today.month)[1]
    pre = market.post_preorder(
        order["buyer"],
        order["buyer_kind"],
        {
            "buyer_name": order["buyer_name"],
            "produce": order["produce"],
            "qty_kg": order["total_kg"],
            "needed_by": today.replace(day=last).isoformat(),
            "town": order["town"],
            "lat": order["lat"],
            "lon": order["lon"],
            "price_offer_mmk_kg": order["price"].get("mmk_kg"),
        },
    )
    return market._save(market.PREORDER, {**pre, "season_order_id": order["id"], "month": tag})


def _activate_one(row: dict[str, Any], order: dict[str, Any], today: date) -> None:
    record = producers.get(row["producer_id"])
    pre = _month_preorder(order, today)
    listing = market.post_listing(
        row["farmer"],
        {
            "produce": order["produce"],
            "qty_kg": row["kg"],
            "ready_on": today.isoformat(),
            "town": record["township"] or record["village"] or order["town"],
            "lat": record["lat"],
            "lon": record["lon"],
            "producer_id": record["id"],
            "farmer_name": record["name"],
        },
    )
    offer = market.apply(
        row["farmer"], pre["id"], {"listing_id": listing["id"], "qty_kg": row["kg"]}
    )
    market._save(RESERVE, {**row, "status": "offered", "offer_id": offer["id"]})


def activate(today: date | None = None) -> int:
    today = today or date.today()
    done = 0
    for row in _reserves():
        order = _order(row["order_id"])
        if row["status"] == "intent" and today.month in order["delivery_months"]:
            _activate_one(row, order, today)
            done += 1
    return done


def _delivered_on(offer: dict[str, Any]) -> date:
    return _day(offer["delivered_at"])


def mark_paid(actor: str, offer_id: str, paid_on: Any = None) -> dict[str, Any]:
    offer = haul._offer(offer_id)
    pid = haul._listing(offer).get("producer_id")
    if offer["farmer"] != actor and not (pid and producers.can_act(actor, producers.get(pid))):
        raise PermissionError("only the farmer on this offer can mark it paid")
    if offer["status"] != "delivered":
        raise ValueError("an offer can be marked paid only after delivery")
    day = _day(paid_on) if paid_on else date.today()
    if day < _delivered_on(offer):
        raise ValueError("paid_on cannot be before the delivery")
    record, _ = _STORE.update(
        market.OFFER, offer_id, lambda old: {**old, "paid_on": day.isoformat()}, market.URL
    )
    return record


def buyer_reliability(buyer: str) -> dict[str, Any]:
    live = [
        o
        for o in market.offers()
        if o["buyer"] == buyer and o["status"] in ("selected", "delivered", "cancelled")
    ]
    done = [o for o in live if o["status"] == "delivered"]
    days = [(_day(o["paid_on"]) - _delivered_on(o)).days for o in done if o.get("paid_on")]
    median = statistics.median(days) if days else None
    return {
        "orders": len(live),
        "completed": len(done),
        "cancelled": sum(1 for o in live if o["status"] == "cancelled"),
        "median_days_to_pay": median if median is None or median % 1 else int(median),
        "new": not live,
    }


def farmer_reliability(producer_id: str) -> dict[str, int]:
    delivered = on_time = 0
    for offer in market.offers():
        if offer["status"] != "delivered" or haul._listing(offer).get("producer_id") != producer_id:
            continue
        delivered += 1
        needed = _day(market.get_preorder(offer["preorder_id"])["needed_by"])
        on_time += _delivered_on(offer) <= needed
    return {"delivered": delivered, "on_time": on_time}


def mine(buyer: str) -> list[dict[str, Any]]:
    out = []
    for order in sorted(_orders(), key=lambda o: o["created_at"], reverse=True):
        if order["buyer"] != buyer:
            continue
        farmers = []
        for row in _reserves(order["id"]):
            record = producers.get(row["producer_id"])
            farmers.append(
                {
                    "name": record["name"],
                    "kg": row["kg"],
                    "status": row["status"],
                    "reliability": farmer_reliability(record["id"]),
                    "needs_met": [r["params"]["need"] for r in _needs_met(order, record)],
                }
            )
        out.append(
            {
                **order,
                "target_kg": order["total_kg"],
                "reserved_kg": reserved_kg(order["id"]),
                "farmers": farmers,
            }
        )
    return out
