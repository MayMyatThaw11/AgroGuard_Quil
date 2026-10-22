from __future__ import annotations

import hashlib
import math
import zlib
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import numpy as np

from ..cache import TTLCache
from ..config import get_settings
from ..store import RecordCache, log_fetch, missing, sha256, source_ref
from . import chirps

PROVIDER = "Copernicus Sentinel-2 Collection 1 L2A COGs via Element 84 Earth Search (AWS Open Data)"
LICENCE = "Copernicus Sentinel data, free and open under the Copernicus data policy"
COLLECTION = "sentinel-2-c1-l2a"
SCL_CLEAR = (4, 5, 6)
SCL_SOURCE = "Sen2Cor scene classification: 4 vegetation, 5 not vegetated, 6 water count as clear"
NDVI_METHOD = "NDVI = (B08 - B04) / (B08 + B04)"
NDWI_METHOD = "NDWI (McFeeters 1996) = (B03 - B08) / (B03 + B08)"
MIN_CLEAR_FRACTION = 0.5
SKIP_SCENE_CLOUD_PCT = 95.0
MAX_SCENES = 8
HEADER_BYTES = 65536
ASSUMPTIONS = {
    "min_clear_fraction": MIN_CLEAR_FRACTION,
    "skip_scene_cloud_pct": SKIP_SCENE_CLOUD_PCT,
    "status": (
        "TO VERIFY: the clear-pixel share needed to report a paddy value is an engineering choice"
    ),
}
_A = 6378137.0
_F = 1 / 298.257223563
_K0 = 0.9996
_CACHE = RecordCache()
_HOT = TTLCache()
HEADER_TTL_S = 3600.0


class SentinelError(Exception):
    pass


def zone_of(epsg: int) -> tuple[int, bool]:
    if 32601 <= epsg <= 32660:
        return epsg - 32600, False
    if 32701 <= epsg <= 32760:
        return epsg - 32700, True
    raise SentinelError(f"EPSG {epsg} is not a WGS84 UTM zone")


def utm_from_lonlat(lat: float, lon: float, zone: int, south: bool = False) -> tuple[float, float]:
    n = _F / (2 - _F)
    big_a = _A / (1 + n) * (1 + n**2 / 4 + n**4 / 64)
    alpha = (n / 2 - 2 * n**2 / 3 + 5 * n**3 / 16, 13 * n**2 / 48 - 3 * n**3 / 5, 61 * n**3 / 240)
    phi = math.radians(lat)
    dlon = math.radians(lon - (zone * 6 - 183))
    root = 2 * math.sqrt(n) / (1 + n)
    t = math.sinh(math.atanh(math.sin(phi)) - root * math.atanh(root * math.sin(phi)))
    xi = math.atan2(t, math.cos(dlon))
    eta = math.atanh(math.sin(dlon) / math.sqrt(1 + t * t))
    east = eta + sum(
        a * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, a in enumerate(alpha, 1)
    )
    north = xi + sum(
        a * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, a in enumerate(alpha, 1)
    )
    return 500000.0 + _K0 * big_a * east, (10000000.0 if south else 0.0) + _K0 * big_a * north


def _float_predictor(raw: bytes, h: int, w: int) -> np.ndarray:
    """TIFF floating-point predictor (Adobe Technical Note 3): byte deltas over planes."""
    rows = np.frombuffer(raw, dtype=np.uint8)[: h * w * 4].reshape(h, w * 4)
    planes = np.cumsum(rows, axis=1, dtype=np.uint8).reshape(h, 4, w)
    return planes.transpose(0, 2, 1).copy().view(">f4").reshape(h, w).astype(np.float32)


def decode_tile(raw: bytes, tags: dict[str, Any]) -> np.ndarray:
    h, w = tags["tile_h"], tags["tile_w"]
    body = zlib.decompress(raw)
    if tags["bits"] == 32 and tags.get("sample_format") == 3:
        if len(body) < h * w * 4:
            raise SentinelError("tile is shorter than expected")
        if tags.get("predictor", 1) == 3:
            return _float_predictor(body, h, w)
        return np.frombuffer(body, dtype=tags["byte_order"] + "f4")[: h * w].reshape(h, w)
    dtype = np.dtype(tags["byte_order"] + {8: "u1", 16: "u2"}[tags["bits"]])
    data = np.frombuffer(body, dtype=dtype)
    if data.size < h * w:
        raise SentinelError("tile is shorter than expected")
    tile = data[: h * w].reshape(h, w).astype(dtype.newbyteorder("="))
    if tags.get("predictor", 1) == 2:
        tile = np.cumsum(tile, axis=1, dtype=tile.dtype)
    return tile


