from datetime import date, timedelta

from agriquill import schedule

START = date(2026, 10, 14)


def hourly(days=4, wind=2.0, windy_days=()):
    times, winds = [], []
    for d in range(days):
        for h in range(24):
            times.append(f"{START + timedelta(days=d)}T{h:02d}:00")
            winds.append(6.3 if d in windy_days else wind)
    n = len(times)
    return {
        "time": times,
        "temperature_2m": [30.0] * n,
        "relative_humidity_2m": [60.0] * n,
        "wet_bulb_temperature_2m": [25.0] * n,
        "precipitation": [0.0] * n,
        "wind_speed_10m": winds,
        "is_day": [1 if 6 <= i % 24 <= 18 else 0 for i in range(n)],
    }


def task(tid, day, target, asset, priority="medium", command="open", paddy=None):
    return {
        "id": tid,
        "agent": "drone_pilot" if target == "drone" else "water_steward",
        "date": str(START + timedelta(days=day)),
        "day_offset": day,
        "priority": priority,
        "paddy_id": paddy,
        "asset_id": asset,
        "actuation": {"target": target, "command": command},
        "blocked_reason": None,
    }


def test_flight_avoids_windy_days():
    out = schedule.solve(
        [task("f", 0, "drone", "D-01", command="scout_flight")], hourly(windy_days=(0, 1))
    )
    sched = out["tasks"][0]["schedule"]
    assert sched["status"] == "scheduled"
    assert sched["start"] >= f"{START + timedelta(days=2)}"


def test_one_drone_never_overlaps():
    tasks = [task(f"f{i}", 0, "drone", "D-01", command="scout_flight") for i in range(3)]
    out = schedule.solve(tasks, hourly(), durations_h={"scout": 2})
    spans = sorted(
        (t["schedule"]["start_index"], t["schedule"]["start_index"] + 2) for t in out["tasks"]
    )
    assert all(a[1] <= b[0] for a, b in zip(spans, spans[1:], strict=False))


def test_crew_capacity_limits_parallel_work():
    tasks = [task(f"w{i}", 0, "irrigation_valve", f"P-0{i}", paddy=f"PD-0{i}") for i in range(3)]
    out = schedule.solve(tasks, hourly(days=2), durations_h={"irrigate": 3}, crew=1)
    starts = sorted(t["schedule"]["start_index"] for t in out["tasks"])
    assert all(b - a >= 3 for a, b in zip(starts, starts[1:], strict=False))


def test_no_window_is_blocked_with_gate_reason():
    out = schedule.solve(
        [task("f", 0, "drone", "D-01", command="scout_flight")], hourly(windy_days=(0, 1, 2, 3))
    )
    t = out["tasks"][0]
    assert t["schedule"]["status"] == "blocked"
    assert t["blocked_reason"].startswith("NO_GATE_WINDOW:wind")


def test_spray_respects_delta_t():
    h = hourly()
    h["wet_bulb_temperature_2m"] = [20.0] * len(h["time"])
    out = schedule.solve([task("s", 0, "drone", "D-01", command="spray")], h)
    assert out["tasks"][0]["blocked_reason"].startswith("NO_GATE_WINDOW:delta_t")


def test_deterministic():
    tasks = [task(f"f{i}", 0, "drone", "D-01", command="scout_flight") for i in range(4)]
    a = schedule.solve(tasks, hourly())
    b = schedule.solve(tasks, hourly())
    assert [t["schedule"] for t in a["tasks"]] == [t["schedule"] for t in b["tasks"]]


def test_missing_duration_is_marked_assumed():
    out = schedule.solve([task("f", 0, "drone", "D-01", command="scout_flight")], hourly())
    assert out["tasks"][0]["schedule"]["assumed_duration"] is True


def test_solver_failure_falls_back(monkeypatch):
    from ortools.sat.python import cp_model

    def boom(self, model):
        raise RuntimeError("forced")

    monkeypatch.setattr(cp_model.CpSolver, "Solve", boom)
    out = schedule.solve([task("f", 0, "drone", "D-01", command="scout_flight")], hourly())
    assert out["summary"]["status"] == "FALLBACK"
    assert out["tasks"][0]["schedule"]["status"] == "unscheduled"


def test_advisory_tasks_are_not_scheduled():
    advisory = {"id": "a", "agent": "pest_watcher", "date": str(START), "actuation": None}
    out = schedule.solve([advisory], hourly())
    assert out["tasks"][0]["schedule"]["status"] == "advisory"


FAR = {"PD-1": (16.0, 95.0), "PD-2": (16.0, 95.09)}  # about 9.6 km apart
NEAR = {"PD-1": (16.0, 95.0), "PD-2": (16.0, 95.0005)}  # about 50 m apart


def two_stops():
    return [task(f"w{i}", 0, "irrigation_valve", f"P-0{i}", paddy=f"PD-{i}") for i in (1, 2)]


def spans(out):
    return sorted(
        (t["schedule"]["start_index"], t["schedule"]["duration_h"], t["paddy_id"])
        for t in out["tasks"]
    )


def test_one_crew_leaves_time_to_get_between_fields():
    out = schedule.solve(two_stops(), hourly(days=2), crew=1, positions=FAR, travel_kmh=5.0)
    first, second = spans(out)
    assert second[0] - (first[0] + first[1]) >= schedule.travel_hours(FAR["PD-1"], FAR["PD-2"], 5)
    assert schedule.travel_hours(FAR["PD-1"], FAR["PD-2"], 5) == 2
    later = next(t for t in out["tasks"] if t["schedule"]["start_index"] == second[0])
    assert later["schedule"]["travel_h_before"] == 2
    assert later["schedule"]["travel_from"] == first[2]


def test_nearby_fields_and_unknown_positions_cost_no_travel():
    for positions in (NEAR, {}, None):
        out = schedule.solve(two_stops(), hourly(days=2), crew=1, positions=positions)
        assert all("travel_h_before" not in t["schedule"] for t in out["tasks"])
    assert schedule.travel_hours(NEAR["PD-1"], NEAR["PD-2"], 5) == 0
    assert schedule.travel_hours(None, NEAR["PD-2"], 5) == 0


def test_faster_travel_shortens_the_gap():
    assert schedule.travel_hours(FAR["PD-1"], FAR["PD-2"], 20) == 0
