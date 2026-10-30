from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import safety, store, telemetry
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.mcp import tools

client = TestClient(create_app())
URL = "/api/v1/agriquill/actuation/approve"
DRONE = {"target": "drone", "declared_inputs": [], "parcel_standard": "ASEAN_ORGANIC_ASOA"}


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def test_confirmed_request_without_phase_a_token_is_rejected():
    out = safety.evaluate_actuation(
        "irrigation_valve",
        standard="ASEAN_ORGANIC_ASOA",
        approval_pin="1234",
        operator_confirmed=True,
        requested_minutes=30,
    )
    assert out["status"] == "REJECTED"
    assert out["failure"]["code"] == "REJECTED_TOKEN_MISSING"


def test_write_routes_need_the_farm_token_once_it_is_set():
    settings = get_settings()
    settings.write_token = SecretStr("farm-secret")
    try:
        url = "/api/v1/agriquill/proposals/prop_unknown/decision"
        body = {"decision": "approved", "decided_by": "Ko Aung"}
        assert client.post(url, json=body).status_code == 401
        wrong = {"X-AgriQuill-Write-Token": "guess"}
        assert client.post(url, json=body, headers=wrong).status_code == 401
        right = {"X-AgriQuill-Write-Token": "farm-secret"}
        assert client.post(url, json=body, headers=right).status_code == 404
        assert client.get("/api/v1/agriquill/proposals").status_code == 200
        sim = {"parcel_id": "P1", "simulation_days": 30}
        assert client.post("/api/v1/agriquill/sim/run", json=sim).status_code == 401
        assert client.post("/api/v1/agriquill/sim/run", json=sim, headers=right).status_code == 202
        assert client.post("/api/v1/agriquill/ops/plan", json={}).status_code == 401
    finally:
        settings.write_token = None


def test_named_users_act_under_their_own_name_and_role():
    settings = get_settings()
    settings.users = SecretStr("TestUser:test-code-1:crew,manager; Ko Ko:111:crew")
    try:
        decide = "/api/v1/agriquill/proposals/prop_unknown/decision"
        me = {"X-AgriQuill-Write-Token": "test-code-1"}
        crew = {"X-AgriQuill-Write-Token": "111"}
        named = {"decision": "approved", "decided_by": "TestUser"}
        assert client.post(decide, json=named, headers=me).status_code == 404
        other = client.post(decide, json={**named, "decided_by": "U Aung"}, headers=me)
        assert other.status_code == 403 and "TestUser" in other.json()["detail"]
        assert (
            client.post(decide, json={**named, "decided_by": "Ko Ko"}, headers=crew).status_code
            == 403
        )
        assert client.post(decide, json=named).status_code == 401
        stamp = datetime.now(UTC).isoformat(timespec="seconds")
        reading = {
            "device_id": "PD-02-tube",
            "observed_at": stamp,
            "values": {"water_depth_cm": -5.0},
            "reporter": "ko ko",
        }
        r = client.post("/api/v1/agriquill/telemetry/readings", json=reading, headers=crew)
        assert r.status_code == 200 and r.json()["stored"]
    finally:
        settings.users = None


def test_auth_me_reports_who_the_code_belongs_to():
    settings = get_settings()
    url = "/api/v1/agriquill/auth/me"
    open_mode = client.get(url)
    assert open_mode.status_code == 200 and open_mode.json()["sign_in_required"] is False
    settings.users = SecretStr("TestUser:abc123:crew,manager")
    try:
        right = client.get(url, headers={"X-AgriQuill-Write-Token": "abc123"})
        assert right.status_code == 200
        assert right.json() == {
            "name": "TestUser",
            "roles": ["buyer", "crew", "manager"],
            "farms": None,
            "sign_in_required": True,
        }
        assert client.get(url, headers={"X-AgriQuill-Write-Token": "nope"}).status_code == 401
        assert client.get(url).status_code == 401
    finally:
        settings.users = None


