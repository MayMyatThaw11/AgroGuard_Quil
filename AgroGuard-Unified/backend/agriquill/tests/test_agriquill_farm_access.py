from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import jobs, live, store, telemetry
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.ledger import get_ledger

client = TestClient(create_app())
BASE = "/api/v1/agriquill"
DEMO = "farm_ayeyarwady_demo"
A, B = "farm_a", "farm_b"
ADMIN = {"X-AgriQuill-Write-Token": "admin-code"}
ANN = {"X-AgriQuill-Write-Token": "code-a"}
BEN = {"X-AgriQuill-Write-Token": "code-b"}
USERS = (
    "Admin:admin-code:crew,manager; Ann:code-a:crew,manager:farm_a; Ben:code-b:crew,manager:farm_b"
)


def contract_text(farm_id: str, tube: str | None = None) -> str:
    text = live.SITE_TEMPLATE.format(
        boundary="",
        farm_id=farm_id,
        name="Test farm",
        country="MM",
        lat=16.7,
        lon=95.6,
        osm="way/1",
        area=1.0,
        crop_id="rice_lowland",
        standard="",
    )
    return text.replace(f"{farm_id}-F-01-tube", tube) if tube else text


@pytest.fixture(autouse=True)
def two_farms(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path, settings.public_farms
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.public_farms = DEMO
    live.register(A, contract_text(A), "tester")
    live.register(B, contract_text(B), "tester")
    get_ledger(settings.ledger_path).append("sim_run", {"task_id": "t1"})
    get_ledger(settings.ledger_path).append("ops_plan", {"farm_id": DEMO})
    settings.users = SecretStr(USERS)
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path, settings.public_farms = saved


def add_proposal(farm_id: str) -> str:
    pid = f"prop_{farm_id}"
    row = {
        "proposal_id": pid,
        "farm_id": farm_id,
        "status": "proposed",
        "created_at": datetime.now(UTC).isoformat(),
        "patched_text": "secret contract text",
    }
    live._STORE.put("proposal", pid, row, f"agriquill:proposal/{pid}", pid, None)
    return pid


def denied(response, farm_id: str) -> bool:
    return response.status_code == 403 and farm_id in response.json()["detail"]


def test_auth_me_lists_the_farms_of_the_code():
    assert client.get(f"{BASE}/auth/me", headers=ANN).json()["farms"] == [A]
    assert client.get(f"{BASE}/auth/me", headers=ADMIN).json()["farms"] is None


def test_star_or_missing_farm_list_means_every_farm():
    get_settings().users = SecretStr(USERS.replace(":farm_b", ":*"))
    assert client.get(f"{BASE}/auth/me", headers=BEN).json()["farms"] is None
    assert client.get(f"{BASE}/contracts/{A}", headers=BEN).status_code == 200


def test_reads_of_another_farm_are_refused():
    for path in (f"contracts/{B}", f"contracts/{B}/monitoring", f"contracts/{B}/summary"):
        assert denied(client.get(f"{BASE}/{path}", headers=ANN), B), path
    assert denied(client.get(f"{BASE}/contracts/{B}/check", headers=ANN), B)
    assert denied(client.post(f"{BASE}/contracts/{B}/plan", headers=ANN), B)
    assert denied(client.get(f"{BASE}/proposals", params={"farm_id": B}, headers=ANN), B)
    assert client.get(f"{BASE}/contracts/{A}", headers=ANN).status_code == 200
    assert client.get(f"{BASE}/contracts/{B}").status_code == 401


def test_writes_to_another_farm_are_refused():
    put = {"text": contract_text(B), "registered_by": "Ann"}
    assert denied(client.put(f"{BASE}/contracts/{B}", json=put, headers=ANN), B)
    fresh = {"text": contract_text("farm_new"), "registered_by": "Ann"}
    assert denied(client.put(f"{BASE}/contracts/farm_new", json=fresh, headers=ANN), "farm_new")
    herd = {"id": "FISH-1", "kind": "fish", "count": 10, "added_by": "Ann"}
    assert denied(client.post(f"{BASE}/contracts/{B}/herds", json=herd, headers=ANN), B)
    assert denied(client.post(f"{BASE}/contracts/{B}/watch", headers=ANN), B)
    pid = add_proposal(B)
    decision = {"decision": "approved", "decided_by": "Ann"}
    r = client.post(f"{BASE}/proposals/{pid}/decision", json=decision, headers=ANN)
    assert denied(r, B)
    actuate = {"target": "drone", "wind_speed_ms": 1.0, "farm_id": B}
    assert denied(client.post(f"{BASE}/actuation/approve", json=actuate, headers=ANN), B)
    site = {
        "osm": "way/42",
        "name": "New site",
        "lat": 16.7,
        "lon": 95.6,
        "area_ha": 1.0,
        "country_iso2": "MM",
        "created_by": "Ann",
    }
    r = client.post(f"{BASE}/contracts/from-site", json=site, headers=ANN)
    assert denied(r, live.site_farm_id("way/42"))
    assert live.load(live.site_farm_id("way/42")) is None


def test_public_demo_farm_is_read_only_for_scoped_codes():
    assert client.get(f"{BASE}/contracts/{DEMO}", headers=ANN).status_code == 200
    put = {"text": live.load(DEMO)[0], "registered_by": "Ann"}
    assert denied(client.put(f"{BASE}/contracts/{DEMO}", json=put, headers=ANN), DEMO)


def test_lists_only_show_visible_farms():
    add_proposal(A)
    add_proposal(B)
    farms = {c["farm_id"] for c in client.get(f"{BASE}/contracts", headers=ANN).json()["contracts"]}
    assert farms == {A, DEMO}
    rows = client.get(f"{BASE}/proposals", headers=ANN).json()["proposals"]
    assert {r["farm_id"] for r in rows} == {A}
    everyone = client.get(f"{BASE}/contracts", headers=ADMIN).json()["contracts"]
    assert {A, B, DEMO} <= {c["farm_id"] for c in everyone}


def test_ledger_is_filtered_but_verified_over_the_whole_chain():
    chain = get_ledger(get_settings().ledger_path)
    full = client.get(f"{BASE}/ledger", headers=ADMIN).json()
    assert len(full["entries"]) == len(chain.entries())
    ann = client.get(f"{BASE}/ledger", headers=ANN).json()
    assert {e["payload"]["farm_id"] for e in ann["entries"]} == {A, DEMO}
    anonymous = client.get(f"{BASE}/ledger").json()
    assert {e["payload"].get("farm_id") for e in anonymous["entries"]} == {DEMO}
    assert anonymous["valid"] is True and anonymous["head"] == chain.head_hash()


def test_telemetry_is_scoped_by_the_farm_that_declares_the_sensor():
    stamp = (datetime.now(UTC) - timedelta(minutes=5)).isoformat(timespec="seconds")
    tube = f"{B}-F-01-tube"
    telemetry.ingest(tube, stamp, {"water_depth_cm": -4.0}, "manual", "Ben")
    telemetry.ingest("ws-01", stamp, {"wind_ms": 2.0}, "lorawan:ttn")
    query = {"device_id": tube, "metric": "water_depth_cm"}
    assert client.get(f"{BASE}/telemetry/latest", params=query, headers=ANN).status_code == 403
    assert client.get(f"{BASE}/telemetry/latest", params=query).status_code == 401
    found = client.get(f"{BASE}/telemetry/latest", params=query, headers=BEN).json()
    assert found["reading"]["value"] == -4.0
    demo = {"device_id": "ws-01", "metric": "wind_ms"}
    assert client.get(f"{BASE}/telemetry/latest", params=demo).status_code == 200
    reading = {"device_id": tube, "observed_at": stamp, "values": {"water_depth_cm": 1.0}}
    r = client.post(f"{BASE}/telemetry/readings", json={**reading, "reporter": "Ann"}, headers=ANN)
    assert r.status_code == 403


def test_job_status_drops_other_farms():
    run = {
        "run_id": "job_farm_access",
        "job": jobs.WATCH_JOB,
        "status": "COMPLETED",
        "result": {f: {"status": "OK", "proposals": 0} for f in (A, B, DEMO)},
    }
    jobs._RUNS[run["run_id"]] = run
    try:
        out = client.get(f"{BASE}/jobs/status/job_farm_access", headers=ANN).json()
        assert set(out["result"]) == {A, DEMO}
        assert set(client.get(f"{BASE}/jobs/status/job_farm_access").json()["result"]) == {DEMO}
    finally:
        jobs._RUNS.pop(run["run_id"])


def test_contract_cannot_claim_another_farms_sensor():
    stolen = contract_text("farm_c", tube=f"{B}-F-01-tube")
    r = client.put(
        f"{BASE}/contracts/farm_c", json={"text": stolen, "registered_by": "Admin"}, headers=ADMIN
    )
    assert r.status_code == 422
    assert any(d["code"] == "AGRI-E031" for d in r.json()["detail"])
    assert live.load("farm_c") is None
    assert live.register(B, contract_text(B), "tester")["farm_id"] == B


def test_anonymous_ledger_writes_need_a_code():
    sim = {"parcel_id": "P1", "simulation_days": 30}
    assert client.post(f"{BASE}/sim/run", json=sim).status_code == 401
    assert client.post(f"{BASE}/sim/run", json=sim, headers=ANN).status_code == 202


def test_open_mode_keeps_everything_open():
    get_settings().users = None
    farms = {c["farm_id"] for c in client.get(f"{BASE}/contracts").json()["contracts"]}
    assert {A, B, DEMO} <= farms
    assert client.get(f"{BASE}/contracts/{B}").status_code == 200
    chain = get_ledger(get_settings().ledger_path)
    assert len(client.get(f"{BASE}/ledger").json()["entries"]) == len(chain.entries())
    me = client.get(f"{BASE}/auth/me").json()
    assert me["farms"] is None and me["sign_in_required"] is False
