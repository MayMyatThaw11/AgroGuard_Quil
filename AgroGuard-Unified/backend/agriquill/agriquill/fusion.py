from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

PROCESS_VAR_CM2_PER_H = 0.04
READING_VAR_CM2 = {"lorawan": 0.25, "manual": 1.0}
DEFAULT_READING_VAR_CM2 = 1.0
OUTLIER_SIGMA = 3.0
Z90 = 1.2816
ASSUMPTIONS = {
    "process_variance_cm2_per_hour": PROCESS_VAR_CM2_PER_H,
    "reading_variance_cm2": READING_VAR_CM2,
    "outlier_sigma": OUTLIER_SIGMA,
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
    for i in range(start, len(times)):
        for row in sorted(by_hour.get(i, []), key=lambda r: r["observed_at"]):
            z, r = float(row["value"]), reading_variance(row["source"])
            if x is None:
                x, p = z, r
                updates += 1
                continue
            s = p + r
            innovation = z - x
            if abs(innovation) > OUTLIER_SIGMA * math.sqrt(s):
                flags.append(
                    {
                        "observed_at": row["observed_at"],
                        "reading_cm": z,
                        "predicted_cm": round(x, 2),
                        "kind": "unmodelled_inflow" if innovation > 0 else "fast_drawdown",
                        "meaning": "irrigation, unforecast rain or a blocked drain"
                        if innovation > 0
                        else "bund leak, higher percolation or a sensor fault",
                    }
                )
                x, p = z, r
            else:
                gain = p / s
                x, p = x + gain * innovation, (1 - gain) * p
            updates += 1
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
        if _day_end(times, i):
            sigma = math.sqrt(p)
            if i < now_index:
                past.append(
                    {"date": times[i][:10], "depth_cm": round(x, 2), "sigma_cm": round(sigma, 2)}
                )
            else:
                forward.append(
                    {
                        "p10": round(x - Z90 * sigma, 2),
                        "p50": round(x, 2),
                        "p90": round(x + Z90 * sigma, 2),
                    }
                )
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
        "updates": updates,
        "flags": flags,
    }
