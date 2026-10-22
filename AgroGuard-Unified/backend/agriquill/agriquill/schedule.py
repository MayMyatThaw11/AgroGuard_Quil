from __future__ import annotations

import math
from collections import Counter
from collections.abc import Mapping, Sequence
from typing import Any

from .config import get_settings
from .gates import DEFAULT_GATES, window_mask

PRIORITY_WEIGHT = {"high": 100, "medium": 30, "low": 10}
SLACK_DAYS = {"irrigate": 1, "drain": 1, "scout": 2, "harvest": 2, "spray": 3}
DEFAULT_DURATION_H = 1
# Walking pace along the bunds; a farm that drives or rides declares travel_kmh. TO VERIFY.
DEFAULT_TRAVEL_KMH = 5.0


def task_kind(task: Mapping[str, Any]) -> str | None:
    if task.get("manual_kind"):
        return str(task["manual_kind"])
    actuation = task.get("actuation") or {}
    if actuation.get("command") == "spray":
        return "spray"
    if actuation.get("target") == "drone":
        return "scout"
    if actuation.get("target") == "irrigation_valve":
        return "irrigate"
    if actuation.get("target") == "sluice_gate":
        return "drain"
    if task.get("agent") == "harvest_planner" and task.get("asset_id"):
        return "harvest"
    if task.get("agent") == "crop_scout":
        return "scout"
    return None


def gate_kind(task: Mapping[str, Any], kind: str) -> str:
    if kind == "spray":
        return "spray"
    if (task.get("actuation") or {}).get("target") == "drone":
        return "flight"
    return "any"


