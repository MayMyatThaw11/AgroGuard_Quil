from agriquill import drying


def rain(hours: int, wet: range) -> list[float]:
    return [2.0 if h in wet else 0.0 for h in range(hours)]


LOTS = [
    {"id": "dry_field", "field": "A", "ready_h": 8, "dry_h": 6},
    {"id": "wet_field", "field": "B", "ready_h": 9, "dry_h": 6},
]


def test_the_lot_facing_rain_dries_first_and_beats_day_level_on_observed_rain():
    forecast = {"A": rain(72, range(0)), "B": rain(72, range(12, 30))}
    observed = {"A": rain(72, range(0)), "B": rain(72, range(13, 28))}
    out = drying.replay(LOTS, forecast, observed, dryers=1)
    assert out["starts"]["by_rain"]["wet_field"] < out["starts"]["by_rain"]["dry_field"]
    assert out["wet_hours"]["by_rain"] < out["wet_hours"]["by_day"] and out["better"]


def test_scoring_uses_observed_rain_not_the_forecast():
    forecast = {"A": rain(72, range(0)), "B": rain(72, range(12, 30))}
    observed = {"A": rain(72, range(0)), "B": rain(72, range(0))}
    out = drying.replay(LOTS, forecast, observed, dryers=1)
    assert out["wet_hours"] == {"by_rain": 0, "by_day": 0} and out["better"] is False


def test_day_level_starts_at_the_next_morning_and_queues_on_one_dryer():
    starts = drying.plan_by_day(LOTS, dryers=1)
    assert starts == {"dry_field": 30, "wet_field": 36}
    assert drying.plan_by_day(LOTS, dryers=2) == {"dry_field": 30, "wet_field": 30}


def test_one_dryer_never_runs_two_lots_at_once_in_the_scheduler():
    from agriquill import schedule
    from tests.test_agriquill_schedule import hourly, task

    jobs = [task(f"d{i}", 0, "dryer", "DR-01", command="dry") for i in (1, 2)]
    out = schedule.solve(jobs, hourly(days=2), durations_h={"dry": 6})
    spans = sorted(
        (t["schedule"]["start_index"], t["schedule"]["duration_h"]) for t in out["tasks"]
    )
    assert {t["schedule"]["kind"] for t in out["tasks"]} == {"dry"}
    assert spans[1][0] >= spans[0][0] + spans[0][1]
