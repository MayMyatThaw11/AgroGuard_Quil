from __future__ import annotations

import math
from typing import Any

from . import waterplan

STATUS = "TO VERIFY against local extension guidance and a test batch before stocking"
TRENCH_SHARE = 0.08
TRENCH_DEPTH_M = 0.6
POND_SHARE = 0.10
FRESH_PPT = 3.0
SPECIES: dict[str, dict[str, Any]] = {
    "nile_tilapia": {
        "name": "Nile tilapia",
        "latin": "Oreochromis niloticus",
        "kind": "fish",
        "salinity": (0.0, 15.0),
        "temp": (25.0, 32.0),
        "cycle_days": 150,
        "pond_per_m2": 3.0,
        "rice_per_ha": 2000,
        "survival": 0.85,
        "harvest_g": 400,
        "fcr": 1.6,
        "intensity": "semi",
    },
    "rohu": {
        "name": "Rohu",
        "latin": "Labeo rohita",
        "kind": "fish",
        "salinity": (0.0, 2.0),
        "temp": (25.0, 32.0),
        "cycle_days": 270,
        "pond_per_m2": 1.0,
        "rice_per_ha": 3000,
        "survival": 0.75,
        "harvest_g": 800,
        "fcr": 1.8,
        "intensity": "semi",
    },
    "common_carp": {
        "name": "Common carp",
        "latin": "Cyprinus carpio",
        "kind": "fish",
        "salinity": (0.0, 4.0),
        "temp": (20.0, 30.0),
        "cycle_days": 240,
        "pond_per_m2": 1.0,
        "rice_per_ha": 3000,
        "survival": 0.75,
        "harvest_g": 700,
        "fcr": 1.8,
        "intensity": "semi",
    },
    "pangasius": {
        "name": "Striped catfish (pangasius)",
        "latin": "Pangasianodon hypophthalmus",
        "kind": "fish",
        "salinity": (0.0, 3.0),
        "temp": (26.0, 30.0),
        "cycle_days": 210,
        "pond_per_m2": 20.0,
        "rice_per_ha": None,
        "survival": 0.8,
        "harvest_g": 1000,
        "fcr": 1.6,
        "intensity": "intensive",
    },
    "giant_freshwater_prawn": {
        "name": "Giant freshwater prawn",
        "latin": "Macrobrachium rosenbergii",
        "kind": "shrimp",
        "salinity": (0.0, 3.0),
        "temp": (28.0, 31.0),
        "cycle_days": 150,
        "pond_per_m2": 5.0,
        "rice_per_ha": None,
        "survival": 0.6,
        "harvest_g": 40,
        "fcr": 1.8,
        "intensity": "semi",
    },
    "whiteleg_shrimp": {
        "name": "Whiteleg shrimp",
        "latin": "Litopenaeus vannamei",
        "kind": "shrimp",
        "salinity": (5.0, 35.0),
        "temp": (28.0, 32.0),
        "cycle_days": 110,
        "pond_per_m2": 30.0,
        "rice_per_ha": 40000,
        "survival": 0.7,
        "harvest_g": 18,
        "fcr": 1.4,
        "intensity": "intensive",
    },
    "black_tiger": {
        "name": "Black tiger shrimp",
        "latin": "Penaeus monodon",
        "kind": "shrimp",
        "salinity": (10.0, 30.0),
        "temp": (26.0, 32.0),
        "cycle_days": 135,
        "pond_per_m2": 6.0,
        "rice_per_ha": 40000,
        "survival": 0.4,
        "harvest_g": 28,
        "fcr": 0.8,
        "intensity": "extensive",
    },
    "pekin_duck": {
        "name": "Pekin duck",
        "latin": "Anas platyrhynchos domesticus",
        "kind": "duck",
        "salinity": (0.0, 99.0),
        "temp": (5.0, 38.0),
        "cycle_days": 56,
        "rice_per_ha": 200,
        "survival": 0.9,
        "harvest_g": 3000,
        "fcr": 2.8,
        "intensity": "semi",
    },
    "khaki_campbell": {
        "name": "Khaki Campbell duck",
        "latin": "Anas platyrhynchos domesticus",
        "kind": "duck",
        "salinity": (0.0, 99.0),
        "temp": (5.0, 38.0),
        "cycle_days": 365,
        "rice_per_ha": 200,
        "survival": 0.9,
        "harvest_g": 1800,
        "fcr": 3.0,
        "intensity": "semi",
        "eggs_per_year": 250,
    },
    "native_chicken": {
        "name": "Native free-range chicken",
        "latin": "Gallus gallus domesticus",
        "kind": "chicken",
        "salinity": (0.0, 99.0),
        "temp": (5.0, 38.0),
        "cycle_days": 120,
        "dike_per_ha": 200,
        "survival": 0.8,
        "harvest_g": 1500,
        "fcr": 4.0,
        "intensity": "extensive",
    },
    "broiler": {
        "name": "Broiler chicken",
        "latin": "Gallus gallus domesticus",
        "kind": "chicken",
        "salinity": (0.0, 99.0),
        "temp": (5.0, 38.0),
        "cycle_days": 38,
        "dike_per_ha": 300,
        "survival": 0.95,
        "harvest_g": 2000,
        "fcr": 1.7,
        "intensity": "intensive",
    },
}
FIT = ("weak", "good", "strong")


