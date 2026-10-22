import random
from datetime import UTC, datetime, timedelta

from agriquill import fusion

START = datetime(2026, 9, 1, tzinfo=UTC)


def weather(days: int) -> dict:
    times, et0, rain = [], [], []
    for h in range(days * 24):
        moment = START + timedelta(hours=h)
        times.append(moment.strftime("%Y-%m-%dT%H:00"))
        et0.append(0.4 if 7 <= moment.hour <= 17 else 0.0)
        rain.append(12.0 if h % 120 == 60 else 0.0)
    return {"time": times, "et0_fao_evapotranspiration": et0, "precipitation": rain}


def readings(hourly: dict, true_perc: float, every_h: int = 12, seed: int = 1) -> list[dict]:
    rng = random.Random(seed)
    depth, out = 8.0, []
    for i, stamp in enumerate(hourly["time"]):
        if i % every_h == 0:
            value = round(depth + rng.gauss(0, 0.5), 2)
            observed = datetime.fromisoformat(stamp).replace(tzinfo=UTC).isoformat()
            out.append({"value": value, "observed_at": observed, "source": "manual"})
        et0, rain = hourly["et0_fao_evapotranspiration"][i], hourly["precipitation"][i]
        depth += (rain - et0 * 1.05 - true_perc / 24) / 10
    return out


def test_augmented_filter_learns_a_wrong_percolation_and_wins_on_next_readings():
    hourly = weather(20)
    out = fusion.next_reading_backtest(readings(hourly, true_perc=10.0), hourly, 0, 1.05, 3.0)
    assert out["pairs"] >= 30
    assert out["mae_cm"]["augmented"] < out["mae_cm"]["one_state"]
    assert out["status"] == "promote"


def test_too_few_pairs_stay_in_shadow_even_when_better():
    hourly = weather(5)
    out = fusion.next_reading_backtest(readings(hourly, 10.0, every_h=24), hourly, 0, 1.05, 3.0)
    assert out["pairs"] < 30 and out["status"] == "shadow"


def test_a_later_reading_never_changes_an_earlier_prediction():
    hourly = weather(10)
    rows = readings(hourly, 6.0)
    by_hour = {i * 12: [r] for i, r in enumerate(rows)}
    first = fusion._augmented_walk(by_hour, hourly, 1.05, 3.0, True)
    rows[-1] = {**rows[-1], "value": rows[-1]["value"] + 30}
    by_hour = {i * 12: [r] for i, r in enumerate(rows)}
    second = fusion._augmented_walk(by_hour, hourly, 1.05, 3.0, True)
    assert [y for _, y in first] == [y for _, y in second]


def test_one_reading_is_not_scored():
    hourly = weather(3)
    out = fusion.next_reading_backtest(readings(hourly, 3.0)[:1], hourly, 0, 1.05, 3.0)
    assert out["pairs"] == 0 and out["status"] == "shadow"


def test_a_correct_contract_percolation_gives_no_reason_to_promote():
    hourly = weather(20)
    out = fusion.next_reading_backtest(readings(hourly, true_perc=3.0), hourly, 0, 1.05, 3.0)
    assert out["status"] == "shadow"
    assert abs(out["mae_cm"]["augmented"] - out["mae_cm"]["one_state"]) < 0.05
