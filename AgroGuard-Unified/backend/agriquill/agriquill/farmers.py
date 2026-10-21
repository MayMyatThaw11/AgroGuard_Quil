from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import numpy as np

from . import crops, pest, safety
from .config import get_settings

DEFAULT_THRESHOLDS: dict[str, float] = {
    "awd_safe_depth_cm": -15.0,
    "awd_reflood_target_cm": 5.0,
    "flowering_min_depth_cm": 3.0,
    "flowering_max_depth_cm": 5.0,
    "overflow_depth_cm": 10.0,
    "rain_hold_mm": 20.0,
    "ndvi_drop_per_10_days": 0.05,
    "blast_rh_pct": 90.0,
    "blast_temp_min_c": 20.0,
    "blast_temp_max_c": 28.0,
    "blast_consecutive_days": 2,
    "dry_day_rain_mm": 2.0,
    "harvest_dry_days": 3,
    "harvest_early_days": 3,
    "rice_salinity_threshold_ds_m": 3.0,
    "spray_wind_calm_floor_ms": 1.3,
}
COUNT_THRESHOLDS = {"blast_consecutive_days", "harvest_dry_days", "harvest_early_days"}
THRESHOLD_STATUS = "TO VERIFY against local extension guidance before field use"


def lift_volume_m3(area_ha: float, lift_cm: float) -> float:
    return round(area_ha * 10_000 * max(lift_cm, 0.0) / 100, 0)


def resolve_thresholds(overrides: Mapping[str, float] | None = None) -> dict[str, float]:
    ceiling = get_settings().wind_ceiling_ms
    resolved = {
        **DEFAULT_THRESHOLDS,
        "spray_wind_advisory_ms": get_settings().spray_wind_advisory_ms,
    }
    for key, value in (overrides or {}).items():
        if key not in resolved:
            raise ValueError(f"unknown threshold {key!r}")
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"threshold {key!r} must be a finite number")
        if key in COUNT_THRESHOLDS and (value < 1 or value != int(value)):
            raise ValueError(f"threshold {key!r} must be a whole number of days >= 1")
        resolved[key] = float(value)
    if not 0 < resolved["spray_wind_advisory_ms"] <= ceiling:
        raise ValueError(f"spray_wind_advisory_ms must be within (0, {ceiling}] m/s hard ceiling")
    if resolved["spray_wind_calm_floor_ms"] >= resolved["spray_wind_advisory_ms"]:
        raise ValueError("spray_wind_calm_floor_ms must be below spray_wind_advisory_ms")
    if resolved["flowering_min_depth_cm"] >= resolved["flowering_max_depth_cm"]:
        raise ValueError("flowering_min_depth_cm must be below flowering_max_depth_cm")
    if resolved["blast_temp_min_c"] >= resolved["blast_temp_max_c"]:
        raise ValueError("blast_temp_min_c must be below blast_temp_max_c")
    return resolved


RICE_CATEGORIES = {"paddy", "rice_shrimp", "rice_fish"}

CREW: tuple[dict[str, str], ...] = (
    {
        "id": "water_steward",
        "name": "Water Steward",
        "role": "Irrigation and drainage",
        "practice": "Alternate wetting and drying, read from the field water tube",
        "voice": "Water only when the tube says the roots are thirsty, and never fight the rain.",
    },
    {
        "id": "crop_scout",
        "name": "Crop Scout",
        "role": "Canopy health",
        "practice": "Walk the bunds and compare the greenness week to week",
        "voice": "A field that fades slowly is telling you something before it shouts.",
    },
    {
        "id": "pest_watcher",
        "name": "Pest Watcher",
        "role": "Disease and pest pressure",
        "practice": "Watch for long wet, mild nights that bring blast",
        "voice": "Warm fog that does not lift is the season for blast. Look under the leaves.",
    },
    {
        "id": "harvest_planner",
        "name": "Harvest Planner",
        "role": "Harvest and machinery",
        "practice": "Drain early and cut on a run of dry days",
        "voice": "Cut on dry days so the grain dries in the sun, not in the shed.",
    },
    {
        "id": "drone_pilot",
        "name": "Drone Pilot",
        "role": "Aerial scouting and spraying",
        "practice": "Fly only in calm air",
        "voice": "If the palm leaves are dancing, the drone stays on the ground.",
    },
)