def travel_hours(a: tuple[float, float] | None, b: tuple[float, float] | None, kmh: float) -> int:
    """Whole hours to get from one field to another, rounded to the hourly grid.

    Under half an hour counts as zero: the forecast is hourly, so a finer gap is not modelled.
    """
    if a is None or b is None or kmh <= 0:
        return 0
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + (
        math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    km = 2 * 6371.0088 * math.asin(math.sqrt(h))
    return int(km / kmh + 0.5)


def _day_index(times: Sequence[str]) -> dict[str, list[int]]:
    days: dict[str, list[int]] = {}
    for i, stamp in enumerate(times):
        days.setdefault(stamp[:10], []).append(i)
    return days


def _candidates(
    task: Mapping[str, Any],
    kind: str,
    duration: int,
    hourly: Mapping[str, list[Any]],
    gates: Mapping[str, Any],
) -> tuple[list[int], str | None]:
    days = _day_index(hourly["time"])
    ordered = sorted(days)
    first = ordered.index(task["date"]) if task["date"] in days else None
    if first is None:
        return [], "horizon:task date is outside the hourly forecast"
    last = min(first + SLACK_DAYS[kind], len(ordered) - 1)
    if kind == "irrigate":
        first = 0
    hours = [i for d in ordered[first : last + 1] for i in days[d]]
    mask = window_mask(dict(hourly), gate_kind(task, kind), dict(gates), duration)
    daylight = hourly.get("is_day")
    allowed: list[int] = []
    failures: Counter[str] = Counter()
    for i in hours:
        dark = daylight is not None and not all(
            daylight[j] for j in range(i, min(i + duration, len(daylight)))
        )
        if mask[i] is None and not dark:
            allowed.append(i)
        else:
            failures[(mask[i] or "daylight:outside daylight hours").split(":")[0]] += 1
    if allowed:
        return allowed, None
    worst = failures.most_common(1)[0][0] if failures else "horizon"
    sample = next((m for m in (mask[i] for i in hours) if m and m.startswith(worst)), worst)
    return [], f"NO_GATE_WINDOW:{sample}"


def solve(
    tasks: Sequence[dict[str, Any]],
    hourly: Mapping[str, list[Any]],
    gates_by_paddy: Mapping[str | None, Mapping[str, Any]] | None = None,
    durations_h: Mapping[str, float] | None = None,
    crew: int | None = None,
    preferred_hour: int = 6,
    positions: Mapping[str, tuple[float, float]] | None = None,
    travel_kmh: float | None = None,
) -> dict[str, Any]:
    from ortools.sat.python import cp_model

    gates_by_paddy = gates_by_paddy or {}
    durations_h = durations_h or {}
    times = hourly["time"]
    horizon = len(times)
    model = cp_model.CpModel()
    jobs: list[dict[str, Any]] = []
    out = [dict(t) for t in tasks]
    for task in out:
        kind = task_kind(task)
        if kind is None or task.get("blocked_reason"):
            task["schedule"] = {"status": "advisory" if kind is None else "blocked"}
            continue
        declared = task.get("duration_h") or durations_h.get(kind)
        duration = max(int(round(declared)), 1) if declared else DEFAULT_DURATION_H
        gates = (
            gates_by_paddy.get(task.get("paddy_id")) or gates_by_paddy.get(None) or DEFAULT_GATES
        )
        allowed, reason = _candidates(task, kind, duration, hourly, gates)
        task["schedule"] = {
            "status": "blocked" if reason else "pending",
            "kind": kind,
            "duration_h": duration,
            "assumed_duration": declared is None,
            "gates": gate_kind(task, kind),
        }
        if reason:
            task["blocked_reason"] = reason
            continue
        start = model.new_int_var_from_domain(cp_model.Domain.FromValues(allowed), f"s{len(jobs)}")
        present = model.new_bool_var(f"p{len(jobs)}")
        interval = model.new_optional_fixed_size_interval_var(
            start, duration, present, f"i{len(jobs)}"
        )
        day_start = _day_index(times).get(task["date"], [0])[0]
        target = min(day_start + preferred_hour, horizon - 1)
        lateness = model.new_int_var(0, horizon, f"l{len(jobs)}")
        model.add_abs_equality(lateness, start - target)
        jobs.append(
            {
                "task": task,
                "start": start,
                "present": present,
                "interval": interval,
                "lateness": lateness,
                "weight": PRIORITY_WEIGHT.get(task.get("priority", "medium"), 30),
            }
        )
    by_asset: dict[str, list[Any]] = {}
    for job in jobs:
        asset = job["task"].get("asset_id")
        if asset:
            by_asset.setdefault(asset, []).append(job["interval"])
    for intervals in by_asset.values():
        model.add_no_overlap(intervals)
    speed = travel_kmh or DEFAULT_TRAVEL_KMH
    # One crew member, or one machine, cannot be in two fields at once: leave the drive between.
    groups: list[list[dict[str, Any]]] = []
    if crew == 1:
        groups.append(jobs)
    else:
        groups.extend(
            [j for j in jobs if j["task"].get("asset_id") == asset]
            for asset in {j["task"].get("asset_id") for j in jobs if j["task"].get("asset_id")}
        )
    for group in groups:
        for n, first in enumerate(group):
            for second in group[n + 1 :]:
                gap = travel_hours(
                    (positions or {}).get(first["task"].get("paddy_id") or ""),
                    (positions or {}).get(second["task"].get("paddy_id") or ""),
                    speed,
                )
                if gap <= 0 or first["task"].get("paddy_id") == second["task"].get("paddy_id"):
                    continue
                order = model.new_bool_var(f"o{id(first)}_{id(second)}")
                both = [first["present"], second["present"]]
                model.add(
                    first["start"] + first["task"]["schedule"]["duration_h"] + gap
                    <= second["start"]
                ).only_enforce_if([*both, order])
                model.add(
                    second["start"] + second["task"]["schedule"]["duration_h"] + gap
                    <= first["start"]
                ).only_enforce_if([*both, order.Not()])
                first.setdefault("gaps", {})[id(second)] = gap
                second.setdefault("gaps", {})[id(first)] = gap
    if crew:
        model.add_cumulative([j["interval"] for j in jobs], [1] * len(jobs), crew)
    model.maximize(
        sum(j["weight"] * horizon * j["present"] for j in jobs) - sum(j["lateness"] for j in jobs)
    )
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.max_time_in_seconds = get_settings().scheduler_time_limit_s
    try:
        status = solver.Solve(model)
        name = solver.StatusName(status)
    except Exception as exc:
        name, status = f"ERROR {type(exc).__name__}", None
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for job in jobs:
            job["task"]["schedule"]["status"] = "unscheduled"
        return {
            "tasks": out,
            "summary": {
                "status": "FALLBACK",
                "reason": f"CP-SAT returned {name}; tasks keep the day-level order",
                "solver": "CP-SAT",
            },
        }
    for job in jobs:
        sched = job["task"]["schedule"]
        if solver.Value(job["present"]):
            s = solver.Value(job["start"])
            end = s + sched["duration_h"]
            sched.update(
                status="scheduled",
                start=times[s],
                end=times[end] if end < horizon else times[-1],
                start_index=s,
            )
        else:
            sched["status"] = "unscheduled"
            job["task"]["blocked_reason"] = "NO_CAPACITY:asset or crew busy in every allowed hour"
    _mark_travel(groups, solver)
    return {
        "tasks": out,
        "summary": {
            "status": name,
            "solver": "CP-SAT (OR-Tools)",
            "horizon_h": horizon,
            "crew": crew,
            "travel_kmh": speed,
            "scheduled": sum(1 for t in out if t["schedule"]["status"] == "scheduled"),
            "blocked": sum(1 for t in out if t["schedule"]["status"] == "blocked"),
            "objective": solver.ObjectiveValue(),
        },
    }


def _mark_travel(groups: Sequence[Sequence[dict[str, Any]]], solver: Any) -> None:
    """Tell each scheduled task how long the drive to it takes, for the day view."""
    for group in groups:
        done = sorted(
            (j for j in group if solver.Value(j["present"])), key=lambda j: solver.Value(j["start"])
        )
        for before, after in zip(done, done[1:], strict=False):
            gap = after.get("gaps", {}).get(id(before))
            if gap:
                sched = after["task"]["schedule"]
                sched["travel_h_before"] = max(sched.get("travel_h_before", 0), gap)
                sched["travel_from"] = before["task"].get("paddy_id")
