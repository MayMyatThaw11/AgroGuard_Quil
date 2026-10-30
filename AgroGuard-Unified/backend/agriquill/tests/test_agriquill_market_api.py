import base64
import hashlib
import hmac
import json
import time
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import market, store
from agriquill.api.main import create_app
from agriquill.config import get_settings

SECRET = "jwt-test-secret"
BASE = "/api/v1/agriquill/market"
READY = (date.today() + timedelta(days=20)).isoformat()
client = TestClient(create_app())


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def token(sub: int, name: str, **extra: str) -> dict[str, str]:
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(
        json.dumps({"sub": str(sub), "name": name, "exp": int(time.time()) + 600, **extra}).encode()
    )
    sig = b64(hmac.new(SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return {"Authorization": f"Bearer {header}.{body}.{sig}"}


FARMER = token(1, "Ko Aung")
FARMER_B = token(2, "Ma Hla")
BUYER = token(3, "Shwe Taung Co-op", role="buyer", buyer_kind="cooperative")
BUYER_B = token(4, "Other Buyer", role="buyer", buyer_kind="processor")


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = get_settings()
    saved = (
        settings.data_dir,
        settings.ledger_path,
        settings.agroguard_jwt_secret,
        settings.farm_market_enabled,
    )
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.agroguard_jwt_secret = SecretStr(SECRET)
    settings.farm_market_enabled = True
    market.clear_cache()
    monkeypatch.setattr(
        market.prices, "trend", lambda *a, **k: {"field": "price", "reason": "offline"}
    )
    yield
    store.close_all()
    (
        settings.data_dir,
        settings.ledger_path,
        settings.agroguard_jwt_secret,
        settings.farm_market_enabled,
    ) = saved


def post_listing(headers=FARMER, kg=500):
    body = {
        "produce": "tomato",
        "qty_kg": kg,
        "ready_on": READY,
        "town": "Hmawbi",
        "lat": 17.1,
        "lon": 96.05,
    }
    return client.post(f"{BASE}/listings", json=body, headers=headers)


def post_preorder(headers=BUYER, kg=400):
    body = {
        "produce": "tomato",
        "qty_kg": kg,
        "needed_by": READY,
        "town": "Hmawbi",
        "lat": 17.12,
        "lon": 96.07,
    }
    return client.post(f"{BASE}/preorders", json=body, headers=headers)


def offer_flow():
    listing = post_listing().json()
    order = post_preorder().json()
    offer = client.post(
        f"{BASE}/preorders/{order['id']}/offers",
        json={"listing_id": listing["id"], "qty_kg": 400},
        headers=FARMER,
    )
    assert offer.status_code == 201
    return listing, order, offer.json()


def test_buyer_can_post_preorder_farmer_cannot() -> None:
    assert post_preorder(BUYER).status_code == 201
    assert post_preorder(FARMER).status_code == 403


def test_buyer_cannot_list_a_harvest() -> None:
    assert post_listing(BUYER).status_code == 403
    assert post_listing(FARMER).status_code == 201


def test_signed_out_is_401_when_sign_in_is_configured() -> None:
    settings = get_settings()
    settings.write_token = SecretStr("shared-code")
    try:
        assert client.get(f"{BASE}/offers/mine").status_code == 401
    finally:
        settings.write_token = None


def test_farmer_sees_no_buyer_location_until_selected() -> None:
    _, order, offer = offer_flow()
    [mine] = client.get(f"{BASE}/offers/mine", headers=FARMER).json()
    assert mine["status"] == "candidate"
    assert "buyer_lat" not in mine
    assert mine["buyer_km"] is not None
    client.post(f"{BASE}/preorders/{order['id']}/offers/{offer['id']}/select", headers=BUYER)
    [chosen] = client.get(f"{BASE}/offers/mine", headers=FARMER).json()
    assert chosen["status"] == "selected"
    assert chosen["buyer_lat"] == 17.12


def test_select_other_buyers_preorder_403() -> None:
    _, order, offer = offer_flow()
    response = client.post(
        f"{BASE}/preorders/{order['id']}/offers/{offer['id']}/select", headers=BUYER_B
    )
    assert response.status_code == 403


def test_pickup_409_before_selection_201_after() -> None:
    _, order, offer = offer_flow()
    assert client.post(f"{BASE}/offers/{offer['id']}/pickup", headers=FARMER).status_code == 409
    client.post(f"{BASE}/preorders/{order['id']}/offers/{offer['id']}/select", headers=BUYER)
    booking = client.post(f"{BASE}/offers/{offer['id']}/pickup", headers=FARMER)
    assert booking.status_code == 201
    body = booking.json()
    assert body["beta"] is True and len(body["drivers"]) == 3
    assert "fare_mmk" not in body
    assert client.post(f"{BASE}/offers/{offer['id']}/pickup", headers=FARMER_B).status_code == 403


def test_only_owning_buyer_sees_candidates_with_fare() -> None:
    _, order, offer = offer_flow()
    assert client.get(f"{BASE}/preorders/{order['id']}/offers", headers=BUYER_B).status_code == 403
    client.post(f"{BASE}/preorders/{order['id']}/offers/{offer['id']}/select", headers=BUYER)
    client.post(f"{BASE}/offers/{offer['id']}/pickup", headers=FARMER)
    [row] = client.get(f"{BASE}/preorders/{order['id']}/offers", headers=BUYER).json()
    assert row["pickup"]["fare_mmk"] > 0


def test_outlook_route_answers() -> None:
    post_listing()
    response = client.get(
        f"{BASE}/outlook",
        params={"town": "Hmawbi", "produce": "tomato", "on": READY},
        headers=FARMER,
    )
    assert response.status_code == 200
    assert response.json()["level"] == "no-buyers"


def test_bad_body_is_422() -> None:
    assert post_listing(kg=0).status_code == 422


def test_coop_registers_farmer_who_claims_from_a_phone_without_account() -> None:
    body = {
        "kind": "household",
        "name": "Daw Hla's family",
        "lat": 17.2,
        "lon": 96.1,
        "township": "Hmawbi",
        "crops": [{"produce": "tomato", "area_ha": 1.0, "harvest_month": 3}],
        "consent": {"by": "Co-op", "read_aloud": True, "text_version": "v1"},
        "on_behalf": True,
    }
    made = client.post(f"{BASE}/producers", json=body, headers=BUYER)
    assert made.status_code == 201
    created = made.json()
    again = client.post(f"{BASE}/producers", json=body, headers=BUYER)
    assert again.status_code == 409
    assert again.json()["detail"]["profile"]["name"] == "Daw Hla's family"
    claimed = client.post(
        f"{BASE}/producers/{created['id']}/claim",
        json={"code": created["claim_code"], "pin": "4321"},
    )
    phone = {"X-AgriQuill-Producer-Token": claimed.json()["device_token"]}
    listing = {
        "produce": "tomato",
        "qty_kg": 200,
        "ready_on": READY,
        "town": "Hmawbi",
        "lat": 17.2,
        "lon": 96.1,
    }
    posted = client.post(
        f"{BASE}/listings", json={**listing, "producer_id": created["id"]}, headers=phone
    )
    assert posted.status_code == 201
    bad = client.post(
        f"{BASE}/listings", json=listing, headers={"X-AgriQuill-Producer-Token": "nope"}
    )
    assert bad.status_code == 401


def test_dev_token_gets_every_role() -> None:
    dev = token(9, "Lead", role="dev")
    assert post_listing(dev).status_code == 201
    assert post_preorder(dev).status_code == 201


def test_manager_access_code_is_dev_and_can_buy() -> None:
    settings = get_settings()
    saved = settings.users
    settings.users = SecretStr("Lead:CODE-1:manager,crew")
    try:
        code = {"X-AgriQuill-Write-Token": "CODE-1"}
        assert post_preorder(code).status_code == 201
        assert post_listing(code).status_code == 201
    finally:
        settings.users = saved


def test_buyer_sees_only_their_own_preorders_with_offer_counts() -> None:
    _, order, _ = offer_flow()
    post_preorder(BUYER_B)
    mine = client.get(f"{BASE}/preorders/mine", headers=BUYER).json()
    assert [p["id"] for p in mine] == [order["id"]]
    assert mine[0]["offers"] == 1
    assert client.get(f"{BASE}/preorders/mine", headers=FARMER).status_code == 403


def test_buyer_sees_farm_location_only_after_selecting() -> None:
    _, order, offer = offer_flow()
    [row] = client.get(f"{BASE}/preorders/{order['id']}/offers", headers=BUYER).json()
    assert "farm_lat" not in row
    client.post(f"{BASE}/preorders/{order['id']}/offers/{offer['id']}/select", headers=BUYER)
    [chosen] = client.get(f"{BASE}/preorders/{order['id']}/offers", headers=BUYER).json()
    assert chosen["farm_lat"] == 17.1 and chosen["farm_lon"] == 96.05


def test_dev_without_buyer_kind_registers_a_self_owned_profile_and_pin_gate_works() -> None:
    dev = token(9, "Lead", role="dev")
    body = {
        "kind": "individual",
        "name": "Ko Aung",
        "lat": 17.4,
        "lon": 96.3,
        "pin": "4321",
        "crops": [{"produce": "onion", "harvest_month": 4}],
    }
    made = client.post(f"{BASE}/producers", json=body, headers=dev)
    assert made.status_code == 201, made.text
    created = made.json()
    assert created["owner"] is not None and created["manager"] is None and created["has_pin"]
    assert (
        client.post(
            f"{BASE}/producers/{created['id']}/pin", json={"pin": "4321"}, headers=dev
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"{BASE}/producers/{created['id']}/pin", json={"pin": "0000"}, headers=dev
        ).status_code
        == 403
    )


def test_registering_for_someone_else_needs_the_explicit_flag_and_consent() -> None:
    dev = token(9, "Lead", role="dev")
    body = {
        "kind": "individual",
        "name": "Ko Aung",
        "lat": 17.5,
        "lon": 96.4,
        "crops": [{"produce": "onion", "harvest_month": 4}],
        "on_behalf": True,
    }
    assert client.post(f"{BASE}/producers", json=body, headers=dev).status_code == 422
    assert (
        client.post(
            f"{BASE}/producers", json={**body, "on_behalf": False}, headers=BUYER
        ).status_code
        == 403
    )


def select_offer(order, offer) -> None:
    client.post(f"{BASE}/preorders/{order['id']}/offers/{offer['id']}/select", headers=BUYER)


def test_trip_409_before_selection_200_after_without_fares() -> None:
    _, order, offer = offer_flow()
    assert client.get(f"{BASE}/offers/{offer['id']}/trip", headers=FARMER).status_code == 409
    select_offer(order, offer)
    assert client.get(f"{BASE}/offers/{offer['id']}/trip", headers=FARMER_B).status_code == 403
    response = client.get(f"{BASE}/offers/{offer['id']}/trip", headers=FARMER)
    assert response.status_code == 200
    assert response.json()["vehicle"] == "three-wheeler"


def test_farmer_responses_have_no_fare_fields() -> None:
    _, order, offer = offer_flow()
    select_offer(order, offer)
    bodies = [
        client.get(f"{BASE}/offers/{offer['id']}/trip", headers=FARMER).text,
        client.post(f"{BASE}/offers/{offer['id']}/pickup", headers=FARMER).text,
        client.get(f"{BASE}/offers/mine", headers=FARMER).text,
    ]
    for text in bodies:
        for banned in ("fare", "share_mmk", "low_mmk", "high_mmk", "per_kg", "landed", "transport"):
            assert banned not in text.replace("price_offer_mmk_kg", "")


def test_candidates_carry_transport_range_and_landed_cost() -> None:
    listing = post_listing().json()
    body = {
        "produce": "tomato",
        "qty_kg": 400,
        "needed_by": READY,
        "town": "Hmawbi",
        "lat": 17.12,
        "lon": 96.07,
        "price_offer_mmk_kg": 1900,
    }
    order = client.post(f"{BASE}/preorders", json=body, headers=BUYER).json()
    client.post(
        f"{BASE}/preorders/{order['id']}/offers",
        json={"listing_id": listing["id"], "qty_kg": 400},
        headers=FARMER,
    )
    [row] = client.get(f"{BASE}/preorders/{order['id']}/offers", headers=BUYER).json()
    lows = [t["low_mmk"] for t in row["transport"]]
    assert lows == sorted(lows) or row["transport"][0]["fits"]
    first = row["transport"][0]
    assert row["landed_low"] == 1900 + first["low_per_kg"]
    assert row["landed_high"] == 1900 + first["high_per_kg"]
    assert row["landed_low"] < row["landed_high"]


def test_delivery_by_other_buyer_403_and_farmer_sees_received() -> None:
    _, order, offer = offer_flow()
    select_offer(order, offer)
    path = f"{BASE}/offers/{offer['id']}/delivery"
    payload = {"received_kg": 380, "rejected_kg": 20, "reason": "bruised"}
    assert client.post(path, json=payload, headers=BUYER_B).status_code == 403
    assert client.post(path, json=payload, headers=FARMER).status_code == 403
    assert client.post(path, json=payload, headers=BUYER).status_code == 200
    trip = client.get(f"{BASE}/offers/{offer['id']}/trip", headers=FARMER).json()
    assert trip["delivery"] == {"received_kg": 380, "rejected_kg": 20, "reason": "bruised"}
