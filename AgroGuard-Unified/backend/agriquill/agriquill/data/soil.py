from __future__ import annotations

from typing import Any

import httpx

from ..cache import TTLCache
from ..config import get_settings

SOIL_DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"]
_CACHE = TTLCache()

_UNIT_FACTOR: dict[str, float] = {
    "g/kg": 0.1,
    "%": 1.0,
    "dg/kg": 0.1,
    "pH*10": 0.1,
    "pH": 1.0,
    "mmol(c)/kg": 0.1,
    "cmol(c)/kg": 1.0,
}


def _mean(layer: dict[str, Any], prop: str) -> list[float]:
    for L in layer["properties"]["layers"]:
        if L["name"] == prop:
            depths = L["depths"]
            if len(depths) != len(SOIL_DEPTHS):
                raise ValueError(f"{prop}: expected {len(SOIL_DEPTHS)} depths, got {len(depths)}")
            out: list[float] = []
            for i, d in enumerate(depths):
                label = str(d.get("label", ""))
                if label and label != SOIL_DEPTHS[i]:
                    raise ValueError(
                        f"{prop}: depth {i} labelled {label!r}, expected {SOIL_DEPTHS[i]!r}"
                    )
                mean = d["values"]["mean"]
                if mean is None:
                    raise ValueError("no value at this point (water, built-up land or no data)")
                out.append(float(mean))
            return out
    raise ValueError(f"missing property {prop}")


def _unit(layer: dict[str, Any], prop: str) -> str:
    for L in layer["properties"]["layers"]:
        if L["name"] == prop:
            return str(L["unit_measure"]["mapped_units"])
    raise ValueError(f"missing property {prop}")


def _conv(value: float, unit: str) -> float:
    try:
        return value * _UNIT_FACTOR[unit]
    except KeyError:
        raise ValueError(f"unmapped unit {unit}") from None


def parse_soil(raw: dict[str, Any]) -> dict[str, Any]:
    sand = _mean(raw, "sand")
    silt = _mean(raw, "silt")
    clay = _mean(raw, "clay")
    ph = _mean(raw, "phh2o")
    soc = _mean(raw, "soc")
    cec = _mean(raw, "cec")
    u_sand, u_silt, u_clay = _unit(raw, "sand"), _unit(raw, "silt"), _unit(raw, "clay")
    u_ph, u_soc, u_cec = _unit(raw, "phh2o"), _unit(raw, "soc"), _unit(raw, "cec")

    layers = []
    for i, depth in enumerate(SOIL_DEPTHS):
        layers.append(
            {
                "depth": depth,
                "sand_perc": round(_conv(sand[i], u_sand), 3),
                "silt_perc": round(_conv(silt[i], u_silt), 3),
                "clay_perc": round(_conv(clay[i], u_clay), 3),
                "ph_h2o": round(_conv(ph[i], u_ph), 3),
                "soc_g_kg": round(_conv(soc[i], u_soc), 3),
                "cec_cmolc_kg": round(_conv(cec[i], u_cec), 3),
            }
        )
    geom = raw.get("geometry", {}).get("coordinates", [None, None])
    return {
        "provider": "ISRIC_SoilGrids_2.0",
        "longitude": geom[0],
        "latitude": geom[1],
        "layers": layers,
    }


async def fetch_soil(lat: float, lon: float) -> dict[str, Any]:
    s = get_settings()
    key = ("soil", round(lat, 5), round(lon, 5))
    cached = _CACHE.get(key)
    if cached is not None:
        return cached
    params: list[tuple[str, str]] = [("lat", str(lat)), ("lon", str(lon)), ("value", "mean")]
    for prop in ["clay", "sand", "silt", "phh2o", "soc", "cec"]:
        params.append(("property", prop))
    for d in SOIL_DEPTHS:
        params.append(("depth", d))
    try:
        async with httpx.AsyncClient(timeout=s.http_timeout_s) as client:
            r = await client.get(s.soilgrids_endpoint, params=params)
            r.raise_for_status()
        profile = parse_soil(r.json())
    except ValueError as exc:
        return unavailable(lat, lon, f"SoilGrids: {exc}")
    except (httpx.HTTPError, KeyError) as exc:
        return unavailable(lat, lon, f"SoilGrids unavailable: {type(exc).__name__}")
    _CACHE.set(key, profile, s.soil_cache_ttl_s)
    return profile


def unavailable(lat: float, lon: float, reason: str) -> dict[str, Any]:
    return {
        "provider": "unavailable",
        "latitude": lat,
        "longitude": lon,
        "layers": [],
        "missing": [{"field": "layers", "reason": reason}],
    }
