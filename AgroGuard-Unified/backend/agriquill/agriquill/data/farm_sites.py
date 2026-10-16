from __future__ import annotations

import json
import math
import os
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from ..store import missing, sha256, source_ref
from . import gfw_forest

SITES = Path(__file__).with_name("farm_sites.json")
OVERPASS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)
HEADERS = {
    "User-Agent": "AgriQill/0.1 (+https://github.com/loucasty-cell/Agriqill)",
    "Accept": "*/*",
}
PROVIDER = "OpenStreetMap contributors via Overpass API"
LICENCE = "ODbL 1.0, https://www.openstreetmap.org/copyright"
RADII_M = (12000, 25000)
PER_TOWN = 12
FETCH_LIMIT = 150
MIN_AREA_HA = 0.3
MAX_AREA_HA = 60.0
SEPARATION_M = 150.0
PAUSE_S = 2.0
ROUNDS = 4
TOWN_WORKERS = 2
BACKOFF_S = 20.0
CROPLAND = "Agriculture"


class SiteError(Exception):
    pass


def _query(lat: float, lon: float, radius: int) -> str:
    around = f"(around:{radius},{lat},{lon})"
    return f'[out:json][timeout:180];way["landuse"="farmland"]{around};out geom {FETCH_LIMIT};'


def _fetch(client: httpx.Client, lat: float, lon: float, radius: int) -> bytes:
    last: Exception | None = None
    for attempt in range(ROUNDS):
        for endpoint in OVERPASS:
            try:
                response = client.post(
                    endpoint,
                    data={"data": _query(lat, lon, radius)},
                    headers=HEADERS,
                )
                response.raise_for_status()
                return response.content
            except httpx.HTTPError as exc:
                last = exc
        time.sleep(BACKOFF_S * (attempt + 1))
    status = getattr(getattr(last, "response", None), "status_code", None)
    raise SiteError(f"every Overpass endpoint failed: {type(last).__name__} {status or ''}".strip())


def polygon_stats(points: list[tuple[float, float]]) -> tuple[float, float, float] | None:
    if len(points) < 4 or points[0] != points[-1]:
        return None
    lat0 = sum(p[0] for p in points) / len(points)
    kx = 111_320.0 * math.cos(math.radians(lat0))
    ky = 110_574.0
    xs = [(p[1] - points[0][1]) * kx for p in points]
    ys = [(p[0] - points[0][0]) * ky for p in points]
    cross = [xs[i] * ys[i + 1] - xs[i + 1] * ys[i] for i in range(len(points) - 1)]
    area2 = sum(cross)
    if area2 == 0:
        return None
    cx = sum((xs[i] + xs[i + 1]) * cross[i] for i in range(len(cross))) / (3 * area2)
    cy = sum((ys[i] + ys[i + 1]) * cross[i] for i in range(len(cross))) / (3 * area2)
    return abs(area2) / 2 / 10_000.0, points[0][0] + cy / ky, points[0][1] + cx / kx


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 110_574.0
    dx = (a[1] - b[1]) * 111_320.0 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


