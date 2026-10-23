from __future__ import annotations

import json
import math
import time
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from functools import partial
from pathlib import Path
from typing import Any

import httpx

from . import crops
from .cache import TTLCache
from .config import get_settings
from .resilience import Breaker, CircuitOpen, guarded
from .store import RecordCache, log_fetch, now_iso, sha256, source_ref

Point = tuple[float, float]

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
OVERPASS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
HEADERS = {"User-Agent": "AgriQill/0.1 (+https://github.com/loucasty-cell/Agriqill)"}
GVP_WFS = "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows"
GVP_LAYER = "GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes"
GVP_PAGE = "https://volcano.si.edu/volcano.cfm?vn={number}"
VOLCANO_PACK = Path(__file__).with_name("data") / "gvp_volcanoes.json"

ERA5 = "Open-Meteo historical archive (ECMWF ERA5 reanalysis)"
DEM = "Open-Meteo elevation API (Copernicus DEM GLO-90)"
OSM = "OpenStreetMap contributors via Overpass (ODbL)"
SOILGRIDS = "ISRIC SoilGrids 2.0 (CC BY 4.0)"
GVP = "Smithsonian Global Volcanism Program, Volcanoes of the World, Holocene list"

ASEAN_BOX = (-11.1, 28.6, 92.1, 141.1)
BOX_MARGIN_DEG = 5.0
EARTH_KM = 6371.0088
CLIMATE_YEARS = 10
DRY_MONTH_MM = 60.0
MAX_MISSING_SHARE = 0.1
SLOPE_STEP_M = 300.0
MAX_POINTS = 90
SOIL_POINTS = 5
SOIL_CELL_DEG = 0.0025
NEAR_KM = 4.0
TOWN_KM = 15.0
PROTECTED_KM = 10.0
COAST_KM = 50.0
RAW_TTL_S = 30 * 86400.0
HOT_TTL_S = 6 * 3600.0
RICE_CATEGORIES = ("paddy", "rice_fish", "rice_shrimp")

HEAT_C = 35.0
HEAT_SOURCE = (
    "Jagadish, Craufurd and Wheeler 2007, J Exp Bot 58(7):1627-1635, doi:10.1093/jxb/erm003 "
    "(PubMed 17431025 abstract, fetched 2026-10-23): 'In both genotypes <=1 h exposure to "
    ">=33.7 degrees C at anthesis caused sterility.' Their 33.7 C is panicle tissue temperature; "
    "the 35 C daily maximum 2 m air temperature line is this app's screening cut. TO VERIFY"
)
RIPENING_DAYS = 30
FLOWER_HALF_DAYS = 7
FLOWER_SOURCE = (
    "Flowering = planting date + crop season days - 30 days, from 'Ripening stage (flowering to "
    "harvesting) is also constant at about 1 month' (JICA rice training text, "
    "openjicareport.jica.go.jp/pdf/1000025769_04.pdf, fetched 2026-10-23). The +/-7 day window "
    "around it is this app's rule. TO VERIFY"
)

_CACHE = RecordCache()
_HOT = TTLCache("sitecontext_hot")
_BREAKERS = {
    name: Breaker(name=f"sitecontext_{name}") for name in ("open_meteo", "overpass", "soilgrids")
}
_FAILURES = (httpx.HTTPError, CircuitOpen, ValueError, KeyError, TypeError)

CATEGORIES: tuple[tuple[str, Callable[[Mapping[str, str]], bool]], ...] = (
    ("river", lambda t: t.get("waterway") == "river"),
    ("canal", lambda t: t.get("waterway") in ("canal", "ditch", "drain")),
    ("stream", lambda t: t.get("waterway") == "stream"),
    (
        "water",
        lambda t: t.get("natural") == "water" or t.get("landuse") in ("reservoir", "basin"),
    ),
    ("wetland", lambda t: t.get("natural") == "wetland"),
    ("coast", lambda t: t.get("natural") in ("beach", "coastline")),
    ("forest", lambda t: t.get("natural") == "wood" or t.get("landuse") == "forest"),
    ("farmland", lambda t: t.get("landuse") in ("farmland", "paddy") or t.get("crop") == "rice"),
    ("aquaculture", lambda t: t.get("landuse") == "aquaculture"),
    ("orchard", lambda t: t.get("landuse") in ("orchard", "plantation")),
    ("town", lambda t: t.get("place") in ("town", "city")),
    ("residential", lambda t: t.get("landuse") == "residential"),
    (
        "protected",
        lambda t: (
            t.get("boundary") in ("protected_area", "national_park")
            or t.get("leisure") == "nature_reserve"
        ),
    ),
)


