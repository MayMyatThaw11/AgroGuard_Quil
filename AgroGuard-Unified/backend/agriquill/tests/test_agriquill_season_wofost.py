from itertools import pairwise

import httpx
import pytest

from agriquill import season, season_wofost
from tests.test_agriquill_season import day, inputs, plan


def test_wofost_returns_the_shared_schema():
    out = season_wofost.run(plan(), inputs())
    assert out["engine"] == "wofost" and out["status"] == season.STATUS
    assert out["days"][0]["date"] == day(0)
    assert set(out["days"][0]["vars"]) == set(season.VAR_UNITS)
    assert out["summary"]["yield_kg_ha"]["value"] > 0


def test_wofost_dvs_increases_monotonically():
    out = season_wofost.run(plan(), inputs())
    dvs = [r["vars"]["dvs"]["value"] for r in out["days"] if r["vars"]["dvs"]["value"] is not None]
    assert len(dvs) > 30
    assert all(b >= a for a, b in pairwise(dvs))


def test_wofost_runs_offline(monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError("WOFOST tried to reach the network")

    monkeypatch.setattr(httpx.Client, "send", refuse)
    monkeypatch.setattr("urllib.request.urlopen", refuse)
    assert season_wofost.run(plan(), inputs())["status"] == season.STATUS


def test_wofost_states_its_nitrogen_basis():
    out = season_wofost.run(plan(), inputs())
    assert out["method"]["nitrogen"].startswith("not modelled")
    assert out["days"][10]["vars"]["n_uptake_kg_ha"]["value"] is None


def test_wofost_fails_cleanly_on_a_weather_gap():
    out = season_wofost.run(plan(), inputs(drop={12}))
    assert out == {
        "status": "failed",
        "reason": f"weather missing for {day(12)}; WOFOST needs every day",
    }


@pytest.mark.parametrize("missing", ["hydraulics"])
def test_wofost_fails_cleanly_without_soil_limits(missing):
    data = inputs()
    data[missing] = None
    assert season_wofost.run(plan(), data)["status"] == "failed"