def _header(client: httpx.Client, url: str) -> dict[str, Any]:
    tags = _HOT.get(("s2tags", url))
    if tags is None:
        head = chirps._range(client, url, 0, HEADER_BYTES)
        tags = chirps.parse_header(
            head, lambda off, n: chirps._range(client, url, off, n), checks=False
        )
        floats = tags.get("bits") == 32 and tags.get("sample_format") == 3
        if tags.get("compression") != 8 or tags.get("predictor", 1) not in (1, 2, 3):
            raise SentinelError(f"unsupported COG encoding in {url}")
        if not floats and (tags.get("bits") not in (8, 16) or tags.get("sample_format", 1) != 1):
            raise SentinelError(f"expected unsigned 8 or 16 bit or float32 samples in {url}")
        _HOT.set(("s2tags", url), tags, HEADER_TTL_S)
    return tags


def read_window(
    client: httpx.Client, url: str, row0: int, col0: int, rows: int, cols: int
) -> tuple[np.ndarray, str]:
    tags = _header(client, url)
    th, tw = tags["tile_h"], tags["tile_w"]
    across = math.ceil(tags["width"] / tw)
    floats = tags.get("bits") == 32 and tags.get("sample_format") == 3
    shape = (rows, cols)
    out = np.full(shape, np.nan, dtype=np.float32) if floats else np.zeros(shape, np.uint16)
    digest = hashlib.sha256()
    for ty in range(row0 // th, (row0 + rows - 1) // th + 1):
        for tx in range(col0 // tw, (col0 + cols - 1) // tw + 1):
            index = ty * across + tx
            offset, nbytes = tags["tile_offsets"][index], tags["tile_bytes"][index]
            raw = chirps._range(client, url, offset, nbytes)
            if len(raw) != nbytes:
                raise SentinelError("truncated tile")
            digest.update(raw)
            tile = decode_tile(raw, tags)
            r0, c0 = max(row0, ty * th), max(col0, tx * tw)
            r1, c1 = min(row0 + rows, (ty + 1) * th), min(col0 + cols, (tx + 1) * tw)
            out[r0 - row0 : r1 - row0, c0 - col0 : c1 - col0] = tile[
                r0 - ty * th : r1 - ty * th, c0 - tx * tw : c1 - tx * tw
            ]
    return out, "sha256:" + digest.hexdigest()


def pixel_mask(
    ring: list[tuple[float, float]],
    transform: list[float],
    row0: int,
    col0: int,
    rows: int,
    cols: int,
) -> np.ndarray:
    a, _, c, _, e, f = transform[:6]
    xs = c + (np.arange(col0, col0 + cols) + 0.5) * a
    ys = f + (np.arange(row0, row0 + rows) + 0.5) * e
    px, py = np.meshgrid(xs, ys)
    inside = np.zeros(px.shape, dtype=bool)
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:], strict=True):
        crosses = (y1 > py) != (y2 > py)
        with np.errstate(divide="ignore", invalid="ignore"):
            at = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
        inside ^= crosses & (px < at)
    return inside