@dataclass(frozen=True)
class PaddyState:
    id: str
    crop_id: str
    stage: str
    days_since_planting: int
    area_ha: float
    water_depth_cm: Sequence[float]
    ndvi: Sequence[float]
    salinity_ds_m: Sequence[float] = ()
    min_water_cm: float | None = None


@dataclass(frozen=True)
class WeatherDay:
    rain_mm: float
    temp_c: float
    rh_pct: float
    wind_ms: float


@dataclass(frozen=True)
class Asset:
    id: str
    kind: str
    label: str
    status: str
    serves: Sequence[str] = field(default_factory=tuple)


@dataclass
class _Planner:
    paddies: Sequence[PaddyState]
    forecast: dict[str, dict[str, list[float]]]
    weather: Sequence[WeatherDay]
    assets: Sequence[Asset]
    start: date
    standard: str | None
    t: dict[str, float]
    tasks: list[dict[str, Any]] = field(default_factory=list)

    def day(self, offset: int) -> str:
        return (self.start + timedelta(days=offset)).isoformat()

    def asset(self, kind: str, paddy_id: str | None = None) -> Asset | None:
        matches = [a for a in self.assets if a.kind == kind]
        if paddy_id is not None:
            served = [a for a in matches if paddy_id in a.serves]
            matches = served or matches
        return matches[0] if matches else None

    def add(self, agent: str, title: str, detail: str, **extra: Any) -> None:
        offset = int(extra.pop("day_offset", 0))
        actuation = extra.pop("actuation", None)
        self.tasks.append(
            {
                "id": f"task_{agent}_{len(self.tasks) + 1:02d}",
                "agent": agent,
                "title": title,
                "detail": detail,
                "day_offset": offset,
                "date": self.day(offset),
                "priority": extra.pop("priority", "medium"),
                "paddy_id": extra.pop("paddy_id", None),
                "asset_id": extra.pop("asset_id", None),
                "actuation": actuation,
                "requires_human_approval": actuation is not None,
                "blocked_reason": extra.pop("blocked_reason", None),
                "evidence": extra.pop("evidence", []),
                "water": extra.pop("water", None),
            }
        )


_NUMBER = re.compile(r"\d+(?:\.\d+)?")
_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _numbers(text: str) -> list[str]:
    return _NUMBER.findall(_DATE.sub(" ", text).replace("m3", "m"))


def untraced_numbers(task: Mapping[str, Any], ignore: Sequence[str] = ()) -> list[str]:
    """Numbers a task states in its title or detail that no line of its evidence backs.

    A number matches when it equals an evidence number at the precision it was written
    (a "5 mm" in the text is backed by "5.3 mm" in the evidence). The task's own day
    number, ISO dates and the names of fields, machines and standards are not quantities.
    """
    text = f"{task['title']} {task['detail']}"
    for name in sorted(
        {*ignore, task.get("paddy_id") or "", task.get("asset_id") or ""}, key=len, reverse=True
    ):
        if name:
            text = text.replace(name, " ")
    backing = [float(n) for line in task["evidence"] for n in _numbers(str(line))]
    backing.append(float(task["day_offset"] + 1))
    missing: list[str] = []
    for written in _numbers(text):
        places = len(written.split(".")[1]) if "." in written else 0
        slack = 0.5 * 10**-places + 1e-9
        if not any(abs(float(written) - v) <= slack for v in backing):
            missing.append(written)
    return list(dict.fromkeys(missing))


def _first(values: Sequence[float], predicate: Any) -> int | None:
    for index, value in enumerate(values):
        if predicate(value):
            return index
    return None


