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
