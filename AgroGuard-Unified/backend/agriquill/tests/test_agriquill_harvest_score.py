from typing import Any

import pytest

from agriquill import cropvalue, harvest_score, modelcard, season_run
from tests.test_agriquill_harvests import (  # noqa: F401
    ANN,
    BASE,
    PLAN,
    add,
    client,
    isolated,
)
from tests.test_agriquill_provenance import bare_numbers

URL = f"{BASE}/harvests/score"
ENGINE_YIELDS = {
    2025: {"own": 3000.0, "aquacrop": 5000.0},
    2024: {"own": 3600.0, "aquacrop": 4400.0},
    2023: {"own": 4400.0, "aquacrop": 4000.0},
}


def plan_for(year: int) -> dict[str, Any]:
    return {**PLAN, "transplant_date": f"{year}-07-01", "weather_years": [year]}


def record(year: int, **kw: Any) -> None:
    r = add(harvested_on=f"{year}-10-20", plan=plan_for(year), **kw)
    assert r.status_code == 200, r.text


@pytest.fixture
def engines(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    seen: list[int] = []

    def fake_run(farm_id: str, parcel_id: str, plan: dict[str, Any]) -> dict[str, Any]:
        year = int(plan["weather_years"][0])
        seen.append(year)
        by_engine = {**ENGINE_YIELDS[year], "wofost": None}
        return {
            "years": [
                {
                    "year": year,
                    "compare": {"summary": {"yield_kg_ha": {"by_engine": by_engine}}},
                    "engines": {
                        "own": {"days": [1]},
                        "aquacrop": {"days": [1]},
                        "wofost": {"status": "failed", "reason": "soil service down"},
                    },
                }
            ]
        }

    monkeypatch.setattr(season_run, "run", fake_run)
    monkeypatch.setattr(season_run, "ENGINES", {"own": 0, "aquacrop": 0, "wofost": 0})
    monkeypatch.setattr(
        cropvalue,
        "harvest_reference",
        lambda spec: {"parcels": [{"parcel": "P1", "yield": {"t_ha": 3.941}}]},
    )
    return seen


def three_seasons() -> None:
    for year in (2025, 2024, 2023):
        record(year)


def test_engine_errors_match_the_hand_computation(engines):
    three_seasons()
    out = client.get(URL, headers=ANN).json()
    own, aqua = out["engines"]["own"], out["engines"]["aquacrop"]
    assert own["pairs"] == 3 and own["status"] == "scored"
    assert own["mean_abs_pct_error"] == pytest.approx(15.0, abs=0.05)
    assert own["mean_signed_pct_error"] == pytest.approx(-25 / 3, abs=0.05)
    assert aqua["mean_abs_pct_error"] == pytest.approx(35 / 3, abs=0.05)
    assert [s["error_pct"] for s in own["seasons"]] == pytest.approx([-25, -10, 10], abs=0.05)
    assert own["seasons"][0]["measured_dry_kg_ha"] == pytest.approx(4000, abs=0.05)


def test_the_national_baseline_is_scored_on_the_same_seasons(engines):
    three_seasons()
    base = client.get(URL, headers=ANN).json()["baseline"]
    measured = 5000 * 80 / 86
    expected = abs(3941 - measured) / measured * 100
    assert base["pairs"] == 3
    assert base["mean_abs_pct_error"] == pytest.approx(expected, abs=0.05)
    assert "FAOSTAT" in base["basis"] and "TO VERIFY" in base["basis"]


def test_a_failed_engine_is_reported_not_counted_as_zero(engines):
    three_seasons()
    wofost = client.get(URL, headers=ANN).json()["engines"]["wofost"]
    assert wofost["pairs"] == 0 and wofost["mean_abs_pct_error"] is None
    assert wofost["status"] == "no scored seasons"
    assert "soil service down" in wofost["reason"]


def test_fewer_than_three_seasons_are_not_called_a_score(engines):
    record(2025)
    record(2024)
    own = client.get(URL, headers=ANN).json()["engines"]["own"]
    assert own["pairs"] == 2 and own["status"] == "too few seasons (2 of 3)"
    assert own["mean_abs_pct_error"] is not None


def test_harvests_that_cannot_be_scored_say_why(engines):
    record(2025)
    add(harvested_on="2024-10-18")
    add(harvested_on="2023-10-17", plan=plan_for(2023), moisture_pct=None)
    add(harvested_on="2022-03-01", plan=plan_for(2022))
    out = client.get(URL, headers=ANN).json()
    why = {s["harvested_on"]: s["reason"] for s in out["skipped"]}
    assert "no season plan" in why["2024-10-18"]
    assert "moisture" in why["2023-10-17"]
    assert "before the transplant date" in why["2022-03-01"]
    assert engines == [2025]


def test_voided_harvests_are_not_scored(engines):
    three_seasons()
    client.delete(
        f"{BASE}/harvests/P1~2025-10-20",
        params={"reason": "wrong field", "voided_by": "Ann"},
        headers=ANN,
    )
    assert client.get(URL, headers=ANN).json()["engines"]["own"]["pairs"] == 2


def test_the_score_is_saved_for_the_model_card(engines):
    three_seasons()
    client.get(URL, headers=ANN)
    saved = harvest_score.saved("farm_h")
    assert saved and saved["engines"]["own"]["pairs"] == 3 and saved["scored_at"]


def test_every_number_in_the_score_carries_provenance(engines):
    three_seasons()
    out = client.get(URL, headers=ANN).json()
    assert bare_numbers(out) == []


def test_scoring_needs_a_known_farm(engines):
    assert client.get("/api/v1/agriquill/farms/nobody/harvests/score", headers=ANN).status_code in (
        403,
        404,
    )


def test_the_model_card_copies_the_saved_score(engines):
    assert (
        modelcard._harvest_rows("farm_h")[0]["reason"] == "no recorded harvest has been scored yet"
    )
    three_seasons()
    client.get(URL, headers=ANN)
    rows = {r["model"]: r for r in modelcard._harvest_rows("farm_h")}
    own = rows["season engine own"]
    assert own["value"] == pytest.approx(15.0, abs=0.05) and own["pairs"] == 3
    assert own["status"] == "shadow" and own["baseline_value"] == pytest.approx(15.27, abs=0.05)
    assert rows["season engine wofost"]["status"] == "not run"


def test_the_score_includes_a_held_out_calibration_per_engine(engines):
    three_seasons()
    calibration = client.get(URL, headers=ANN).json()["calibration"]
    own = calibration["own"]
    assert own["pairs"] == 3 and own["factor"] == pytest.approx(4000 / 3600, abs=0.0001)
    assert own["status"] == "shadow" and "raw engine" in own["reason"]
    assert own["baseline_mape_pct"] == pytest.approx(15.27, abs=0.05)
    assert calibration["wofost"]["pairs"] == 0 and calibration["wofost"]["factor"] is None
