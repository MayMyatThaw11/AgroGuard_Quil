from __future__ import annotations

from typing import Any

from .data import ecocrop, fao_pack, pinksheet, regions
from .store import missing

CROP_OPTIONS: tuple[dict[str, Any], ...] = (
    {
        "id": "rice",
        "label": "Rice",
        "ecocrop": "Oryza sativa",
        "faostat": "Rice",
        "price": "rice",
        "basis": "FAOSTAT paddy yield against a milled 5% export price",
    },
    {
        "id": "coffee",
        "label": "Coffee (Robusta)",
        "ecocrop": "Coffea canephora",
        "faostat": "Coffee, green",
        "price": "coffee",
        "basis": None,
    },
    {
        "id": "maize",
        "label": "Maize",
        "ecocrop": "Zea mays",
        "faostat": "Maize (corn)",
        "price": "maize",
        "basis": None,
    },
    {
        "id": "rubber",
        "label": "Natural rubber",
        "ecocrop": "Hevea brasiliensis",
        "faostat": "Natural rubber in primary forms",
        "price": "rubber",
        "basis": None,
    },
    {
        "id": "cocoa",
        "label": "Cocoa",
        "ecocrop": "Theobroma cacao",
        "faostat": "Cocoa beans",
        "price": "cocoa",
        "basis": None,
    },
    {
        "id": "palm",
        "label": "Oil palm",
        "ecocrop": "Elaeis guineensis",
        "faostat": "Oil palm fruit",
        "price": "palm",
        "basis": "fresh fruit bunch yield against a crude palm oil price",
    },
    {
        "id": "sugarcane",
        "label": "Sugar cane",
        "ecocrop": "Saccharum officinarum",
        "faostat": "Sugar cane",
        "price": "sugarcane",
        "basis": "cane yield against a raw sugar price",
    },
    {
        "id": "tea",
        "label": "Tea",
        "ecocrop": "Camellia sinensis",
        "faostat": "Tea leaves",
        "price": "tea",
        "basis": "green leaf yield against a made tea auction price",
    },
    {
        "id": "cassava",
        "label": "Cassava",
        "ecocrop": "Manihot esculenta",
        "faostat": "Cassava, fresh",
        "price": None,
        "basis": None,
    },
    {
        "id": "durian",
        "label": "Durian",
        "ecocrop": "Durio zibethinus",
        "faostat": None,
        "price": None,
        "basis": None,
    },
)
VERDICT_RANK = {"suitable": 0, "conditional": 1, "unknown": 2, "contraindicated": 3}
NOTE = (
    "Gross value is national FAOSTAT yield times a World Bank world price. It is not profit: "
    "input, labour, transport and processing costs are not included, and farm-gate prices are "
    "lower than world prices."
)


def site_from_region(region: dict[str, Any]) -> dict[str, Any]:
    rain = (region.get("rainfall") or {}).get("series") or []
    weather = region.get("weather") or {}
    summary = weather.get("summary") or {}
    tmax, tmin = summary.get("tmax_mean_c"), summary.get("tmin_mean_c")
    return {
        "mean_temp_c": round((tmax + tmin) / 2, 1)
        if tmax is not None and tmin is not None
        else None,
        "annual_rain_mm": round(sum(r["precip_mm"] for r in rain), 1) if len(rain) == 12 else None,
        "elevation_m": weather.get("elevation_m"),
        "soil_ph": None,
        "basis": {
            "mean_temp_c": "NASA POWER 30-day mean, not an annual mean",
            "annual_rain_mm": "CHIRPS last 12 months",
            "elevation_m": "NASA POWER grid elevation",
            "soil_ph": "not in the regional snapshot",
        },
    }


def _yield(iso3: str, item: str | None) -> dict[str, Any]:
    if item is None:
        return {"t_ha": None, "reason": "no FAOSTAT item for this crop"}
    out = fao_pack.faostat_qcl(iso3, item, "Yield")
    rows = [r for r in out.get("records", []) if r["value"] is not None]
    if not rows:
        reason = (out.get("missing") or [missing("yield", "no FAOSTAT yield")])[0]["reason"]
        return {"t_ha": None, "reason": reason}
    last = max(rows, key=lambda r: r["year"])
    factor = {"kg/ha": 0.001, "t/ha": 1.0, "hg/ha": 0.0001}.get(last["unit"])
    if factor is None:
        return {"t_ha": None, "reason": f"unexpected FAOSTAT unit {last['unit']}"}
    return {
        "t_ha": round(last["value"] * factor, 3),
        "year": last["year"],
        "flag": last["flag"],
        "flag_meaning": last["flag_meaning"],
        "item": last["item"],
        "source": out.get("source"),
    }


def options(town: str, prices: dict[str, Any] | None = None) -> dict[str, Any]:
    region = regions.get(town)
    if region.get("iso3") is None:
        return {"town": town, "options": [], "missing": region.get("missing", [])}
    site = site_from_region(region)
    prices = prices if prices is not None else pinksheet.benchmarks()
    rows = []
    for spec in CROP_OPTIONS:
        crop = ecocrop.get(spec["ecocrop"])
        suitability = (
            ecocrop.screen(crop, site)
            if crop
            else {"verdict": "unknown", "factors": [], "reason": "crop not in the EcoCrop pack"}
        )
        found_yield = _yield(region["iso3"], spec["faostat"])
        key = spec["price"]
        if key == "rice" and region.get("country") == "Vietnam":
            key = "rice_vn"
        price = (prices.get("crops") or {}).get(key) if key else None
        gross = None
        reason = None
        if found_yield.get("t_ha") is None:
            reason = "no national yield"
        elif not price or price.get("usd_per_tonne") is None:
            reason = "no World Bank price series"
        elif spec["basis"]:
            reason = f"not multiplied: {spec['basis']}"
        else:
            gross = round(found_yield["t_ha"] * price["usd_per_tonne"])
        rows.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "suitability": suitability["verdict"],
                "factors": suitability.get("factors", []),
                "yield": found_yield,
                "price": price,
                "gross_value_usd_ha": gross,
                "gross_value_reason": reason,
            }
        )
    rows.sort(
        key=lambda r: (VERDICT_RANK.get(r["suitability"], 2), -(r["gross_value_usd_ha"] or 0))
    )
    return {
        "town": region.get("town", town),
        "country": region.get("country"),
        "site": site,
        "options": rows,
        "note": NOTE,
        "price_source": prices.get("source"),
        "price_updated": prices.get("updated"),
        "missing": prices.get("missing", []),
    }
