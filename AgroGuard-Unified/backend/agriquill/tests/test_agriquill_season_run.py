from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import live, season_run, store
from agriquill.api.main import create_app
from agriquill.config import get_settings
from tests.test_agriquill_season import inputs as season_inputs_fixture

client = TestClient(create_app())
ANN = {"X-AgriQuill-Write-Token": "code-a"}
URL = "/api/v1/agriquill/farms/farm_r/parcels/P1/season-run"
CONTRACT = """farm farm_r {
    name: "Run farm"
    country: MM
    location: [16.73, 94.77]
}

parcel P1 {
    area: 1 ha
    crop: "rice"
}
"""


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch) -> Iterator[list]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.users = SecretStr("Ann:code-a:crew,manager:farm_r")
    live.register("farm_r", CONTRACT, "Ann")
    calls: list = []

    def fake_inputs(farm_id, parcel_id, start, days):
        calls.append((farm_id, parcel_id, start, days))
        out = season_inputs_fixture(n=days, start=start)
        out["location_basis"] = "farm location: no parcel boundary drawn"
        return out

    monkeypatch.setattr(season_run, "site_inputs", fake_inputs)
    monkeypatch.setattr(season_run, "ENGINES", {"own": season_run.ENGINES["own"]})
    yield calls
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def body(**kw):
    base = {
        "transplant_date": "2025-07-01",
        "duration_days": 120,
        "seedbed_days": 0,
        "hills_per_m2": 25,
        "plants_per_hill": 3,
        "water": {"regime": "continuous", "awd_threshold_cm": None, "reflood_cm": 5},
        "bund_height_cm": 20,
        "trench": None,
        "fish": False,
        "percolation_mm_day": 2,
        "soil_n_kg_ha": 30,
        "events": [],
        "weather_years": [2024],
    }
    base.update(kw)
    return base


def test_same_plan_hits_cache(isolated):
    first = season_run.run("farm_r", "P1", body())
    second = season_run.run("farm_r", "P1", body())
    assert len(isolated) == 1
    assert first["plan_sha256"] == second["plan_sha256"]


def test_plan_dates_move_to_the_replay_year(isolated):
    out = season_run.run("farm_r", "P1", body(weather_years=[2023]))
    assert isolated[0][2] == date(2023, 7, 1)
    assert out["years"][0]["engines"]["own"]["days"][0]["date"] == "2023-07-01"


def test_one_engine_failing_keeps_others(monkeypatch):
    def boom(plan, inputs):
        raise RuntimeError("boom")

    monkeypatch.setitem(season_run.ENGINES, "broken", boom)
    out = season_run.run("farm_r", "P1", body())
    engines = out["years"][0]["engines"]
    assert engines["broken"] == {"status": "failed", "reason": "RuntimeError: boom"}
    assert engines["own"]["status"] == "uncalibrated"


def test_compare_skips_null_engines():
    def rows(value):
        return {"days": [{"date": "2025-07-01", "vars": {"lai": value}}], "status": "uncalibrated"}

    out = season_run.compare(
        {
            "a": rows({"value": 1.0, "unit": "m2/m2"}),
            "b": rows({"value": 3.0, "unit": "m2/m2"}),
            "c": rows({"value": None, "reason": "not modelled by c"}),
            "d": {"status": "failed", "reason": "x"},
        }
    )
    lai = out["days"][0]["vars"]["lai"]
    assert (lai["min"], lai["max"]) == (1.0, 3.0)
    assert lai["engines"] == {"a": 1.0, "b": 3.0, "c": None}


def test_spread_across_years_needs_two_years():
    out = season_run.run("farm_r", "P1", body(weather_years=[2023, 2024]))
    spread = out["spread"]["own"]["yield_kg_ha"]
    assert set(spread["years"]) == {"2023", "2024"}
    assert spread["min"] <= spread["max"]


def test_plan_rejects_bund_below_reflood():
    r = client.post(
        URL,
        json=body(bund_height_cm=8, water={"regime": "continuous", "reflood_cm": 10}),
        headers=ANN,
    )
    assert r.status_code == 422
    assert "bund_height_cm must exceed reflood_cm" in r.text


def test_plan_rejects_events_outside_the_season():
    late = {"kind": "irrigate", "date": "2026-03-01", "mm": 50}
    r = client.post(URL, json=body(events=[late]), headers=ANN)
    assert r.status_code == 422 and "outside the season" in r.text


def test_route_returns_uncalibrated_status_and_location_basis():
    r = client.post(URL, json=body(), headers=ANN)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "uncalibrated"
    assert out["comparison"] == "comparison only, no measured yields to score against"
    assert out["years"][0]["location_basis"] == "farm location: no parcel boundary drawn"


def test_season_run_without_boundary_uses_farm_location(isolated):
    season_run.run("farm_r", "P1", body())
    assert isolated[0][:2] == ("farm_r", "P1")


def test_unknown_parcel_is_404():
    r = client.post(
        "/api/v1/agriquill/farms/farm_r/parcels/NOPE/season-run", json=body(), headers=ANN
    )
    assert r.status_code == 404


def pid(**kw):
    return {"setpoint_cm": 8, "kp": 0.5, "ki": 0.05, "kd": 0, "max_mm_day": 60, **kw}


def test_pid_regime_needs_its_settings():
    r = client.post(URL, json=body(water={"regime": "pid", "reflood_cm": None}), headers=ANN)
    assert r.status_code == 422 and "pid" in r.text


def test_pid_setpoint_must_sit_below_the_bund():
    water = {"regime": "pid", "reflood_cm": None, "pid": pid(setpoint_cm=25)}
    r = client.post(URL, json=body(water=water, bund_height_cm=20), headers=ANN)
    assert r.status_code == 422 and "setpoint_cm must be below bund_height_cm" in r.text


def test_pid_plan_runs_through_the_route():
    water = {"regime": "pid", "reflood_cm": None, "pid": pid()}
    r = client.post(URL, json=body(water=water, bund_height_cm=20), headers=ANN)
    assert r.status_code == 200, r.text
    assert r.json()["years"][0]["plan"]["water"]["pid"]["setpoint_cm"] == 8


def test_a_run_with_a_failed_engine_is_not_cached(isolated, monkeypatch):
    def boom(plan, inputs):
        raise RuntimeError("soil service down")

    monkeypatch.setitem(season_run.ENGINES, "broken", boom)
    first = season_run.run("farm_r", "P1", body())
    second = season_run.run("farm_r", "P1", body())
    assert first["years"][0]["engines"]["broken"]["status"] == "failed"
    assert second["cached"] is False
    assert len(isolated) == 2


def test_a_season_run_needs_the_write_token():
    assert client.post(URL, json=body()).status_code in (401, 403)
