from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np

PROCESS_VAR_CM2_PER_H = 0.04
READING_VAR_CM2 = {"lorawan": 0.25, "manual": 1.0}
DEFAULT_READING_VAR_CM2 = 1.0
OUTLIER_SIGMA = 3.0
HUBER_K = 1.345
CONFIRM_WINDOW_H = 96
Z90 = 1.2816
ASSUMPTIONS = {
    "process_variance_cm2_per_hour": PROCESS_VAR_CM2_PER_H,
    "reading_variance_cm2": READING_VAR_CM2,
    "outlier_sigma": OUTLIER_SIGMA,
    "robust_update": f"Huber weight min(1, {HUBER_K}/|z|) beyond {OUTLIER_SIGMA} sigma; a jump "
    f"is accepted only when a second reading within {CONFIRM_WINDOW_H} h agrees",
    "status": "TO VERIFY: noise levels are engineering assumptions until field-calibrated",
}


def local_hour(moment: datetime, offset_s: int) -> str:
    return (moment.astimezone(UTC) + timedelta(seconds=offset_s)).strftime("%Y-%m-%dT%H:00")


def reading_variance(source: str) -> float:
    return READING_VAR_CM2.get(source.split(":")[0], DEFAULT_READING_VAR_CM2)


def _forcing(hourly: dict[str, list[Any]], i: int, kc: float, perc: float) -> float | None:
    et0 = hourly["et0_fao_evapotranspiration"][i]
    rain = hourly["precipitation"][i]
    if et0 is None or rain is None:
        return None
    return (rain - et0 * kc - perc / 24.0) / 10.0


def _day_end(times: list[str], i: int) -> bool:
    return i + 1 == len(times) or times[i + 1][:10] != times[i][:10]


def kalman_depth(
    readings: list[dict[str, Any]],
    hourly: dict[str, list[Any]],
    offset_s: int,
    now_index: int,
    kc: float,
    perc_mm_day: float,
) -> dict[str, Any]:
    times = hourly["time"]
    by_hour: dict[int, list[dict[str, Any]]] = {}
    for row in readings:
        stamp = local_hour(datetime.fromisoformat(row["observed_at"]), offset_s)
        if not times or stamp < times[0]:
            continue
        index = next((i for i, t in enumerate(times) if t >= stamp), len(times))
        if index <= now_index:
            by_hour.setdefault(min(index, now_index), []).append(row)
    if not by_hour:
        return {"now": None, "reason": "no reading inside the weather window"}
    start = min(by_hour)
    x: float | None = None
    p = 0.0
    flags: list[dict[str, Any]] = []
    updates = 0
    past: list[dict[str, Any]] = []
    forward: list[dict[str, float]] = []
    now: tuple[float, float] | None = None
    pending: dict[str, Any] | None = None
    conflict = False
    for i in range(start, len(times)):
        for row in sorted(by_hour.get(i, []), key=lambda r: r["observed_at"]):
            z, r = float(row["value"]), reading_variance(row["source"])
            if x is None:
                x, p = z, r
                updates += 1
                continue
            updates += 1
            if pending is not None and i - pending["hour"] > CONFIRM_WINDOW_H:
                pending = None
            if pending is not None:
                hours = i - pending["hour"]
                tolerance = OUTLIER_SIGMA * math.sqrt(
                    pending["r"] + r + PROCESS_VAR_CM2_PER_H * hours
                )
                agrees = abs(z - pending["x"]) <= tolerance
                pending["flag"]["status"] = "confirmed" if agrees else "conflicting"
                pending = None
                if agrees:
                    x, p = z, r
                    continue
                conflict = True
            s = p + r
            innovation = z - x
            if abs(innovation) > OUTLIER_SIGMA * math.sqrt(s):
                flag = {
                    "observed_at": row["observed_at"],
                    "reading_cm": z,
                    "predicted_cm": round(x, 2),
                    "kind": "unmodelled_inflow" if innovation > 0 else "fast_drawdown",
                    "meaning": "irrigation, unforecast rain or a blocked drain"
                    if innovation > 0
                    else "bund leak, higher percolation or a sensor fault",
                    "status": "unconfirmed",
                }
                flags.append(flag)
                pending = {"x": z, "r": r, "hour": i, "flag": flag}
                weight = HUBER_K / (abs(innovation) / math.sqrt(s))
                gain = weight * p / s
            else:
                gain = p / s
            x, p = x + gain * innovation, (1 - gain) * p
        if i == now_index:
            now = (x, p) if x is not None else None
        if x is None:
            continue
        step = _forcing(hourly, i, kc, perc_mm_day)
        if step is None:
            if i < now_index:
                return {"now": None, "reason": f"weather hour {times[i]} lacks rain or ET0"}
            break
        x, p = x + step, p + PROCESS_VAR_CM2_PER_H
        if pending is not None:
            pending["x"] += step
        if _day_end(times, i):
            sigma = math.sqrt(p)
            if i < now_index:
                past.append(
                    {"date": times[i][:10], "depth_cm": round(x, 2), "sigma_cm": round(sigma, 2)}
                )
            else:
                forward.append(
                    {
                        "date": times[i][:10],
                        "p10": round(x - Z90 * sigma, 2),
                        "p50": round(x, 2),
                        "p90": round(x + Z90 * sigma, 2),
                    }
                )
    if conflict:
        return {
            "now": None,
            "reason": "unknown: conflicting readings; a jump was not confirmed by the next "
            "reading. Check the tube and the bunds, then log a new reading",
            "flags": flags,
        }
    if now is None and x is not None and now_index >= len(times):
        now = (x, p)
    if now is None or now[0] is None:
        return {"now": None, "reason": "the filter could not reach the current hour"}
    return {
        "now": round(now[0], 2),
        "sigma_cm": round(math.sqrt(now[1]), 2),
        "past": past,
        "band": {
            "p10": [f["p10"] for f in forward],
            "p50": [f["p50"] for f in forward],
            "p90": [f["p90"] for f in forward],
        },
        "band_dates": [f["date"] for f in forward],
        "updates": updates,
        "flags": flags,
    }


