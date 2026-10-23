import json
import logging
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import certificates, obs
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.resilience import Breaker, CircuitOpen, guarded

client = TestClient(create_app(), raise_server_exceptions=False)
BASE = "/api/v1/agriquill"
CERTS = "/agriquill/farms/{farm_id}/certificates"
MANAGER = {"X-AgriQuill-Write-Token": "code-m"}
CREW = {"X-AgriQuill-Write-Token": "code-c"}


@pytest.fixture(autouse=True)
def fresh() -> None:
    obs.reset()
    get_settings().users = SecretStr("Mia:code-m:crew,manager;Cal:code-c:crew:farm_a")


def _route(method: str, route: str) -> dict:
    return next(r for r in obs.routes() if r["method"] == method and r["route"].endswith(route))


def test_each_request_is_counted_once_under_its_route_template(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("secret path C:/data")

    assert client.get(f"{BASE}/farms/farm_a/certificates", headers=CREW).status_code == 200
    assert client.get(f"{BASE}/farms/farm_b/certificates", headers=CREW).status_code == 403
    monkeypatch.setattr(certificates, "calendar", boom)
    assert client.get(f"{BASE}/farms/farm_a/certificates", headers=CREW).status_code == 500
    stats = _route("GET", CERTS)
    assert (stats["requests"], stats["errors_4xx"], stats["errors_5xx"]) == (3, 1, 1)
    assert sum(stats["buckets_ms"].values()) == 3
    assert all("farm_a" not in r["route"] and "farm_b" not in r["route"] for r in obs.routes())


def test_unknown_paths_share_one_bucket():
    for n in range(5):
        client.get(f"{BASE}/no-such-route-{n}")
    assert _route("GET", obs.UNMATCHED)["requests"] == 5


def test_the_log_line_has_the_template_and_no_token_body_or_name(caplog):
    body = {"name": "secret-body-value", "issued": "2026-01-01"}
    with caplog.at_level(logging.INFO, logger="agriquill.access"):
        client.post(
            f"{BASE}/farms/farm_a/certificates",
            json=body,
            headers={**MANAGER, "X-Request-ID": "trace-abc-123"},
        )
    lines = [r.getMessage() for r in caplog.records if r.name == "agriquill.access"]
    assert len(lines) == 1
    line = json.loads(lines[0])
    assert line["route"].endswith(CERTS) and line["method"] == "POST"
    assert line["request_id"] == "trace-abc-123" and line["farm_id"] == "farm_a"
    assert isinstance(line["status"], int) and line["duration_ms"] >= 0
    for leaked in ("code-m", "secret-body-value", "Mia", "Write-Token"):
        assert leaked not in lines[0]


def test_metrics_needs_the_manager_role():
    assert client.get(f"{BASE}/metrics").status_code == 401
    assert client.get(f"{BASE}/metrics", headers=CREW).status_code == 403
    r = client.get(f"{BASE}/metrics", headers=MANAGER)
    assert r.status_code == 200
    body = r.json()
    assert set(body) >= {"uptime_s", "routes", "outside_calls", "breakers", "cache"}
    assert body["breakers"]["gleam"]["state"] in {"closed", "open", "half-open"}
    if body["cache"] is None:
        assert body["cache_reason"] == "cache stats not available"


def test_percentiles_come_from_the_fixed_buckets():
    h = obs.Histogram()
    for ms in [3.0] * 50 + [40.0] * 45 + [900.0] * 4 + [20000.0]:
        h.add(ms)
    assert (h.percentile(0.5), h.percentile(0.95), h.percentile(0.99)) == (5.0, 50.0, 1000.0)
    assert h.percentile(1.0) == 20000.0
    assert obs.Histogram().percentile(0.5) is None
    one = obs.Histogram()
    one.add(7.0)
    assert one.percentile(0.99) == 7.0


def test_concurrent_requests_are_all_counted():
    with ThreadPoolExecutor(max_workers=16) as pool:
        codes = list(pool.map(lambda _: client.get("/health").status_code, range(200)))
    assert codes == [200] * 200
    assert _route("GET", "/health")["requests"] == 200


def test_route_table_stays_bounded():
    for n in range(obs.MAX_KEYS + 50):
        obs.record_request("GET", f"/r/{n}", 200, 1.0, "req-12345678")
    assert len(obs.routes()) == obs.MAX_KEYS + 1
    assert _route(obs.OVERFLOW, obs.OVERFLOW)["requests"] == 50


def test_outside_calls_are_timed_and_failures_logged_by_class(caplog):
    breaker = Breaker(threshold=1, cooldown_s=60.0, name="probe")
    assert guarded(breaker, lambda: "ok") == "ok"

    def down() -> str:
        raise httpx.ConnectError("token=abc in url")

    with caplog.at_level(logging.WARNING, logger="agriquill.outside"):
        with pytest.raises(httpx.ConnectError):
            guarded(breaker, down, attempts=1)
        with pytest.raises(CircuitOpen):
            guarded(breaker, lambda: "ok")
    assert obs.outside()["probe"]["calls"] == 3 and obs.outside()["probe"]["failures"] == 2
    lines = [json.loads(r.getMessage()) for r in caplog.records]
    assert [line["error"] for line in lines] == ["ConnectError", "CircuitOpen"]
    assert all("token" not in json.dumps(line) for line in lines)
    assert breaker.snapshot()["state"] == "open" and breaker.snapshot()["opened_at"]
