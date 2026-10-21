from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from agriquill import twin
from agriquill.api.main import _TWIN_TASKS, create_app

client = TestClient(create_app())
BASE = "/api/v1/agriquill"
GOLDEN = json.loads((Path(__file__).parent / "data" / "twin_fixture_ts.json").read_text("utf-8"))


def _task(machine: str, farm: str, action: str, paddies: list[str]) -> dict:
    start = datetime(2026, 10, 12, 8, tzinfo=UTC)
    return {
        "machineId": machine,
        "farmId": farm,
        "action": action,
        "paddyIds": paddies,
        "startAt": start.isoformat(),
        "arriveAt": (start + timedelta(minutes=10)).isoformat(),
        "endAt": (start + timedelta(hours=1)).isoformat(),
    }


def setup_function() -> None:
    _TWIN_TASKS.clear()


def test_python_fixture_matches_the_typescript_fixture_draw_for_draw() -> None:
    built = twin.build_fixture(100, date.fromisoformat(GOLDEN["today"]))
    assert built["farms"] == GOLDEN["farms"]
    assert built["fleet"] == GOLDEN["fleet"]


def test_farms_and_fleet_endpoints_follow_the_adapter_contract() -> None:
    farms = client.get(f"{BASE}/farms").json()
    fleet = client.get(f"{BASE}/fleet").json()
    assert len(farms) == 100
    assert all(len(f["paddies"]) == 8 for f in farms)
    assert {m["kind"] for m in fleet} == set(twin.KINDS)
    assert all(m["farmId"] in {f["id"] for f in farms} for m in fleet)
    assert len(client.get(f"{BASE}/farms", params={"count": 10}).json()) == 10
    assert client.get(f"{BASE}/farms", params={"count": 0}).status_code == 422
    assert client.get(f"{BASE}/fleet", params={"count": 401}).status_code == 422


def test_single_farm_endpoint_returns_its_paddies_and_machines() -> None:
    farm = client.get(f"{BASE}/farms/FM-001").json()
    assert farm["name"] == "Maubin Delta Cooperative"
    assert len(farm["paddies"]) == 8
    assert {"D-01", "R-01", "T-01", "P-001"} <= {m["id"] for m in farm["machines"]}
    assert client.get(f"{BASE}/farms/FM-999").status_code == 404


def test_posted_tasks_are_recorded_as_simulated_and_never_actuate() -> None:
    body = [_task("D-01", "FM-001", "Scout & NDVI scan", ["PD-01", "PD-02"])]
    response = client.post(f"{BASE}/tasks", json=body)
    assert response.status_code == 200
    stored = response.json()[0]
    assert stored["simulated"] is True
    assert stored["status"] == "planned"
    assert stored["id"].startswith("TK-")
    ledger = client.get(f"{BASE}/ledger").json()
    last = ledger["entries"][-1]
    assert last["kind"] == "twin_tasks_recorded"
    assert last["payload"]["actuation_emitted"] is False


def test_tasks_since_filters_by_recorded_time() -> None:
    client.post(f"{BASE}/tasks", json=[_task("R-01", "FM-001", "Pest trap check", ["PD-03"])])
    assert len(client.get(f"{BASE}/tasks").json()) == 1
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    assert client.get(f"{BASE}/tasks", params={"since": future}).json() == []
    assert client.get(f"{BASE}/tasks", params={"since": "yesterday"}).status_code == 422


def test_invalid_tasks_reject_the_whole_batch_with_reasons() -> None:
    good = _task("D-01", "FM-001", "Scout & NDVI scan", ["PD-01"])
    bad_action = _task("D-01", "FM-001", "Till soil", ["PD-01"])
    bad_machine = _task("X-99", "FM-001", "Scout & NDVI scan", ["PD-01"])
    bad_paddy = _task("D-01", "FM-001", "Scout & NDVI scan", ["PD-99"])
    reversed_times = {**good, "startAt": good["endAt"], "endAt": good["startAt"]}
    response = client.post(
        f"{BASE}/tasks", json=[good, bad_action, bad_machine, bad_paddy, reversed_times]
    )
    assert response.status_code == 422
    messages = " | ".join(i["msg"] for i in response.json()["detail"])
    assert "not an action of a drone" in messages
    assert "not in /fleet" in messages
    assert "paddyIds" in messages
    assert "startAt <= arriveAt <= endAt" in messages
    assert client.get(f"{BASE}/tasks").json() == []
    assert client.post(f"{BASE}/tasks", json={"not": "a list"}).status_code == 422


def _decision(**overrides: object) -> dict:
    body = {
        "proposal_id": "AP-00001",
        "agent": "water",
        "farm_id": "FM-001",
        "paddy_ids": ["PD-01"],
        "title": "Re-flood 1 paddy to +5 cm",
        "action": "Flood to +5 cm",
        "decision": "approved",
        "decided_by": "Cooperative manager",
        "task_ids": ["TK-1"],
        "evidence": [
            {"label": "Lowest ahead", "value": "-16.2 cm", "source": "Water balance model"},
        ],
    }
    body.update(overrides)
    return body


def test_agent_decisions_are_recorded_in_the_ledger_and_never_actuate() -> None:
    res = client.post(f"{BASE}/agents/decisions", json=_decision())
    assert res.status_code == 200, res.text
    assert res.json()["recorded"] is True
    last = client.get(f"{BASE}/ledger").json()["entries"][-1]
    assert last["kind"] == "agent_decision"
    assert last["payload"]["decided_by"] == "Cooperative manager"
    assert last["payload"]["actuation_emitted"] is False


def test_agent_decisions_need_a_known_agent_a_decision_and_a_named_person() -> None:
    url = f"{BASE}/agents/decisions"
    assert client.post(url, json=_decision(agent="rogue")).status_code == 422
    assert client.post(url, json=_decision(decision="maybe")).status_code == 422
    assert client.post(url, json=_decision(decided_by="   ")).status_code == 422
    too_much = [{"label": "x", "value": "y", "source": "z"}] * 13
    assert client.post(url, json=_decision(evidence=too_much)).status_code == 422


def test_frontend_farm_sites_match_the_committed_snapshot() -> None:
    from agriquill.data import farm_sites

    target = (
        Path(__file__).resolve().parents[3] / "apps/agriquill-ide/src/lib/livetwin/farmSites.ts"
    )
    assert target.read_text("utf-8") == farm_sites.to_typescript()


def test_every_demo_farm_sits_on_a_mapped_field_of_its_town() -> None:
    from agriquill.data import farm_sites

    for farm in twin.fixture(twin.MAX_FARMS)["farms"]:
        osm = {s["osm"] for s in farm_sites.sites_for(farm["town"])}
        assert farm["site"]["osm"] in osm
