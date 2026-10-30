import inspect
from datetime import date

from pydantic import SecretStr

from agriquill import market, market_api, season_match
from agriquill.config import get_settings

from .test_agriquill_market_api import (  # noqa: F401
    BASE,
    BUYER,
    BUYER_B,
    FARMER,
    FARMER_B,
    READY,
    client,
    isolated,
    offer_flow,
    post_listing,
    post_preorder,
    select_offer,
)

COOP_PROFILE = {
    "kind": "household",
    "name": "Daw Hla's family",
    "lat": 17.2,
    "lon": 96.1,
    "township": "Hmawbi",
    "crops": [{"produce": "tomato", "area_ha": 1.0, "harvest_month": 3}],
    "consent": {"by": "Co-op", "read_aloud": True, "text_version": "v1"},
    "on_behalf": True,
}


def coop_profile() -> dict:
    made = client.post(f"{BASE}/producers", json=COOP_PROFILE, headers=BUYER)
    assert made.status_code == 201
    return made.json()


def claim_from_phone(created: dict) -> dict[str, str]:
    claimed = client.post(
        f"{BASE}/producers/{created['id']}/claim",
        json={"code": created["claim_code"], "pin": "4321"},
    )
    return {"X-AgriQuill-Producer-Token": claimed.json()["device_token"]}


def test_a_used_claim_code_cannot_take_the_profile_back() -> None:
    created = coop_profile()
    phone = claim_from_phone(created)
    revoked = client.post(f"{BASE}/producers/{created['id']}/revoke-manager", headers=phone)
    assert revoked.status_code == 200
    again = client.post(
        f"{BASE}/producers/{created['id']}/claim",
        json={"code": created["claim_code"], "pin": "0000"},
    )
    assert again.status_code == 403


def test_a_revoked_manager_reservation_does_not_break_the_farmer_pages() -> None:
    settings = get_settings()
    saved = settings.users
    settings.users = SecretStr("Lead:CODE-1:manager,crew")
    try:
        lead = {"X-AgriQuill-Write-Token": "CODE-1"}
        made = client.post(f"{BASE}/producers", json=COOP_PROFILE, headers=lead)
        assert made.status_code == 201
        created = made.json()
        order = client.post(
            f"{BASE}/season-orders",
            json={
                "produce": "tomato",
                "total_kg": 10_000,
                "delivery_months": [3],
                "town": "Taikkyi",
                "lat": 17.32,
                "lon": 95.97,
                "price": {"kind": "fixed", "mmk_kg": 1900},
            },
            headers=BUYER_B,
        ).json()
        reserved = client.post(
            f"{BASE}/season-orders/{order['id']}/reserve",
            json={"producer_id": created["id"], "kg": 1000},
            headers=lead,
        )
        assert reserved.status_code == 201
        phone = claim_from_phone(created)
        client.post(f"{BASE}/producers/{created['id']}/revoke-manager", headers=phone)
        assert season_match.activate(date(2027, 3, 1)) == 0
        assert client.get(f"{BASE}/offers/mine", headers=FARMER).status_code == 200
        matches = client.get(
            f"{BASE}/season-orders/matches", params={"producer_id": created["id"]}, headers=phone
        )
        assert matches.status_code == 200
    finally:
        settings.users = saved


def test_a_stale_phone_key_does_not_override_a_signed_in_buyer() -> None:
    phone = claim_from_phone(coop_profile())
    signed_in = {**BUYER, **phone}
    assert client.get(f"{BASE}/preorders/mine", headers=signed_in).status_code == 200


def test_town_balance_centre_is_rounded_to_about_a_kilometre() -> None:
    body = {
        "produce": "tomato",
        "qty_kg": 500,
        "ready_on": READY,
        "town": "Hmawbi",
        "lat": 17.12345,
        "lon": 96.54321,
    }
    assert client.post(f"{BASE}/listings", json=body, headers=FARMER).status_code == 201
    [row] = market.towns_balance("tomato", READY)
    assert (row["lat"], row["lon"]) == (17.12, 96.54)


