"""Wave 0 safety and security fixes (BUILD_PLAN_BACKEND.md section 4).

B-W0-2 auth fails closed, B-W0-3 declared devices only, B-W0-4 approval rate limits,
B-W0-5 the MCP agent can never finish an actuation, B-W0-6 only the server approval
path can reach a machine command.
"""

import inspect
import re
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import safety, store, telemetry
from agriquill.api.main import create_app, require_sign_in_configured
from agriquill.api.main import router as agriquill_router
from agriquill.config import Settings, get_settings
from agriquill.mcp import tools

BASE = "/api/v1/agriquill"
DEMO = "farm_ayeyarwady_demo"
MANAGER = {"X-AgriQuill-Write-Token": "mgr-code"}
BUILTIN_CODE = {"X-AgriQuill-Write-Token": "FARMSIM-2026"}
SETTINGS_TO_RESTORE = (
    "environment",
    "users",
    "write_token",
    "builtin_user",
    "telemetry_webhook_token",
    "telemetry_ttn_token",
    "telemetry_chirpstack_token",
    "approvals_per_minute_per_caller",
    "approvals_per_minute_global",
    "pin_failures_per_caller",
    "data_dir",
    "ledger_path",
)


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = {name: getattr(settings, name) for name in SETTINGS_TO_RESTORE}
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    yield
    store.close_all()
    for name, value in saved.items():
        setattr(settings, name, value)


client = TestClient(create_app())


def _now(minutes_ago: int = 1) -> str:
    return (datetime.now(UTC) - timedelta(minutes=minutes_ago)).isoformat(timespec="seconds")


# ── B-W0-2: auth fails closed ────────────────────────────────────────────────


def test_the_server_default_is_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGRIQUILL_ENVIRONMENT", raising=False)
    assert Settings.model_fields["environment"].default == "production"
    assert Settings(environment="development").is_development
    assert not Settings(_env_file=None).is_development


def test_blank_settings_count_as_not_set(monkeypatch: pytest.MonkeyPatch) -> None:
    # .env.example ships "AGRIQUILL_WRITE_TOKEN=" and "AGRIQUILL_USERS=": a blank value
    # must not look like a configured token, or production would start with no sign-in.
    monkeypatch.setenv("AGRIQUILL_WRITE_TOKEN", "")
    monkeypatch.setenv("AGRIQUILL_USERS", "")
    settings = Settings(_env_file=None)
    assert settings.write_token is None and settings.users is None
    settings.builtin_user = None
    with pytest.raises(RuntimeError, match="no sign-in is configured"):
        require_sign_in_configured(settings)


def test_production_without_any_sign_in_refuses_to_start() -> None:
    settings = get_settings()
    settings.environment = "production"
    settings.users = settings.write_token = None
    settings.builtin_user = SecretStr("Farm Manager:FARMSIM-2026:manager,crew:*")
    with pytest.raises(RuntimeError, match="no sign-in is configured"), TestClient(create_app()):
        pass


def test_production_with_users_starts() -> None:
    settings = get_settings()
    settings.environment = "production"
    settings.users = SecretStr("Mgr:mgr-code:crew,manager")
    require_sign_in_configured(settings)
    with TestClient(create_app()) as started:
        assert started.get(f"{BASE}/health").status_code == 200


def test_development_without_sign_in_still_starts_open() -> None:
    settings = get_settings()
    settings.environment = "development"
    settings.users = settings.write_token = settings.builtin_user = None
    require_sign_in_configured(settings)
    assert client.get(f"{BASE}/auth/me").status_code == 200


def test_the_built_in_demo_code_only_works_in_development() -> None:
    settings = get_settings()
    settings.users = SecretStr("Mgr:mgr-code:crew,manager")
    settings.builtin_user = SecretStr("Farm Manager:FARMSIM-2026:manager,crew:*")
    settings.environment = "development"
    assert client.get(f"{BASE}/auth/me", headers=BUILTIN_CODE).status_code == 200
    settings.environment = "production"
    assert client.get(f"{BASE}/auth/me", headers=BUILTIN_CODE).status_code == 401
    assert client.get(f"{BASE}/auth/me", headers=MANAGER).status_code == 200


def test_a_runtime_change_cannot_reopen_a_production_api() -> None:
    settings = get_settings()
    settings.environment = "production"
    settings.users = settings.write_token = settings.builtin_user = None
    res = client.get(f"{BASE}/auth/me")
    assert res.status_code == 503


