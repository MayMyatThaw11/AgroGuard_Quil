import math
from datetime import date, timedelta
from itertools import pairwise

from agriquill import season

T0 = date(2025, 7, 1)


def day(n: int) -> str:
    return (T0 + timedelta(days=n)).isoformat()


def weather_days(n: int, start: date, *, tmax=32.0, tmin=24.0, rain=None, drop=()):
    rain = rain or {}
    out = []
    for i in range(n):
        if i in drop:
            continue
        out.append(
            {
                "date": (start + timedelta(days=i)).isoformat(),
                "tmax_c": tmax,
                "tmin_c": tmin,
                "rain_mm": float(rain.get(i, 0.0)),
                "srad_mj_m2": 18.0,
                "et0_mm": 4.5,
                "wind_ms": 2.0,
                "rh_min_pct": 70.0,
                "rh_max_pct": 95.0,
            }
        )
    return out


def inputs(n=150, start=T0, **kw):
    return {
        "lat": 16.7,
        "lon": 94.8,
        "weather": {
            "days": weather_days(n, start, **kw),
            "missing": [],
            "source": {"provider": "test"},
        },
        "hourly": None,
        "hydraulics": {"theta_fc": 0.40, "theta_wp": 0.20, "theta_sat": 0.50, "source": "test"},
        "missing": [],
    }


def plan(**kw):
    base = {
        "transplant_date": T0.isoformat(),
        "duration_days": 120,
        "seedbed_days": 0,
        "hills_per_m2": 25,
        "plants_per_hill": 3,
        "water": {"regime": "continuous", "awd_threshold_cm": None, "reflood_cm": 5.0},
        "bund_height_cm": 20.0,
        "trench": None,
        "fish": False,
        "percolation_mm_day": 2.0,
        "soil_n_kg_ha": 30.0,
        "events": [],
    }
    base.update(kw)
    return base


def v(row, name):
    return row["vars"][name]["value"]


def test_water_balance_closes_every_day():
    out = season.run(
        plan(events=[{"kind": "irrigate", "date": day(3), "mm": 80.0}]), inputs(rain={10: 60})
    )
    for prev, row in pairwise(out["days"]):
        b = row["balance"]
        change = b["storage_mm"] - prev["balance"]["storage_mm"]
        assert abs(b["in_mm"] - b["out_mm"] - v(row, "runoff_mm") - change) <= 0.1, row["date"]


def test_ponded_never_exceeds_bund_and_overflow_is_runoff():
    out = season.run(plan(bund_height_cm=10.0), inputs(rain={5: 300}))
    assert max(v(r, "ponded_mm") for r in out["days"]) <= 100.0
    assert v(out["days"][5], "runoff_mm") > 0


def test_n_pool_never_negative_and_uptake_bounded():
    fert = {
        "kind": "fertiliser",
        "date": day(10),
        "product": "urea",
        "rate_kg_ha": 100.0,
        "n_pct": 46.0,
    }
    out = season.run(plan(events=[fert]), inputs())
    assert all(v(r, "soil_n_kg_ha") >= 0 for r in out["days"])
    net = 46.0 * (
        1 - season.FRAC_GAS["urea"] - season.FRAC_LEACH_WET - season.EF1_FLOODED_RICE["continuous"]
    )
    assert v(out["days"][-1], "n_uptake_kg_ha") <= 30.0 + net + 1e-6


def test_residue_halves_after_one_dt50():
    spray = {
        "kind": "spray",
        "date": day(20),
        "product": "X",
        "rate_g_ai_ha": 200.0,
        "dt50_days": 7.0,
        "phi_days": 14,
        "fish_toxic": False,
    }
    out = season.run(plan(events=[spray]), inputs())
    rows = {r["date"]: r for r in out["days"]}
    assert abs(rows[day(27)]["vars"]["residue"]["value"]["X"] - 100.0) < 0.5


def test_phi_block_when_harvest_inside_interval():
    out = season.run(plan(), inputs())
    harvest = next(w for w in out["windows"] if w["kind"] == "harvest")["start"]
    late = (date.fromisoformat(harvest) - timedelta(days=5)).isoformat()
    spray = {
        "kind": "spray",
        "date": late,
        "product": "X",
        "rate_g_ai_ha": 200.0,
        "dt50_days": 7.0,
        "phi_days": 14,
        "fish_toxic": False,
    }
    out = season.run(plan(events=[spray]), inputs())
    assert any(w["kind"] == "phi_block" for w in out["windows"])


def test_phenology_reaches_flowering_on_the_hand_computed_day():
    out = season.run(plan(), inputs(tmax=24.0, tmin=24.0))
    hu = 24.0 - season.TBD
    dvs, expected = 0.0, -1
    while dvs < 1.0:
        expected += 1
        dvs += hu * (season.DVRJ if dvs < 0.4 else season.DVRI if dvs < 0.65 else season.DVRP)
    first = next(i for i, r in enumerate(out["days"]) if v(r, "dvs") >= 1.0)
    assert first == expected
    assert math.isclose(
        expected,
        0.4 / (season.DVRJ * hu) + 0.25 / (season.DVRI * hu) + 0.35 / (season.DVRP * hu),
        abs_tol=3,
    )


def test_weeding_lowers_weed_loss():
    emerge = {
        "kind": "weed_emergence",
        "date": day(0),
        "density_m2": 50.0,
        "cousens_i": 1.0,
        "cousens_a": 60.0,
    }
    a = season.run(plan(events=[emerge]), inputs())
    b = season.run(
        plan(
            events=[
                emerge,
                {"kind": "weed", "date": day(20), "method": "hand", "removed_pct": 90.0},
            ]
        ),
        inputs(),
    )
    assert v(b["days"][-1], "weed_loss_pct") < v(a["days"][-1], "weed_loss_pct")
    assert abs(v(a["days"][-1], "weed_loss_pct") - 50 / (1 + 50 / 60)) < 0.01


