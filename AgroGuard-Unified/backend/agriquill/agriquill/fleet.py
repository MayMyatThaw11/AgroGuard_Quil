from __future__ import annotations

import math
from functools import lru_cache
from typing import Any

from .farmers import resolve_thresholds

MODULUS = 2147483647
MULTIPLIER = 16807
DEFAULT_SEED = 20261011
WATCH_MARGIN_CM = 2.5
MAX_LIMIT = 3600

REGIONS: tuple[tuple[str, str, int, tuple[str, ...]], ...] = (
    (
        "AY",
        "Ayeyarwady",
        1400,
        ("Maubin", "Pyapon", "Hinthada", "Pathein", "Bogale", "Labutta", "Wakema"),
    ),
    ("BG", "Bago", 800, ("Taungoo", "Pyay", "Nyaunglebin", "Daik-U")),
    ("SG", "Sagaing", 620, ("Shwebo", "Monywa", "Kanbalu")),
    ("MD", "Mandalay", 420, ("Kyaukse", "Myittha", "Meiktila")),
    ("YG", "Yangon", 360, ("Twante", "Kawhmu", "Hmawbi")),
)
CROPS = ("Paw San rice", "Sin Thu Kha rice", "Manawthukha rice", "Black gram", "Sesame")
STAGES = ("Seedling", "Tillering", "Panicle Initiation", "Booting", "Heading", "Ripening")


def _lcg(seed: int):
    state = int(seed) % MODULUS
    if state <= 0:
        state += MODULUS - 1

    def draw() -> float:
        nonlocal state
        state = (state * MULTIPLIER) % MODULUS
        return (state - 1) / (MODULUS - 1)

    return draw


def _fixed(value: float, digits: int) -> float:
    return float(f"{value:.{digits}f}")


@lru_cache(maxsize=4)
def _build(seed: int) -> tuple[dict[str, Any], ...]:
    rand = _lcg(seed)
    fields: list[dict[str, Any]] = []
    for region_index, (code, name, count, towns) in enumerate(REGIONS):
        per_town = count / len(towns)
        for i in range(count):
            town = towns[min(len(towns) - 1, math.floor(i / per_town))]
            coop = f"{town} Coop {1 + math.floor((i % per_town) / 9):02d}"
            water = _fixed(
                -7.5
                - region_index * 0.6
                + math.sin((i + region_index * 97) / 43) * 4.6
                + math.sin(i / 7.3) * 1.5
                + (rand() - 0.5) * 3,
                1,
            )
            low = _fixed(water - 1 - rand() * 4.5, 1)
            offline = rand() < 0.02
            if region_index >= 2 and rand() < 0.4:
                crop_index = 3 + math.floor(rand() * 2)
            else:
                crop_index = math.floor(rand() * 3)
            day = math.floor(18 + rand() * 98)
            fields.append(
                {
                    "id": f"{code}-{i + 1:04d}",
                    "region": name,
                    "region_code": code,
                    "coop": coop,
                    "crop": CROPS[crop_index],
                    "stage": STAGES[min(5, day // 20)],
                    "day": day,
                    "water_cm": water,
                    "lowest_ahead_cm": low,
                    "ndvi": _fixed(0.42 + rand() * 0.4, 2),
                    "area_ha": _fixed(0.5 + rand() * 0.6, 2),
                    "offline": offline,
                }
            )
    return tuple(fields)


def classify(field: dict[str, Any], safe_depth_cm: float) -> str:
    if field["offline"]:
        return "offline"
    if field["lowest_ahead_cm"] < safe_depth_cm:
        return "alert"
    if field["lowest_ahead_cm"] < safe_depth_cm + WATCH_MARGIN_CM:
        return "watch"
    return "ok"


def list_fields(
    *,
    limit: int = 100,
    offset: int = 0,
    region: str | None = None,
    status: str | None = None,
    seed: int = DEFAULT_SEED,
    overrides: dict[str, float] | None = None,
) -> dict[str, Any]:
    thresholds = resolve_thresholds(overrides)
    safe = thresholds["awd_safe_depth_cm"]
    pool = _build(seed)
    if region:
        pool = tuple(f for f in pool if f["region_code"] == region.upper())
    rows = [{**f, "status": classify(f, safe)} for f in pool]
    counts = {
        key: sum(1 for r in rows if r["status"] == key)
        for key in ("ok", "watch", "alert", "offline")
    }
    if status:
        rows = [r for r in rows if r["status"] == status]
    page = rows[offset : offset + limit]
    return {
        "seed": seed,
        "total": len(rows),
        "offset": offset,
        "limit": limit,
        "awd_safe_depth_cm": safe,
        "counts": counts,
        "fields": page,
        "provenance": (
            "Deterministic demo fixture, not field measurements. Status thresholds TO VERIFY."
        ),
    }