# ── B-W0-3: only declared devices, one webhook token per network ─────────────


TTN = {
    "end_device_ids": {"device_id": "PD-02-tube"},
    "received_at": _now(),
    "uplink_message": {"decoded_payload": {"water_depth_cm": -9.0}},
}


def _ttn(device: str) -> dict:
    return {**TTN, "end_device_ids": {"device_id": device}, "received_at": _now()}


def test_a_forged_device_id_on_a_webhook_gets_403() -> None:
    get_settings().telemetry_webhook_token = SecretStr("field-secret")
    headers = {"X-AgriQuill-Token": "field-secret"}
    forged = client.post(f"{BASE}/telemetry/ttn", json=_ttn("forged-sensor-99"), headers=headers)
    assert forged.status_code == 403
    assert "not declared" in forged.json()["detail"]
    assert telemetry.latest("forged-sensor-99", "water_depth_cm") is None
    real = client.post(f"{BASE}/telemetry/ttn", json=_ttn("PD-02-tube"), headers=headers)
    assert real.status_code == 200


def test_each_network_has_its_own_webhook_token() -> None:
    settings = get_settings()
    settings.telemetry_webhook_token = None
    settings.telemetry_ttn_token = SecretStr("ttn-secret")
    settings.telemetry_chirpstack_token = SecretStr("chirp-secret")
    post = client.post
    ok = post(
        f"{BASE}/telemetry/ttn",
        json=_ttn("PD-02-tube"),
        headers={"X-AgriQuill-Token": "ttn-secret"},
    )
    assert ok.status_code == 200
    crossed = post(
        f"{BASE}/telemetry/ttn",
        json=_ttn("PD-02-tube"),
        headers={"X-AgriQuill-Token": "chirp-secret"},
    )
    assert crossed.status_code == 401


def test_the_shared_webhook_token_still_covers_a_network_with_no_token_of_its_own() -> None:
    settings = get_settings()
    settings.telemetry_webhook_token = SecretStr("shared")
    settings.telemetry_ttn_token = None
    res = client.post(
        f"{BASE}/telemetry/ttn", json=_ttn("PD-02-tube"), headers={"X-AgriQuill-Token": "shared"}
    )
    assert res.status_code == 200


def _reading(device: str, reporter: str) -> dict:
    return {
        "device_id": device,
        "observed_at": _now(),
        "values": {"water_depth_cm": -8.0},
        "reporter": reporter,
    }


def test_an_all_farms_crew_code_cannot_invent_a_sensor() -> None:
    get_settings().users = SecretStr("Mgr:mgr-code:crew,manager")
    forged = client.post(
        f"{BASE}/telemetry/readings", json=_reading("made-up-7", "Mgr"), headers=MANAGER
    )
    assert forged.status_code == 403
    real = client.post(
        f"{BASE}/telemetry/readings", json=_reading("PD-02-tube", "Mgr"), headers=MANAGER
    )
    assert real.status_code == 200


def test_only_the_bridge_user_may_report_agroguard_sensors() -> None:
    get_settings().users = SecretStr(
        "agroguard-bridge:bridge-code:crew:*;Mgr:mgr-code:crew,manager"
    )
    bridge = {"X-AgriQuill-Write-Token": "bridge-code"}
    own = client.post(
        f"{BASE}/telemetry/readings",
        json=_reading("agroguard:dev-1", "agroguard-bridge"),
        headers=bridge,
    )
    assert own.status_code == 200
    other = client.post(
        f"{BASE}/telemetry/readings", json=_reading("agroguard:dev-1", "Mgr"), headers=MANAGER
    )
    assert other.status_code == 403
    off_prefix = client.post(
        f"{BASE}/telemetry/readings",
        json=_reading("random-device", "agroguard-bridge"),
        headers=bridge,
    )
    assert off_prefix.status_code == 403


# ── B-W0-4: approval rate limits ─────────────────────────────────────────────


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    fake = Clock()
    monkeypatch.setattr(safety, "_clock", fake)
    get_settings().users = SecretStr("Mgr:mgr-code:crew,manager;Ana:ana-code:crew,manager")
    return fake


VALVE = {"target": "irrigation_valve", "requested_minutes": 30}


def _phase_a(headers: dict = MANAGER) -> object:
    return client.post(f"{BASE}/actuation/approve", json=VALVE, headers=headers)


