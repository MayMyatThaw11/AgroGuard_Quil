import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import live, rehearse, store, telemetry
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.ledger import get_ledger
from agriquill.mcp import server

client = TestClient(create_app())
FARM = "farm_ayeyarwady_demo"


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path, settings.telemetry_webhook_token
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.telemetry_webhook_token = SecretStr("t")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path, settings.telemetry_webhook_token = saved


def open_meteo(rain=0.0, et0=0.25, wind=2.0):
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) - timedelta(days=14)
    start = start.replace(hour=0)
    hours = 22 * 24
    times = [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(hours)]
    return {
        "timezone": "GMT",
        "utc_offset_seconds": 0,
        "elevation": 8.0,
        "hourly_units": {
            "time": "iso8601",
            "temperature_2m": "°C",
            "precipitation": "mm",
            "wind_speed_10m": "m/s",
        },
        "hourly": {
            "time": times,
            "temperature_2m": [30.0] * hours,
            "relative_humidity_2m": [65.0] * hours,
            "wet_bulb_temperature_2m": [25.0] * hours,
            "precipitation": [rain] * hours,
            "wind_speed_10m": [wind] * hours,
            "wind_gusts_10m": [wind * 1.5] * hours,
            "et0_fao_evapotranspiration": [et0 if 6 <= i % 24 <= 18 else 0.0 for i in range(hours)],
            "is_day": [1 if 6 <= i % 24 <= 18 else 0 for i in range(hours)],
        },
    }


def mock(body):
    def handler(request: httpx.Request) -> httpx.Response:
        if body is None:
            return httpx.Response(503)
        return httpx.Response(200, content=json.dumps(body).encode())

    return httpx.Client(transport=httpx.MockTransport(handler))


def tube(device, value, hours_ago=2):
    stamp = (datetime.now(UTC) - timedelta(hours=hours_ago)).isoformat(timespec="seconds")
    telemetry.ingest(device, stamp, {"water_depth_cm": value}, "manual", "tester")


def test_without_tube_readings_depth_is_null_with_reason():
    out = live.build_live(FARM, mock(open_meteo()))
    assert out["status"] == "OK"
    assert all(p.get("source") is None for p in out["paddies"])
    assert any("log one tube reading" in m["reason"] for m in out["missing"])
    assert out["weather"]["source"]["sha256"].startswith("sha256:")


def test_derived_depth_follows_water_balance():
    tube("PD-02-tube", -5.0, hours_ago=24)
    out = live.build_live(FARM, mock(open_meteo()))
    pd02 = next(p for p in out["paddies"] if p["id"] == "PD-02")
    assert pd02["source"] == "DERIVED"
    assert pd02["now"] < -5.0
    assert pd02["band"]["p50"] == sorted(pd02["band"]["p50"], reverse=True)
    assert pd02["method"]["percolation_mm_day"] == 3.0


def test_weather_outage_is_reported_not_invented():
    out = live.build_live(FARM, mock(None))
    assert out["status"] == "NO_WEATHER" and out["tasks"] == []


def test_watch_raises_proposal_and_decision_is_ledgered():
    tube("PD-02-tube", -14.0)
    result = live.watch(FARM, mock(open_meteo(et0=0.6)))
    reflood = [p for p in result["proposals"] if "PD-02" in p["text"]]
    assert reflood, [t["title"] for t in result["live"]["tasks"]]
    pid = reflood[0]["proposal_id"]
    assert live.watch(FARM, mock(open_meteo(et0=0.6)))["proposals"] == []
    r = client.post(
        f"/api/v1/agriquill/proposals/{pid}/decision",
        json={"decision": "approved", "decided_by": "U Aung"},
    )
    assert r.status_code == 200
    assert "actuation/approve" in r.json()["next_step"]
    again = client.post(
        f"/api/v1/agriquill/proposals/{pid}/decision",
        json={"decision": "approved", "decided_by": "U Aung"},
    )
    assert again.status_code == 409
    kinds = [e["kind"] for e in get_ledger(get_settings().ledger_path).entries()]
    assert "proposal" in kinds and "proposal_decided" in kinds


