from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from . import cropvalue, cues, haul, market, market_signals, producers, reach, season_match, supply
from .config import get_settings
from .data import regions


def require_market() -> None:
    if not get_settings().farm_market_enabled:
        raise HTTPException(status_code=404, detail="Not found")


_BODY = Body(...)
public = APIRouter(prefix="/market")


@public.get("/enabled")
async def enabled() -> dict[str, bool]:
    return {"enabled": get_settings().farm_market_enabled}


def account_of(caller: Any) -> str:
    return caller.account or f"code:{caller.name or 'shared'}"


def _farmer(caller: Any) -> str:
    if not {"crew", "manager"} & set(caller.roles):
        raise HTTPException(status_code=403, detail="only farmer accounts can do this")
    return account_of(caller)


def _buyer(caller: Any) -> tuple[str, str]:
    if "buyer" not in caller.roles:
        raise HTTPException(status_code=403, detail="only buyer accounts can do this")
    return account_of(caller), caller.buyer_kind or "cooperative"


def _run(fn: Callable[..., Any], *args: Any) -> Any:
    try:
        return fn(*args)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except haul.NotSelected as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except producers.PlanLimit as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    except producers.NearbyProfile as exc:
        raise HTTPException(
            status_code=409, detail={"message": str(exc), "profile": exc.profile}
        ) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc).strip("'")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _mine(farmer: str) -> list[dict[str, Any]]:
    out = []
    for offer in market.offers():
        if offer["farmer"] != farmer:
            continue
        order = market.get_preorder(offer["preorder_id"])
        row = {
            **offer,
            "produce": order["produce"],
            "buyer_name": order.get("buyer_name"),
            "buyer_kind": order["buyer_kind"],
            "channel": order["channel"],
            "town": order["town"],
            "needed_by": order["needed_by"],
            "price_offer_mmk_kg": order["price_offer_mmk_kg"],
            "buyer_km": round(haul.route_km(offer), 1),
            "pickup": haul.farmer_view(haul.pickup_for(offer["id"])),
        }
        if offer["status"] in ("selected", "delivered"):
            row["buyer_lat"], row["buyer_lon"] = order["lat"], order["lon"]
        out.append(row)
    return sorted(out, key=lambda r: r["created_at"], reverse=True)


def _candidates(buyer: str, preorder_id: str) -> list[dict[str, Any]]:
    order = market.get_preorder(preorder_id)
    if order["buyer"] != buyer:
        raise PermissionError("only the buyer who posted this pre-order can see its offers")
    rows = []
    for offer in market.offers():
        if offer["preorder_id"] != preorder_id:
            continue
        listing = next((x for x in market.listings() if x["id"] == offer["listing_id"]), None)
        row = {
            **offer,
            "farmer_name": listing.get("farmer_name") if listing else None,
            "ready_on": listing["ready_on"] if listing else None,
            "farm_town": listing["town"] if listing else None,
            "km": round(haul.route_km(offer), 1),
            "pickup": haul.pickup_for(offer["id"]),
        }
        if listing:
            pid = listing.get("producer_id")
            row["reliability"] = season_match.farmer_reliability(pid) if pid else None
            exact = offer["status"] in ("selected", "delivered")
            row.update(_transport(listing, order, offer, 0.0 if exact else 1.0))
            if exact:
                row["farm_lat"], row["farm_lon"] = listing["lat"], listing["lon"]
                row["pool"] = haul.pool(offer["id"])
        rows.append(row)
    return rows


def _transport(
    listing: dict[str, Any], order: dict[str, Any], offer: dict[str, Any], widen_km: float
) -> dict[str, Any]:
    options = haul.estimate(
        (listing["lat"], listing["lon"]),
        (order["lat"], order["lon"]),
        offer["qty_kg"],
        listing["produce"],
        listing["ready_on"],
        widen_km=widen_km,
    )
    price = listing.get("ask_mmk_kg") or order.get("price_offer_mmk_kg")
    best = options[0]
    return {
        "transport": options,
        "landed_basis": None if price is None else "ask" if listing.get("ask_mmk_kg") else "offer",
        "landed_low": None if price is None else price + best["low_per_kg"],
        "landed_high": None if price is None else price + best["high_per_kg"],
    }


