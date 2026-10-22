from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from typing import Any

from . import contract, live, schedule

PERSONAS = ("manual", "tech")
JOB_KINDS = ("irrigate", "drain", "scout", "spray", "harvest")
PLANNER_REASONS = ("NO_CAPACITY", "NO_GATE_WINDOW", "horizon")
# An 8-hour labour day fits inside ASEAN daylight all year; a farm with longer shifts sets hours.
WORK_DAY_H = 8
HAND_JOBS = {"drone": "scout", "irrigation_valve": "irrigate", "sluice_gate": "drain"}


def _fresh(task: Mapping[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in task.items() if k != "schedule"}
    if str(out.get("blocked_reason") or "").startswith(PLANNER_REASONS):
        out["blocked_reason"] = None
    return out


def by_hand(task: Mapping[str, Any]) -> dict[str, Any]:
    """The crew version of a machine job. Spray gates are never relaxed."""
    out = _fresh(task)
    actuation = out.get("actuation") or {}
    paddy = out.get("paddy_id") or "the field"
    if actuation.get("command") == "spray":
        out.update(manual_kind="spray", asset_id=None, by_hand_of=task.get("asset_id"))
        out["title"] = f"{task['title']} (knapsack sprayer)"
        return out
    kind = HAND_JOBS.get(str(actuation.get("target")))
    if kind is None and out.get("agent") == "harvest_planner" and out.get("asset_id"):
        kind = "harvest"
    if kind is None:
        return out
    title = (
        f"Scout {paddy} on foot instead of the drone flight"
        if kind == "scout"
        else f"{task['title']} (by hand)"
    )
    if actuation.get("target") == "drone" and out.get("blocked_reason") == "REJECTED_WIND_EXCEEDED":
        out["blocked_reason"] = None
    out.update(
        manual_kind=kind,
        asset_id=None,
        actuation=None,
        by_hand_of=task.get("asset_id"),
        title=title,
    )
    return out


def shape(
    tasks: Sequence[Mapping[str, Any]], persona: str, machines: set[str] | None
) -> list[dict[str, Any]]:
    if persona == "manual":
        return [by_hand(t) for t in tasks]
    return [
        _fresh(t)
        if not t.get("asset_id") or machines is None or t["asset_id"] in machines
        else by_hand(t)
        for t in tasks
    ]


def split_days(tasks: Sequence[dict[str, Any]], hours: Mapping[str, float]) -> list[dict[str, Any]]:
    """A hand job longer than one working day becomes one part per day, in date order."""
    out: list[dict[str, Any]] = []
    for task in tasks:
        need = hours.get(schedule.task_kind(task) or "") if task.get("manual_kind") else None
        if not need or need <= WORK_DAY_H:
            out.append(task)
            continue
        total = math.ceil(need)
        parts = math.ceil(total / WORK_DAY_H)
        start = date.fromisoformat(task["date"])
        for n in range(parts):
            out.append(
                {
                    **task,
                    "id": f"{task['id']}_part{n + 1}",
                    "title": f"{task['title']}, part {n + 1} of {parts}",
                    "date": (start + timedelta(days=n)).isoformat(),
                    "day_offset": task.get("day_offset", 0) + n,
                    "duration_h": total // parts + (1 if n < total % parts else 0),
                    "part_of": task["id"],
                    "job_title": task["title"],
                }
            )
    return out


def _lateness(task: Mapping[str, Any], times: Sequence[str], preferred_hour: int = 6) -> int:
    start = task["schedule"].get("start_index")
    first = next((i for i, t in enumerate(times) if t[:10] == task["date"]), None)
    return 0 if start is None or first is None else abs(start - (first + preferred_hour))


def cost(
    tasks: list[dict[str, Any]],
    prices: Mapping[str, float],
    budget: float | None,
    inflation_pct: float,
) -> dict[str, Any]:
    factor = 1 + inflation_pct / 100
    done = [t for t in tasks if t["schedule"]["status"] == "scheduled"]
    for t in done:
        price = prices.get(t["schedule"]["kind"])
        t["cost"] = (
            None if price is None else round(price * factor * t["schedule"]["duration_h"], 2)
        )
    dropped: list[dict[str, Any]] = []
    jobs: dict[str, list[dict[str, Any]]] = {}
    for t in done:
        if t["cost"] is not None:
            jobs.setdefault(t.get("part_of") or t["id"], []).append(t)
    total = sum(t["cost"] for parts in jobs.values() for t in parts)
    if budget is not None:
        # shortcut: drops jobs without re-solving; upgrade if a freed hour should move a job
        order = sorted(
            jobs.items(),
            key=lambda item: (
                schedule.PRIORITY_WEIGHT.get(item[1][0].get("priority", "medium"), 30),
                -sum(t["cost"] for t in item[1]),
            ),
        )
        for job_id, parts in order:
            if total <= budget:
                break
            spend = sum(t["cost"] for t in parts)
            total -= spend
            for t in parts:
                t["schedule"]["status"] = "dropped"
                t["blocked_reason"] = (
                    f"BUDGET: dropped as the lowest-priority job ({t.get('priority', 'medium')}) "
                    f"to keep the plan within {budget:g}"
                )
            title = parts[0].get("job_title") or parts[0]["title"]
            dropped.append(
                {"id": job_id, "title": title, "cost": round(spend, 2), "days": len(parts)}
            )
    unpriced = sum(1 for t in done if t["cost"] is None)
    within = None if budget is None else (total <= budget if unpriced == 0 else None)
    return {
        "priced_total": round(total, 2),
        "unpriced_jobs": unpriced,
        "budget": budget,
        "inflation_pct": inflation_pct,
        "within_budget": within,
        "dropped": dropped,
        "note": None
        if unpriced == 0
        else f"{unpriced} job(s) have no price from you, so the total is a lower bound",
    }


def run(farm_id: str, variations: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Plan up to five ways of working one farm against one shared weather and water forecast."""
    current = live.build_live(farm_id)
    if current["status"] != "OK":
        return {"farm_id": farm_id, "status": current["status"], "missing": current["missing"]}
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        raise KeyError(farm_id)
    terms = contract.terms_for(spec).get("schedule", {})
    gates: dict[str | None, dict[str, Any]] = {
        p["id"]: contract.gates_for(spec, p["id"]) for p in spec["parcels"]
    }
    gates[None] = contract.gates_for(spec)
    hourly, times = current["hourly"], current["hourly"]["time"]
    owned = {a["id"] for a in spec["assets"]}
    plans = []
    for v in variations:
        machines = set(v["machines"]) & owned if v.get("machines") is not None else owned
        tasks = shape(current["tasks"], v["persona"], machines if v["persona"] == "tech" else None)
        tasks = split_days(tasks, v.get("durations_h") or {})
        solved = schedule.solve(
            tasks,
            hourly,
            gates,
            {**(terms.get("durations_h") or {}), **(v.get("durations_h") or {})},
            v["crew"],
            positions=contract.parcel_positions(spec),
            travel_kmh=terms.get("travel_kmh"),
        )
        money = cost(
            solved["tasks"],
            v.get("unit_prices") or {},
            v.get("budget"),
            v.get("inflation_pct") or 0.0,
        )
        out = solved["tasks"]
        plans.append(
            {
                "label": v.get("label") or v["persona"],
                "persona": v["persona"],
                "crew": v["crew"],
                "machines": sorted(machines) if v["persona"] == "tech" else [],
                "own_hours": sorted(v.get("durations_h") or {}),
                "outcome": {
                    "scheduled": sum(1 for t in out if t["schedule"]["status"] == "scheduled"),
                    "blocked": [
                        {"id": t["id"], "title": t["title"], "reason": t["blocked_reason"]}
                        for t in out
                        if t["schedule"]["status"] in ("blocked", "unscheduled")
                    ],
                    "lateness_h": sum(
                        _lateness(t, times) for t in out if t["schedule"]["status"] == "scheduled"
                    ),
                    "by_hand": sum(
                        1
                        for t in out
                        if t.get("manual_kind") and t["schedule"]["status"] == "scheduled"
                    ),
                    "cost": money,
                    "solver": solved["summary"].get("status"),
                },
                "tasks": out,
            }
        )
    return {
        "farm_id": farm_id,
        "status": "OK",
        "shared_forecast": {
            "generated_at": current["generated_at"],
            "weather_source": current["weather"]["source"],
        },
        "plans": plans,
        "approval": "plans write nothing; any job still needs the usual approval before it runs",
    }