def scene_stats(
    scene_id: str,
    when: str,
    cloud_pct: float | None,
    red: np.ndarray,
    nir: np.ndarray,
    green: np.ndarray,
    scl: np.ndarray,
    mask: np.ndarray,
    scale: dict[str, float],
) -> dict[str, Any]:
    total = int(mask.sum())
    clear = mask & np.isin(scl, SCL_CLEAR) & (red > 0) & (nir > 0) & (green > 0)
    n_clear = int(clear.sum())
    out: dict[str, Any] = {
        "scene_id": scene_id,
        "datetime": when,
        "scene_cloud_pct": cloud_pct,
        "pixels": total,
        "clear_pixels": n_clear,
        "clear_fraction": round(n_clear / total, 3) if total else None,
        "ndvi": None,
        "ndwi": None,
        "provenance": "DERIVED",
    }
    if total == 0:
        return {
            **out,
            "status": "outside",
            "reason": "no 10 m pixel centre falls inside this boundary",
        }
    if n_clear / total < MIN_CLEAR_FRACTION:
        share = round(100 * n_clear / total)
        return {
            **out,
            "status": "cloudy",
            "reason": (
                f"only {share} % of the paddy's pixels are clear; "
                f"need {round(100 * MIN_CLEAR_FRACTION)} %"
            ),
        }

    def refl(band: np.ndarray) -> np.ndarray:
        return band[clear].astype("float64") * scale["scale"] + scale["offset"]

    r, n, g = refl(red), refl(nir), refl(green)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = (n - r) / (n + r)
        ndwi = (g - n) / (g + n)
    ok = np.isfinite(ndvi) & np.isfinite(ndwi) & (np.abs(ndvi) <= 1) & (np.abs(ndwi) <= 1)
    out["invalid_pixels"] = int((~ok).sum())
    if not ok.any():
        return {
            **out,
            "status": "unavailable",
            "reason": "no clear pixel had a physically valid index",
        }
    return {
        **out,
        "status": "clear",
        "ndvi": round(float(ndvi[ok].mean()), 3),
        "ndwi": round(float(ndwi[ok].mean()), 3),
        "reason": None,
    }