def _water_steward(plan: _Planner) -> list[str]:
    calm: list[str] = []
    for paddy in plan.paddies:
        crop = crops.get_crop(paddy.crop_id)
        if crop.category not in RICE_CATEGORIES:
            continue
        band = plan.forecast.get(paddy.id)
        if band is None:
            continue
        p50, p90 = band["p50"], band["p90"]
        now = float(paddy.water_depth_cm[-1])
        pump = plan.asset("pump", paddy.id)
        inlet = plan.asset("gate", paddy.id) or plan.asset("sluice", paddy.id)
        outlet = next(
            (a for a in plan.assets if a.kind == "sluice" and "outlet" in a.label.lower()), None
        )
        acted = False

        if paddy.stage == "Ripening":
            if now > 0:
                plan.add(
                    "water_steward",
                    f"Drain {paddy.id} before harvest",
                    f"Water stands at {now:.1f} cm while the crop ripens. Open the outlet so the "
                    "soil firms up for the harvester.",
                    paddy_id=paddy.id,
                    asset_id=outlet.id if outlet else None,
                    actuation={"target": "sluice_gate", "command": "open"} if outlet else None,
                    priority="medium",
                    evidence=[f"current depth {now:.1f} cm", f"stage {paddy.stage}"],
                )
                acted = True
        elif (
            paddy.salinity_ds_m
            and paddy.salinity_ds_m[-1] >= plan.t["rice_salinity_threshold_ds_m"]
        ):
            salinity = float(paddy.salinity_ds_m[-1])
            limit = plan.t["rice_salinity_threshold_ds_m"]
            plan.add(
                "water_steward",
                f"Keep {paddy.id} inlet closed: salty water",
                f"Inlet water reads {salinity:.1f} dS/m, at or above the {limit:.1f} dS/m rice "
                "threshold. Close the inlet and do not irrigate from the canal until a fresh-water "
                "reading comes in.",
                paddy_id=paddy.id,
                asset_id=inlet.id if inlet else None,
                actuation={"target": "sluice_gate", "command": "close"} if inlet else None,
                priority="high",
                evidence=[
                    f"salinity {salinity:.1f} dS/m",
                    f"threshold {limit:.1f} dS/m (TO VERIFY)",
                ],
            )
            acted = True
        else:
            floor = (
                plan.t["flowering_min_depth_cm"]
                if paddy.stage == "Flowering"
                else plan.t["awd_safe_depth_cm"]
            )
            if paddy.min_water_cm is not None:
                floor = max(floor, paddy.min_water_cm)
            breach = _first(p50, lambda v, f=floor: v <= f)
            if breach is not None:
                rain_before = sum(w.rain_mm for w in plan.weather[: breach + 1])
                if rain_before >= plan.t["rain_hold_mm"] and paddy.stage != "Flowering":
                    plan.add(
                        "water_steward",
                        f"Hold the pump for {paddy.id}",
                        f"The tube level is forecast to reach {p50[breach]:.1f} cm, but "
                        f"{rain_before:.0f} mm of rain is expected first. Let the sky irrigate.",
                        paddy_id=paddy.id,
                        day_offset=breach,
                        priority="low",
                        evidence=[
                            f"p50 day {breach + 1}: {p50[breach]:.1f} cm",
                            f"rain before threshold {rain_before:.1f} mm",
                        ],
                    )
                else:
                    when = max(breach - 1, 0)
                    target = plan.t["awd_reflood_target_cm"]
                    if paddy.stage == "Flowering":
                        target = min(target, plan.t["flowering_max_depth_cm"])
                    volume_m3 = lift_volume_m3(paddy.area_ha, target - p50[when])
                    action = (
                        "Run the intake pump and open the inlet the day before"
                        if pump
                        else f"No pump is registered for {paddy.id}, so bring water in by hand "
                        "or add a pump to the contract; start the day before"
                    )
                    plan.add(
                        "water_steward",
                        f"Re-flood {paddy.id} to {target:.0f} cm",
                        f"Forecast median reaches {p50[breach]:.1f} cm on day {breach + 1}. "
                        f"{action}; about {volume_m3:.0f} m3.",
                        paddy_id=paddy.id,
                        asset_id=pump.id if pump else inlet.id if inlet else None,
                        day_offset=when,
                        priority="high" if paddy.stage == "Flowering" or breach <= 2 else "medium",
                        actuation={"target": "irrigation_valve", "command": "open"},
                        water={"target_cm": target, "floor_cm": floor},
                        evidence=[
                            f"p50 day {breach + 1}: {p50[breach]:.1f} cm",
                            f"floor {floor:.0f} cm ({paddy.stage})",
                            f"re-flood target {target:.0f} cm",
                            f"estimated volume {volume_m3:.0f} m3",
                            *([] if pump else [f"no pump registered for {paddy.id}"]),
                        ],
                    )
                acted = True
            spill = _first(p90, lambda v: v >= plan.t["overflow_depth_cm"])
            if spill is not None and outlet is not None:
                plan.add(
                    "water_steward",
                    f"Open outlet ahead of heavy rain on {paddy.id}",
                    f"Upper forecast reaches {p90[spill]:.1f} cm on day {spill + 1}. Lower the "
                    "water early so the bunds are not overtopped.",
                    paddy_id=paddy.id,
                    asset_id=outlet.id,
                    day_offset=max(spill - 1, 0),
                    priority="high",
                    actuation={"target": "sluice_gate", "command": "open"},
                    evidence=[f"p90 day {spill + 1}: {p90[spill]:.1f} cm"],
                )
                acted = True
        if not acted:
            calm.append(paddy.id)
    return calm