def haversine_km(a: Point, b: Point) -> float:
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_KM * math.asin(math.sqrt(h))


def sample_points(spec: Mapping[str, Any]) -> dict[str, Any]:
    """Every distinct boundary corner of every parcel, thinned evenly, plus their centroid."""
    seen: dict[Point, None] = {}
    for parcel in spec.get("parcels", []):
        ring = parcel.get("boundary") or []
        for lat, lon in ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring:
            seen[(round(float(lat), 6), round(float(lon), 6))] = None
    ring_points = list(seen)
    if len(ring_points) > MAX_POINTS:
        step = len(ring_points) / MAX_POINTS
        ring_points = [ring_points[int(i * step)] for i in range(MAX_POINTS)]
    if ring_points:
        lat = sum(p[0] for p in ring_points) / len(ring_points)
        lon = sum(p[1] for p in ring_points) / len(ring_points)
        centroid = (round(lat, 6), round(lon, 6))
        basis = f"{len(ring_points)} boundary corners plus their mean point"
    else:
        location = spec.get("farm", {}).get("location") or []
        if len(location) != 2:
            raise ValueError("contract has no parcel boundary and no farm location: [lat, lon]")
        centroid = (float(location[0]), float(location[1]))
        basis = "no parcel boundary drawn: the farm location only, so no spread"
    return {"centroid": centroid, "ring": ring_points, "basis": basis}


def _spread(values: Sequence[float], digits: int = 1) -> dict[str, Any]:
    return {"min": round(min(values), digits), "max": round(max(values), digits), "n": len(values)}


def _fact(
    fid: str,
    label: str,
    value: Any,
    unit: str,
    source_class: str,
    provider: str,
    method: str,
    at_ms: int,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "id": fid,
        "label": label,
        "value": value,
        "unit": unit,
        "sourceClass": source_class,
        "provider": provider,
        "method": method,
        "retrievedAt": at_ms,
        **extra,
    }


def _unknown(fid: str, label: str, unit: str, provider: str, reason: str) -> dict[str, Any]:
    return {
        "id": fid,
        "label": label,
        "value": None,
        "unit": unit,
        "sourceClass": "UNKNOWN",
        "provider": provider,
        "method": "-",
        "reason": reason,
    }


def _http(
    breaker: str, url: str, params: Any = None, data: str | None = None, attempts: int = 3
) -> bytes:
    def call() -> bytes:
        with httpx.Client(timeout=get_settings().http_timeout_s, headers=HEADERS) as client:
            if data is None:
                response = client.get(url, params=params)
            else:
                response = client.post(url, data={"data": data})
            response.raise_for_status()
            return response.content

    return guarded(_BREAKERS[breaker], call, attempts)


def _cached(
    source: str,
    key: str,
    provider: str,
    url: str,
    ttl_s: float | None,
    fetch: Callable[[], bytes],
) -> tuple[Any, dict[str, str]]:
    hit = _CACHE.get(source, key)
    if hit and not hit["stale"]:
        return hit["payload"], source_ref(provider, hit["url"], hit["retrieved_at"], hit["sha256"])
    try:
        body = fetch()
        payload = json.loads(body)
    except _FAILURES:
        if hit:
            return hit["payload"], source_ref(
                provider, hit["url"], hit["retrieved_at"], hit["sha256"]
            ) | {"stale": "true"}
        raise
    digest = sha256(body)
    _CACHE.put(source, key, payload, url, digest, ttl_s)
    log_fetch(source, key, digest)
    return payload, source_ref(provider, url, now_iso(), digest)


def _why(name: str, exc: Exception) -> str:
    status = getattr(getattr(exc, "response", None), "status_code", None)
    return f"{name} unavailable ({type(exc).__name__}{f' HTTP {status}' if status else ''})"


def climate_period(today: date) -> tuple[str, str, str]:
    last = today.year - 1
    first = last - CLIMATE_YEARS + 1
    return f"{first}-01-01", f"{last}-12-31", f"{first}-{last}"


