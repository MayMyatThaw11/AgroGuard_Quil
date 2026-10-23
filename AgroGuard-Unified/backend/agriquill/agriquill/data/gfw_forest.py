from __future__ import annotations

import hashlib
import math
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx

from ..cache import TTLCache
from ..config import get_settings
from ..resilience import Breaker, CircuitOpen, guarded
from ..store import RecordCache, log_fetch, missing, sha256, source_ref

PROVIDER = "Global Forest Watch Data API (World Resources Institute)"
EUDR_CUTOFF_YEAR = 2020
CANOPY_THRESHOLD = 30
FIRE_WINDOW_DAYS = 30
RADIUS_KM = (0.05, 25.0)
RESULT_TTL_S = 24 * 3600.0
LISTING_TTL_S = 6 * 3600.0
POINTS = 24
ASEAN_BOX = {
    "type": "Polygon",
    "coordinates": [[[92, -11], [141, -11], [141, 29], [92, 29], [92, -11]]],
}
LOSS = "umd_tree_cover_loss"
FIRES = "nasa_viirs_fire_alerts"
PONDS = "clark_labs_tropical_pond_aquaculture_2018__class"
SCOPE = (
    "Satellite screening only. UMD tree cover loss uses a canopy-density threshold, not the "
    "legal forest definition of EU 2023/1115 or ASOA, and a parcel polygon is needed for a "
    "compliance file. This is not a compliance certificate."
)
_CACHE = RecordCache()
_HOT = TTLCache("gfw_forest_hot")
_CLIENT: list[httpx.Client] = []
_BREAKER = Breaker(threshold=5, cooldown_s=60.0, name="gfw_forest")


class GfwError(Exception):
    pass


def _client() -> httpx.Client:
    if not _CLIENT:
        _CLIENT.append(httpx.Client(timeout=90.0, follow_redirects=True))
    return _CLIENT[0]


def _headers() -> dict[str, str]:
    key = get_settings().gfw_api_key
    if key is None:
        raise GfwError("AGRIQUILL_GFW_API_KEY is not set")
    return {"x-api-key": key.get_secret_value(), "Origin": "https://agriquill.local"}


def circle(lat: float, lon: float, radius_km: float) -> dict[str, Any]:
    dlat = radius_km / 110.574
    dlon = radius_km / (111.320 * max(math.cos(math.radians(lat)), 0.01))
    ring = [
        [
            round(lon + dlon * math.cos(2 * math.pi * i / POINTS), 6),
            round(lat + dlat * math.sin(2 * math.pi * i / POINTS), 6),
        ]
        for i in range(POINTS)
    ]
    return {"type": "Polygon", "coordinates": [[*ring, ring[0]]]}


def _version(client: httpx.Client, dataset: str) -> str:
    hit = _HOT.get(("version", dataset))
    if hit is not None:
        return str(hit)
    response = client.get(f"{get_settings().gfw_api}/dataset/{dataset}/latest", headers=_headers())
    response.raise_for_status()
    version = str(response.json()["data"]["version"])
    _HOT.set(("version", dataset), version, LISTING_TTL_S)
    return version