def _phase_b(token: str, pin: str, headers: dict = MANAGER) -> object:
    body = {**VALVE, "operator_confirmed": True, "challenge_token": token, "approval_pin": pin}
    return client.post(f"{BASE}/actuation/approve", json=body, headers=headers)


def test_the_sixth_wrong_pin_in_ten_minutes_gets_429(clock: Clock) -> None:
    for _ in range(5):
        a = _phase_a().json()
        assert a["status"] == "PENDING_APPROVAL"
        b = _phase_b(a["challenge_token"], "0000").json()
        assert b["failure"]["code"] == "REJECTED_PIN_MISMATCH"
        clock.advance(61)  # stay clear of the per-minute token limit
    a = _phase_a().json()
    blocked = _phase_b(a["challenge_token"], "1234")  # even the right PIN is refused now
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "60"


def test_the_pin_lockout_ends_after_the_window(clock: Clock) -> None:
    for _ in range(5):
        a = _phase_a().json()
        _phase_b(a["challenge_token"], "0000")
        clock.advance(61)
    clock.advance(safety.get_settings().pin_failure_window_s)
    a = _phase_a().json()
    ok = _phase_b(a["challenge_token"], "1234")
    assert ok.status_code == 200 and ok.json()["status"] == "PERMITTED"


def test_one_callers_wrong_pins_do_not_lock_out_another(clock: Clock) -> None:
    ana = {"X-AgriQuill-Write-Token": "ana-code"}
    for _ in range(5):
        a = _phase_a().json()
        _phase_b(a["challenge_token"], "0000")
        clock.advance(61)
    a = _phase_a(ana).json()
    ok = _phase_b(a["challenge_token"], "1234", ana)
    assert ok.status_code == 200 and ok.json()["status"] == "PERMITTED"


def test_the_sixth_approval_request_in_a_minute_gets_429(clock: Clock) -> None:
    assert all(_phase_a().status_code == 200 for _ in range(5))
    assert _phase_a().status_code == 429
    clock.advance(61)
    assert _phase_a().status_code == 200


def test_an_overall_limit_caps_many_callers_together(clock: Clock) -> None:
    get_settings().approvals_per_minute_global = 3
    ana = {"X-AgriQuill-Write-Token": "ana-code"}
    assert _phase_a().status_code == 200
    assert _phase_a(ana).status_code == 200
    assert _phase_a().status_code == 200
    assert _phase_a(ana).status_code == 429


def test_the_farm_limit_counts_across_callers(clock: Clock) -> None:
    ana = {"X-AgriQuill-Write-Token": "ana-code"}
    body = {**VALVE, "farm_id": DEMO}
    for i in range(5):
        who = MANAGER if i % 2 == 0 else ana
        assert client.post(f"{BASE}/actuation/approve", json=body, headers=who).status_code == 200
    assert client.post(f"{BASE}/actuation/approve", json=body, headers=ana).status_code == 429


# ── B-W0-5: the MCP agent can never finish an actuation ──────────────────────


def _token_rows() -> int:
    conn, lock = safety._tokens()
    with lock:
        return conn.execute("SELECT COUNT(*) FROM challenge_tokens").fetchone()[0]


def test_the_actuate_schema_has_no_pin_confirmation_or_token() -> None:
    schema = tools.TOOLS["lorawan_actuate"]["input_schema"]
    for field in ("approval_pin", "operator_confirmed", "challenge_token"):
        assert field not in schema["properties"]
    assert "approval_pin" not in schema["required"]
    assert schema["additionalProperties"] is False


@pytest.mark.parametrize(
    "field,value",
    [("approval_pin", "1234"), ("operator_confirmed", True), ("challenge_token", "t")],
)
def test_an_agent_that_passes_a_human_only_field_is_refused(field: str, value: object) -> None:
    with pytest.raises(ValueError, match="never an agent"):
        tools.lorawan_actuate(device_id="valve-1", command="open", **{field: value})


def test_actuate_is_phase_a_only_and_never_hands_out_a_token_or_a_downlink() -> None:
    before = _token_rows()
    out = tools.lorawan_actuate(device_id="valve-1", command="open", requested_minutes=30)
    assert out["status"] == "PENDING_APPROVAL"
    assert out["downlink"] is None
    assert "challenge_token" not in out
    assert "named person" in out["next_step"]
    assert _token_rows() == before


