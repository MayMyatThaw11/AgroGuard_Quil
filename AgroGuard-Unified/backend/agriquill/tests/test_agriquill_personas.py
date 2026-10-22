from datetime import timedelta

from agriquill import live, personas, schedule
from tests.test_agriquill_schedule import START, hourly, task


def farm_tasks():
    flight = task("fly", 0, "drone", "D-01", command="scout_flight", paddy="PD-1")
    flight["blocked_reason"] = "REJECTED_WIND_EXCEEDED"
    spray = task("spr", 0, "drone", "D-01", command="spray", paddy="PD-1")
    water = task("wat", 0, "irrigation_valve", "P-01", priority="high", paddy="PD-2")
    late = task("low", 1, "irrigation_valve", "P-02", priority="low", paddy="PD-1")
    for t in (flight, spray, water, late):
        t.update(title=t["id"], detail="", evidence=[])
    return [flight, spray, water, late]


def test_manual_never_uses_a_machine_and_keeps_its_job_kinds():
    shaped = personas.shape(farm_tasks(), "manual", None)
    assert all(t["asset_id"] is None for t in shaped)
    kinds = [schedule.task_kind(t) for t in shaped]
    assert kinds == ["scout", "spray", "irrigate", "irrigate"]
    assert shaped[0]["title"].startswith("Scout PD-1 on foot")


def test_on_foot_scouting_is_free_of_the_drone_wind_ceiling_but_spraying_is_not():
    windy = hourly(days=2, windy_days=(0, 1))
    out = schedule.solve(personas.shape(farm_tasks(), "manual", None), windy, crew=2)
    status = {t["id"]: t["schedule"]["status"] for t in out["tasks"]}
    assert status["fly"] == "scheduled"
    assert status["spr"] == "blocked"


def test_tech_keeps_owned_machines_and_does_the_rest_by_hand():
    shaped = personas.shape(farm_tasks(), "tech", {"D-01", "P-01"})
    assets = {t["id"]: t["asset_id"] for t in shaped}
    assert assets == {"fly": "D-01", "spr": "D-01", "wat": "P-01", "low": None}
    assert shaped[0]["blocked_reason"] == "REJECTED_WIND_EXCEEDED"


def test_a_budget_cut_drops_the_lowest_priority_job_with_its_reason():
    out = schedule.solve(personas.shape(farm_tasks(), "manual", None), hourly(days=3), crew=3)
    prices = {"irrigate": 10.0, "scout": 5.0, "spray": 8.0}
    money = personas.cost(out["tasks"], prices, 23.0, 0.0)
    assert [d["id"] for d in money["dropped"]] == ["low"]
    low = next(t for t in out["tasks"] if t["id"] == "low")
    assert low["schedule"]["status"] == "dropped" and low["blocked_reason"].startswith("BUDGET")
    assert money["within_budget"] is True and money["priced_total"] == 23.0
    again = schedule.solve(personas.shape(farm_tasks(), "manual", None), hourly(days=3), crew=3)
    tight = personas.cost(again["tasks"], prices, 20.0, 0.0)
    assert [d["id"] for d in tight["dropped"]] == ["low", "spr"]


def test_unpriced_jobs_stay_null_and_the_budget_verdict_stays_unknown():
    out = schedule.solve(personas.shape(farm_tasks(), "manual", None), hourly(days=3), crew=3)
    money = personas.cost(out["tasks"], {"irrigate": 10.0}, 1000.0, 10.0)
    scout = next(t for t in out["tasks"] if t["id"] == "fly")
    assert scout["cost"] is None and money["unpriced_jobs"] >= 1
    assert money["within_budget"] is None and "lower bound" in money["note"]
    water = next(t for t in out["tasks"] if t["id"] == "wat")
    assert water["cost"] == round(10.0 * 1.1 * water["schedule"]["duration_h"], 2)