def climate_facts(
    daily: Mapping[str, list[Any]] | None, period: str, at_ms: int, failure: str | None = None
) -> dict[str, dict[str, Any]]:
    labels = {
        "rainMm": ("Annual rain", "mm"),
        "et0Mm": ("Annual reference ET (FAO-56)", "mm"),
        "aridity": ("Aridity index (rain / ET0)", ""),
        "meanTempC": ("Mean temperature", "°C"),
        "coldestMonthC": ("Coldest month mean", "°C"),
        "warmestMonthC": ("Warmest month mean", "°C"),
        "dryMonths": (f"Months under {DRY_MONTH_MM:.0f} mm", "months"),
        "radiation": ("Mean daily solar radiation", "MJ/m²/day"),
    }

    def fail(reason: str) -> dict[str, dict[str, Any]]:
        return {k: _unknown(k, lab, unit, ERA5, reason) for k, (lab, unit) in labels.items()}

    times = (daily or {}).get("time") or []
    if not daily or not times:
        return fail(failure or "Climate archive not loaded")
    rain_s, temp_s = daily["precipitation_sum"], daily["temperature_2m_mean"]
    gaps = sum(v is None for v in rain_s) + sum(v is None for v in temp_s)
    if gaps / (2 * len(times)) > MAX_MISSING_SHARE:
        return fail(f"{round(gaps / (2 * len(times)) * 100)}% of archive days are missing")
    years = len({t[:4] for t in times})
    rain = [0.0] * 12
    et0 = [0.0] * 12
    temps: list[list[float]] = [[] for _ in range(12)]
    rads: list[float] = []
    for i, stamp in enumerate(times):
        m = int(stamp[5:7]) - 1
        rain[m] += rain_s[i] or 0.0
        et0[m] += daily["et0_fao_evapotranspiration"][i] or 0.0
        if temp_s[i] is not None:
            temps[m].append(temp_s[i])
        if daily["shortwave_radiation_sum"][i] is not None:
            rads.append(daily["shortwave_radiation_sum"][i])
    month_rain = [r / years for r in rain]
    month_t = [sum(t) / len(t) for t in temps if t]
    all_t = [v for t in temps for v in t]
    total_rain = sum(month_rain)
    total_et0 = sum(e / years for e in et0)
    extra = {"period": period, "resolution": "~25 km grid (ERA5 via Open-Meteo)"}

    def derived(fid: str, value: Any, method: str) -> dict[str, Any]:
        label, unit = labels[fid]
        return _fact(fid, label, value, unit, "MODELLED", ERA5, method, at_ms, **extra)

    return {
        "rainMm": derived("rainMm", round(total_rain), f"Mean annual total over {years} years"),
        "et0Mm": derived(
            "et0Mm", round(total_et0), f"FAO-56 ET0 from Open-Meteo, mean over {years} years"
        ),
        "aridity": derived(
            "aridity",
            round(total_rain / total_et0, 2) if total_et0 > 0 else None,
            "Annual rain divided by annual ET0 (UNEP aridity index form)",
        ),
        "meanTempC": derived(
            "meanTempC", round(sum(all_t) / max(1, len(all_t)), 1), "Mean of daily mean temperature"
        ),
        "coldestMonthC": derived(
            "coldestMonthC", round(min(month_t), 1), "Lowest of 12 monthly means"
        ),
        "warmestMonthC": derived(
            "warmestMonthC", round(max(month_t), 1), "Highest of 12 monthly means"
        ),
        "dryMonths": derived(
            "dryMonths",
            sum(r < DRY_MONTH_MM for r in month_rain),
            f"Months whose mean rain is under {DRY_MONTH_MM:.0f} mm (Koppen dry-month line)",
        ),
        "radiation": derived(
            "radiation",
            round(sum(rads) / max(1, len(rads)), 1),
            "Mean of daily shortwave radiation sums",
        ),
    }


