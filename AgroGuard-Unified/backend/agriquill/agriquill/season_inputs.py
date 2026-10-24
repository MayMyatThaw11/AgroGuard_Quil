from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any

from . import live
from .data import weather
from .data.soil import fetch_soil
from .store import missing

SAXTON_RAWLS_2006 = (
    "Saxton & Rawls 2006, Soil Sci. Soc. Am. J. 70:1569-1578, Eq. 1-3 and 5 (density factor 1); "
    "coefficients cross-checked against USDA WEPP saxpar.for and AquaCrop-OSPy soil.py"
)
# van Bemmelen factor, organic carbon to organic matter. TO VERIFY for delta paddy soils.
SOC_TO_OM = 1.724
ROOT_LAYER_CM = 30


def _wp(s: float, c: float, om: float) -> float:
    t = (
        -0.024 * s
        + 0.487 * c
        + 0.006 * om
        + 0.005 * s * om
        - 0.013 * c * om
        + 0.068 * s * c
        + 0.031
    )
    return t + 0.14 * t - 0.02


def _fc(s: float, c: float, om: float) -> float:
    t = (
        -0.251 * s
        + 0.195 * c
        + 0.011 * om
        + 0.006 * s * om
        - 0.027 * c * om
        + 0.452 * s * c
        + 0.299
    )
    return t + 1.283 * t**2 - 0.374 * t - 0.015


def _s33(s: float, c: float, om: float) -> float:
    t = 0.278 * s + 0.034 * c + 0.022 * om - 0.018 * s * om - 0.027 * c * om - 0.584 * s * c + 0.078
    return t + 0.636 * t - 0.107


def hydraulics(layer: Mapping[str, Any]) -> dict[str, Any] | None:
    sand, clay, soc = layer.get("sand_perc"), layer.get("clay_perc"), layer.get("soc_g_kg")
    if sand is None or clay is None or soc is None:
        return None
    s, c = float(sand) / 100, float(clay) / 100
    om = float(soc) / 10 * SOC_TO_OM
    fc = _fc(s, c, om)
    return {
        "theta_wp": round(_wp(s, c, om), 3),
        "theta_fc": round(fc, 3),
        "theta_sat": round(fc + _s33(s, c, om) - 0.097 * s + 0.043, 3),
        "inputs": {"sand_pct": float(sand), "clay_pct": float(clay), "om_pct": round(om, 3)},
        "source": SAXTON_RAWLS_2006,
        "assumed": f"organic matter = SOC x {SOC_TO_OM} (TO VERIFY); bulk density not adjusted",
    }


def _root_layer(layers: list[dict[str, Any]]) -> dict[str, Any] | None:
    picked: list[tuple[float, dict[str, Any]]] = []
    for layer in layers:
        top, bottom = (int(x) for x in str(layer["depth"]).removesuffix("cm").split("-"))
        if top < ROOT_LAYER_CM:
            picked.append((min(bottom, ROOT_LAYER_CM) - top, layer))
    if not picked:
        return None
    total = sum(w for w, _ in picked)
    out: dict[str, Any] = {"depth": f"0-{ROOT_LAYER_CM}cm"}
    for key in ("sand_perc", "clay_perc", "soc_g_kg"):
        values = [(w, layer.get(key)) for w, layer in picked]
        if any(v is None for _, v in values):
            out[key] = None
        else:
            out[key] = sum(w * float(v) for w, v in values if v is not None) / total
    return out


def _location(spec: Mapping[str, Any], parcel_id: str) -> tuple[float, float, str]:
    parcel = next((p for p in spec["parcels"] if p["id"] == parcel_id), None)
    if parcel is None:
        raise KeyError(parcel_id)
    ring = parcel.get("boundary") or []
    corners = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    if corners:
        lat = sum(float(p[0]) for p in corners) / len(corners)
        lon = sum(float(p[1]) for p in corners) / len(corners)
        return round(lat, 6), round(lon, 6), "parcel boundary centroid"
    location = spec.get("farm", {}).get("location") or []
    if len(location) != 2:
        raise ValueError("parcel has no boundary and the farm has no location: [lat, lon]")
    return float(location[0]), float(location[1]), "farm location: no parcel boundary drawn"


def _soil_note(soil: dict[str, Any]) -> str | None:
    borrowed = soil.get("substituted")
    if not borrowed:
        return None
    return (
        f"soil taken from a cell {borrowed['distance_m']} m from the field because the field's own "
        "cell has no data; TO VERIFY with a soil sample"
    )


def site_inputs(farm_id: str, parcel_id: str, start: date, days: int) -> dict[str, Any]:
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        raise KeyError(farm_id)
    lat, lon, basis = _location(spec, parcel_id)
    end = start + timedelta(days=days)
    daily = weather.fetch_archive_daily(lat, lon, start, end)
    hourly = weather.fetch_archive_hourly(lat, lon, start, end)
    soil = asyncio.run(fetch_soil(lat, lon))
    layer = _root_layer(soil.get("layers") or [])
    water = hydraulics(layer) if layer else None
    gaps = [*daily.get("missing", []), *soil.get("missing", [])]
    if water is None:
        gaps.append(missing("hydraulics", "no SoilGrids sand, clay and carbon for the top 30 cm"))
    if hourly.get("hourly") is None:
        gaps.append(missing("hourly", "hourly replay weather unavailable"))
    return {
        "farm_id": farm_id,
        "parcel_id": parcel_id,
        "lat": lat,
        "lon": lon,
        "location_basis": basis,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "weather": daily,
        "hourly": hourly.get("hourly"),
        "soil": soil,
        "soil_note": _soil_note(soil),
        "hydraulics": water,
        "missing": gaps,
    }