def test_buyer_and_supply_distances_are_whole_kilometres_and_hide_the_farmer_account() -> None:
    _, order, _ = offer_flow()
    found = client.get(
        f"{BASE}/supply",
        params={"produce": "tomato", "lat": 17.0, "lon": 96.0, "by": READY},
        headers=BUYER,
    ).json()
    kms = [x["km"] for g in found["groups"] for x in g["listings"]]
    assert kms and all(float(k).is_integer() for k in kms)
    rows = client.get(f"{BASE}/preorders/{order['id']}/offers", headers=BUYER).json()
    assert rows and all("farmer" not in r for r in rows)
    near = client.get(f"{BASE}/preorders", params={"lat": 17.0, "lon": 96.0}, headers=FARMER).json()
    assert near and all(float(p["km"]).is_integer() for p in near)


def test_an_order_sent_to_one_farm_gives_no_new_buyers_cue_to_another() -> None:
    mine = post_listing(FARMER).json()
    body = {
        "produce": "tomato",
        "qty_kg": 400,
        "needed_by": READY,
        "town": "Hmawbi",
        "lat": 17.12,
        "lon": 96.07,
        "target_listing_ids": [mine["id"]],
    }
    assert client.post(f"{BASE}/preorders", json=body, headers=BUYER).status_code == 201
    other = client.post(
        f"{BASE}/producers",
        json={
            "kind": "individual",
            "name": "Ma Hla",
            "lat": 17.11,
            "lon": 96.06,
            "crops": [{"produce": "tomato", "area_ha": 1.0, "harvest_month": 3}],
        },
        headers=FARMER_B,
    ).json()
    cues = client.get(f"{BASE}/cues", params={"producer_id": other["id"]}, headers=FARMER_B)
    assert cues.status_code == 200
    assert not [c for c in cues.json() if c["kind"] == "new-buyers"]


def test_area_must_be_a_real_positive_number() -> None:
    for bad in ("nan", "inf", -2):
        body = {
            **COOP_PROFILE,
            "crops": [{"produce": "tomato", "area_ha": bad, "harvest_month": 3}],
        }
        made = client.post(f"{BASE}/producers", json=body, headers=BUYER)
        assert made.status_code == 422, bad


def test_a_delivered_offer_cannot_be_selected_again() -> None:
    _, order, offer = offer_flow()
    select_offer(order, offer)
    done = client.post(
        f"{BASE}/offers/{offer['id']}/delivery", json={"received_kg": 400}, headers=BUYER
    )
    assert done.status_code == 200
    again = client.post(
        f"{BASE}/preorders/{order['id']}/offers/{offer['id']}/select", headers=BUYER
    )
    assert again.status_code == 422


def test_paid_on_cannot_be_in_the_future_or_set_twice() -> None:
    _, order, offer = offer_flow()
    select_offer(order, offer)
    client.post(f"{BASE}/offers/{offer['id']}/delivery", json={"received_kg": 400}, headers=BUYER)
    url = f"{BASE}/offers/{offer['id']}/paid"
    assert client.post(url, json={"paid_on": "2099-01-01"}, headers=FARMER).status_code == 422
    assert client.post(url, json={}, headers=FARMER).status_code == 200
    assert client.post(url, json={}, headers=FARMER).status_code == 422


def test_read_routes_are_not_coroutines_so_blocking_price_calls_do_not_stall_the_server() -> None:
    router = market_api.build(lambda: None, lambda: None)
    reads = [r for r in router.routes if "GET" in getattr(r, "methods", ())]
    assert reads
    assert not [r.path for r in reads if inspect.iscoroutinefunction(r.endpoint)]


def test_saving_the_same_harvest_twice_replaces_it_instead_of_doubling_supply() -> None:
    assert post_listing(FARMER, kg=500).status_code == 201
    assert post_listing(FARMER, kg=700).status_code == 201
    mine = [x for x in market.listings() if x["farmer"] == "ag:1"]
    assert [x["qty_kg"] for x in mine] == [700]


def test_town_balance_is_cached_until_a_write_for_that_produce(monkeypatch) -> None:
    post_listing(FARMER, kg=500)
    first = market.towns_balance("tomato", READY)
    calls = []
    real = market.listings
    monkeypatch.setattr(market, "listings", lambda: calls.append(1) or real())
    assert market.towns_balance("tomato", READY) == first and not calls
    post_listing(FARMER_B, kg=700)
    assert market.towns_balance("tomato", READY)[0]["supply_kg"] > first[0]["supply_kg"]
