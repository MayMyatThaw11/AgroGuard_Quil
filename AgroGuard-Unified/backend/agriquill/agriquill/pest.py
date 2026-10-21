from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

# Every number here is a starting point, not a measured fact. TO VERIFY against local
# extension guidance and against pilot-farm outcomes before anyone acts on the result alone.
PEST_THRESHOLDS: dict[str, float] = {
    # An hour counts as "leaf wet" when humidity is this high or rain is falling. There are no
    # leaf-wetness sensors on these farms, so this is a proxy for dew and rain on the canopy.
    "leaf_wet_rh_pct": 90.0,
    "leaf_wet_rain_mm": 0.1,
    # Blast needs a long unbroken wet spell inside the mild temperature band.
    "blast_wet_run_h": 10.0,
    # Bacterial leaf blight spreads through leaf wounds that wind-driven rain makes.
    "blb_rain_mm": 25.0,
    "blb_wind_ms": 6.0,
}
PEST_STATUS = "TO VERIFY against local extension guidance before field use"

SHADOW_NOTE = (
    "Shadow model: shown beside the daily rule so the two can be compared on pilot-farm "
    "outcomes. It does not create tasks until it does better than the rule it would replace."
)


def _wet(hourly: Mapping[str, Sequence[Any]], i: int) -> bool:
    rh = hourly.get("relative_humidity_2m")
    rain = hourly.get("precipitation")
    humid = rh is not None and rh[i] is not None and rh[i] >= PEST_THRESHOLDS["leaf_wet_rh_pct"]
    rainy = (
        rain is not None and rain[i] is not None and rain[i] >= PEST_THRESHOLDS["leaf_wet_rain_mm"]
    )
    return humid or rainy


def shadow_blast(
    hourly: Mapping[str, Sequence[Any]] | None,
    temp_min_c: float,
    temp_max_c: float,
    rule_dates: Sequence[str],
) -> dict[str, Any]:
    """Leaf-wetness blast model, run beside the daily rule and never acting on its own.

    For each day it finds the longest unbroken run of wet hours (RH or rain) that all sit
    inside the blast temperature band, counted on the day the run ends. A day is flagged when
    that run reaches `blast_wet_run_h`. Missing hours break a run: unknown is not wet.
    """
    needed = ("time", "temperature_2m", "relative_humidity_2m")
    if not hourly or any(not hourly.get(key) for key in needed):
        return {
            "status": "shadow",
            "available": False,
            "reason": "hourly humidity and temperature are not available for this plan",
            "note": SHADOW_NOTE,
        }
    times = hourly["time"]
    temps = hourly["temperature_2m"]
    longest: dict[str, int] = {}
    run = 0
    for i, stamp in enumerate(times):
        t = temps[i]
        in_band = t is not None and temp_min_c <= t <= temp_max_c
        run = run + 1 if in_band and _wet(hourly, i) else 0
        day = str(stamp)[:10]
        longest[day] = max(longest.get(day, 0), run)
    need = PEST_THRESHOLDS["blast_wet_run_h"]
    days = [
        {"date": day, "wet_run_h": hours, "flag": hours >= need} for day, hours in longest.items()
    ]
    flagged = [day for day, hours in longest.items() if hours >= need]
    agree = sorted(set(flagged) & set(rule_dates))
    return {
        "status": "shadow",
        "available": True,
        "model": "leaf-wetness hours",
        "wet_run_threshold_h": need,
        "thresholds": {k: v for k, v in PEST_THRESHOLDS.items() if k.startswith("leaf_wet")},
        "days": days,
        "flagged_dates": flagged,
        "rule_dates": list(rule_dates),
        "only_shadow": sorted(set(flagged) - set(rule_dates)),
        "only_rule": sorted(set(rule_dates) - set(flagged)),
        "agree_dates": agree,
        "threshold_status": PEST_STATUS,
        "note": SHADOW_NOTE,
    }