def species_for(
    salinity_ppt: float | None, temp_c: float | None, kinds: tuple[str, ...] | None = None
) -> list[dict[str, Any]]:
    out = []
    for sid, s in SPECIES.items():
        if kinds and s["kind"] not in kinds:
            continue
        if salinity_ppt is not None and not s["salinity"][0] <= salinity_ppt <= s["salinity"][1]:
            continue
        if temp_c is not None and not s["temp"][0] <= temp_c <= s["temp"][1]:
            continue
        out.append({"id": sid, **s})
    return out


ROI_MIN = 3.0


def margin(
    species_id: str, units: float, prices: dict[str, float] | None, fed: bool = True
) -> dict[str, Any]:
    s = SPECIES[species_id]
    prices = prices or {}
    needed = ["sell_mmk_kg", "seed_mmk_each"] + (["feed_mmk_kg"] if fed and s["fcr"] else [])
    absent = [k for k in needed if prices.get(k) is None]
    kg = units * s["survival"] * s["harvest_g"] / 1000.0
    base = {"units": units, "harvest_kg": kg, "cycle_days": s["cycle_days"]}
    if absent:
        return {**base, "missing": absent}
    feed_kg = s["fcr"] * kg if fed else 0.0
    revenue = kg * prices["sell_mmk_kg"]
    cost = units * prices["seed_mmk_each"] + feed_kg * prices.get("feed_mmk_kg", 0.0)
    return {
        **base,
        "revenue_mmk": revenue,
        "cost_mmk": cost,
        "margin_mmk": revenue - cost,
        "roi_x": round(revenue / cost, 2) if cost else None,
        "roi_ok": revenue >= ROI_MIN * cost,
        "missing": [],
    }


def rank_species(
    ids: list[str], pond_m2: float, prices: dict[str, dict[str, float]]
) -> list[dict[str, Any]]:
    rows = []
    for sid in ids:
        s = SPECIES[sid]
        rows.append(
            {
                "id": sid,
                "name": s["name"],
                "margin": margin(sid, s["pond_per_m2"] * pond_m2, prices.get(sid)),
            }
        )
    priced = sorted(
        (r for r in rows if not r["margin"]["missing"]), key=lambda r: -r["margin"]["margin_mmk"]
    )
    return priced + [r for r in rows if r["margin"]["missing"]]


def _fit(score: int) -> str:
    return FIT[max(0, min(2, score - 1))]


def _row(
    sid: str,
    title: str,
    species: list[str],
    score: int,
    reasons: list[str],
    cautions: list[str],
    **extra: Any,
) -> dict[str, Any]:
    return {
        "id": sid,
        "title": title,
        "fit": _fit(score),
        "species": [{"id": s, "name": SPECIES[s]["name"]} for s in species],
        "reasons": [{"id": r} for r in reasons],
        "cautions": [{"id": c} for c in cautions],
        "status": STATUS,
        **extra,
    }


def _perimeter(farm: dict[str, Any]) -> float:
    return float(farm.get("perimeter_m") or 4.0 * math.sqrt(farm["area_ha"] * 10000.0))