def test_variations_share_one_forecast(monkeypatch):
    calls = []
    weather = hourly(days=3)

    def fake_live(farm_id, client=None):
        calls.append(farm_id)
        return {
            "status": "OK",
            "tasks": farm_tasks(),
            "hourly": weather,
            "generated_at": str(START),
            "weather": {"source": "test"},
        }

    spec = {
        "farm": {"terms": {}, "standard": None},
        "parcels": [
            {"id": "PD-1", "terms": {}, "boundary": None},
            {"id": "PD-2", "terms": {}, "boundary": None},
        ],
        "assets": [{"id": "D-01"}, {"id": "P-01"}, {"id": "P-02"}],
    }
    monkeypatch.setattr(live, "build_live", fake_live)
    monkeypatch.setattr(live, "load", lambda f: ("", {"contract": spec}))
    out = personas.run(
        "f",
        [
            {"persona": "manual", "crew": 1, "durations_h": {"irrigate": 3}},
            {"persona": "tech", "crew": 2, "machines": ["D-01", "X-99"]},
        ],
    )
    assert calls == ["f"]
    manual, tech = out["plans"]
    assert manual["outcome"]["by_hand"] == 4 and tech["machines"] == ["D-01"]
    assert all(t["date"] >= str(START) for t in tech["tasks"])
    assert str(START + timedelta(days=1)) in {t["date"] for t in manual["tasks"]}


def test_hand_hours_reach_the_solver(monkeypatch):
    weather = hourly(days=3)
    monkeypatch.setattr(
        live,
        "build_live",
        lambda f, client=None: {
            "status": "OK",
            "tasks": farm_tasks(),
            "hourly": weather,
            "generated_at": str(START),
            "weather": {"source": "test"},
        },
    )
    spec = {
        "farm": {"terms": {}, "standard": None},
        "parcels": [{"id": "PD-1", "terms": {}}, {"id": "PD-2", "terms": {}}],
        "assets": [],
    }
    monkeypatch.setattr(live, "load", lambda f: ("", {"contract": spec}))
    out = personas.run(
        "f",
        [
            {"persona": "manual", "crew": 2, "durations_h": {"irrigate": 3}},
            {"persona": "tech", "crew": 2},
        ],
    )
    hand, tech = out["plans"]
    wat = {p["persona"]: next(t for t in p["tasks"] if t["id"] == "wat") for p in (hand, tech)}
    assert wat["manual"]["schedule"]["duration_h"] == 3
    assert wat["tech"]["schedule"]["duration_h"] == 1
    assert hand["own_hours"] == ["irrigate"] and tech["own_hours"] == []


def test_a_long_hand_job_is_split_into_working_days_that_each_get_scheduled():
    harvest = task("har", 0, "drone", None, paddy="PD-1")
    harvest.update(
        agent="harvest_planner", actuation=None, asset_id="T-01", title="Harvest PD-1", detail=""
    )
    hand = personas.shape([harvest], "manual", None)
    parts = personas.split_days(hand, {"harvest": 20})
    assert [p["duration_h"] for p in parts] == [7, 7, 6]
    assert [p["date"] for p in parts] == [str(START + timedelta(days=n)) for n in range(3)]
    assert parts[2]["title"] == "Harvest PD-1 (by hand), part 3 of 3"
    out = schedule.solve(parts, hourly(days=5), crew=2)
    assert {t["schedule"]["status"] for t in out["tasks"]} == {"scheduled"}
    assert personas.split_days(hand, {"harvest": 6}) == hand


def test_the_parts_of_one_hand_job_are_dropped_together_for_budget():
    harvest = task("har", 0, "drone", None, paddy="PD-1")
    harvest.update(
        agent="harvest_planner", actuation=None, asset_id="T-01", title="Harvest PD-1", detail=""
    )
    parts = personas.split_days(personas.shape([harvest], "manual", None), {"harvest": 20})
    out = schedule.solve(parts, hourly(days=5), crew=2)
    money = personas.cost(out["tasks"], {"harvest": 1000.0}, 15000.0, 0.0)
    assert money["dropped"] == [
        {"id": "har", "title": "Harvest PD-1 (by hand)", "cost": 20000.0, "days": 3}
    ]
    assert {t["schedule"]["status"] for t in out["tasks"]} == {"dropped"}
    assert money["priced_total"] == 0