def as_series(scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One entry per acquisition day: a pass over a tile edge yields one scene per tile."""
    by_day: dict[str, list[dict[str, Any]]] = {}
    for scene in scenes:
        by_day.setdefault(scene["datetime"][:10], []).append(scene)
    out = []
    for same_day in by_day.values():
        best = max(same_day, key=lambda s: s.get("clear_pixels") or 0)
        others = [s["scene_id"] for s in same_day if s is not best]
        out.append({**best, "also": others} if others else best)
    return sorted(out, key=lambda s: s["datetime"])


def search(
    client: httpx.Client, ring_lonlat: list[list[float]], start: datetime, end: datetime
) -> list[dict[str, Any]]:
    body = {
        "collections": [COLLECTION],
        "intersects": {"type": "Polygon", "coordinates": [ring_lonlat]},
        "datetime": f"{start:%Y-%m-%dT%H:%M:%SZ}/{end:%Y-%m-%dT%H:%M:%SZ}",
        "limit": MAX_SCENES,
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
    }
    response = client.post(f"{get_settings().earth_search_url}/search", json=body)
    response.raise_for_status()
    return list(response.json().get("features", []))


def _scale(asset: dict[str, Any]) -> dict[str, float]:
    band = (asset.get("raster:bands") or [{}])[0]
    if "scale" not in band or "offset" not in band:
        raise SentinelError("asset does not publish its reflectance scale and offset")
    return {"scale": float(band["scale"]), "offset": float(band["offset"])}


def _window(transform: list[float], ring: list[tuple[float, float]]) -> tuple[int, int, int, int]:
    a, _, c, _, e, f = transform[:6]
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    col0, col1 = math.floor((min(xs) - c) / a), math.floor((max(xs) - c) / a) + 1
    row0, row1 = math.floor((max(ys) - f) / e), math.floor((min(ys) - f) / e) + 1
    return row0, col0, row1 - row0, col1 - col0


def _read_scene(
    client: httpx.Client, item: dict[str, Any], ring_latlon: list[list[float]]
) -> dict[str, Any]:
    props = item["properties"]
    cloud = props.get("eo:cloud_cover")
    if cloud is not None and cloud >= SKIP_SCENE_CLOUD_PCT:
        return {
            "scene_id": item["id"],
            "datetime": props["datetime"],
            "scene_cloud_pct": cloud,
            "pixels": None,
            "clear_pixels": None,
            "clear_fraction": None,
            "ndvi": None,
            "ndwi": None,
            "provenance": "DERIVED",
            "status": "cloudy",
            "reason": (
                f"scene cloud cover {round(cloud)} % is at or above "
                f"{round(SKIP_SCENE_CLOUD_PCT)} %; pixels not read"
            ),
        }
    zone, south = zone_of(int(props["proj:epsg"]))
    ring = [utm_from_lonlat(lat, lon, zone, south) for lat, lon in ring_latlon]
    assets = item["assets"]
    t10 = assets["red"]["proj:transform"]
    row0, col0, rows, cols = _window(t10, ring)
    if rows <= 0 or cols <= 0 or row0 < 0 or col0 < 0:
        raise SentinelError("boundary lies outside this scene's tile")
    red, d1 = read_window(client, assets["red"]["href"], row0, col0, rows, cols)
    nir, d2 = read_window(client, assets["nir"]["href"], row0, col0, rows, cols)
    green, d3 = read_window(client, assets["green"]["href"], row0, col0, rows, cols)
    t20 = assets["scl"]["proj:transform"]
    xs = t10[2] + (np.arange(col0, col0 + cols) + 0.5) * t10[0]
    ys = t10[5] + (np.arange(row0, row0 + rows) + 0.5) * t10[4]
    scl_cols = np.floor((xs - t20[2]) / t20[0]).astype(int)
    scl_rows = np.floor((ys - t20[5]) / t20[4]).astype(int)
    s_row0, s_col0 = int(scl_rows.min()), int(scl_cols.min())
    scl_win, d4 = read_window(
        client,
        assets["scl"]["href"],
        s_row0,
        s_col0,
        int(scl_rows.max()) - s_row0 + 1,
        int(scl_cols.max()) - s_col0 + 1,
    )
    scl = scl_win[np.ix_(scl_rows - s_row0, scl_cols - s_col0)]
    mask = pixel_mask(ring, t10, row0, col0, rows, cols)
    out = scene_stats(
        item["id"], props["datetime"], cloud, red, nir, green, scl, mask, _scale(assets["red"])
    )
    out["sha256"] = sha256("|".join((d1, d2, d3, d4)).encode())
    return out


def paddy_series(
    ring_latlon: list[list[float]], days: int = 60, client: httpx.Client | None = None
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
        "provider": PROVIDER,
        "licence": LICENCE,
        "method": {
            "ndvi": NDVI_METHOD,
            "ndwi": NDWI_METHOD,
            "cloud_mask": SCL_SOURCE,
            "assumptions": ASSUMPTIONS,
        },
        "window_days": days,
        "series": [],
        "missing": [],
        "provenance": "DERIVED",
    }
    try:
        try:
            items = search(http, ring_lonlat, start, end)
        except httpx.HTTPError as exc:
            out["missing"].append(
                missing("ndvi", f"Earth Search unavailable: {type(exc).__name__}")
            )
            return out
        if not items:
            out["missing"].append(
                missing("ndvi", f"no Sentinel-2 scene over this boundary in the last {days} days")
            )
            return out
        scenes = []
        for item in items:
            key = f"{item['id']}:{ring_key}"
            hit = _CACHE.get("sentinel2", key)
            if hit is not None:
                scenes.append(hit["payload"])
                continue
            try:
                scene = _read_scene(http, item, ring_latlon)
            except (
                httpx.HTTPError,
                SentinelError,
                chirps.ChirpsError,
                KeyError,
                zlib.error,
            ) as exc:
                scenes.append(
                    {
                        "scene_id": item["id"],
                        "datetime": item["properties"]["datetime"],
                        "status": "unavailable",
                        "ndvi": None,
                        "ndwi": None,
                        "reason": f"{type(exc).__name__}: {exc}"[:160],
                        "provenance": "DERIVED",
                    }
                )
                continue
            url = item["assets"]["red"]["href"]
            _CACHE.put("sentinel2", key, scene, url, scene.get("sha256", ""), None)
            log_fetch("sentinel2", key, scene.get("sha256", ""))
            scenes.append(scene)
        out["series"] = as_series(scenes)
        out["source"] = source_ref(
            PROVIDER,
            f"{get_settings().earth_search_url}/collections/{COLLECTION}",
            end.isoformat(timespec="seconds"),
            sha256(repr([s["scene_id"] for s in scenes]).encode()),
        )
        clear = [s for s in out["series"] if s["status"] == "clear"]
        if not clear:
            out["missing"].append(
                missing(
                    "ndvi", "every scene in the window was cloudy or unreadable over this boundary"
                )
            )
        return out
    finally:
        if own:
            http.close()