def flowering_windows(spec: Mapping[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    windows: list[dict[str, Any]] = []
    skipped: list[str] = []
    for parcel in spec.get("parcels", []):
        pid = parcel.get("id", "?")
        try:
            crop = crops.get_crop(parcel.get("crop_id") or "")
        except (KeyError, ValueError):
            skipped.append(f"{pid}: crop unknown")
            continue
        if crop.category not in RICE_CATEGORIES:
            skipped.append(f"{pid}: not rice ({crop.id})")
            continue
        try:
            planted = date.fromisoformat(str(parcel.get("planted")))
        except ValueError:
            skipped.append(f"{pid}: planting date missing or not ISO")
            continue
        flower = planted + timedelta(days=crop.season_days - RIPENING_DAYS)
        windows.append(
            {
                "parcel": pid,
                "crop_id": crop.id,
                "planted": planted.isoformat(),
                "flowering": flower.isoformat(),
                "from": (flower - timedelta(days=FLOWER_HALF_DAYS)).isoformat(),
                "to": (flower + timedelta(days=FLOWER_HALF_DAYS)).isoformat(),
            }
        )
    return windows, skipped


def _shift(day: date, year: int) -> date:
    try:
        return day.replace(year=year)
    except ValueError:
        return day.replace(year=year, day=28)


def heat_days(
    daily: Mapping[str, list[Any]], window: Mapping[str, str], threshold: float = HEAT_C
) -> dict[str, Any]:
    """Days with ERA5 daily max at or above the threshold inside the same calendar window each
    archive year; a year with more than 10% of its window missing is left out, not zero."""
    tmax = dict(zip(daily["time"], daily["temperature_2m_max"], strict=True))
    start, end = date.fromisoformat(window["from"]), date.fromisoformat(window["to"])
    length = (end - start).days
    per_year: dict[str, int] = {}
    dropped: list[str] = []
    for year in sorted({int(t[:4]) for t in daily["time"]}):
        first = _shift(start, year)
        days = [(first + timedelta(days=d)).isoformat() for d in range(length + 1)]
        values = [tmax.get(d) for d in days]
        if sum(v is None for v in values) / len(values) > MAX_MISSING_SHARE:
            dropped.append(str(year))
            continue
        per_year[str(year)] = sum(v is not None and v >= threshold for v in values)
    if not per_year:
        return {"mean_days": None, "reason": "no archive year covers the flowering window"}
    counts = list(per_year.values())
    return {
        "mean_days": round(sum(counts) / len(counts), 1),
        "max_days": max(counts),
        "years_with_heat": sum(c > 0 for c in counts),
        "years": len(counts),
        "per_year": per_year,
        "years_left_out": dropped,
    }


def load_volcanoes(path: Path = VOLCANO_PACK) -> dict[str, Any] | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def nearest_volcano(points: Sequence[Point], pack: Mapping[str, Any]) -> dict[str, Any]:
    best: tuple[float, dict[str, Any]] | None = None
    per_point: list[float] = []
    for point in points:
        here = min(
            ((haversine_km(point, (v["lat"], v["lon"])), v) for v in pack["volcanoes"]),
            key=lambda item: item[0],
        )
        per_point.append(here[0])
        if best is None or here[0] < best[0]:
            best = here
    if best is None:
        raise ValueError("no sample points")
    return {"km": round(best[0], 1), "volcano": best[1], "spread_km": _spread(per_point)}


def sync_volcanoes(client: httpx.Client | None = None, out: Path = VOLCANO_PACK) -> dict[str, Any]:
    """Fetch the GVP Holocene list from the official WFS and keep the ASEAN box plus a margin."""
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeName": GVP_LAYER,
        "outputFormat": "application/json",
    }
    own = client or httpx.Client(timeout=120.0, headers=HEADERS)
    try:
        response = own.get(GVP_WFS, params=params)
        response.raise_for_status()
    finally:
        if client is None:
            own.close()
    features = response.json()["features"]
    south, north, west, east = ASEAN_BOX
    m = BOX_MARGIN_DEG
    rows = []
    for f in features:
        p = f["properties"]
        lat, lon = float(p["Latitude"]), float(p["Longitude"])
        if south - m <= lat <= north + m and west - m <= lon <= east + m:
            number = int(p["Volcano_Number"])
            rows.append(
                {
                    "number": number,
                    "name": p["Volcano_Name"],
                    "lat": lat,
                    "lon": lon,
                    "country": p.get("Country"),
                    "last_eruption_year": p.get("Last_Eruption_Year"),
                    "url": GVP_PAGE.format(number=number),
                }
            )
    rows.sort(key=lambda r: r["number"])
    digest = sha256(response.content)
    payload = {
        "provider": GVP,
        "source_url": str(response.url),
        "fetched_at": now_iso(),
        "sha256": digest,
        "features_total": len(features),
        "box": {"south": south, "north": north, "west": west, "east": east, "margin_deg": m},
        "licence": "Smithsonian GVP data, cite: Global Volcanism Program, Volcanoes of the World",
        "volcanoes": rows,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    log_fetch("gvp_volcanoes", "holocene", digest)
    return {"volcanoes": len(rows), "features_total": len(features)}


def overpass_query(centre: Point, reach_m: float) -> str:
    p = f"{centre[0]:.5f},{centre[1]:.5f}"

    def around(km: float) -> str:
        return f"(around:{round(km * 1000 + reach_m)},{p})"

    near, town, prot = around(NEAR_KM), around(TOWN_KM), around(PROTECTED_KM)
    return (
        f'[out:json][timeout:25];is_in({p})->.a;(area.a["landuse"];area.a["natural"];'
        f'area.a["boundary"="protected_area"];area.a["leisure"="nature_reserve"];)->.in;'
        f'.in out tags;(nwr{near}["waterway"~"^(river|canal|ditch|drain|stream)$"];'
        f'nwr{near}["natural"~"^(water|wood|wetland|beach)$"];'
        f'nwr{near}["landuse"~"^(forest|reservoir|basin)$"];'
        f'nwr{town}["place"~"^(town|city)$"];'
        f'nwr{prot}["boundary"~"^(protected_area|national_park)$"];'
        f'nwr{prot}["leisure"="nature_reserve"];);out tags center qt 900;'
        f'way{around(COAST_KM)}["natural"="coastline"];out geom qt;'
    )


def surroundings(body: Mapping[str, Any], points: Sequence[Point]) -> dict[str, Any]:
    """Nearest mapped feature of each kind, measured from every sample point."""
    inside: list[str] = []
    found: dict[str, list[Point]] = {}
    for e in body.get("elements", []):
        tags = e.get("tags") or {}
        if e.get("type") == "area":
            cat = next((c for c, test in CATEGORIES if test(tags)), None)
            if cat:
                inside.append(cat)
            continue
        if e.get("geometry"):
            spots = [(g["lat"], g["lon"]) for g in e["geometry"]]
        elif "lat" in e:
            spots = [(e["lat"], e["lon"])]
        elif "center" in e:
            spots = [(e["center"]["lat"], e["center"]["lon"])]
        else:
            continue
        for cat, test in CATEGORIES:
            if test(tags):
                found.setdefault(cat, []).extend(spots)
    near: dict[str, list[float]] = {
        cat: [min(haversine_km(p, s) for s in spots) for p in points]
        for cat, spots in found.items()
    }
    return {"inside": sorted(set(inside)), "near": near}


def _distance_fact(
    fid: str,
    label: str,
    keys: Sequence[str],
    radius: float,
    near: Mapping[str, list[float]],
    at_ms: int,
    ref: Mapping[str, str],
    method: str,
) -> dict[str, Any]:
    hits = [near[k] for k in keys if k in near]
    base = {"source": ref}
    if not hits:
        return _fact(
            fid,
            label,
            None,
            "km",
            "REMOTELY_ESTIMATED",
            OSM,
            method,
            at_ms,
            beyondKm=radius,
            reason=f"None mapped within {radius:g} km",
            **base,
        )
    per_point = [min(col) for col in zip(*hits, strict=True)]
    return _fact(
        fid,
        label,
        round(min(per_point), 1),
        "km",
        "REMOTELY_ESTIMATED",
        OSM,
        method,
        at_ms,
        spread=_spread(per_point),
        **base,
    )


def _topsoil(raw: Mapping[str, Any], name: str) -> float | None:
    layer = next((x for x in raw["properties"]["layers"] if x["name"] == name), None)
    if layer is None:
        return None
    factor = layer["unit_measure"]["d_factor"]
    total = cm = 0.0
    for d in layer["depths"]:
        mean = d["values"]["mean"]
        if mean is None:
            return None
        thick = d["range"]["bottom_depth"] - d["range"]["top_depth"]
        total += mean / factor * thick
        cm += thick
    return total / cm if cm else None


def _soil_points(centre: Point, ring: Sequence[Point]) -> list[Point]:
    cells: dict[tuple[int, int], Point] = {}
    for p in [centre, *ring]:
        cells.setdefault((round(p[0] / SOIL_CELL_DEG), round(p[1] / SOIL_CELL_DEG)), p)
    return list(cells.values())[:SOIL_POINTS]


def _ring_reach_m(centre: Point, ring: Sequence[Point]) -> float:
    return max((haversine_km(centre, p) * 1000 for p in ring), default=0.0)


def build(farm_id: str, today: date | None = None) -> dict[str, Any]:
    from . import live

    loaded = live.load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    text, verdict = loaded
    key = (farm_id, sha256(text.encode("utf-8")))
    hot = _HOT.get(key)
    if hot is not None:
        return {"farm_id": farm_id, **hot}
    out = {"farm_id": farm_id, **context(verdict["contract"], today or datetime.now(UTC).date())}
    if not out["failed"]:
        _HOT.set(key, out, HOT_TTL_S)
    return out


def context(spec: Mapping[str, Any], today: date) -> dict[str, Any]:
    at_ms = int(time.time() * 1000)
    pts = sample_points(spec)
    centre: Point = pts["centroid"]
    ring: list[Point] = pts["ring"]
    samples = [centre, *ring]
    failed: list[str] = []
    facts: dict[str, dict[str, Any]] = {}

    start, end, period = climate_period(today)
    with ThreadPoolExecutor(max_workers=4) as pool:
        era5 = pool.submit(_era5, centre, start, end, failed)
        terrain = pool.submit(_terrain, centre, samples, at_ms, failed)
        soil = pool.submit(_soil, centre, ring, at_ms, failed)
        osm_job = pool.submit(_osm, centre, ring, samples, at_ms, failed)
        daily, climate_ref, climate_fail = era5.result()
        climate = climate_facts(daily, period, at_ms, climate_fail)
        for fact in climate.values():
            if fact["value"] is not None:
                fact["source"] = climate_ref
                fact["method"] += (
                    "; sampled at the farm centroid (one ERA5 cell, coarser than the ring)"
                )
        facts |= climate | terrain.result() | soil.result()
        pin_in, osm = osm_job.result()
    facts |= osm
    facts["volcanoKm"] = _volcano(samples, at_ms)
    facts["heatDays"] = _heat(spec, daily, period, climate_ref, climate_fail, at_ms)
    return {
        "lat": centre[0],
        "lon": centre[1],
        "samples": {"n": len(samples), "basis": pts["basis"]},
        "facts": facts,
        "pinIn": pin_in,
        "retrievedAt": at_ms,
        "failed": failed,
    }


def _era5(
    centre: Point, start: str, end: str, failed: list[str]
) -> tuple[dict[str, list[Any]] | None, dict[str, str] | None, str | None]:
    params = {
        "latitude": f"{centre[0]:.4f}",
        "longitude": f"{centre[1]:.4f}",
        "start_date": start,
        "end_date": end,
        "daily": "precipitation_sum,temperature_2m_mean,temperature_2m_max,"
        "et0_fao_evapotranspiration,shortwave_radiation_sum",
        "timezone": "auto",
    }
    try:
        raw, ref = _cached(
            "site_era5",
            f"{params['latitude']}:{params['longitude']}:{start}:{end}",
            ERA5,
            str(httpx.URL(ARCHIVE, params=params)),
            None,
            lambda: _http("open_meteo", ARCHIVE, params),
        )
        return raw["daily"], ref, None
    except _FAILURES as exc:
        failed.append("era5")
        return None, None, _why("Climate archive", exc)


def _terrain(
    centre: Point, samples: Sequence[Point], at_ms: int, failed: list[str]
) -> dict[str, dict[str, Any]]:
    url = get_settings().open_meteo_elevation_url
    dlat = SLOPE_STEP_M / 111320
    dlon = SLOPE_STEP_M / (111320 * math.cos(math.radians(centre[0])))
    probes = [
        (centre[0] + dlat, centre[1]),
        (centre[0] - dlat, centre[1]),
        (centre[0], centre[1] + dlon),
        (centre[0], centre[1] - dlon),
    ]
    coords = [*samples, *probes]
    params = {
        "latitude": ",".join(f"{p[0]:.5f}" for p in coords),
        "longitude": ",".join(f"{p[1]:.5f}" for p in coords),
    }
    try:
        raw, ref = _cached(
            "site_elevation",
            f"{params['latitude']}|{params['longitude']}",
            DEM,
            str(httpx.URL(url, params=params)),
            RAW_TTL_S,
            lambda: _http("open_meteo", url, params),
        )
        heights = [float(h) for h in raw["elevation"]]
        if len(heights) != len(coords):
            raise ValueError("elevation count does not match the points sent")
    except _FAILURES as exc:
        reason = _why("Elevation", exc)
        failed.append("elevation")
        return {
            "elevationM": _unknown("elevationM", "Elevation", "m", DEM, reason),
            "slopePct": _unknown("slopePct", "Slope over 300 m", "%", DEM, reason),
        }
    ring_h = heights[: len(samples)]
    n, s, e, w = heights[len(samples) :]
    slope = math.hypot((e - w) / (2 * SLOPE_STEP_M), (n - s) / (2 * SLOPE_STEP_M)) * 100
    return {
        "elevationM": _fact(
            "elevationM",
            "Elevation",
            round(sum(ring_h) / len(ring_h)),
            "m",
            "REMOTELY_ESTIMATED",
            DEM,
            "Mean DEM height over the sample points",
            at_ms,
            resolution="90 m",
            spread=_spread(ring_h),
            source=ref,
        ),
        "slopePct": _fact(
            "slopePct",
            "Slope over 300 m",
            round(slope, 1),
            "%",
            "MODELLED",
            DEM,
            "Central difference between DEM points 300 m N, S, E and W of the centroid",
            at_ms,
            resolution="90 m DEM, 600 m baseline",
            source=ref,
        ),
    }


def _soil(
    centre: Point, ring: Sequence[Point], at_ms: int, failed: list[str]
) -> dict[str, dict[str, Any]]:
    label = "Topsoil silt + clay (0-30 cm)"
    url = get_settings().soilgrids_endpoint
    values: list[float] = []
    refs: list[dict[str, str]] = []
    reasons: list[str] = []
    for lat, lon in _soil_points(centre, ring):
        params = [
            ("lat", f"{lat:.4f}"),
            ("lon", f"{lon:.4f}"),
            ("property", "clay"),
            ("property", "silt"),
            ("depth", "0-5cm"),
            ("depth", "5-15cm"),
            ("depth", "15-30cm"),
            ("value", "mean"),
        ]
        try:
            raw, ref = _cached(
                "site_soil",
                f"{lat:.4f}:{lon:.4f}",
                SOILGRIDS,
                str(httpx.URL(url, params=params)),
                RAW_TTL_S,
                partial(_http, "soilgrids", url, params),
            )
        except _FAILURES as exc:
            reasons.append(_why("SoilGrids", exc))
            continue
        clay, silt = _topsoil(raw, "clay"), _topsoil(raw, "silt")
        if clay is None or silt is None:
            reasons.append("SoilGrids has no value here (water, built-up land or no data)")
            continue
        values.append(clay + silt)
        refs.append(ref)
    if not values:
        if any("unavailable" in r for r in reasons):
            failed.append("soilgrids")
        reason = reasons[0] if reasons else "no soil sample point"
        return {"finePct": _unknown("finePct", label, "%", SOILGRIDS, reason)}
    return {
        "finePct": _fact(
            "finePct",
            label,
            round(sum(values) / len(values)),
            "%",
            "MODELLED",
            SOILGRIDS,
            "Silt plus clay, thickness-weighted 0-30 cm, mean over up to 5 sample points "
            "in distinct 250 m cells",
            at_ms,
            resolution="250 m",
            spread=_spread(values, 0),
            source=refs[0],
            **({"missingPoints": reasons} if reasons else {}),
        )
    }


def _osm(
    centre: Point,
    ring: Sequence[Point],
    samples: Sequence[Point],
    at_ms: int,
    failed: list[str],
) -> tuple[list[str], dict[str, dict[str, Any]]]:
    query = overpass_query(centre, _ring_reach_m(centre, ring))
    labels = {
        "coastKm": ("Coast", COAST_KM, ("coast",)),
        "waterKm": (
            "Surface water (river, canal, lake)",
            NEAR_KM,
            ("river", "canal", "stream", "water"),
        ),
        "riverKm": ("River", NEAR_KM, ("river",)),
        "forestKm": ("Forest", NEAR_KM, ("forest",)),
        "townKm": ("Town or city (market)", TOWN_KM, ("town",)),
        "protectedKm": ("Protected area", PROTECTED_KM, ("protected",)),
    }

    def fetch() -> bytes:
        last: Exception | None = None
        for endpoint in OVERPASS:
            try:
                return _http("overpass", endpoint, data=query, attempts=1)
            except _FAILURES as exc:
                last = exc
        raise last or ValueError("no Overpass endpoint")

    try:
        body, ref = _cached(
            "site_overpass", sha256(query.encode("utf-8")), OSM, OVERPASS[0], RAW_TTL_S, fetch
        )
    except _FAILURES as exc:
        reason = _why("OpenStreetMap", exc)
        failed.append("overpass")
        return [], {k: _unknown(k, lab, "km", OSM, reason) for k, (lab, _, _) in labels.items()}
    found = surroundings(body, samples)
    method = (
        "Distance from each sample point to the nearest mapped feature (coastline vertices, "
        "other features by centre); value is the nearest, spread over the points"
    )
    return found["inside"], {
        k: _distance_fact(k, lab, keys, radius, found["near"], at_ms, ref, method)
        for k, (lab, radius, keys) in labels.items()
    }


def _volcano(samples: Sequence[Point], at_ms: int) -> dict[str, Any]:
    label = "Nearest Holocene volcano"
    pack = load_volcanoes()
    if pack is None:
        return _unknown(
            "volcanoKm", label, "km", GVP, "GVP volcano pack missing: run job gvp_volcano_sync"
        )
    hit = nearest_volcano(samples, pack)
    v = hit["volcano"]
    source = {
        "provider": GVP,
        "url": pack["source_url"],
        "retrieved_at": pack["fetched_at"],
        "sha256": pack["sha256"],
    }
    south, north, west, east = (pack["box"][k] for k in ("south", "north", "west", "east"))
    margin = pack["box"]["margin_deg"]
    inside = all(
        south - margin <= p[0] <= north + margin and west - margin <= p[1] <= east + margin
        for p in samples
    )
    if not inside:
        return _unknown(
            "volcanoKm", label, "km", GVP, "farm lies outside the packed ASEAN box and margin"
        )
    return _fact(
        "volcanoKm",
        label,
        hit["km"],
        "km",
        "DOCUMENTED_REFERENCE",
        GVP,
        "Great-circle (haversine) distance from each sample point to every packed volcano",
        at_ms,
        spread=hit["spread_km"],
        source=source,
        volcano={k: v[k] for k in ("name", "number", "lat", "lon", "country", "url")},
    )


def _heat(
    spec: Mapping[str, Any],
    daily: Mapping[str, list[Any]] | None,
    period: str,
    climate_ref: Mapping[str, str] | None,
    climate_fail: str | None,
    at_ms: int,
) -> dict[str, Any]:
    label = f"Days at or above {HEAT_C:g} °C around rice flowering"
    windows, skipped = flowering_windows(spec)
    if not windows:
        reason = "no rice parcel with a crop and planting date: " + (
            "; ".join(skipped) or "no parcels"
        )
        return _unknown("heatDays", label, "days/season", ERA5, reason) | {"threshold": HEAT_SOURCE}
    if daily is None or "temperature_2m_max" not in daily:
        reason = climate_fail or "Climate archive not loaded"
        return _unknown("heatDays", label, "days/season", ERA5, reason) | {"threshold": HEAT_SOURCE}
    parcels = [{**w, **heat_days(daily, w)} for w in windows]
    scored = [p for p in parcels if p["mean_days"] is not None]
    if not scored:
        return _unknown(
            "heatDays", label, "days/season", ERA5, "no archive year covers any flowering window"
        ) | {"threshold": HEAT_SOURCE}
    worst = max(scored, key=lambda p: p["mean_days"])
    return _fact(
        "heatDays",
        label,
        worst["mean_days"],
        "days/season",
        "MODELLED",
        ERA5,
        f"ERA5 daily max 2 m air temperature >= {HEAT_C:g} °C in each parcel's flowering window "
        f"(+/-{FLOWER_HALF_DAYS} days) of every archive year; value is the worst parcel's mean",
        at_ms,
        period=period,
        resolution="~25 km grid (ERA5 via Open-Meteo)",
        source=climate_ref,
        threshold=HEAT_SOURCE,
        flowering=FLOWER_SOURCE,
        parcels=parcels,
        skipped=skipped,
        verify="TO VERIFY",
    )
