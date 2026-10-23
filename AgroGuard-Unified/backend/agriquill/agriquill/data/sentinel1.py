from __future__ import annotations

import hashlib
import itertools
import statistics
import zlib
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import numpy as np

from ..cache import TTLCache
from ..config import get_settings
from ..store import RecordCache, log_fetch, missing, sha256, source_ref
from . import chirps, sentinel2

PROVIDER = "Copernicus Sentinel-1 RTC (gamma0, terrain corrected) via Microsoft Planetary Computer"
LICENCE = "Copernicus Sentinel data, free and open; RTC product CC BY 4.0 (Microsoft)"
COLLECTION = "sentinel-1-rtc"
NODATA = -32768.0
WET_VV_DB = -18.0
MIN_PAIRS = 10
MAX_SCENES = 16
PAIR_WINDOW_H = 36
TOKEN_TTL_S = 1800.0
ASSUMPTIONS = {
    "wet_vv_db": WET_VV_DB,
    "status": (
        "TO VERIFY: the open-water VV threshold is a literature range value, "
        "not calibrated on these paddies"
    ),
    "limit": (
        "a rice canopy over standing water scatters back brightly (double bounce), "
        "so radar sees open water, not water under a closed canopy"
    ),
}
_CACHE = RecordCache()
_HOT = TTLCache("sentinel1_hot")


def scene_db(win: np.ndarray, mask: np.ndarray) -> dict[str, Any]:
    total = int(mask.sum())
    good = mask & np.isfinite(win) & (win > 0) & (win != NODATA)
    n = int(good.sum())
    out: dict[str, Any] = {"pixels": total, "valid_pixels": n, "vv_db": None, "reason": None}
    if n == 0:
        out["reason"] = "no valid radar pixel inside this boundary"
        return out
    out["vv_db"] = round(float(10 * np.log10(win[good].astype("float64").mean())), 2)
    return out


def water_call(vv_db: float | None) -> dict[str, Any]:
    if vv_db is None:
        return {"call": None, "caveat": "no backscatter value"}
    if vv_db < WET_VV_DB:
        return {"call": "open water", "caveat": f"VV {vv_db} dB is under {WET_VV_DB} dB"}
    return {
        "call": "no open water",
        "caveat": "radar cannot see water under a closed rice canopy, so this is not proof of dry",
    }


def revisit(scenes: list[dict[str, Any]]) -> dict[str, Any]:
    by_orbit: dict[Any, list[datetime]] = {}
    for s in scenes:
        by_orbit.setdefault(s["relative_orbit"], []).append(_when(s["datetime"]))
    gaps = []
    for times in by_orbit.values():
        times.sort()
        gaps += [round((b - a).total_seconds() / 86400) for a, b in itertools.pairwise(times)]
    if not gaps:
        return {
            "same_orbit_days": None,
            "shortest_resolvable_cycle_days": None,
            "orbits": len(by_orbit),
            "reason": "fewer than two scenes from one orbit geometry",
        }
    days = int(statistics.median(gaps))
    return {
        "same_orbit_days": days,
        "shortest_resolvable_cycle_days": 2 * days,
        "orbits": len(by_orbit),
        "reason": None,
        "method": (
            "backscatter is compared only within one orbit geometry; a wet-dry cycle "
            "needs at least two looks per cycle, so cycles shorter than twice the "
            "revisit cannot be resolved"
        ),
    }


def agreement(pairs: list[tuple[bool, bool]]) -> dict[str, Any]:
    n = len(pairs)
    if n < MIN_PAIRS:
        return {
            "pairs": n,
            "agree": None,
            "chance": None,
            "reason": f"needs {MIN_PAIRS} radar dates with a depth estimate within "
            f"{PAIR_WINDOW_H} h; have {n}",
        }
    agree = sum(r == d for r, d in pairs)
    pr = sum(r for r, _ in pairs) / n
    pd = sum(d for _, d in pairs) / n
    return {
        "pairs": n,
        "agree": agree,
        "chance": round(pr * pd + (1 - pr) * (1 - pd), 3),
        "reason": None,
    }


def _when(text: str) -> datetime:
    at = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return at if at.tzinfo else at.replace(tzinfo=UTC)


def pair_with_depth(
    scenes: list[dict[str, Any]], dates: list[str], depths: list[float]
) -> list[tuple[bool, bool]]:
    stamps = [_when(d) for d in dates]
    out = []
    for s in scenes:
        if s.get("vv_db") is None:
            continue
        at = _when(s["datetime"])
        near = [(abs((t - at).total_seconds()), v) for t, v in zip(stamps, depths, strict=True)]
        near = [x for x in near if x[0] <= PAIR_WINDOW_H * 3600]
        if near:
            out.append((s["vv_db"] < WET_VV_DB, min(near)[1] > 0))
    return out


