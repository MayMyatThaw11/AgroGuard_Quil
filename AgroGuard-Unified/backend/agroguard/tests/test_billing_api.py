"""Identity, plans and farm quota against a real PostgreSQL (`docker compose up -d postgres`).

Skips when the database is not reachable or not migrated to the users tables.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine
from app.main import app

pytestmark = pytest.mark.asyncio

KEY = {"X-Service-Key": "test-service-key"}


@pytest_asyncio.fixture
async def client(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "jwt_secret", SecretStr("test-jwt-secret"))
    monkeypatch.setattr(settings, "internal_service_key", SecretStr("test-service-key"))
    monkeypatch.setattr(settings, "billing_mode", "mock")
    monkeypatch.setattr(settings, "environment", "test")
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1 FROM simulated_farms LIMIT 1"))
    except Exception:
        pytest.skip("PostgreSQL with the users tables is not available")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http
    await engine.dispose()


async def _login(client, email):
    response = await client.post("/api/v1/auth/demo-login", json={"email": email})
    assert response.status_code == 200, response.text
    body = response.json()
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    reset = await client.post("/api/v1/admin/demo/reset", headers=headers)
    assert reset.status_code == 200
    return body["user_id"], headers


async def _consume(client, user_id, parcel):
    return await client.post(
        "/api/v1/internal/entitlements/consume-farm",
        json={"user_id": user_id, "parcel_id": parcel},
        headers=KEY,
    )


async def test_me_needs_a_valid_token(client):
    assert (await client.get("/api/v1/me")).status_code == 401
    bad = {"Authorization": "Bearer a.b.c"}
    assert (await client.get("/api/v1/me", headers=bad)).status_code == 401
    _, headers = await _login(client, "free@demo.com")
    tampered = {"Authorization": headers["Authorization"][:-2] + "xx"}
    assert (await client.get("/api/v1/me", headers=tampered)).status_code == 401
    me = await client.get("/api/v1/me", headers=headers)
    assert me.json()["email"] == "free@demo.com"


async def test_demo_login_only_accepts_the_two_demo_users(client):
    response = await client.post("/api/v1/auth/demo-login", json={"email": "x@example.com"})
    assert response.status_code == 400


async def test_demo_login_is_off_in_production(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "environment", "production")
    response = await client.post("/api/v1/auth/demo-login", json={"email": "free@demo.com"})
    assert response.status_code == 404


async def test_free_user_gets_three_different_farms(client):
    user_id, headers = await _login(client, "free@demo.com")
    start = (await client.get("/api/v1/me/entitlements", headers=headers)).json()
    assert start["plan"] == "free" and start["farms_limit"] == 3 and start["farms_left"] == 3
    for parcel in ("a", "b", "c"):
        assert (await _consume(client, user_id, parcel)).status_code == 200
    again = await _consume(client, user_id, "a")
    assert again.status_code == 200 and again.json()["entitlements"]["farms_used"] == 3
    blocked = await _consume(client, user_id, "d")
    assert blocked.status_code == 402
    assert blocked.json()["detail"]["code"] == "farm_limit_reached"
    after = (await client.get("/api/v1/me/entitlements", headers=headers)).json()
    assert after["farms_used"] == 3 and after["farms_left"] == 0


async def test_release_gives_the_farm_back(client):
    user_id, _ = await _login(client, "free@demo.com")
    for parcel in ("a", "b", "c"):
        await _consume(client, user_id, parcel)
    release = await client.post(
        "/api/v1/internal/entitlements/release-farm",
        json={"user_id": user_id, "parcel_id": "c"},
        headers=KEY,
    )
    assert release.json()["farms_used"] == 2
    assert (await _consume(client, user_id, "d")).status_code == 200


async def test_pro_user_has_no_limit(client):
    user_id, headers = await _login(client, "pro@demo.com")
    for index in range(5):
        assert (await _consume(client, user_id, f"p{index}")).status_code == 200
    state = (await client.get("/api/v1/me/entitlements", headers=headers)).json()
    assert state["plan"] == "pro" and state["farms_limit"] is None


async def test_internal_routes_need_the_service_key(client):
    user_id, _ = await _login(client, "free@demo.com")
    body = {"user_id": user_id, "parcel_id": "a"}
    url = "/api/v1/internal/entitlements/consume-farm"
    assert (await client.post(url, json=body)).status_code == 401
    assert (await client.post(url, json=body, headers={"X-Service-Key": "nope"})).status_code == 401


async def test_checkout_upgrades_and_cancel_downgrades(client):
    _, headers = await _login(client, "free@demo.com")
    card = {"card_number": "4242 4242 4242 4242", "exp_month": 12, "exp_year": 2099, "cvc": "123"}
    paid = await client.post("/api/v1/billing/mock-checkout", json=card, headers=headers)
    assert paid.status_code == 200
    assert paid.json()["card_last4"] == "4242"
    assert paid.json()["entitlements"]["plan"] == "pro"
    cancelled = await client.post("/api/v1/billing/cancel", headers=headers)
    assert cancelled.json()["plan"] == "free"


async def test_checkout_rejects_declined_bad_and_real_cards(client):
    user_id, headers = await _login(client, "free@demo.com")
    base = {"exp_month": 12, "exp_year": 2099, "cvc": "123"}
    url = "/api/v1/billing/mock-checkout"
    declined = await client.post(
        url,
        json={**base, "card_number": "4000000000000002"},
        headers=headers,
    )
    assert declined.status_code == 402
    luhn = await client.post(
        url,
        json={**base, "card_number": "4242424242424241"},
        headers=headers,
    )
    assert luhn.status_code == 422
    other = await client.post(
        url,
        json={**base, "card_number": "5555555555554444"},
        headers=headers,
    )
    assert other.status_code == 422
    expired = await client.post(
        url,
        json={"card_number": "4242424242424242", "exp_month": 1, "exp_year": 2020, "cvc": "123"},
        headers=headers,
    )
    assert expired.status_code == 422
    state = (await client.get("/api/v1/me/entitlements", headers=headers)).json()
    assert state["plan"] == "free"
    async with engine.connect() as connection:
        columns = await connection.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = 'payments'")
        )
        assert not {"card_number", "cvc"} & {row[0] for row in columns}


async def test_checkout_is_off_unless_billing_mode_is_mock(client, monkeypatch):
    _, headers = await _login(client, "free@demo.com")
    monkeypatch.setattr(get_settings(), "billing_mode", "off")
    card = {"card_number": "4242424242424242", "exp_month": 12, "exp_year": 2099, "cvc": "123"}
    response = await client.post("/api/v1/billing/mock-checkout", json=card, headers=headers)
    assert response.status_code == 404


async def test_downgrade_keeps_tried_farms_and_blocks_new_ones(client):
    user_id, headers = await _login(client, "pro@demo.com")
    for index in range(5):
        assert (await _consume(client, user_id, f"p{index}")).status_code == 200
    cancelled = await client.post("/api/v1/billing/cancel", headers=headers)
    assert cancelled.json()["plan"] == "free"
    assert cancelled.json()["farms_used"] == 5
    assert cancelled.json()["farms_left"] == 0
    assert (await _consume(client, user_id, "p0")).status_code == 200
    assert (await _consume(client, user_id, "new")).status_code == 402
