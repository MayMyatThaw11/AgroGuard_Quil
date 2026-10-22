from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

WET_MM_H = 0.2  # an hour with at least this much rain wets cut paddy, TO VERIFY
LOOKAHEAD_H = 24
DAY_START_H = 6
HOLD_H = 2  # a dryer may wait this long for a lot about to be cut that faces more rain

Rain = Mapping[str, Sequence[float]]


def _ahead(rain: Rain, field: str, hour: int) -> float:
    return float(sum(rain.get(field, ())[hour : hour + LOOKAHEAD_H]))


def plan_by_rain(lots: Sequence[dict[str, Any]], forecast: Rain, dryers: int) -> dict[str, int]:
    """Greedy B-OP-2: when a dryer frees up, the lot (cut now or within HOLD_H) facing most rain."""
    free = [0] * dryers
    waiting = list(lots)
    starts: dict[str, int] = {}
    while waiting:
        hour = max(min(free), min(lot["ready_h"] for lot in waiting))
        soon = [lot for lot in waiting if lot["ready_h"] <= hour + HOLD_H]
        lot = max(soon, key=lambda lot: (_ahead(forecast, lot["field"], hour), -lot["ready_h"]))
        slot = free.index(min(free))
        starts[lot["id"]] = max(hour, lot["ready_h"])
        free[slot] = starts[lot["id"]] + lot["dry_h"]
        waiting.remove(lot)
    return starts


def plan_by_day(lots: Sequence[dict[str, Any]], dryers: int) -> dict[str, int]:
    """Day-level baseline: first cut, first dried, from the next 06:00."""
    free = [0] * dryers
    starts: dict[str, int] = {}
    for lot in sorted(lots, key=lambda lot: lot["ready_h"]):
        day, hour = divmod(lot["ready_h"], 24)
        morning = (day + (hour > DAY_START_H)) * 24 + DAY_START_H
        slot = free.index(min(free))
        starts[lot["id"]] = max(morning, free[slot])
        free[slot] = starts[lot["id"]] + lot["dry_h"]
    return starts


def wet_hours(lots: Sequence[dict[str, Any]], starts: Mapping[str, int], observed: Rain) -> int:
    """Hours each cut lot sat in its field's observed rain before its dryer started."""
    total = 0
    for lot in lots:
        series = observed.get(lot["field"], ())
        total += sum(
            1
            for h in range(lot["ready_h"], starts[lot["id"]])
            if h < len(series) and series[h] >= WET_MM_H
        )
    return total


def replay(
    lots: Sequence[dict[str, Any]], forecast: Rain, observed: Rain, dryers: int
) -> dict[str, Any]:
    """Plan on the forecast, then score both plans on the rain that actually fell."""
    by_rain, by_day = plan_by_rain(lots, forecast, dryers), plan_by_day(lots, dryers)
    rain_wet, day_wet = wet_hours(lots, by_rain, observed), wet_hours(lots, by_day, observed)
    return {
        "status": "shadow",
        "wet_hours": {"by_rain": rain_wet, "by_day": day_wet},
        "better": rain_wet < day_wet,
        "starts": {"by_rain": by_rain, "by_day": by_day},
        "rule": "planned on the forecast, scored on observed rain; wet hour threshold TO VERIFY",
    }