def test_malformed_users_setting_fails_closed():
    from agriquill.api.main import parse_users

    with pytest.raises(ValueError):
        parse_users("TestUser-test-code-1")
    with pytest.raises(ValueError):
        parse_users("A:1:crew:farm_a:extra")
    assert parse_users("A:1:crew,boss;") == [("A", "1", frozenset({"crew"}), None)]
    assert parse_users("A:1:crew:*") == [("A", "1", frozenset({"crew"}), None)]
    assert parse_users("A:1:manager:farm_a, farm_b") == [
        ("A", "1", frozenset({"manager"}), frozenset({"farm_a", "farm_b"}))
    ]
    settings = get_settings()
    settings.users = SecretStr("broken")
    try:
        url = "/api/v1/agriquill/proposals/prop_unknown/decision"
        body = {"decision": "approved", "decided_by": "A"}
        assert client.post(url, json=body).status_code == 500
    finally:
        settings.users = None


def _phase_b(pin: str) -> dict:
    token = safety.evaluate_actuation(
        "irrigation_valve", standard="ASEAN_ORGANIC_ASOA", requested_minutes=30
    )["challenge_token"]
    return safety.evaluate_actuation(
        "irrigation_valve",
        standard="ASEAN_ORGANIC_ASOA",
        requested_minutes=30,
        approval_pin=pin,
        operator_confirmed=True,
        challenge_token=token,
    )


def test_any_four_characters_are_not_a_pin():
    out = _phase_b("9999")
    assert out["status"] == "REJECTED"
    assert out["failure"]["code"] == "REJECTED_PIN_MISMATCH"


def test_no_configured_pin_blocks_phase_b():
    settings = get_settings()
    settings.actuation_pin = None
    out = _phase_b("1234")
    assert out["failure"]["code"] == "REJECTED_APPROVAL_NOT_CONFIGURED"


def test_full_two_phase_flow_and_single_use_token():
    a = safety.evaluate_actuation(
        "irrigation_valve", standard="ASEAN_ORGANIC_ASOA", requested_minutes=30
    )
    token = a["challenge_token"]
    b = safety.evaluate_actuation(
        "irrigation_valve",
        standard="ASEAN_ORGANIC_ASOA",
        requested_minutes=30,
        approval_pin="1234",
        operator_confirmed=True,
        challenge_token=token,
    )
    assert b["status"] == "PERMITTED"
    again = safety.evaluate_actuation(
        "irrigation_valve",
        standard="ASEAN_ORGANIC_ASOA",
        requested_minutes=30,
        approval_pin="1234",
        operator_confirmed=True,
        challenge_token=token,
    )
    assert again["failure"]["code"] == "REJECTED_TOKEN_ALREADY_USED"


def test_token_survives_a_new_connection_and_rejects_changed_payload():
    token = safety.evaluate_actuation(
        "irrigation_valve", standard="ASEAN_ORGANIC_ASOA", requested_minutes=30
    )["challenge_token"]
    store.close_all()
    out = safety.evaluate_actuation(
        "irrigation_valve",
        standard="ASEAN_ORGANIC_ASOA",
        requested_minutes=90,
        approval_pin="1234",
        operator_confirmed=True,
        challenge_token=token,
    )
    assert out["failure"]["code"] == "REJECTED_TOKEN_MISMATCH"


def test_live_anemometer_overrides_a_calm_request_at_transmission():
    now = (datetime.now(UTC) - timedelta(minutes=2)).isoformat(timespec="seconds")
    telemetry.ingest("ws-01", now, {"wind_ms": 7.2}, "lorawan:ttn")
    phase_a = client.post(
        URL, json={**DRONE, "wind_speed_ms": 2.0, "farm_id": "farm_ayeyarwady_demo"}
    ).json()
    assert phase_a["status"] == "REJECTED"
    assert phase_a["failure"]["code"] == "REJECTED_WIND_EXCEEDED"
    assert phase_a["wind_used"]["value_ms"] == 7.2


def test_mcp_lorawan_actuate_can_no_longer_complete_an_approval():
    # It used to take the PIN, the confirmation and the token from the agent, so an
    # agent that held a PIN could finish an actuation. Phase B now belongs to people.
    with pytest.raises(ValueError, match="never an agent"):
        tools.lorawan_actuate(
            device_id="valve-1",
            command="open",
            approval_pin="1234",
            operator_confirmed=True,
            challenge_token="tok_anything",
        )
    out = tools.lorawan_actuate(
        device_id="valve-1",
        command="open",
        standard="ASEAN_ORGANIC_ASOA",
        requested_minutes=30,
    )
    assert out["status"] == "PENDING_APPROVAL" and out["downlink"] is None
