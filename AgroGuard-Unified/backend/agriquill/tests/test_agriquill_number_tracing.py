from datetime import date

from agriquill import crops, farmers
from agriquill.farmers import Asset, PaddyState, WeatherDay

DAYS = 10
FLAT = [0.0] * DAYS


def band(p50: list[float], p90: list[float] | None = None) -> dict[str, list[float]]:
    return {"p50": p50, "p90": p90 or [v + 1 for v in p50]}


def weather(rain: list[float] | None = None, humid_days: tuple[int, ...] = ()) -> list[WeatherDay]:
    rain = rain or FLAT
    return [WeatherDay(rain[i], 25.0, 93.0 if i in humid_days else 70.0, 3.4) for i in range(DAYS)]


ASSETS = [
    Asset("PUMP-1", "pump", "Intake pump", "online"),
    Asset("GATE-OUT", "sluice", "Outlet gate", "online"),
    Asset("TRAC-1", "tractor", "Tractor", "online"),
    Asset("DRONE-1", "drone", "Survey drone", "online"),
    Asset("ROBOT-1", "robot", "Bund robot", "online"),
]


NAMES = ["A1", "A2", "A3", "A4", "A5", "A6", "B1", *(a.id for a in ASSETS)]


def rich_plan() -> dict:
    season = crops.get_crop("rice_lowland").season_days
    paddies = [
        PaddyState("A1", "rice_lowland", "Tillering", 40, 1.2, [-2.0], [0.7] * 10),
        PaddyState("A2", "rice_lowland", "Tillering", 40, 0.8, [3.0], [0.7] * 10),
        PaddyState("A3", "rice_lowland", "Ripening", 100, 0.5, [4.0], [0.7] * 10),
        PaddyState("A4", "rice_lowland", "Tillering", 40, 0.9, [1.0], [0.7] * 10, [4.0]),
        PaddyState(
            "A5", "rice_lowland", "Tillering", 40, 1.0, [1.0], [0.8 - i * 0.03 for i in range(10)]
        ),
        PaddyState("A6", "rice_lowland", "Ripening", season - 1, 1.0, [0.0], [0.7] * 10),
    ]
    forecast = {
        "A1": band([-1.0, -5.0, -10.0, -16.5, -18.0, -19.0, -20.0, -21.0, -22.0, -23.0]),
        "A2": band([3.0] * DAYS, [3, 4, 5, 6, 7, 12.4, 13, 13, 13, 13]),
        "A3": band([4.0] * DAYS),
        "A4": band([1.0] * DAYS),
    }
    return farmers.plan_operations(
        paddies, forecast, weather(humid_days=(2, 3)), ASSETS, date(2026, 7, 1)
    )


def hold_plan() -> dict:
    rain = [30.0] + [0.0] * 9
    paddies = [PaddyState("B1", "rice_lowland", "Tillering", 40, 1.0, [-2.0], [0.7] * 10)]
    forecast = {"B1": band([-1.0, -8.0, -16.2, -18.0, -19.0, -20.0, -21.0, -22.0, -23.0, -24.0])}
    return farmers.plan_operations(paddies, forecast, weather(rain), ASSETS, date(2026, 7, 1))


def test_every_real_task_is_traced_and_nothing_is_held_by_mistake():
    plans = [rich_plan(), hold_plan()]
    agents = {t["agent"] for p in plans for t in p["tasks"]}
    assert {
        "water_steward",
        "crop_scout",
        "pest_watcher",
        "harvest_planner",
        "drone_pilot",
    } <= agents
    titles = " | ".join(t["title"] for p in plans for t in p["tasks"])
    for needed in ("Re-flood", "Hold the pump", "Open outlet", "Drain", "inlet closed"):
        assert needed in titles
    for plan in plans:
        for task in plan["tasks"]:
            assert task["numbers_checked"], (task["title"], task["detail"], task["evidence"])
            assert not str(task["blocked_reason"] or "").startswith("UNTRACED_NUMBER")


def test_every_planted_mismatch_is_held():
    tasks = [t for p in (rich_plan(), hold_plan()) for t in p["tasks"]]
    planted = 0
    for task in tasks:
        # a number in the sentence that the evidence never states
        extra = {**task, "detail": task["detail"] + " Expect 987 mm."}
        assert farmers.untraced_numbers(extra, NAMES) == ["987"], task["title"]
        planted += 1
        # every quantity in the text loses its backing when the evidence is removed
        quantities = farmers.untraced_numbers({**task, "evidence": []}, NAMES)
        if "mm" in task["detail"] or "cm" in task["detail"] or "m/s" in task["detail"]:
            assert quantities, task["title"]
            planted += 1
    assert planted >= 12


def test_a_shifted_quantity_is_caught_and_a_rounded_one_is_not():
    task = next(t for t in hold_plan()["tasks"] if t["title"].startswith("Hold"))
    assert farmers.untraced_numbers(task, NAMES) == []
    shifted = {**task, "detail": task["detail"].replace("-16.2", "-12.2")}
    assert farmers.untraced_numbers(shifted, NAMES) == ["12.2"]
    # "30 mm" written in the text is backed by the evidence's "30.0 mm"
    assert "30 mm" in task["detail"]


def test_untraced_task_is_held_with_its_reason():
    task = {
        "title": "Test",
        "detail": "Rain 42 mm expected.",
        "evidence": ["rain 12.0 mm"],
        "day_offset": 0,
        "paddy_id": None,
        "asset_id": None,
    }
    assert farmers.untraced_numbers(task) == ["42"]
