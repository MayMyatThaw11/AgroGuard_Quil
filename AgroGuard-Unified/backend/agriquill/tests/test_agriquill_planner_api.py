from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agriquill import planner_api, store
from agriquill.api.main import create_app
from agriquill.config import get_settings

BASE = "/api/v1/agriquill/planner"
client = TestClient(create_app())
DAYS = [{"date": f"2026-11-{d:02d}", "rain_mm": 0.0, "et0_mm": 5.0} for d in range(1, 15)]


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = get_settings()
    saved = (
        settings.data_dir,
        settings.ledger_path,
        settings.farm_market_enabled,
        settings.write_token,
    )
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.farm_market_enabled = True
    settings.write_token = None
    monkeypatch.setattr(planner_api, "_daily", lambda lat, lon: DAYS)
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path, settings.farm_market_enabled, settings.write_token = (
        saved
    )


def test_planner_is_404_when_the_market_switch_is_off() -> None:
    settings = get_settings()
    settings.farm_market_enabled = False
    assert client.get(f"{BASE}/catalogue").status_code == 404


def test_water_plan_shows_the_level_band_between_wet_and_dry_soil() -> None:
    res = client.get(
        f"{BASE}/water",
        params={"lat": 16.7, "lon": 95.6, "area_ha": 1.0, "soil": "clay", "depth_cm": 60},
    )
    assert res.status_code == 200
    body = res.json()
    wet, dry = body["runs"]["wet_soil"], body["runs"]["dry_soil"]
    assert len(wet) == 14 and wet[-1]["level_cm"] > dry[-1]["level_cm"]
    assert body["trench"]["share"] == pytest.approx(0.08, abs=0.005)
    assert body["status"].startswith("TO VERIFY")
    assert body["refill"]["m3"] > 0


def test_water_plan_names_the_first_date_below_the_refuge_minimum() -> None:
    res = client.get(
        f"{BASE}/water",
        params={
            "lat": 16.7,
            "lon": 95.6,
            "area_ha": 1.0,
            "soil": "sandy",
            "depth_cm": 60,
            "min_cm": 40,
        },
    )
    assert res.json()["first_below"]["date"] == "2026-11-04"


def test_pipeline_is_sized_only_when_a_source_distance_is_given() -> None:
    plain = client.get(f"{BASE}/water", params={"lat": 16.7, "lon": 95.6, "area_ha": 1.0}).json()
    assert "pipeline" not in plain
    piped = client.get(
        f"{BASE}/water",
        params={"lat": 16.7, "lon": 95.6, "area_ha": 1.0, "source_m": 120, "pump_l_s": 10},
    ).json()
    assert piped["pipeline"]["pipe"]["d_mm"] in {90, 110, 125}
    assert piped["pipeline"]["pump_kw"] > 0


def test_weather_outage_is_a_503_not_a_made_up_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    def down(lat: float, lon: float):
        raise LookupError("the weather service did not answer")

    monkeypatch.setattr(planner_api, "_daily", down)
    assert client.get(f"{BASE}/water", params={"lat": 1, "lon": 1, "area_ha": 1}).status_code == 503


def test_suggest_validates_the_farm_and_returns_ranked_systems() -> None:
    assert client.post(f"{BASE}/suggest", json={"area_ha": 20}).status_code == 422
    res = client.post(
        f"{BASE}/suggest", json={"area_ha": 1.2, "rice": True, "salinity_ppt": 0.4, "soil": "clay"}
    )
    assert res.status_code == 200
    assert {"rice_duck", "rice_fish"} <= {r["id"] for r in res.json()}


def test_catalogue_lists_species_with_their_status() -> None:
    body = client.get(f"{BASE}/catalogue").json()
    assert body["status"].startswith("TO VERIFY")
    assert {"nile_tilapia", "black_tiger", "pekin_duck"} <= {s["id"] for s in body["species"]}