def suggest(farm: dict[str, Any]) -> list[dict[str, Any]]:
    area = float(farm["area_ha"])
    rice = bool(farm.get("rice"))
    salt = farm.get("salinity_ppt")
    temp = farm.get("temp_c")
    prices = farm.get("prices") or {}
    fresh = salt is None or salt <= FRESH_PPT
    unknown = ["salinity-unknown"] if salt is None else []
    out: list[dict[str, Any]] = []
    if rice:
        ducks = [s["id"] for s in species_for(salt, temp, ("duck",))]
        units = SPECIES["pekin_duck"]["rice_per_ha"] * area
        out.append(
            _row(
                "rice_duck",
                "Rice with ducks",
                ducks,
                2 + (area >= 0.3),
                ["rice-present", "weed-snail-control", *unknown],
                ["keep-out-at-heading", "avian-influenza"],
                stocking={"per_ha": SPECIES["pekin_duck"]["rice_per_ha"], "units": units},
                margin=margin("pekin_duck", units, prices.get("pekin_duck"), fed=False),
            )
        )
        if fresh:
            fish = [s["id"] for s in species_for(salt, temp, ("fish",)) if s["rice_per_ha"]]
            if fish:
                sprays = bool(farm.get("sprays_toxic_to_fish"))
                clay = farm.get("soil") == "clay"
                trench = waterplan.size_trench(area, _perimeter(farm), TRENCH_SHARE, TRENCH_DEPTH_M)
                units = SPECIES[fish[0]]["rice_per_ha"] * area
                out.append(
                    _row(
                        "rice_fish",
                        "Rice with fish",
                        fish,
                        2 + clay - sprays,
                        [
                            "rice-present",
                            "fresh-water",
                            *(["clay-holds-water"] if clay else []),
                            *unknown,
                        ],
                        ["trench-dry-in-awd", *(["fish-toxic-spray"] if sprays else [])],
                        trench=trench,
                        stocking={"per_ha": SPECIES[fish[0]]["rice_per_ha"], "units": units},
                        margin=margin(fish[0], units, prices.get(fish[0]), fed=False),
                    )
                )
        if salt is not None and 2.0 <= salt <= 25.0:
            shrimp = [s["id"] for s in species_for(salt, temp, ("shrimp",)) if s["rice_per_ha"]]
            if shrimp:
                units = SPECIES[shrimp[0]]["rice_per_ha"] * area
                out.append(
                    _row(
                        "rice_shrimp",
                        "Rice and shrimp in turn",
                        shrimp,
                        2 + (5.0 <= salt <= 20.0),
                        ["rice-present", "brackish-water"],
                        ["salinity-carry-over"],
                        stocking={"per_ha": SPECIES[shrimp[0]]["rice_per_ha"], "units": units},
                        margin=margin(shrimp[0], units, prices.get(shrimp[0]), fed=False),
                    )
                )
    pond_m2 = POND_SHARE * area * 10000.0
    pond_fish = [
        s["id"] for s in species_for(salt, temp, ("fish",)) if s["intensity"] != "intensive"
    ]
    if pond_fish:
        out.append(
            _row(
                "pond_fish",
                "Fish pond",
                pond_fish,
                2,
                ["water-managed", *(["fresh-water"] if fresh else []), *unknown],
                ["low-oxygen"],
                ranking=rank_species(pond_fish, pond_m2, prices),
                pond_m2=pond_m2,
            )
        )
    pond_shrimp = [s["id"] for s in species_for(salt, temp, ("shrimp",))]
    if pond_shrimp:
        out.append(
            _row(
                "pond_shrimp",
                "Shrimp pond",
                pond_shrimp,
                2 + (salt is not None and 10.0 <= salt <= 25.0),
                ["water-managed", "fresh-water" if fresh else "brackish-water"],
                ["low-oxygen", "needs-aeration"],
                ranking=rank_species(pond_shrimp, pond_m2, prices),
                pond_m2=pond_m2,
            )
        )
    chickens = [s["id"] for s in species_for(salt, temp, ("chicken",))]
    per_ha = SPECIES["native_chicken"]["dike_per_ha"]
    out.append(
        _row(
            "dike_poultry",
            "Birds on the dike",
            chickens,
            2,
            ["manure-feeds-pond", "uses-dike"],
            ["avian-influenza", "keep-coop-off-water-edge"],
            stocking={"per_ha": per_ha, "units": per_ha * area},
        )
    )
    return out
