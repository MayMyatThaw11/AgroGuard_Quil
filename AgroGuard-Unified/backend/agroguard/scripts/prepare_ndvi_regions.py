"""Make the small region files the NDVI page reads, from the MIMU boundary workbook and GeoJSON.

    python scripts/prepare_ndvi_regions.py <mmr_admin_boundaries.xlsx> <districts.geojson>

Writes app/data/mmr_regions.csv (state and district names in English and Burmese, with centre
points) and app/data/mmr_districts.geojson (district outlines thinned for a web map: the source
is 7 MB, which is far more detail than a district picker needs).
"""

import json
import sys
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "app" / "data"
TOLERANCE_DEG = 0.004  # about 400 m: invisible at district zoom


def _distance_sq(p: list[float], a: list[float], b: list[float]) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
    return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2


def simplify(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker, iterative so a long coastline cannot overflow the stack."""
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        far, far_i = 0.0, first
        for i in range(first + 1, last):
            d = _distance_sq(points[i], points[first], points[last])
            if d > far:
                far, far_i = d, i
        if far > tolerance**2:
            keep[far_i] = True
            stack += [(first, far_i), (far_i, last)]
    return [[round(p[0], 4), round(p[1], 4)] for p, k in zip(points, keep, strict=True) if k]


def thin_rings(rings: list[list[list[float]]]) -> list[list[list[float]]]:
    out = []
    for ring in rings:
        thin = simplify(ring, TOLERANCE_DEG)
        if len(thin) >= 4:  # a ring needs three corners and the closing point
            out.append(thin)
    return out


def thin_geometry(geometry: dict) -> dict | None:
    if geometry["type"] == "Polygon":
        rings = thin_rings(geometry["coordinates"])
        return {"type": "Polygon", "coordinates": rings} if rings else None
    if geometry["type"] == "MultiPolygon":
        polygons = [r for r in (thin_rings(p) for p in geometry["coordinates"]) if r]
        return {"type": "MultiPolygon", "coordinates": polygons} if polygons else None
    return None


def main(workbook: Path, geojson: Path) -> None:
    states = pd.read_excel(
        workbook,
        sheet_name="mmr_admin1",
        usecols=["adm1_name", "adm1_name1", "adm1_pcode", "center_lat", "center_lon"],
    )
    districts = pd.read_excel(
        workbook,
        sheet_name="mmr_admin2",
        usecols=["adm2_name", "adm2_name1", "adm2_pcode", "adm1_pcode", "center_lat", "center_lon"],
    )
    rows = [
        {
            "pcode": r.adm1_pcode,
            "level": "state",
            "state_pcode": "",
            "name_en": r.adm1_name,
            "name_my": r.adm1_name1,
            "latitude": r.center_lat,
            "longitude": r.center_lon,
        }
        for r in states.itertuples()
    ] + [
        {
            "pcode": r.adm2_pcode,
            "level": "district",
            "state_pcode": r.adm1_pcode,
            "name_en": r.adm2_name,
            "name_my": r.adm2_name1,
            "latitude": r.center_lat,
            "longitude": r.center_lon,
        }
        for r in districts.itertuples()
    ]
    pd.DataFrame(rows).to_csv(OUT / "mmr_regions.csv", index=False, encoding="utf-8")

    source = json.loads(geojson.read_text(encoding="utf-8"))
    features = []
    for feature in source["features"]:
        props = feature.get("properties", {})
        pcode = str(props.get("DT_PCODE", "")).strip()
        geometry = thin_geometry(feature["geometry"]) if feature.get("geometry") else None
        if pcode and geometry:
            features.append(
                {
                    "type": "Feature",
                    "properties": {"pcode": pcode, "state_pcode": str(props.get("ST_PCODE", ""))},
                    "geometry": geometry,
                }
            )
    target = OUT / "mmr_districts.geojson"
    target.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"{len(rows)} regions, {len(features)} districts, {target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
