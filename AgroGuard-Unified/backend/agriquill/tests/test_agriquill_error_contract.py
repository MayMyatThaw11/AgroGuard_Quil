from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import certificates
from agriquill.api.main import create_app, error_body
from agriquill.config import get_settings

client = TestClient(create_app(), raise_server_exceptions=False)
BASE = "/api/v1/agriquill"
FIELDS = {"code", "message", "status", "timestamp", "request_id", "detail"}


def test_every_error_carries_the_contract_and_keeps_detail():
    get_settings().users = SecretStr("Ann:code-a:crew,manager:farm_a")
    cases = [
        (client.get(f"{BASE}/farms/farm_b/certificates"), 401, "SIGN_IN_REQUIRED"),
        (
            client.get(
                f"{BASE}/farms/farm_b/certificates", headers={"X-AgriQuill-Write-Token": "code-a"}
            ),
            403,
            "FORBIDDEN",
        ),
        (client.get(f"{BASE}/no-such-route"), 404, "NOT_FOUND"),
        (
            client.post(
                f"{BASE}/farms/farm_a/certificates",
                json={},
                headers={"X-AgriQuill-Write-Token": "code-a"},
            ),
            422,
            "VALIDATION_FAILED",
        ),
    ]
    for r, status, code in cases:
        body = r.json()
        assert r.status_code == status and set(body) >= FIELDS, (status, body)
        assert body["code"] == code and body["status"] == status and body["detail"]
        assert r.headers["X-Request-ID"] == body["request_id"]


def test_a_contract_rejection_surfaces_its_first_agri_code():
    diags = [{"code": "AGRI-E034", "severity": "ERROR", "message": "cannot sell as organic"}]
    body = error_body(422, diags, "req-12345678")
    assert body["code"] == "AGRI-E034" and body["message"] == "cannot sell as organic"
    assert body["detail"] == diags


def test_a_caller_request_id_is_echoed_and_a_bad_one_is_replaced():
    good = client.get(f"{BASE}/no-such-route", headers={"X-Request-ID": "trace-abc-123"})
    assert good.json()["request_id"] == "trace-abc-123"
    bad = client.get(f"{BASE}/no-such-route", headers={"X-Request-ID": "<script>x</script>"})
    assert len(bad.json()["request_id"]) == 32 and "<" not in bad.json()["request_id"]


def test_a_crash_returns_the_contract_without_leaking_the_exception(monkeypatch):
    def boom(farm_id):
        raise RuntimeError("secret path C:/data")

    monkeypatch.setattr(certificates, "calendar", boom)
    r = client.get(f"{BASE}/farms/farm_a/certificates")
    assert r.status_code == 500 and r.json()["code"] == "INTERNAL_ERROR"
    assert "secret" not in r.text


def test_success_responses_also_carry_a_request_id():
    assert client.get("/health").headers["X-Request-ID"]