def test_actuate_still_runs_the_gates() -> None:
    out = tools.lorawan_actuate(
        device_id="valve-1", command="open", standard="ASEAN_ORGANIC_ASOA", requested_minutes=999
    )
    assert out["status"] == "REJECTED"
    assert out["failure"]["code"] == "REJECTED_DURATION_EXCEEDED"
    assert out["downlink"] is None


def test_the_guard_uses_the_higher_of_agent_and_on_site_wind() -> None:
    telemetry.ingest("ws-01", _now(2), {"wind_ms": 6.0}, "lorawan:ttn")
    out = tools.drone_spray_guard(2.0, DEMO)
    assert out["permitted"] is False and out["status"] == "REJECTED_WIND_EXCEEDED"
    assert out["wind_used"] == {"value_ms": 6.0, "source": "on-site anemometer"}
    assert out["wind_verified"] is True


def test_the_guard_still_halts_on_the_agents_own_higher_figure() -> None:
    telemetry.ingest("ws-01", _now(2), {"wind_ms": 3.0}, "lorawan:ttn")
    out = tools.drone_spray_guard(6.1, DEMO)
    assert out["permitted"] is False
    assert out["wind_used"]["source"] == "agent-supplied"


def test_the_guard_permits_when_both_winds_are_calm() -> None:
    telemetry.ingest("ws-01", _now(2), {"wind_ms": 3.0}, "lorawan:ttn")
    out = tools.drone_spray_guard(2.0, DEMO)
    assert out["permitted"] is True and out["wind_used"]["value_ms"] == 3.0


def test_the_guard_falls_back_to_todays_forecast_maximum(monkeypatch: pytest.MonkeyPatch) -> None:
    async def forecast(lat: float, lon: float) -> dict:
        return {"daily": [{"wind_speed_max_ms": 6.5}]}

    monkeypatch.setattr(tools, "fetch_weather", forecast)
    out = tools.drone_spray_guard(2.0, DEMO)  # no on-site reading in the isolated store
    assert out["permitted"] is False
    assert out["wind_used"]["source"] == "Open-Meteo forecast maximum today"


def test_a_farm_with_no_wind_source_is_rejected_not_trusted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def down(lat: float, lon: float) -> dict:
        raise RuntimeError("provider down")

    monkeypatch.setattr(tools, "fetch_weather", down)
    out = tools.drone_spray_guard(1.0, DEMO)
    assert out["permitted"] is False and out["status"] == "REJECTED_INVALID_TELEMETRY"
    assert tools.drone_spray_guard(1.0, "no_such_farm")["permitted"] is False


def test_without_a_farm_the_guard_checks_the_agent_figure_and_says_it_is_unverified() -> None:
    out = tools.drone_spray_guard(2.0)
    assert out["permitted"] is True and out["wind_verified"] is False
    assert tools.drone_spray_guard(5.6)["permitted"] is False


# ── B-W0-6: only the server approval path can reach a machine command ────────


PACKAGE = Path(__file__).resolve().parents[1] / "agriquill"


def test_only_the_approval_route_touches_the_actuation_gates() -> None:
    routes = [r for r in agriquill_router.routes if isinstance(r, APIRoute)]
    assert len(routes) > 50  # the whole API surface, not a stub
    touching = [
        r.path
        for r in routes
        if re.search(
            r"evaluate_actuation|lorawan_actuate|downlink|APPROVED_TRANSMITTED",
            inspect.getsource(r.endpoint),
        )
    ]
    assert touching == [f"{agriquill_router.prefix}/actuation/approve"]


def test_only_the_route_and_the_dry_run_tool_call_evaluate_actuation() -> None:
    calls = {}
    for path in PACKAGE.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        found = [m.start() for m in re.finditer(r"evaluate_actuation\(", text)]
        found = [i for i in found if not text[:i].rstrip().endswith("def")]
        if found:
            calls[path.relative_to(PACKAGE).as_posix()] = [text[i : i + 400] for i in found]
    assert set(calls) == {"api/main.py", "mcp/tools.py"}
    assert all("issue_token=False" in snippet for snippet in calls["mcp/tools.py"])


def test_no_agent_tool_can_report_a_downlink() -> None:
    for status_case in (
        {"requested_minutes": 30},
        {"requested_minutes": 999},
        {"standard": "ASEAN_ORGANIC_ASOA", "declared_inputs": ["glyphosate"]},
    ):
        out = tools.lorawan_actuate(device_id="valve-1", command="open", **status_case)
        assert out["downlink"] is None
        assert out["status"] != "APPROVED_TRANSMITTED"
