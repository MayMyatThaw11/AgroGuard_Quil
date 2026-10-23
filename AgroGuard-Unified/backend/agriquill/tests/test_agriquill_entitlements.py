import base64
import hashlib
import hmac
import json
import time
from collections.abc import Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import entitlements, sim
from agriquill.api.main import create_app
from agriquill.config import get_settings

client = TestClient(create_app())
URL = "/api/v1/agriquill/sim/run"
BODY = {"parcel_id": "P1", "simulation_days": 30}
SECRET = "unit-test-secret"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def token(user_id: int = 7, secret: str = SECRET, exp: float | None = None) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    claims = {"sub": str(user_id), "exp": int(exp if exp is not None else time.time() + 600)}
    body = _b64(json.dumps(claims).encode())
    signature = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{_b64(signature)}"


def bearer(**kwargs) -> dict[str, str]:
    return {"Authorization": f"Bearer {token(**kwargs)}"}


class FakeAgroGuard:
    def __init__(self, status: int = 200, body: dict | None = None, fail: bool = False) -> None:
        self.status = status
        self.body = body or {}
        self.fail = fail
        self.calls: list[tuple[str, dict, dict]] = []

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None):
        self.calls.append((url, json, headers))
        if self.fail:
            raise httpx.ConnectError("down")
        return httpx.Response(self.status, json=self.body)


@pytest.fixture(autouse=True)
def unconfigured() -> Iterator[None]:
    settings = get_settings()
    saved = (
        settings.agroguard_url,
        settings.agroguard_jwt_secret,
        settings.agroguard_service_key,
    )
    settings.agroguard_url = None
    settings.agroguard_jwt_secret = None
    settings.agroguard_service_key = None
    yield
    (
        settings.agroguard_url,
        settings.agroguard_jwt_secret,
        settings.agroguard_service_key,
    ) = saved


@pytest.fixture
def configured() -> Iterator[None]:
    settings = get_settings()
    saved = (
        settings.agroguard_url,
        settings.agroguard_jwt_secret,
        settings.agroguard_service_key,
    )
    settings.agroguard_url = "http://agroguard.test"
    settings.agroguard_jwt_secret = SecretStr(SECRET)
    settings.agroguard_service_key = SecretStr("service-key")
    yield
    (
        settings.agroguard_url,
        settings.agroguard_jwt_secret,
        settings.agroguard_service_key,
    ) = saved


def fake(monkeypatch, **kwargs) -> FakeAgroGuard:
    agroguard = FakeAgroGuard(**kwargs)
    monkeypatch.setattr(entitlements.httpx, "AsyncClient", agroguard)
    return agroguard


def test_no_quota_when_unconfigured_in_development():
    assert client.post(URL, json=BODY).status_code == 202


def test_unconfigured_production_refuses_to_run():
    get_settings().environment = "production"
    get_settings().write_token = SecretStr("w")
    response = client.post(URL, json=BODY, headers={"X-AgriQuill-Write-Token": "w"})
    assert response.status_code == 503


def test_needs_a_sign_in_token(configured, monkeypatch):
    fake(monkeypatch)
    assert client.post(URL, json=BODY).status_code == 401
    forged = client.post(URL, json=BODY, headers=bearer(secret="other"))
    assert forged.status_code == 401
    expired = client.post(URL, json=BODY, headers=bearer(exp=time.time() - 5))
    assert expired.status_code == 401


def test_allowed_run_consumes_the_farm_with_the_service_key(configured, monkeypatch):
    agroguard = fake(monkeypatch)
    assert client.post(URL, json=BODY, headers=bearer()).status_code == 202
    url, payload, headers = agroguard.calls[0]
    assert url == "http://agroguard.test" + entitlements.CONSUME_PATH
    assert payload == {"user_id": 7, "parcel_id": "P1"}
    assert headers == {"X-Service-Key": "service-key"}


def test_limit_reached_returns_402_with_the_counts(configured, monkeypatch):
    detail = {"code": "farm_limit_reached", "farms_used": 3, "farms_limit": 3}
    fake(monkeypatch, status=402, body={"detail": detail})
    response = client.post(URL, json=BODY, headers=bearer())
    assert response.status_code == 402
    assert response.json()["detail"] == detail


def test_unreachable_agroguard_fails_closed_in_production(configured, monkeypatch):
    fake(monkeypatch, fail=True)
    get_settings().environment = "production"
    get_settings().write_token = SecretStr("w")
    headers = {**bearer(), "X-AgriQuill-Write-Token": "w"}
    assert client.post(URL, json=BODY, headers=headers).status_code == 503


def test_unreachable_agroguard_is_allowed_in_development(configured, monkeypatch):
    fake(monkeypatch, fail=True)
    assert client.post(URL, json=BODY, headers=bearer()).status_code == 202


def test_failed_simulation_gives_the_farm_back(configured, monkeypatch):
    agroguard = fake(monkeypatch)

    def boom(**kwargs):
        raise RuntimeError("model failed")

    monkeypatch.setattr(sim, "simulate", boom)
    failing = TestClient(create_app(), raise_server_exceptions=False)
    assert failing.post(URL, json=BODY, headers=bearer()).status_code == 500
    assert [call[0].rsplit("/", 1)[1] for call in agroguard.calls] == [
        "consume-farm",
        "release-farm",
    ]


@pytest.fixture
def sign_in_required() -> Iterator[None]:
    settings = get_settings()
    saved = settings.users
    settings.users = SecretStr("Admin:admin-code:crew,manager")
    yield
    settings.users = saved


def test_agroguard_token_signs_in_as_crew_without_a_farm_code(
    configured, sign_in_required, monkeypatch
):
    fake(monkeypatch)
    me = client.get("/api/v1/agriquill/auth/me", headers=bearer())
    assert me.status_code == 200
    assert me.json()["roles"] == ["crew"]
    assert me.json()["farms"] == []
    assert client.post(URL, json=BODY, headers=bearer()).status_code == 202


def test_agroguard_token_cannot_use_manager_routes_or_other_farms(
    configured, sign_in_required, monkeypatch
):
    fake(monkeypatch)
    assert client.get("/api/v1/agriquill/metrics", headers=bearer()).status_code == 403
    other = client.get("/api/v1/agriquill/farms/farm_private/overview", headers=bearer())
    assert other.status_code in (401, 403, 404)


def test_forged_or_unconfigured_agroguard_token_is_not_a_sign_in(
    configured, sign_in_required, monkeypatch
):
    fake(monkeypatch)
    forged = client.get("/api/v1/agriquill/auth/me", headers=bearer(secret="other"))
    assert forged.status_code == 401
    get_settings().agroguard_jwt_secret = None
    assert client.get("/api/v1/agriquill/auth/me", headers=bearer()).status_code == 401