def build(caller_dep: Any, reader_dep: Any) -> APIRouter:
    r = APIRouter(prefix="/market", dependencies=[Depends(require_market)])

    @r.get("/status")
    async def status() -> dict[str, bool]:
        return {"enabled": True}

    @r.get("/outlook")
    async def outlook(
        town: str = Query(..., max_length=80),
        produce: str = Query(..., max_length=40),
        on: str = Query(..., max_length=10),
        caller: Any = caller_dep,
    ) -> dict[str, Any]:
        return _run(market.outlook, town, produce, on)

    @r.get("/outlook/towns")
    async def outlook_towns(
        produce: str = Query(..., max_length=40),
        on: str = Query(..., max_length=10),
        caller: Any = caller_dep,
    ) -> list[dict[str, Any]]:
        return _run(market.towns_balance, produce, on)

    @r.get("/preorders")
    async def preorders(
        town: str | None = Query(None, max_length=80),
        produce: str | None = Query(None, max_length=40),
        channel: str | None = Query(None, pattern="^(direct|bulk)$"),
        lat: float | None = Query(None, ge=-90, le=90),
        lon: float | None = Query(None, ge=-180, le=180),
        caller: Any = caller_dep,
    ) -> list[dict[str, Any]]:
        farmer = account_of(caller) if {"crew", "manager"} & set(caller.roles) else None
        return market.list_preorders(town, produce, channel, lat, lon, farmer)

    @r.get("/preorders/mine")
    async def my_preorders(caller: Any = caller_dep) -> list[dict[str, Any]]:
        buyer, _ = _buyer(caller)
        counts: dict[str, int] = {}
        for offer in market.offers():
            counts[offer["preorder_id"]] = counts.get(offer["preorder_id"], 0) + 1
        rows = [p for p in market.preorders() if p["buyer"] == buyer]
        rows.sort(key=lambda p: p["created_at"], reverse=True)
        return [{**p, "offers": counts.get(p["id"], 0)} for p in rows]

    @r.post("/preorders", status_code=201)
    async def post_preorder(
        body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        buyer, kind = _buyer(caller)
        return _run(market.post_preorder, buyer, kind, {**body, "buyer_name": caller.name})

    @r.post("/listings", status_code=201)
    async def post_listing(
        body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        farmer = _farmer(caller)
        listing = _run(market.post_listing, farmer, {**body, "farmer_name": caller.name})
        check = None
        if listing.get("producer_id"):
            record = producers.get(listing["producer_id"])
            expected = market_signals.expected_kg(record, listing["produce"])
            check = market_signals.gap(listing["qty_kg"], expected.get("kg"))
        return {**listing, "check": check}

    @r.get("/cues")
    async def producer_cues(
        producer_id: str = Query(..., max_length=40),
        since: str | None = Query(None, max_length=10),
        caller: Any = caller_dep,
    ) -> list[dict[str, Any]]:
        return _run(cues.cues, _farmer(caller), producer_id, since)

    @r.get("/producers/{producer_id}/season")
    async def season(producer_id: str, caller: Any = caller_dep) -> dict[str, Any]:
        return _run(season_match.season_record, _farmer(caller), producer_id)

    @r.get("/supply")
    async def supply_search(
        produce: str = Query(..., max_length=40),
        lat: float = Query(..., ge=-90, le=90),
        lon: float = Query(..., ge=-180, le=180),
        radius_km: float = Query(supply.DEFAULT_RADIUS_KM, gt=0, le=supply.MAX_RADIUS_KM),
        kg: int | None = Query(None, ge=1),
        budget: float | None = Query(None, gt=0),
        by: str | None = Query(None, max_length=10),
        caller: Any = caller_dep,
    ) -> dict[str, Any]:
        _buyer(caller)
        by_date = market._day(by, "by") if by else None
        return _run(supply.supply, produce, lat, lon, radius_km, kg, budget, by_date)

    @r.post("/saved-searches", status_code=201)
    async def save_search(body: dict[str, Any] = _BODY, caller: Any = caller_dep) -> dict[str, Any]:
        buyer, _ = _buyer(caller)
        return _run(supply.save_search, buyer, body)

    @r.get("/cues/buyer")
    async def buyer_cues(
        since: str | None = Query(None, max_length=10), caller: Any = caller_dep
    ) -> list[dict[str, Any]]:
        buyer, _ = _buyer(caller)
        return cues.buyer_cues(buyer, since)

    @r.get("/surplus")
    async def surplus(
        produce: str = Query(..., max_length=40),
        lat: float = Query(..., ge=-90, le=90),
        lon: float = Query(..., ge=-180, le=180),
        on: str = Query(..., max_length=10),
        caller: Any = caller_dep,
    ) -> list[dict[str, Any]]:
        _, kind = _buyer(caller)
        if kind not in reach.KINDS:
            raise HTTPException(status_code=403, detail="only food businesses see surplus towns")
        return _run(lambda: reach.surplus(produce, lat, lon, market._day(on, "on")))

    @r.get("/signals")
    async def signals(
        producer_id: str = Query(..., max_length=40),
        produce: str = Query(..., max_length=40),
        severity: str | None = Query(None, max_length=20),
        caller: Any = caller_dep,
    ) -> dict[str, Any]:
        record = _run(producers.require_act, _farmer(caller), producer_id)
        return {
            "ready_on": market_signals.ready_on(record, produce),
            "expected_kg": market_signals.expected_kg(record, produce),
            "grade": market_signals.grade_route(severity),
            "market_open": market.market_open(record.get("township") or ""),
        }

    @r.get("/plant-ideas")
    async def plant_ideas(
        producer_id: str = Query(..., max_length=40),
        month: int = Query(..., ge=1, le=12),
        caller: Any = caller_dep,
    ) -> list[dict[str, Any]]:
        record = _run(producers.require_act, _farmer(caller), producer_id)
        town = record.get("township") or record.get("village") or ""
        site = cropvalue.site_from_region(regions.get(town)) if town else {}
        return market_signals.what_to_plant(site, month, town)

    @r.post("/preorders/{preorder_id}/offers", status_code=201)
    async def apply(
        preorder_id: str, body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        return _run(market.apply, _farmer(caller), preorder_id, body)

    @r.get("/preorders/{preorder_id}/offers")
    async def candidates(preorder_id: str, caller: Any = caller_dep) -> list[dict[str, Any]]:
        buyer, _ = _buyer(caller)
        return _run(_candidates, buyer, preorder_id)

    @r.post("/preorders/{preorder_id}/offers/{offer_id}/select")
    async def select(preorder_id: str, offer_id: str, caller: Any = caller_dep) -> dict[str, Any]:
        buyer, _ = _buyer(caller)
        return _run(market.select, buyer, preorder_id, offer_id)

    @r.get("/offers/mine")
    async def mine(caller: Any = caller_dep) -> list[dict[str, Any]]:
        farmer = _farmer(caller)
        season_match.activate()
        return _mine(farmer)

    @r.post("/season-orders", status_code=201)
    async def post_season_order(
        body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        buyer, kind = _buyer(caller)
        return _run(season_match.post_order, buyer, kind, {**body, "buyer_name": caller.name})

    @r.get("/season-orders/mine")
    async def my_season_orders(caller: Any = caller_dep) -> list[dict[str, Any]]:
        buyer, _ = _buyer(caller)
        return season_match.mine(buyer)

    @r.get("/season-orders/matches")
    async def season_matches(
        producer_id: str = Query(..., max_length=40), caller: Any = caller_dep
    ) -> list[dict[str, Any]]:
        farmer = _farmer(caller)
        season_match.activate()
        return _run(season_match.matches, farmer, producer_id)

    @r.post("/season-orders/{order_id}/reserve", status_code=201)
    async def reserve_season(
        order_id: str, body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        return _run(
            season_match.reserve,
            _farmer(caller),
            str(body.get("producer_id") or ""),
            order_id,
            body.get("kg"),
        )

    @r.post("/offers/{offer_id}/paid")
    async def paid(
        offer_id: str, body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        return _run(season_match.mark_paid, _farmer(caller), offer_id, body.get("paid_on"))

    @r.get("/buyers/{account}/reliability")
    async def buyer_record(account: str, caller: Any = caller_dep) -> dict[str, Any]:
        return season_match.buyer_reliability(account)

    @r.get("/offers/{offer_id}/trip")
    async def trip(offer_id: str, caller: Any = caller_dep) -> dict[str, Any]:
        return _run(haul.trip, _farmer(caller), offer_id)

    @r.post("/offers/{offer_id}/delivery")
    async def delivery(
        offer_id: str, body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        buyer, _ = _buyer(caller)
        return _run(
            haul.confirm_delivery,
            buyer,
            offer_id,
            body.get("received_kg"),
            body.get("rejected_kg", 0),
            body.get("reason"),
        )

    @r.post("/offers/{offer_id}/pickup", status_code=201)
    async def pickup(offer_id: str, caller: Any = caller_dep) -> dict[str, Any]:
        return haul.farmer_view(_run(haul.book_pickup, _farmer(caller), offer_id))

    @r.post("/producers", status_code=201)
    async def create_producer(
        body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        if body.get("on_behalf") is True:
            return _run(producers.create, account_of(caller), caller.buyer_kind or "", body)
        return _run(producers.create, _farmer(caller), None, body)

    @r.get("/producers/plan")
    async def plan(caller: Any = caller_dep) -> dict[str, Any]:
        return producers.plan_usage(account_of(caller))

    @r.get("/producers/mine")
    async def my_producers(caller: Any = caller_dep) -> list[dict[str, Any]]:
        return producers.mine(account_of(caller))

    @r.patch("/producers/{producer_id}")
    async def update_producer(
        producer_id: str, body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        return _run(producers.update, account_of(caller), producer_id, body)

    @r.post("/producers/{producer_id}/members")
    async def join_group(
        producer_id: str, body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        return _run(producers.add_member, account_of(caller), producer_id, body)

    @r.post("/producers/{producer_id}/claim")
    async def claim(
        producer_id: str, body: dict[str, Any] = _BODY, caller: Any = reader_dep
    ) -> dict[str, Any]:
        account = account_of(caller) if caller is not None and caller.account else None
        code, pin = str(body.get("code") or ""), str(body.get("pin") or "")
        return _run(producers.claim, account, producer_id, code, pin)

    @r.post("/producers/{producer_id}/pin")
    async def check_pin(
        producer_id: str, body: dict[str, Any] = _BODY, caller: Any = caller_dep
    ) -> dict[str, Any]:
        return _run(
            producers.verify_pin, account_of(caller), producer_id, str(body.get("pin") or "")
        )

    @r.post("/producers/{producer_id}/revoke-manager")
    async def revoke(producer_id: str, caller: Any = caller_dep) -> dict[str, Any]:
        return _run(producers.revoke_manager, account_of(caller), producer_id)

    @r.get("/producers/{producer_id}/activity")
    async def activity(producer_id: str, caller: Any = caller_dep) -> list[dict[str, Any]]:
        return _run(producers.activity, account_of(caller), producer_id)

    return r