def _token(client: httpx.Client) -> str:
    token = _HOT.get(("s1token",))
    if token is None:
        base = get_settings().planetary_computer_sas_url
        response = client.get(f"{base}/{COLLECTION}")
        response.raise_for_status()
        token = str(response.json()["token"])
        _HOT.set(("s1token",), token, TOKEN_TTL_S)
    return token


def _read_scene(
    client: httpx.Client, item: dict[str, Any], ring_latlon: list[list[float]], token: str
) -> dict[str, Any]:
    props = item["properties"]
    zone, south = sentinel2.zone_of(int(props["proj:epsg"]))
    ring = [sentinel2.utm_from_lonlat(lat, lon, zone, south) for lat, lon in ring_latlon]
    vv = item["assets"]["vv"]
    transform = vv.get("proj:transform") or props["proj:transform"]
    row0, col0, rows, cols = sentinel2._window(transform, ring)
    if rows <= 0 or cols <= 0 or row0 < 0 or col0 < 0:
        raise sentinel2.SentinelError("boundary lies outside this scene")
    win, digest = sentinel2.read_window(client, f"{vv['href']}?{token}", row0, col0, rows, cols)
    mask = sentinel2.pixel_mask(ring, transform, row0, col0, rows, cols)
    out = scene_db(win, mask)
    return {
        "scene_id": item["id"],
        "datetime": props["datetime"],
        "orbit_state": props.get("sat:orbit_state"),
        "relative_orbit": props.get("sat:relative_orbit"),
        **out,
        **water_call(out["vv_db"]),
        "sha256": digest,
        "provenance": "DERIVED",
    }


def paddy_radar(
    ring_latlon: list[list[float]],
    days: int = 60,
    depth: tuple[list[str], list[float]] | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    end = datetime.now(UTC)
    start = end - timedelta(days=days)
    ring_lonlat = [[lon, lat] for lat, lon in ring_latlon]
    ring_key = hashlib.sha256(
        repr([[round(a, 6), round(b, 6)] for a, b in ring_latlon]).encode()
    ).hexdigest()[:16]
    own = client is None
    http = client or httpx.Client(timeout=get_settings().http_timeout_s, follow_redirects=True)
    out: dict[str, Any] = {
        "shadow": True,
        "provider": PROVIDER,
        "licence": LICENCE,
        "assumptions": ASSUMPTIONS,
        "window_days": days,
        "series": [],
        "missing": [],
        "provenance": "DERIVED",
    }
    try:
        try:
            body = {
                "collections": [COLLECTION],
                "intersects": {"type": "Polygon", "coordinates": [ring_lonlat]},
                "datetime": f"{start:%Y-%m-%dT%H:%M:%SZ}/{end:%Y-%m-%dT%H:%M:%SZ}",
                "limit": MAX_SCENES,
                "sortby": [{"field": "properties.datetime", "direction": "desc"}],
            }
            url = f"{get_settings().planetary_computer_url}/search"
            response = http.post(url, json=body)
            response.raise_for_status()
            items = list(response.json().get("features", []))
            token = _token(http) if items else ""
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            out["missing"].append(
                missing("vv_db", f"Planetary Computer unavailable: {type(exc).__name__}")
            )
            return out
        if not items:
            out["missing"].append(
                missing("vv_db", f"no Sentinel-1 scene over this boundary in {days} days")
            )
            return out
        scenes = []
        for item in items:
            key = f"{item['id']}:{ring_key}"
            hit = _CACHE.get("sentinel1", key)
            if hit is not None:
                scenes.append(hit["payload"])
                continue
            try:
                scene = _read_scene(http, item, ring_latlon, token)
            except (
                httpx.HTTPError,
                sentinel2.SentinelError,
                chirps.ChirpsError,
                KeyError,
                zlib.error,
            ) as exc:
                scenes.append(
                    {
                        "scene_id": item["id"],
                        "datetime": item["properties"]["datetime"],
                        "relative_orbit": item["properties"].get("sat:relative_orbit"),
                        "vv_db": None,
                        "call": None,
                        "reason": f"{type(exc).__name__}: {exc}"[:160],
                        "provenance": "DERIVED",
                    }
                )
                continue
            _CACHE.put("sentinel1", key, scene, item["assets"]["vv"]["href"], scene["sha256"], None)
            log_fetch("sentinel1", key, scene["sha256"])
            scenes.append(scene)
        out["series"] = sorted(scenes, key=lambda s: s["datetime"])
        out["revisit"] = revisit(scenes)
        out["agreement"] = agreement(pair_with_depth(scenes, *depth) if depth else [])
        out["source"] = source_ref(
            PROVIDER,
            f"{get_settings().planetary_computer_url}/collections/{COLLECTION}",
            end.isoformat(timespec="seconds"),
            sha256(repr([s["scene_id"] for s in scenes]).encode()),
        )
        return out
    finally:
        if own:
            http.close()