def _crop_scout(plan: _Planner) -> None:
    robot = plan.asset("robot")
    for paddy in plan.paddies:
        recent = np.asarray(paddy.ndvi[-10:], dtype=float)
        if len(recent) < 5:
            continue
        slope = float(np.polyfit(np.arange(len(recent)), recent, 1)[0]) * 10
        if paddy.stage == "Ripening" or slope > -plan.t["ndvi_drop_per_10_days"]:
            continue
        robot_ready = robot is not None and robot.status not in ("offline", "warning")
        plan.add(
            "crop_scout",
            f"Scout {paddy.id}: greenness falling",
            f"NDVI fell {abs(slope):.2f} over ten days at {paddy.stage.lower()} stage. "
            + (
                f"Send {robot.id} along the bund for close-up leaf images."
                if robot_ready and robot
                else "Walk the bund and check leaves by hand."
            ),
            paddy_id=paddy.id,
            asset_id=robot.id if robot_ready and robot else None,
            priority="medium",
            evidence=[f"NDVI slope {slope:+.3f} per 10 days", f"latest NDVI {recent[-1]:.2f}"],
        )


def _pest_watcher(plan: _Planner) -> int | None:
    rice = [p for p in plan.paddies if crops.get_crop(p.crop_id).category in RICE_CATEGORIES]
    if not rice:
        return None
    low, high = plan.t["blast_temp_min_c"], plan.t["blast_temp_max_c"]
    run = 0
    for offset, day in enumerate(plan.weather):
        favourable = day.rh_pct >= plan.t["blast_rh_pct"] and low <= day.temp_c <= high
        run = run + 1 if favourable else 0
        if run >= int(plan.t["blast_consecutive_days"]):
            start = offset - run + 1
            banned = safety.prohibited_for(plan.standard) or ()
            detail = (
                f"Humid, mild weather from day {start + 1} favours rice blast. Check the lower "
                "leaves for diamond-shaped lesions and keep nitrogen top-dressing on hold."
            )
            if banned:
                detail += f" Under {plan.standard}, do not use: {', '.join(banned)}."
            plan.add(
                "pest_watcher",
                "Blast-risk window ahead",
                detail,
                day_offset=start,
                priority="high",
                evidence=[
                    f"day {i + 1}: RH {plan.weather[i].rh_pct:.0f}%, {plan.weather[i].temp_c:.0f} C"
                    for i in range(start, offset + 1)
                ],
            )
            return start
    return None


def _rule_blast_dates(plan: _Planner) -> list[str]:
    """Every day the daily blast rule calls risky, for comparison with the shadow model."""
    low, high = plan.t["blast_temp_min_c"], plan.t["blast_temp_max_c"]
    need = int(plan.t["blast_consecutive_days"])
    run = 0
    dates: list[str] = []
    for offset, day in enumerate(plan.weather):
        favourable = day.rh_pct >= plan.t["blast_rh_pct"] and low <= day.temp_c <= high
        run = run + 1 if favourable else 0
        if run >= need:
            dates.append(plan.day(offset))
    return dates