def test_weed_loss_unknown_without_cousens_parameters():
    emerge = {
        "kind": "weed_emergence",
        "date": day(0),
        "density_m2": 50.0,
        "cousens_i": None,
        "cousens_a": None,
    }
    out = season.run(plan(events=[emerge]), inputs())
    assert out["days"][-1]["vars"]["weed_loss_pct"]["value"] is None
    assert "Cousens" in out["days"][-1]["vars"]["weed_loss_pct"]["reason"]


def test_missing_weather_day_nulls_following_rows():
    out = season.run(plan(), inputs(drop={30}))
    assert v(out["days"][29], "biomass_kg_ha") is not None
    assert out["days"][30]["date"] == day(30)
    assert out["days"][30]["vars"]["biomass_kg_ha"] == {
        "value": None,
        "reason": f"weather missing for {day(30)}",
    }
    assert out["days"][-1]["vars"]["ponded_mm"]["value"] is None


def test_fish_toxic_spray_warns_with_trench_and_fish():
    spray = {
        "kind": "spray",
        "date": day(20),
        "product": "X",
        "rate_g_ai_ha": 200.0,
        "dt50_days": 7.0,
        "phi_days": 14,
        "fish_toxic": True,
    }
    out = season.run(
        plan(trench={"depth_cm": 60, "width_cm": 100, "share_pct": 8}, fish=True, events=[spray]),
        inputs(),
    )
    assert any(w["kind"] == "fish_toxic_spray" for w in out["windows"])


def test_growth_is_unknown_without_plant_density_but_water_runs():
    out = season.run(plan(hills_per_m2=None), inputs())
    last = out["days"][-1]["vars"]
    assert last["biomass_kg_ha"]["value"] is None and "density" in last["biomass_kg_ha"]["reason"]
    assert last["ponded_mm"]["value"] is not None


def test_awd_refloods_when_the_tube_reaches_the_threshold():
    water = {"regime": "awd", "awd_threshold_cm": -15.0, "reflood_cm": 5.0}
    out = season.run(plan(water=water), inputs())
    rows = out["days"]
    dry = [i for i, r in enumerate(rows[:-1]) if v(r, "tube_cm") <= -15.0]
    assert dry, "the field should dry to the AWD threshold at least once"
    assert all(v(rows[i + 1], "irrigation_mm") > 0 for i in dry)


def test_unknown_percolation_is_labelled_a_bound():
    out = season.run(plan(percolation_mm_day=None), inputs())
    assert "percolation" in out["days"][5]["vars"]["ponded_mm"]["bound"]


def test_grain_yield_and_status_are_labelled():
    out = season.run(plan(), inputs())
    assert out["status"] == "uncalibrated"
    assert v(out["days"][-1], "yield_kg_ha") > 0
    assert "ORYZA2000" in out["sources"]["phenology"]


def test_canopy_does_not_fall_back_into_exponential_growth():
    out = season.run(plan(seedbed_days=21, transplant_date=day(21)), inputs(n=200))
    field = [r for r in out["days"] if r["das"] >= 0 and v(r, "dvs") < 0.9]
    lais = [v(r, "lai") for r in field]
    first = next(i for i, x in enumerate(lais) if x >= 1.0)
    assert min(lais[first:]) >= 1.0, "LAI dropped back below 1 after the linear phase began"


def pid_water(setpoint_cm=8.0, max_mm=60.0, kp=0.5, ki=0.05, kd=0.0):
    return {
        "regime": "pid",
        "awd_threshold_cm": None,
        "reflood_cm": None,
        "pid": {"setpoint_cm": setpoint_cm, "kp": kp, "ki": ki, "kd": kd, "max_mm_day": max_mm},
    }


def test_pid_regime_holds_the_ponded_depth_on_its_setpoint():
    out = season.run(plan(water=pid_water(), bund_height_cm=20.0), inputs())
    ponded = [v(r, "ponded_mm") for r in out["days"]]
    assert all(abs(p - 80.0) <= 8.0 for p in ponded[10:]), ponded[10:20]


def test_pid_never_pumps_more_than_the_pump_rate():
    out = season.run(plan(water=pid_water(max_mm=15.0), bund_height_cm=20.0), inputs())
    assert max(v(r, "irrigation_mm") for r in out["days"]) <= 15.0 + 1e-9


def test_pid_stays_off_while_rain_keeps_the_field_above_the_setpoint():
    out = season.run(plan(water=pid_water(), bund_height_cm=20.0), inputs(rain={20: 120}))
    after = [v(r, "irrigation_mm") for r in out["days"][21:23]]
    assert after == [0.0, 0.0]
    assert max(v(r, "ponded_mm") for r in out["days"]) <= 200.0


def test_pid_reports_its_error_and_other_regimes_do_not():
    pid = season.run(plan(water=pid_water()), inputs())
    assert v(pid["days"][30], "pid_error_mm") is not None
    flooded = season.run(plan(), inputs())
    assert flooded["days"][30]["vars"]["pid_error_mm"]["value"] is None


def test_pid_water_balance_still_closes():
    out = season.run(plan(water=pid_water(), bund_height_cm=20.0), inputs(rain={10: 60}))
    for prev, row in pairwise(out["days"]):
        b = row["balance"]
        change = b["storage_mm"] - prev["balance"]["storage_mm"]
        assert abs(b["in_mm"] - b["out_mm"] - v(row, "runoff_mm") - change) <= 0.1
