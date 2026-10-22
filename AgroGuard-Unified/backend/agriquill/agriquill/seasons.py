from __future__ import annotations

from collections.abc import Mapping
from typing import Any

DRY_MONTH_MM = 60.0
RULE = (
    "A month under 60 mm of rain is a dry month, the Koppen-Geiger tropical threshold "
    "(Peel, Finlayson and McMahon 2007, HESS 11:1633, Table 1; fetched 2026-10-22). Dry months "
    "warmer than the place's mean monthly temperature are hot dry (summer); cooler ones are cool "
    "dry (winter). The temperature split is this app's rule, not a published one."
)
LABELS = {"rainy": "Rainy", "hot_dry": "Hot dry (summer)", "cool_dry": "Cool dry (winter)"}


def calendar(normals: Mapping[str, Any]) -> dict[str, Any]:
    """Season of each month from its rain and temperature normals; unknown if a month is missing."""
    months = normals.get("months")
    if not months:
        reason = (normals.get("missing") or [{"reason": "no monthly normals"}])[0]["reason"]
        return {"months": None, "runs": [], "reason": reason, "rule": RULE}
    mean_t = sum(m["t_c"] for m in months) / 12
    labels = [
        "rainy" if m["rain_mm"] >= DRY_MONTH_MM else "hot_dry" if m["t_c"] > mean_t else "cool_dry"
        for m in months
    ]
    wet_all_year = set(labels) == {"rainy"}
    start = next((i for i in range(12) if labels[i] != labels[i - 1]), 0)
    runs: list[dict[str, Any]] = []
    for step in range(12):
        i = (start + step) % 12
        if runs and runs[-1]["season"] == labels[i]:
            runs[-1]["to"] = i + 1
        else:
            runs.append({"season": labels[i], "from": i + 1, "to": i + 1})
    by_rain = sorted(range(12), key=lambda i: months[i]["rain_mm"], reverse=True)
    return {
        "months": [
            {"month": i + 1, **m, "season": labels[i], "label": LABELS[labels[i]]}
            for i, m in enumerate(months)
        ],
        "runs": runs,
        "wet_all_year": wet_all_year,
        "wettest_months": [i + 1 for i in by_rain[:3]],
        "mean_t_c": round(mean_t, 2),
        "rule": RULE,
        "period": normals.get("period"),
        "note": normals.get("note"),
        "source": normals.get("source"),
    }


def for_location(lat: float, lon: float, month: int) -> dict[str, Any]:
    from .data import nasapower

    cal = calendar(nasapower.climatology(lat, lon))
    return {**cal, "now": now(cal, month), "month": month}


def now(cal: Mapping[str, Any], month: int) -> dict[str, Any] | None:
    runs = cal.get("runs") or []
    if not runs:
        return None

    def covers(run: Mapping[str, Any]) -> bool:
        lo, hi = run["from"], run["to"]
        return lo <= month <= hi if lo <= hi else month >= lo or month <= hi

    index = next(i for i, r in enumerate(runs) if covers(r))
    upcoming = runs[(index + 1) % len(runs)] if len(runs) > 1 else None
    return {
        "season": runs[index]["season"],
        "label": LABELS[runs[index]["season"]],
        "until_month": runs[index]["to"],
        "next": dict(upcoming) if upcoming else None,
    }
