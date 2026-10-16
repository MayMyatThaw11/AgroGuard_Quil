from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import store, telemetry
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.ledger import get_ledger

client = TestClient(create_app())
NOW = (datetime.now(UTC) - timedelta(minutes=1)).isoformat(timespec="seconds")
TTN = {
    "end_device_ids": {
        "device_id": "PD-02-tube",
        "application_ids": {"application_id": "delta-coop"},
        "dev_eui": "70B3D57ED0000001",
    },
    "received_at": NOW,
    "uplink_message": {
        "f_cnt": 42,
        "frm_payload": "AAA=",
        "decoded_payload": {"water_depth_cm": -9.0, "battery_v": 3.6},
        "received_at": NOW,
    },
}
CHIRPSTACK = {
    "deduplicationId": "3ac7e3c4-4401-4b8d-9386-a5c902f9202d",
    "time": NOW,
    "deviceInfo": {"devEui": "0101010101010101", "deviceName": "ws-01", "tenantName": "coop"},
    "fPort": 1,
    "data": "qg==",
    "object": {"wind_speed": 4.2, "temperature": 31.5, "humidity": 70},
}


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path, settings.telemetry_webhook_token
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.telemetry_webhook_token = SecretStr("field-secret")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path, settings.telemetry_webhook_token = saved


def post(path, body, token="field-secret"):
    headers = {"X-AgriQuill-Token": token} if token else {}
    return client.post(f"/api/v1/agriquill{path}", json=body, headers=headers)


def test_ttn_uplink_is_stored_and_ledgered():
    r = post("/telemetry/ttn", TTN)
    assert r.status_code == 200
    out = r.json()
    assert [s["metric"] for s in out["stored"]] == ["water_depth_cm", "battery_v"]
    assert out["rejected"] == []
    assert telemetry.latest("PD-02-tube", "water_depth_cm")["value"] == -9.0
    entries = get_ledger(get_settings().ledger_path).entries()
    assert entries[-1]["kind"] == "telemetry_ingested"


def test_chirpstack_uplink_maps_aliases():
    out = post("/telemetry/chirpstack?event=up", CHIRPSTACK).json()
    assert {s["metric"] for s in out["stored"]} == {"wind_ms", "temperature_c", "humidity_pct"}
    assert post("/telemetry/chirpstack?event=join", CHIRPSTACK).json() == {"ignored": "join"}


def test_token_missing_wrong_and_unset():
    assert post("/telemetry/ttn", TTN, token=None).status_code == 401
    assert post("/telemetry/ttn", TTN, token="nope").status_code == 401
    get_settings().telemetry_webhook_token = None
    assert post("/telemetry/ttn", TTN).status_code == 503


def test_out_of_range_and_bad_timestamps_rejected():
    out = telemetry.ingest("x", NOW, {"water_depth_cm": 80.0, "wind_ms": True}, "test")
    assert out["stored"] == [] and len(out["rejected"]) == 2
    with pytest.raises(telemetry.TelemetryError):
        telemetry.ingest("x", "2026-10-14T10:00:00", {"wind_ms": 2.0}, "test")
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    with pytest.raises(telemetry.TelemetryError):
        telemetry.ingest("x", future, {"wind_ms": 2.0}, "test")


def test_duplicate_uplink_is_idempotent():
    post("/telemetry/ttn", TTN)
    again = post("/telemetry/ttn", TTN).json()
    assert again["stored"] == []
    assert len(telemetry.series("PD-02-tube", "water_depth_cm")) == 1


def test_uplink_without_decoder_is_422():
    body = {**TTN, "uplink_message": {"frm_payload": "AAA="}}
    assert post("/telemetry/ttn", body).status_code == 422


def test_manual_reading_needs_a_reporter():
    body = {"device_id": "PD-02-tube", "observed_at": NOW, "values": {"water_depth_cm": -12}}
    assert client.post("/api/v1/agriquill/telemetry/readings", json=body).status_code == 422
    r = client.post("/api/v1/agriquill/telemetry/readings", json={**body, "reporter": "Daw Hla"})
    assert r.status_code == 200 and r.json()["stored"][0]["source"] == "manual"
    latest = client.get(
        "/api/v1/agriquill/telemetry/latest",
        params={"device_id": "PD-02-tube", "metric": "water_depth_cm"},
    ).json()
    assert latest["reading"]["reporter"] == "Daw Hla"


# test_agroguard_bridge_records_temperature_and_humidity was removed here
# during the unified-workspace reconciliation (2026-10-16): it exercised a
# direct in-process import from AgroGuard's `app` package
# (`app.services.observation._bridge_to_agriquill`), which only worked when
# both apps shared one Python process. With AgroGuard and AgriQill as two
# separate processes, that bridge is disabled and documented instead (see
# backend/agroguard/app/services/observation.py) rather than wired up —
# see docs/RECONCILIATION.md for the reasoning.