def query(
    dataset: str, sql: str, geometry: dict[str, Any], client: httpx.Client | None = None
) -> dict[str, Any]:
    own = client or _client()
    digest_in = hashlib.sha256((dataset + sql + str(geometry)).encode()).hexdigest()
    hit = _CACHE.get("gfw_forest", digest_in)
    if hit is not None and not hit["stale"]:
        return hit["payload"] | {"cached": True}

    def fetch() -> tuple[str, str, httpx.Response]:
        version = _version(own, dataset)
        url = f"{get_settings().gfw_api}/dataset/{dataset}/{version}/query/json"
        response = own.post(url, headers=_headers(), json={"sql": sql, "geometry": geometry})
        response.raise_for_status()
        return version, url, response

    try:
        version, url, response = guarded(_BREAKER, fetch)
        rows = response.json()["data"]
    except (httpx.HTTPError, GfwError, CircuitOpen, KeyError, ValueError) as exc:
        reason = f"GFW Data API unavailable: {type(exc).__name__}"
        if hit is not None:
            return hit["payload"] | {"cached": True, "stale": True, "stale_reason": reason}
        return {"rows": None, "dataset": dataset, "version": None, "source": None, "reason": reason}
    digest = sha256(response.content)
    stamp = datetime.now(UTC).isoformat(timespec="seconds")
    payload = {
        "rows": rows,
        "dataset": dataset,
        "version": version,
        "source": source_ref(PROVIDER, url, stamp, digest),
        "reason": None,
    }
    _CACHE.put("gfw_forest", digest_in, payload, url, digest, RESULT_TTL_S)
    log_fetch("gfw_forest", digest_in, digest)
    return payload


def _block(result: dict[str, Any], field: str) -> dict[str, Any]:
    gaps = [] if result["rows"] is not None else [missing(field, result["reason"])]
    return {
        "dataset": result["dataset"],
        "version": result["version"],
        "source": result["source"],
        "missing": gaps,
    }


