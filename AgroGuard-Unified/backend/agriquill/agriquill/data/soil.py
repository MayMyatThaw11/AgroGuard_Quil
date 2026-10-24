from __future__ import annotations

import asyncio
import math
from typing import Any

import httpx

from .. import obs
from ..cache import TTLCache
from ..config import get_settings
from ..store import RecordCache, sha256

SOIL_DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"]
_CACHE = TTLCache("soilgrids")
_STORE = RecordCache()
STORED = "soilgrids_profile_v1"
# Our rule, not a standard: how far to look for a neighbouring cell when a point is masked.
SEARCH_RINGS_M = (250, 500, 750)
BEARINGS_DEG = (0, 90, 180, 270, 45, 135, 225, 315)
SEARCH_BASIS = (
    "nearest SoilGrids cell with data within {limit} m, a different soil patch than the field's "
    "own point; TO VERIFY with a sample from the field"
)


class NoValue(ValueError):
    pass


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
                    raise NoValue("no value at this point (water, built-up land or no data)")
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


def _point(lat: float, lon: float) -> str:
    return f"{round(lat, 5)}|{round(lon, 5)}"


def _stored(lat: float, lon: float) -> dict[str, Any] | None:
    found = _STORE.get(STORED, _point(lat, lon))
    if found is None:
        return None
    return {**found["payload"], "from_store": True, "retrieved_at": found["retrieved_at"]}


async def _query(client: httpx.AsyncClient, lat: float, lon: float) -> dict[str, Any]:
    s = get_settings()
    params: list[tuple[str, str | int | float | bool | None]] = [
        ("lat", str(lat)),
        ("lon", str(lon)),
        ("value", "mean"),
    ]
    for prop in ["clay", "sand", "silt", "phh2o", "soc", "cec"]:
        params.append(("property", prop))
    for d in SOIL_DEPTHS:
        params.append(("depth", d))
    r = await client.get(s.soilgrids_endpoint, params=params)
    r.raise_for_status()
    return parse_soil(r.json())


def _around(lat: float, lon: float, metres: float) -> list[tuple[float, float]]:
    return [
        (
            lat + metres * math.cos(math.radians(b)) / 110574.0,
            lon + metres * math.sin(math.radians(b)) / (111320.0 * math.cos(math.radians(lat))),
        )
        for b in BEARINGS_DEG
    ]


async def _nearest_valid(
    client: httpx.AsyncClient, lat: float, lon: float
) -> dict[str, Any] | None:
    for metres in SEARCH_RINGS_M:
        points = _around(lat, lon, metres)
        found = await asyncio.gather(
            *(_query(client, a, b) for a, b in points), return_exceptions=True
        )
        for (a, b), result in zip(points, found, strict=True):
            if isinstance(result, dict):
                note = {
                    "distance_m": metres,
                    "latitude": round(a, 6),
                    "longitude": round(b, 6),
                    "basis": SEARCH_BASIS.format(limit=SEARCH_RINGS_M[-1]),
                }
                return {**result, "substituted": note}
    return None


async def fetch_soil(lat: float, lon: float) -> dict[str, Any]:
    s = get_settings()
    key = ("soil", round(lat, 5), round(lon, 5))
    cached = _CACHE.get(key)
    if cached is not None:
        return cached
    kept = _stored(lat, lon)
    if kept is not None:
        _CACHE.set(key, kept, s.soil_cache_ttl_s)
        return kept
    try:
        async with httpx.AsyncClient(
            timeout=s.http_timeout_s, transport=obs.TimedAsyncTransport("soilgrids")
        ) as client:
            try:
                profile = await _query(client, lat, lon)
            except NoValue as exc:
                borrowed = await _nearest_valid(client, lat, lon)
                if borrowed is None:
                    return unavailable(
                        lat,
                        lon,
                        f"SoilGrids: {exc}; no cell with data within {SEARCH_RINGS_M[-1]} m",
                    )
                profile = borrowed
    except ValueError as exc:
        return unavailable(lat, lon, f"SoilGrids: {exc}")
    except (httpx.HTTPError, KeyError) as exc:
        return unavailable(lat, lon, f"SoilGrids unavailable: {type(exc).__name__}")
    _STORE.put(
        STORED,
        _point(lat, lon),
        profile,
        s.soilgrids_endpoint,
        sha256(repr(profile).encode()),
        None,
    )
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