def _blb_watcher(plan: _Planner) -> None:
    """Bacterial leaf blight: a hard, windy rain wounds the leaves the germ gets in through."""
    rice = [
        p.id
        for p in plan.paddies
        if crops.get_crop(p.crop_id).category in RICE_CATEGORIES and p.stage != "Ripening"
    ]
    if not rice:
        return
    rain_limit, wind_limit = (
        pest.PEST_THRESHOLDS["blb_rain_mm"],
        pest.PEST_THRESHOLDS["blb_wind_ms"],
    )
    previous = False
    for offset, day in enumerate(plan.weather):
        storm = day.rain_mm >= rain_limit and day.wind_ms >= wind_limit
        if storm and not previous:
            plan.add(
                "pest_watcher",
                f"Storm advisory: check {', '.join(rice)} for leaf blight",
                f"{day.rain_mm:.0f} mm of rain with {day.wind_ms:.1f} m/s wind is forecast on day "
                f"{offset + 1}. Storms like this wound leaves and let bacterial leaf blight in. "
                "After the storm, look for yellow to white streaks from the leaf tips, and ask "
                "your agronomist before applying anything.",
                day_offset=min(offset + 1, len(plan.weather) - 1),
                priority="medium",
                evidence=[
                    f"day {offset + 1}: rain {day.rain_mm:.1f} mm, wind {day.wind_ms:.1f} m/s",
                    f"storm limits {rain_limit:.0f} mm and {wind_limit:.1f} m/s (TO VERIFY)",
                ],
            )
        previous = storm


def _harvest_planner(plan: _Planner) -> None:
    horizon = len(plan.weather)
    need = int(plan.t["harvest_dry_days"])
    early = int(plan.t["harvest_early_days"])
    dry = [w.rain_mm < plan.t["dry_day_rain_mm"] for w in plan.weather]
    tractor = plan.asset("tractor")
    tractor_ready = tractor is not None and tractor.status != "offline"
    windows: dict[int, list[str]] = {}
    waiting: list[str] = []
    for paddy in plan.paddies:
        season = crops.get_crop(paddy.crop_id).season_days
        ready_at = max(season - early - paddy.days_since_planting, 0)
        if ready_at + need > horizon:
            continue
        window = next(
            (i for i in range(ready_at, horizon - need + 1) if all(dry[i : i + need])), None
        )
        if window is None:
            waiting.append(paddy.id)
        else:
            windows.setdefault(window, []).append(paddy.id)
    for window, ids in sorted(windows.items()):
        plan.add(
            "harvest_planner",
            f"Harvest {', '.join(ids)} from {plan.day(window)}",
            f"Nominal maturity is within {early} days and {need} dry days start on day "
            f"{window + 1}. "
            + (
                f"Book {tractor.id} and the trailer."
                if tractor_ready and tractor
                else "Hire a harvester."
            )
            + " Confirm grain ripeness in the field before cutting.",
            asset_id=tractor.id if tractor_ready and tractor else None,
            day_offset=window,
            priority="medium",
            evidence=[
                f"maturity within {early} days; {need} dry days needed",
                *[
                    f"day {i + 1}: {plan.weather[i].rain_mm:.1f} mm"
                    for i in range(window, window + need)
                ],
            ],
        )
    if waiting:
        plan.add(
            "harvest_planner",
            "No dry harvest window yet",
            f"{', '.join(waiting)} reach maturity in this horizon but no {need}-day dry run "
            "follows. Prepare tarpaulins and the drying floor, and check again tomorrow.",
            priority="medium",
            evidence=[
                f"dry run needed: {need} days",
                f"rain forecast: {[round(w.rain_mm, 1) for w in plan.weather]}",
            ],
        )


