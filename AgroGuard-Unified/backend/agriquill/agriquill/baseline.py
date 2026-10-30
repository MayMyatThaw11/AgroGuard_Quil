from __future__ import annotations

from datetime import date
from typing import Any

from .data import fao_pack
from .store import missing

OFFICIAL_FLAG = "A"
MAX_AGE_YEARS = 5
DEFAULT_COUNTRY = "MMR"

PRODUCE_FAO_ITEM: dict[str, str] = {
    "rice": "Rice",
    "maize": "Maize (corn)",
    "pulses": "Pulses, Total",
    "onion": "Onions and shallots, dry (excluding dehydrated)",
    "chili": "Chillies and peppers, dry (Capsicum spp., Pimenta spp.), raw",
    "tomato": "Tomatoes",
    "potato": "Potatoes",
    "vegetables": "Vegetables Primary",
    "fruit": "Fruit Primary",
}
CALENDAR_CROP: dict[str, tuple[str, ...]] = {
    "rice": ("rice",),
    "maize": ("maize", "corn"),
    "onion": ("onion",),
    "tomato": ("tomato",),
    "potato": ("potato",),
    "chili": ("chili", "chilli", "pepper"),
    "pulses": ("bean", "pea", "lentil", "gram", "pulse"),
}


def official_yield(country: str, produce: str, today: date | None = None) -> dict[str, Any]:
    item = PRODUCE_FAO_ITEM.get(produce)
    if item is None:
        return missing("yield", f"no FAOSTAT item is mapped for {produce}")
    out = fao_pack.faostat_qcl(country, item, "Yield")
    rows = [r for r in out["records"] if r["value"] is not None]
    if not rows:
        return missing(
            "yield", out["missing"][0]["reason"] if out["missing"] else "no FAOSTAT yield"
        )
    oldest = (today or date.today()).year - MAX_AGE_YEARS
    official = [r for r in rows if r["flag"] == OFFICIAL_FLAG and r["year"] >= oldest]
    if not official:
        latest = max(rows, key=lambda r: r["year"])
        return missing("yield", f"FAOSTAT has no official figure since {oldest}") | {
            "context": {
                "kg_ha": latest["value"],
                "year": latest["year"],
                "flag": latest["flag"],
                "note": latest["flag_meaning"],
            },
            "source": out["source"],
        }
    best = max(official, key=lambda r: r["year"])
    return {
        "kg_ha": best["value"],
        "year": best["year"],
        "flag": best["flag"],
        "item": best["item"],
        "provenance": "OFFICIAL_RECORD",
        "source": out["source"],
    }


def _months(start: Any, end: Any) -> set[int]:
    try:
        first, last = int(start["month"]), int(end["month"])
    except (KeyError, TypeError, ValueError):
        return set()
    span = (last - first) % 12
    return {(first - 1 + i) % 12 + 1 for i in range(span + 1)}


def season_months(country: str, produce: str, aez: str | None = None) -> dict[str, Any]:
    names = CALENDAR_CROP.get(produce)
    if not names:
        return missing("season", f"no FAO crop calendar crop is mapped for {produce}")
    calendar: dict[str, Any] = {}
    for name in names:
        calendar = fao_pack.crop_calendar(country, name)
        if calendar["entries"]:
            break
    entries = [e for e in calendar["entries"] if not aez or aez.lower() in e["aez"].lower()]
    if not entries:
        reason = (
            calendar["missing"][0]["reason"] if calendar["missing"] else f"no entry for {produce}"
        )
        return missing("season", reason)
    plant: set[int] = set()
    harvest: set[int] = set()
    for entry in entries:
        for session in entry["sessions"]:
            if session.get("all_year") == "yes":
                plant |= set(range(1, 13))
                harvest |= set(range(1, 13))
                continue
            plant |= _months(session.get("early_sowing"), session.get("later_sowing"))
            harvest |= _months(session.get("early_harvest"), session.get("late_harvest"))
    return {
        "plant": sorted(plant),
        "harvest": sorted(harvest),
        "crop": entries[0]["crop"],
        "aez": sorted({e["aez"] for e in entries}),
        "provenance": "OFFICIAL_RECORD",
        "source": calendar["source"],
    }


def summary(country: str, produce: str, today: date | None = None) -> dict[str, Any]:
    return {
        "yield": official_yield(country, produce, today),
        "season": season_months(country, produce),
    }
