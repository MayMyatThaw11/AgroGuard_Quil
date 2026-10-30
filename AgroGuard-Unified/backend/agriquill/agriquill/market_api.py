from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from . import haul, market, producers
from .config import get_settings


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
        if offer["status"] == "selected":
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
        rows.append(
            {
                **offer,
                "farmer_name": listing.get("farmer_name") if listing else None,
                "ready_on": listing["ready_on"] if listing else None,
                "farm_town": listing["town"] if listing else None,
                "km": round(haul.route_km(offer), 1),
                "pickup": haul.pickup_for(offer["id"]),
            }
        )
        if listing and offer["status"] == "selected":
            rows[-1]["farm_lat"], rows[-1]["farm_lon"] = listing["lat"], listing["lon"]
    return rows


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

    @r.get("/preorders")
    async def preorders(
        town: str | None = Query(None, max_length=80),
        produce: str | None = Query(None, max_length=40),
        channel: str | None = Query(None, pattern="^(direct|bulk)$"),
        lat: float | None = Query(None, ge=-90, le=90),
        lon: float | None = Query(None, ge=-180, le=180),
        caller: Any = caller_dep,
    ) -> list[dict[str, Any]]:
        return market.list_preorders(town, produce, channel, lat, lon)

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
        return _run(market.post_listing, _farmer(caller), {**body, "farmer_name": caller.name})

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
        return _mine(_farmer(caller))

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