def test_reflood_proposal_is_rehearsed_sealed_and_scored_after_the_job():
    tube("PD-02-tube", -14.0)
    result = live.watch(FARM, mock(open_meteo(et0=0.6)))
    reflood = next(p for p in result["proposals"] if p["text"].startswith("Re-flood PD-02"))
    rehearsal = reflood["rehearsal"]
    assert rehearsal["branches"]["hold"]["days_below_floor"] > 0
    assert rehearsal["branches"]["act"]["first_breach_day"] is None
    assert rehearsal["water_m3"] > 0 and rehearsal["floor_cm"] == -15.0
    assert reflood["season"]["town"].startswith("Maubin")
    sealed = [
        e
        for e in get_ledger(get_settings().ledger_path).entries()
        if e["kind"] == "proposal" and e["payload"]["proposal_id"] == reflood["proposal_id"]
    ]
    assert sealed[0]["payload"]["rehearsal_sha256"] == rehearse.digest(rehearsal)

    live.decide(reflood["proposal_id"], "approved", "U Aung")
    stored = live.proposal(reflood["proposal_id"])
    done = datetime.now(UTC) - timedelta(hours=6, minutes=30)
    stored["schedule"] = {**stored["schedule"], "end": done.strftime("%Y-%m-%dT%H:00")}
    stored["rehearsal"] = {
        **rehearsal,
        "dates": [done.strftime("%Y-%m-%d"), *rehearsal["dates"][1:]],
    }
    pid = stored["proposal_id"]
    live._STORE.put("proposal", pid, stored, f"agriquill:proposal/{pid}", pid, None)
    assert live.score_outcomes(FARM) == []
    tube("PD-02-tube", 4.0, hours_ago=0)
    scored = live.score_outcomes(FARM)
    assert len(scored) == 1 and scored[0]["outcome"]["measured_cm"] == 4.0
    assert live.score_outcomes(FARM) == []
    kinds = [e["kind"] for e in get_ledger(get_settings().ledger_path).entries()]
    assert kinds.count("outcome") == 1
    summary = live.decisions(live.proposals(FARM))
    assert summary["scored"] == 1 and summary["mean_abs_error_cm"] is not None


def test_contract_change_makes_proposal_stale():
    tube("PD-02-tube", -14.0)
    pid = live.watch(FARM, mock(open_meteo(et0=0.6)))["proposals"][0]["proposal_id"]
    text = live.load(FARM)[0].replace("crew: 2", "crew: 3")
    live.register(FARM, text, "agronomist")
    with pytest.raises(live.ProposalConflict):
        live.decide(pid, "approved", "U Aung")


def test_measured_drawdown_proposes_percolation_patch():
    today = datetime.now(UTC).replace(hour=12, minute=0, second=0, microsecond=0)
    for day in range(1, 12):
        stamp = (today - timedelta(days=day)).isoformat()
        telemetry.ingest("PD-02-tube", stamp, {"water_depth_cm": 2.0 - (12 - day)}, "lorawan", None)
    result = live.watch(FARM, mock(open_meteo(et0=0.0)))
    patches = [p for p in result["proposals"] if p["agri_patch"]]
    assert patches and patches[0]["agri_patch"]["to"] == 10.0
    live.decide(patches[0]["proposal_id"], "approved", "Agronomist Mya")
    terms = live.load(FARM)[1]["contract"]["farm"]["terms"]
    assert terms["hydrology"]["percolation_mm_day"] == 10.0


def test_register_rejects_errors_and_wrong_farm():
    text = live.load(FARM)[0]
    r = client.put(
        f"/api/v1/agriquill/contracts/{FARM}", json={"text": text.replace("5.5 m/s", "8 m/s")}
    )
    assert r.status_code == 422
    r = client.put("/api/v1/agriquill/contracts/other_farm", json={"text": text})
    assert r.status_code == 422
    assert client.get(f"/api/v1/agriquill/contracts/{FARM}").json()["is_valid"] is True


def test_mcp_exposes_read_only_contract_tools():
    names = server.select_tools(False)
    assert "contract_verify" in names and "ops_plan_live_preview" in names
    assert not any("watch" in n or "decision" in n for n in names)
    assert "proposal_rehearsal" in names and "rehearsal_outcomes" in names
