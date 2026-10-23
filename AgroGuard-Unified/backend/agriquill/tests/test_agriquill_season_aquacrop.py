from agriquill import season, season_aquacrop
from tests.test_agriquill_season import day, inputs, plan


def with_texture(data):
    data["hydraulics"]["inputs"] = {"sand_pct": 20.0, "clay_pct": 45.0, "om_pct": 2.6}
    return data


def test_aquacrop_returns_the_shared_schema():
    out = season_aquacrop.run(plan(), with_texture(inputs()))
    assert out["engine"] == "aquacrop" and out["status"] == season.STATUS
    assert out["days"][0]["date"] == day(0)
    assert set(out["days"][0]["vars"]) == set(season.VAR_UNITS)
    assert out["summary"]["yield_kg_ha"]["value"] > 0


def test_aquacrop_bund_holds_water_after_heavy_rain():
    out = season_aquacrop.run(plan(bund_height_cm=20.0), with_texture(inputs(rain={5: 250})))
    ponded = [r["vars"]["ponded_mm"]["value"] for r in out["days"]]
    assert ponded[5] > 0
    assert max(ponded) <= 200.0 + 1e-6


def test_aquacrop_marks_nitrogen_and_weeds_not_modelled():
    out = season_aquacrop.run(plan(), with_texture(inputs()))
    cell = out["days"][10]["vars"]
    assert cell["n_uptake_kg_ha"] == {"value": None, "reason": "not modelled by AquaCrop-OSPy"}
    assert cell["weed_loss_pct"]["value"] is None


def test_aquacrop_fails_cleanly_on_a_weather_gap():
    out = season_aquacrop.run(plan(), with_texture(inputs(drop={12})))
    assert out == {
        "status": "failed",
        "reason": f"weather missing for {day(12)}; AquaCrop needs every day",
    }


def test_aquacrop_fails_cleanly_without_soil_texture():
    data = inputs()
    data["hydraulics"] = None
    assert season_aquacrop.run(plan(), data)["status"] == "failed"


def test_aquacrop_gets_the_same_irrigation_as_the_own_bucket():
    data = with_texture(inputs())
    own = season.run(plan(), data)
    aqua = season_aquacrop.run(plan(), data)
    end = aqua["summary"]["maturity_date"]

    def total(out):
        return sum(r["vars"]["irrigation_mm"]["value"] or 0 for r in out["days"] if r["date"] < end)

    assert total(own) > 0
    assert abs(total(aqua) - total(own)) <= 1.0