def compliance(
    lat: float,
    lon: float,
    radius_km: float = 1.0,
    today: date | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    if not RADIUS_KM[0] <= radius_km <= RADIUS_KM[1]:
        raise ValueError(f"radius_km must be between {RADIUS_KM[0]} and {RADIUS_KM[1]}")
    today = today or datetime.now(UTC).date()
    area = circle(lat, lon, radius_km)
    loss = query(
        LOSS,
        "SELECT umd_tree_cover_loss__year, SUM(area__ha) FROM data "
        f"WHERE umd_tree_cover_loss__year > {EUDR_CUTOFF_YEAR} "
        f"AND umd_tree_cover_density_2000__threshold >= {CANOPY_THRESHOLD} "
        "GROUP BY umd_tree_cover_loss__year",
        area,
        client,
    )
    primary = query(
        LOSS,
        "SELECT umd_tree_cover_loss__year, SUM(area__ha) FROM data "
        f"WHERE umd_tree_cover_loss__year > {EUDR_CUTOFF_YEAR} "
        f"AND umd_tree_cover_density_2000__threshold >= {CANOPY_THRESHOLD} "
        "AND is__umd_regional_primary_forest_2001 = 'true' "
        "GROUP BY umd_tree_cover_loss__year",
        area,
        client,
    )
    since = (today - timedelta(days=FIRE_WINDOW_DAYS)).isoformat()
    fires = query(
        FIRES,
        "SELECT confidence__cat, COUNT(*) FROM data "
        f"WHERE alert__date >= '{since}' GROUP BY confidence__cat",
        area,
        client,
    )
    through = query(
        FIRES,
        "SELECT MAX(alert__date) FROM data "
        f"WHERE alert__date >= '{(today - timedelta(days=120)).isoformat()}'",
        ASEAN_BOX,
        client,
    )
    ponds = query(
        LOSS,
        f"SELECT {PONDS}, SUM(area__ha) FROM data GROUP BY {PONDS}",
        area,
        client,
    )
    out: dict[str, Any] = {
        "provider": PROVIDER,
        "provenance": "RETRIEVED",
        "location": {"latitude": round(lat, 4), "longitude": round(lon, 4), "radius_km": radius_km},
        "scope": SCOPE,
        "tree_cover_loss": _loss(loss, f"canopy >= {CANOPY_THRESHOLD} percent in 2000")
        | {"since_year": EUDR_CUTOFF_YEAR + 1},
        "primary_forest_loss": _loss(primary, "UMD regional primary forest 2001"),
        "fire_alerts": _fires(fires, through, since, today),
        "aquaculture_ponds_2018": {
            "classes": _classes(ponds),
            "legend": "class codes are Clark Labs values; the legend is TO VERIFY",
        }
        | _block(ponds, "aquaculture_ponds_2018"),
    }
    out["missing"] = [
        gap
        for key in (
            "tree_cover_loss",
            "primary_forest_loss",
            "fire_alerts",
            "aquaculture_ponds_2018",
        )
        for gap in out[key]["missing"]
    ]
    return out


def _classes(result: dict[str, Any]) -> list[dict[str, Any]] | None:
    if result["rows"] is None:
        return None
    return [
        {"class": r[PONDS], "area_ha": round(float(r["area__ha"]), 4)}
        for r in sorted(result["rows"], key=lambda r: r[PONDS])
    ]


def _loss(result: dict[str, Any], basis: str) -> dict[str, Any]:
    rows = result["rows"]
    years = (
        None
        if rows is None
        else [
            {"year": r["umd_tree_cover_loss__year"], "area_ha": round(float(r["area__ha"]), 4)}
            for r in sorted(rows, key=lambda r: r["umd_tree_cover_loss__year"])
        ]
    )
    return {
        "basis": basis,
        "years": years,
        "total_ha": None if years is None else round(sum(y["area_ha"] for y in years), 4),
    } | _block(result, "years")


def _fires(
    result: dict[str, Any], through: dict[str, Any], since: str, today: date
) -> dict[str, Any]:
    rows = result["rows"]
    latest = through["rows"][0].get("max") if through["rows"] else None
    block = _block(result, "alerts")
    counts = None if rows is None else {str(r["confidence__cat"]): int(r["count"]) for r in rows}
    if counts is not None and (latest is None or latest < since):
        counts = None
        block["missing"].append(missing("alerts", f"VIIRS alerts in this dataset end at {latest}"))
    return {
        "window": {"from": since, "to": today.isoformat()},
        "dataset_data_through": latest,
        "alerts_by_confidence": counts,
        "total": None if counts is None else sum(counts.values()),
        "confidence": "n nominal, l low, h high (VIIRS 375 m active-fire detections)",
    } | block


def search_datasets(
    term: str, limit: int = 10, client: httpx.Client | None = None
) -> dict[str, Any]:
    own = client or _client()
    listing = _HOT.get(("datasets",))
    stamp = datetime.now(UTC).isoformat(timespec="seconds")
    url = f"{get_settings().gfw_api}/datasets"
    if listing is None:
        try:
            response = own.get(url, headers=_headers())
            response.raise_for_status()
            listing = {"rows": response.json()["data"], "digest": sha256(response.content)}
        except (httpx.HTTPError, GfwError, KeyError, ValueError) as exc:
            return {
                "provider": PROVIDER,
                "term": term,
                "hits": [],
                "missing": [missing("datasets", f"GFW Data API unavailable: {type(exc).__name__}")],
                "source": None,
            }
        _HOT.set(("datasets",), listing, LISTING_TTL_S)
        log_fetch("gfw_forest", "datasets", listing["digest"])
    words = [w for w in term.lower().split() if w]
    hits = []
    for row in listing["rows"]:
        meta = row.get("metadata") or {}
        text = " ".join(
            str(x or "") for x in (row.get("dataset"), meta.get("title"), meta.get("overview"))
        ).lower()
        if words and all(w in text for w in words):
            hits.append(
                {
                    "dataset": row["dataset"],
                    "title": meta.get("title"),
                    "overview": (meta.get("overview") or "")[:240] or None,
                    "versions": (row.get("versions") or [])[-3:],
                }
            )
    return {
        "provider": PROVIDER,
        "provenance": "RETRIEVED",
        "term": term,
        "hits": hits[: max(1, min(limit, 50))],
        "total_matches": len(hits),
        "missing": [] if hits else [missing("hits", "no dataset matches every word")],
        "source": source_ref(PROVIDER, url, stamp, listing["digest"]),
    }
