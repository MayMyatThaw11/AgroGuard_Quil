from datetime import date

from agriquill import farmers, pest
from agriquill.farmers import Asset, PaddyState, WeatherDay

START = date(2026, 7, 1)


def hourly(days: int, wet: dict[int, tuple[int, int]], temp: float = 25.0) -> dict:
    """RH is 95% in the (first, last) hours of each listed day, 60% otherwise."""
    times, rh, temps, rain = [], [], [], []
    for d in range(days):
        for h in range(24):
            times.append(f"2026-07-{d + 1:02d}T{h:02d}:00")
            lo, hi = wet.get(d, (99, -1))
            rh.append(95.0 if lo <= h <= hi else 60.0)
            temps.append(temp)
            rain.append(0.0)
    return {
        "time": times,
        "temperature_2m": temps,
        "relative_humidity_2m": rh,
        "precipitation": rain,
    }


def test_a_long_wet_night_in_the_blast_band_is_flagged():
    out = pest.shadow_blast(hourly(3, {1: (0, 11)}), 20.0, 28.0, [])
    assert out["available"] and out["flagged_dates"] == ["2026-07-02"]
    assert out["only_shadow"] == ["2026-07-02"]


def test_short_or_broken_wetness_is_not_flagged():
    short = pest.shadow_blast(hourly(3, {1: (0, 8)}), 20.0, 28.0, [])
    assert short["flagged_dates"] == []
    # a wet spell across midnight counts when its run reaches the limit
    crossing = pest.shadow_blast(hourly(3, {0: (20, 23), 1: (0, 6)}), 20.0, 28.0, [])
    assert crossing["flagged_dates"] == ["2026-07-02"]
    # wet but too cold for blast
    cold = pest.shadow_blast(hourly(3, {1: (0, 11)}, temp=15.0), 20.0, 28.0, [])
    assert cold["flagged_dates"] == []


def test_missing_data_is_unknown_not_wet():
    out = pest.shadow_blast(None, 20.0, 28.0, [])
    assert out["available"] is False and "reason" in out
    gappy = hourly(2, {0: (0, 14)})
    gappy["temperature_2m"][5] = None
    assert pest.shadow_blast(gappy, 20.0, 28.0, [])["flagged_dates"] == []


def test_shadow_never_creates_tasks_and_sits_beside_the_rule():
    paddies = [PaddyState("A1", "rice_lowland", "Tillering", 40, 1.0, [1.0], [0.7] * 10)]
    weather = [WeatherDay(0.0, 25.0, 70.0, 2.0) for _ in range(10)]
    plain = farmers.plan_operations(paddies, {}, weather, [], START)
    shadowed = farmers.plan_operations(
        paddies, {}, weather, [], START, hourly=hourly(10, {3: (0, 15)})
    )
    assert shadowed["tasks"] == plain["tasks"]
    assert shadowed["shadow"]["blast"]["flagged_dates"] == ["2026-07-04"]
    assert plain["shadow"]["blast"]["available"] is False
    assert shadowed["pest_thresholds"]["status"] == pest.PEST_STATUS


def stormy(day: int, rain: float = 40.0, wind: float = 8.0) -> list[WeatherDay]:
    return [
        WeatherDay(rain if i == day else 0.0, 25.0, 70.0, wind if i == day else 2.0)
        for i in range(10)
    ]


def blb_tasks(weather, stage="Tillering"):
    paddies = [PaddyState("A1", "rice_lowland", stage, 40, 1.0, [1.0], [0.7] * 10)]
    plan = farmers.plan_operations(
        paddies, {}, weather, [Asset("D", "drone", "d", "online")], START
    )
    return [t for t in plan["tasks"] if t["title"].startswith("Storm advisory")]


def test_blb_advisory_follows_a_wet_windy_day_and_advises_not_treats():
    (task,) = blb_tasks(stormy(3))
    assert task["day_offset"] == 4 and task["numbers_checked"]
    assert task["actuation"] is None and not task["requires_human_approval"]
    assert "agronomist" in task["detail"]
    assert "A1" in task["title"]


def test_blb_advisory_needs_both_rain_and_wind_and_a_growing_crop():
    assert blb_tasks(stormy(3, rain=10.0)) == []
    assert blb_tasks(stormy(3, wind=3.0)) == []
    assert blb_tasks(stormy(3), stage="Ripening") == []
    # a storm on the last forecast day still gives an advisory inside the horizon
    (late,) = blb_tasks(stormy(9))
    assert late["day_offset"] == 9