def _drone_pilot(plan: _Planner, pest_day: int | None) -> None:
    if pest_day is None:
        return
    drone = plan.asset("drone")
    if drone is None:
        return
    ceiling = get_settings().wind_ceiling_ms
    advisory = plan.t["spray_wind_advisory_ms"]
    floor = plan.t["spray_wind_calm_floor_ms"]
    flyable: list[int] = []
    for offset in range(pest_day, len(plan.weather)):
        day = plan.weather[offset]
        try:
            safety.check_wind(day.wind_ms)
        except safety.SafetyError:
            continue
        if day.rain_mm < plan.t["dry_day_rain_mm"]:
            flyable.append(offset)
    preferred = [i for i in flyable if floor <= plan.weather[i].wind_ms <= advisory]
    chosen = preferred[0] if preferred else flyable[0] if flyable else None
    if chosen is None:
        plan.add(
            "drone_pilot",
            f"{drone.id} grounded: wind above ceiling",
            f"Every forecast day after the risk window exceeds the {ceiling} m/s hard ceiling "
            "or is wet. Scout on foot instead.",
            asset_id=drone.id,
            day_offset=pest_day,
            priority="medium",
            blocked_reason="REJECTED_WIND_EXCEEDED",
            evidence=[
                f"hard ceiling {ceiling} m/s",
                f"winds: {[round(w.wind_ms, 1) for w in plan.weather[pest_day:]]}",
            ],
        )
        return
    day = plan.weather[chosen]
    in_band = chosen in preferred
    caution = (
        ""
        if in_band
        else f" Wind is outside the {floor}-{advisory} m/s spray advisory band, so fly scouting "
        "only and do not spray that day."
    )
    plan.add(
        "drone_pilot",
        f"Aerial scouting flight with {drone.id}",
        f"Flyable air on day {chosen + 1} ({day.wind_ms:.1f} m/s). Fly a multispectral pass over "
        "the blast-risk paddies; any spray needs a separate approved input check." + caution,
        asset_id=drone.id,
        day_offset=chosen,
        priority="medium",
        actuation={"target": "drone", "command": "scout_flight"},
        evidence=[
            f"wind {day.wind_ms:.1f} m/s",
            f"spray advisory band {floor}-{advisory} m/s",
            f"hard ceiling {ceiling} m/s",
            f"rain {day.rain_mm:.1f} mm",
        ],
    )


def plan_operations(
    paddies: Sequence[PaddyState],
    forecast: dict[str, dict[str, list[float]]],
    weather: Sequence[WeatherDay],
    assets: Sequence[Asset],
    start: date,
    standard: str | None = None,
    thresholds: Mapping[str, float] | None = None,
    hourly: Mapping[str, Sequence[Any]] | None = None,
) -> dict[str, Any]:
    if not weather:
        raise ValueError("a weather forecast is required")
    resolved = resolve_thresholds(thresholds)
    plan = _Planner(paddies, forecast, weather, assets, start, standard, resolved)
    calm = _water_steward(plan)
    _crop_scout(plan)
    pest_day = _pest_watcher(plan)
    _blb_watcher(plan)
    _harvest_planner(plan)
    _drone_pilot(plan, pest_day)

    names = [
        *(p.id for p in paddies),
        *(a.id for a in assets),
        *([standard] if standard else []),
        *(safety.prohibited_for(standard) or ()),
    ]
    for task in plan.tasks:
        missing = untraced_numbers(task, names)
        task["numbers_checked"] = not missing
        if missing and not task["blocked_reason"]:
            task["blocked_reason"] = (
                f"UNTRACED_NUMBER:{', '.join(missing)} in the text is not backed by the evidence"
            )
    rank = {"high": 0, "medium": 1, "low": 2}
    plan.tasks.sort(key=lambda t: (t["day_offset"], rank[t["priority"]]))
    counts = {member["id"]: 0 for member in CREW}
    for task in plan.tasks:
        counts[task["agent"]] += 1
    return {
        "tasks": plan.tasks,
        "crew": [{**member, "task_count": counts[member["id"]]} for member in CREW],
        "paddies_without_action": calm,
        "thresholds": {**resolved, "status": THRESHOLD_STATUS},
        "pest_thresholds": {**pest.PEST_THRESHOLDS, "status": pest.PEST_STATUS},
        "shadow": {
            "blast": pest.shadow_blast(
                hourly,
                resolved["blast_temp_min_c"],
                resolved["blast_temp_max_c"],
                _rule_blast_dates(plan),
            )
        },
        "approval_policy": "Every actuation is a proposal. It runs only after an authenticated "
        "human approval through /actuation/approve.",
    }
