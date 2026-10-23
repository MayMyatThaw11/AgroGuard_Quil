from __future__ import annotations

import json
from typing import Any

from . import live
from .config import get_settings
from .contract import ring_area_ha
from .ledger import get_ledger
from .store import RecordCache, now_iso, sha256

_STORE = RecordCache("contracts.sqlite")
SITE = "processing_site"
LINK = "site_link"
MAX_FEATURES = 200


def _ledger_append(kind: str, payload: dict[str, Any]) -> None:
    get_ledger(get_settings().ledger_path).append(kind, payload)


def _text(props: dict[str, Any], key: str, index: int) -> str:
    value = props.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"feature {index}: properties.{key} must be a non-empty string")
    return value.strip()


def _site(feature: Any, index: int) -> dict[str, Any]:
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        raise ValueError(f"feature {index}: not a GeoJSON Feature")
    geometry = feature.get("geometry") or {}
    if geometry.get("type") != "Polygon":
        raise ValueError(f"feature {index}: geometry must be a Polygon")
    rings = geometry.get("coordinates") or []
    ring = rings[0] if rings else []
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError(f"feature {index}: the outer ring must be closed with 4 or more points")
    points = [[float(lat), float(lon)] for lon, lat, *_ in ring]
    props = dict(feature.get("properties") or {})
    site_id = _text(props, "id", index)
    corners = points[:-1]
    return {
        "id": site_id,
        "name": props.get("name") or site_id,
        "properties": props,
        "geometry": {"type": "Polygon", "coordinates": [ring]},
        "centroid": [
            round(sum(p[0] for p in corners) / len(corners), 6),
            round(sum(p[1] for p in corners) / len(corners), 6),
        ],
        "area_ha": ring_area_ha(points),
        "area_basis": "computed from the uploaded outline",
        "precision_level": _text(props, "precision_level", index),
    }


def upload(collection: dict[str, Any], uploaded_by: str) -> dict[str, Any]:
    if not isinstance(collection, dict) or collection.get("type") != "FeatureCollection":
        raise ValueError("body must be a GeoJSON FeatureCollection")
    features = collection.get("features") or []
    if not features or len(features) > MAX_FEATURES:
        raise ValueError(f"a FeatureCollection needs 1 to {MAX_FEATURES} features")
    parsed = [_site(f, i) for i, f in enumerate(features)]
    stamp = now_iso()
    for site in parsed:
        row = {**site, "uploaded_by": uploaded_by, "uploaded_at": stamp}
        row_digest = sha256(json.dumps(row, sort_keys=True).encode("utf-8"))
        _STORE.put(SITE, site["id"], row, "agriquill:sites", row_digest, None)
    digest = sha256(json.dumps(parsed, sort_keys=True).encode("utf-8"))
    _ledger_append(
        "site_upload",
        {"sites": [s["id"] for s in parsed], "uploaded_by": uploaded_by, "sha256": digest},
    )
    return {"sites": parsed, "sha256": digest}


def listing() -> list[dict[str, Any]]:
    links = [row for row in _STORE.items(LINK) if row.get("site_id")]
    out = []
    for site in sorted(_STORE.items(SITE), key=lambda s: s["id"]):
        suppliers = [
            {"farm_id": r["farm_id"], "parcel_id": r["parcel_id"]}
            for r in sorted(links, key=lambda r: (r["farm_id"], r["parcel_id"]))
            if r["site_id"] == site["id"]
        ]
        out.append({**site, "suppliers": suppliers})
    return out


def link(farm_id: str, parcel_id: str, site_id: str | None, linked_by: str) -> dict[str, Any]:
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        raise KeyError(farm_id)
    if parcel_id not in {p["id"] for p in spec["parcels"]}:
        raise KeyError(parcel_id)
    if site_id is not None and _STORE.get(SITE, site_id) is None:
        raise KeyError(site_id)
    row = {
        "farm_id": farm_id,
        "parcel_id": parcel_id,
        "site_id": site_id,
        "linked_by": linked_by,
        "linked_at": now_iso(),
    }
    saved, digest = _STORE.update(
        LINK, f"{farm_id}|{parcel_id}", lambda _old: row, "agriquill:sites"
    )
    _ledger_append("site_link", {**row, "sha256": digest})
    return dict(saved)


def delivers_to(farm_id: str) -> dict[str, str | None]:
    return {r["parcel_id"]: r.get("site_id") for r in _STORE.items(LINK, f"{farm_id}|")}
