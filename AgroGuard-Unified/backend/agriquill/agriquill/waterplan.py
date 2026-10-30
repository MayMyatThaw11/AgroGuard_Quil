from __future__ import annotations

import math
from typing import Any

OPEN_WATER_KC = 1.05
OPEN_WATER_KC_SOURCE = "FAO-56 Table 12: open water under 2 m deep, tropical climate"
MAX_TRENCH_SHARE = 0.10
STATUS = "TO VERIFY against a local seepage test and extension guidance before field use"
SEEPAGE_MM_DAY: dict[str, tuple[float, float]] = {
    "clay": (1.0, 3.0),
    "loam": (3.0, 8.0),
    "sandy": (15.0, 30.0),
}
PIPE_MM = (50, 63, 75, 90, 110, 125, 160, 200)
HAZEN_C = {"pvc": 150.0, "hdpe": 140.0, "steel": 120.0}
MAX_VELOCITY_M_S = 1.5
WATER_KG_M3 = 1000.0
GRAVITY = 9.81


def trench_geometry(
    length_m: float, top_w_m: float, depth_m: float, side_slope: float = 1.0
) -> dict[str, float]:
    bottom = top_w_m - 2.0 * side_slope * depth_m
    if bottom <= 0:
        raise ValueError("the side slopes close the bottom: widen the top or reduce the depth")
    section = (top_w_m + bottom) / 2.0 * depth_m
    return {
        "length_m": length_m,
        "top_w_m": top_w_m,
        "bottom_w_m": round(bottom, 3),
        "depth_m": depth_m,
        "volume_m3": round(section * length_m, 3),
        "surface_m2": round(top_w_m * length_m, 3),
    }


def size_trench(
    area_ha: float, perimeter_m: float, share: float, depth_m: float, side_slope: float = 1.0
) -> dict[str, float]:
    if not 0 < share <= MAX_TRENCH_SHARE:
        raise ValueError(f"trench share must be above 0 and at most {MAX_TRENCH_SHARE:.0%}")
    surface = share * area_ha * 10000.0
    top = surface / perimeter_m
    plan = trench_geometry(perimeter_m, top, depth_m, side_slope)
    return {**plan, "share": round(plan["surface_m2"] / (area_ha * 10000.0), 4)}


def evaporation_mm(et0_mm: float, kc: float = OPEN_WATER_KC) -> float:
    return et0_mm * kc


def simulate_level(
    days: list[dict[str, Any]],
    start_cm: float,
    seep_mm_day: float,
    full_cm: float | None = None,
    kc: float = OPEN_WATER_KC,
) -> list[dict[str, Any]]:
    level = start_cm
    out = []
    for day in days:
        net_mm = float(day["rain_mm"]) - evaporation_mm(float(day["et0_mm"]), kc) - seep_mm_day
        level += net_mm / 10.0
        spill = 0.0
        if full_cm is not None and level > full_cm:
            spill = (level - full_cm) * 10.0
            level = full_cm
        level = max(level, 0.0)
        out.append(
            {
                "date": day["date"],
                "level_cm": round(level, 4),
                "net_mm": round(net_mm, 3),
                "spill_mm": round(spill, 3),
            }
        )
    return out


def first_below(run: list[dict[str, Any]], min_cm: float) -> dict[str, Any] | None:
    return next((row for row in run if row["level_cm"] < min_cm), None)


def refill_m3(level_cm: float, target_cm: float, surface_m2: float) -> float:
    return max(target_cm - level_cm, 0.0) / 100.0 * surface_m2


def refill_days(volume_m3: float, pump_l_s: float, hours_per_day: float) -> float:
    per_day = pump_l_s * 3600.0 * hours_per_day / 1000.0
    return volume_m3 / per_day if per_day > 0 else math.inf


def hazen_williams_loss_m(q_l_s: float, length_m: float, d_mm: float, c: float) -> float:
    q = q_l_s / 1000.0
    d = d_mm / 1000.0
    return 10.67 * length_m * q**1.852 / (c**1.852 * d**4.87)


def pipe_size(
    q_l_s: float, length_m: float, max_loss_m: float, material: str = "hdpe"
) -> dict[str, Any]:
    c = HAZEN_C[material]
    for d_mm in PIPE_MM:
        area = math.pi / 4.0 * (d_mm / 1000.0) ** 2
        velocity = q_l_s / 1000.0 / area
        loss = hazen_williams_loss_m(q_l_s, length_m, d_mm, c)
        if velocity <= MAX_VELOCITY_M_S and loss <= max_loss_m:
            return {
                "d_mm": d_mm,
                "velocity_m_s": round(velocity, 3),
                "loss_m": round(loss, 3),
                "material": material,
                "c": c,
            }
    raise ValueError("no standard pipe diameter meets the velocity and head-loss limits")


def pump_kw(q_l_s: float, head_m: float, efficiency: float = 0.55) -> float:
    return WATER_KG_M3 * GRAVITY * (q_l_s / 1000.0) * head_m / efficiency / 1000.0
