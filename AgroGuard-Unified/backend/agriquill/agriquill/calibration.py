from __future__ import annotations

from statistics import median
from typing import Any

# Our rule, not a standard: a correction needs this many scored seasons before it is judged.
MIN_PAIRS = 3
RULE = (
    "our rule: a correction is used only when its leave-one-out error is below both the raw "
    f"engine's error and the national baseline's error, on at least {MIN_PAIRS} scored seasons"
)
BASIS = (
    "factor = median of measured / engine over the farm's scored seasons; leave-one-out error "
    "applies the factor learned from the other seasons to each held-out season; errors are "
    "mean absolute % of the measured dry grain"
)

Pair = tuple[float, float]


def _usable(pairs: list[Pair]) -> list[Pair]:
    return [(engine, measured) for engine, measured in pairs if engine > 0 and measured > 0]


def factor(pairs: list[Pair]) -> float:
    return float(median(measured / engine for engine, measured in _usable(pairs)))


def _mape(errors: list[float]) -> float:
    return sum(errors) / len(errors)


def raw_mape(pairs: list[Pair]) -> float:
    return _mape([abs(engine - measured) / measured * 100 for engine, measured in _usable(pairs)])


def leave_one_out(pairs: list[Pair]) -> float:
    rows = _usable(pairs)
    errors = []
    for i, (engine, measured) in enumerate(rows):
        learned = factor(rows[:i] + rows[i + 1 :])
        errors.append(abs(engine * learned - measured) / measured * 100)
    return _mape(errors)


def calibrate(pairs: list[Pair], baseline_mape: float | None) -> dict[str, Any]:
    rows = _usable(pairs)
    out: dict[str, Any] = {
        "pairs": len(rows),
        "factor": None,
        "raw_mape_pct": None,
        "leave_one_out_mape_pct": None,
        "baseline_mape_pct": None if baseline_mape is None else round(baseline_mape, 2),
        "status": "shadow",
        "reason": None,
        "rule": RULE,
        "basis": BASIS,
    }
    if len(rows) < MIN_PAIRS:
        out["reason"] = f"too few seasons ({len(rows)} of {MIN_PAIRS})"
        return out
    raw, held_out = raw_mape(rows), leave_one_out(rows)
    out.update(
        factor=round(factor(rows), 4),
        raw_mape_pct=round(raw, 2),
        leave_one_out_mape_pct=round(held_out, 2),
    )
    if baseline_mape is None:
        out["reason"] = "no national baseline to compare against"
    elif held_out >= raw:
        out["reason"] = "the correction does not beat the raw engine on held-out seasons"
    elif held_out >= baseline_mape:
        out["reason"] = "the correction does not beat the national baseline on held-out seasons"
    else:
        out["status"] = "promoted"
    return out