# B-TS-5 shadow: state [depth cm, percolation mm/day, Kc offset]. Priors and noise TO VERIFY.
PERC_PRIOR_SD_MM_DAY = 2.0
KC_PRIOR_SD = 0.1
PERC_WALK_VAR = 0.01
KC_WALK_VAR = 1e-5
PROMOTE_MIN_PAIRS = 30


def _augmented_walk(
    by_hour: dict[int, list[dict[str, Any]]],
    hourly: dict[str, list[Any]],
    kc: float,
    perc_mm_day: float,
    augmented: bool,
) -> list[tuple[float, float]]:
    """Walk forward hour by hour; before each reading record (reading, prediction from the past)."""
    times = hourly["time"]
    x = np.array([0.0, perc_mm_day, 0.0])
    p = np.diag([0.0, PERC_PRIOR_SD_MM_DAY**2, KC_PRIOR_SD**2]) if augmented else np.zeros((3, 3))
    q = np.diag(
        [PROCESS_VAR_CM2_PER_H, PERC_WALK_VAR, KC_WALK_VAR]
        if augmented
        else [PROCESS_VAR_CM2_PER_H, 0, 0]
    )
    h = np.array([1.0, 0.0, 0.0])
    started = False
    pairs: list[tuple[float, float]] = []
    for i in range(min(by_hour), len(times)):
        for row in sorted(by_hour.get(i, []), key=lambda r: r["observed_at"]):
            z, r = float(row["value"]), reading_variance(row["source"])
            if not started:
                x[0], p[0, 0], started = z, r, True
                continue
            pairs.append((z, float(x[0])))
            s = float(h @ p @ h) + r
            innovation = z - x[0]
            weight = min(1.0, HUBER_K / (abs(innovation) / math.sqrt(s))) if innovation else 1.0
            gain = weight * (p @ h) / s
            x = x + gain * innovation
            p = (np.eye(3) - np.outer(gain, h)) @ p
        et0, rain = hourly["et0_fao_evapotranspiration"][i], hourly["precipitation"][i]
        if et0 is None or rain is None or not started:
            continue
        f = np.array([[1.0, -1 / 240.0, -et0 / 10.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        x[0] += (rain - et0 * (kc + x[2]) - x[1] / 24.0) / 10.0
        p = f @ p @ f.T + q
    return pairs


def next_reading_backtest(
    readings: list[dict[str, Any]],
    hourly: dict[str, list[Any]],
    offset_s: int,
    kc: float,
    perc_mm_day: float,
) -> dict[str, Any]:
    """Score both filters on each next reading, using only earlier readings for each prediction."""
    times = hourly["time"]
    by_hour: dict[int, list[dict[str, Any]]] = {}
    for row in readings:
        stamp = local_hour(datetime.fromisoformat(row["observed_at"]), offset_s)
        index = next((i for i, t in enumerate(times) if t >= stamp), None)
        if index is not None and times and stamp >= times[0]:
            by_hour.setdefault(index, []).append(row)
    if len(by_hour) < 2:
        return {"status": "shadow", "pairs": 0, "reason": "needs two readings inside the window"}
    scores: dict[str, float | None] = {}
    for name, flag in (("one_state", False), ("augmented", True)):
        pairs = _augmented_walk(by_hour, hourly, kc, perc_mm_day, flag)
        scores[name] = round(sum(abs(z - y) for z, y in pairs) / len(pairs), 3) if pairs else None
    n = sum(len(v) for v in by_hour.values()) - 1
    one, aug = scores["one_state"], scores["augmented"]
    better = one is not None and aug is not None and aug < one
    return {
        "status": "promote" if better and n >= PROMOTE_MIN_PAIRS else "shadow",
        "pairs": n,
        "mae_cm": scores,
        "rule": f"promote only when the augmented filter has the lower next-reading MAE on "
        f"{PROMOTE_MIN_PAIRS} or more pairs",
        "priors": {
            "percolation_mm_day": [perc_mm_day, PERC_PRIOR_SD_MM_DAY],
            "kc_offset": [0.0, KC_PRIOR_SD],
            "status": "TO VERIFY",
        },
    }