def candidates(raw: bytes, center: tuple[float, float]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for element in json.loads(raw).get("elements", []):
        if element.get("type") != "way":
            continue
        points = [(g["lat"], g["lon"]) for g in element.get("geometry", [])]
        stats = polygon_stats(points)
        if stats is None or not MIN_AREA_HA <= stats[0] <= MAX_AREA_HA:
            continue
        tags = element.get("tags", {})
        found.append(
            {
                "osm": f"way/{element['id']}",
                "latitude": round(stats[1], 5),
                "longitude": round(stats[2], 5),
                "area_ha": round(stats[0], 2),
                "landuse": tags.get("landuse"),
                "crop": tags.get("crop"),
                "water_management": tags.get("water_management") or tags.get("irrigation"),
                "name": tags.get("name"),
                "distance_to_town_km": round(_distance_m((stats[1], stats[2]), center) / 1000.0, 2),
            }
        )
    return found


def choose(found: list[dict[str, Any]], count: int = PER_TOWN) -> list[dict[str, Any]]:
    ranked = sorted(found, key=lambda s: (s["crop"] is None, s["distance_to_town_km"], s["osm"]))
    chosen: list[dict[str, Any]] = []
    for site in ranked:
        here = (site["latitude"], site["longitude"])
        if all(_distance_m(here, (c["latitude"], c["longitude"])) >= SEPARATION_M for c in chosen):
            chosen.append(site)
        if len(chosen) == count:
            break
    return chosen


def land_cover(site: dict[str, Any]) -> dict[str, Any]:
    area = gfw_forest.circle(site["latitude"], site["longitude"], 0.04)
    result = gfw_forest.query(
        "esa_land_cover_2015",
        "SELECT esa_land_cover_2015__class, SUM(area__ha) FROM data "
        "GROUP BY esa_land_cover_2015__class",
        area,
    )
    if result["rows"] is None:
        return {"class": None, "missing": [missing("land_cover", result["reason"])]}
    rows = sorted(result["rows"], key=lambda r: -float(r["area__ha"]))
    top = rows[0]["esa_land_cover_2015__class"] if rows else None
    return {
        "class": top,
        "agrees": None if top is None else top == CROPLAND,
        "dataset": "ESA CCI land cover 2015 (via GFW Data API)",
        "source": result["source"],
        "missing": [],
    }


def build_town(client: httpx.Client, town: dict[str, Any]) -> dict[str, Any]:
    center = (town["latitude"], town["longitude"])
    attempts: list[dict[str, Any]] = []
    found: list[dict[str, Any]] = []
    raw = b""
    for radius in RADII_M:
        raw = _fetch(client, center[0], center[1], radius)
        found = candidates(raw, center)
        attempts.append({"radius_m": radius, "usable": len(found)})
        if len(found) >= PER_TOWN:
            break
        time.sleep(PAUSE_S)
    if not found:
        return {
            "town": town["town"],
            "country": town["country"],
            "sites": [],
            "search": attempts,
            "source": None,
            "licence": LICENCE,
            "missing": [missing("sites", "no mapped farmland polygon within 25 km")],
        }
    chosen = choose(found)
    for site in chosen:
        site["land_cover_check"] = land_cover(site)
    return {
        "town": town["town"],
        "country": town["country"],
        "sites": chosen,
        "search": attempts,
        "source": source_ref(
            PROVIDER, OVERPASS[0], datetime.now(UTC).isoformat(timespec="seconds"), sha256(raw)
        ),
        "licence": LICENCE,
        "missing": [],
    }


def build(towns: list[str] | None = None, force: bool = False) -> dict[str, Any]:
    from ..twin import TOWNS

    seen: dict[str, dict[str, Any]] = {}
    for country, name, lat, lon, *_ in TOWNS:
        seen.setdefault(name, {"town": name, "country": country, "latitude": lat, "longitude": lon})
    listed = [r for r in seen.values() if not towns or r["town"] in towns]
    previous = read().get("towns", {})
    todo = [r for r in listed if force or not previous.get(r["town"], {}).get("sites")]
    built: dict[str, Any] = {}
    lock = threading.Lock()

    def one(region: dict[str, Any], client: httpx.Client) -> None:
        try:
            result = build_town(client, region)
        except (SiteError, ValueError, KeyError) as exc:
            result = {
                "town": region["town"],
                "country": region["country"],
                "sites": [],
                "search": [],
                "source": None,
                "licence": LICENCE,
                "missing": [missing("sites", f"{type(exc).__name__}: {exc}"[:160])],
            }
        with lock:
            built[region["town"]] = result
            write({"built_at": _now(), "towns": read().get("towns", {}) | {region["town"]: result}})

    with (
        httpx.Client(timeout=200.0, follow_redirects=True) as client,
        ThreadPoolExecutor(max_workers=TOWN_WORKERS) as pool,
    ):
        list(pool.map(lambda r: one(r, client), todo))
    return {
        "towns": len(built),
        "without_sites": sorted(t for t, v in built.items() if not v["sites"]),
        "sites": sum(len(v["sites"]) for v in built.values()),
    }


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def write(payload: dict[str, Any]) -> None:
    fd, tmp = tempfile.mkstemp(dir=SITES.parent, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=1, sort_keys=True)
        handle.write("\n")
    os.replace(tmp, SITES)


def read() -> dict[str, Any]:
    if not SITES.is_file():
        return {}
    return json.loads(SITES.read_text(encoding="utf-8"))


def sites_for(town: str) -> list[dict[str, Any]]:
    return read().get("towns", {}).get(town, {}).get("sites", [])


def to_typescript() -> str:
    rows = []
    for town, entry in sorted(read().get("towns", {}).items()):
        if not entry["sites"]:
            continue
        sites = ",\n".join(
            "    "
            + json.dumps(
                {
                    "osm": s["osm"],
                    "latitude": s["latitude"],
                    "longitude": s["longitude"],
                    "areaHa": s["area_ha"],
                    "landuse": s["landuse"],
                    "crop": s["crop"],
                    "landCover": s["land_cover_check"].get("class"),
                },
                ensure_ascii=False,
            )
            for s in entry["sites"]
        )
        rows.append(f"  {json.dumps(town, ensure_ascii=False)}: [\n{sites},\n  ],")
    header = (
        "export interface FarmSite {\n"
        "  osm: string;\n"
        "  latitude: number;\n"
        "  longitude: number;\n"
        "  areaHa: number;\n"
        "  landuse: string | null;\n"
        "  crop: string | null;\n"
        "  landCover: string | null;\n"
        "}\n\n"
        "export const FARM_SITES: Readonly<Record<string, readonly FarmSite[]>> = {\n"
    )
    return header + "\n".join(rows) + "\n};\n"
