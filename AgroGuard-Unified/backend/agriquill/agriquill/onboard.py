from __future__ import annotations

import asyncio
import csv
import hashlib
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path
from statistics import mean
from typing import Any

import httpx

from . import contract, crops, geometry, live, safety, telemetry
from .agronomy import RICE_KC, RICE_KC_SOURCE, STAGE_KC
from .config import get_settings
from .data import soil, weather
from .fusion import local_hour
from .gates import hour_delta_t, nitrogen, washout_mm, window_mask
from .ledger import get_ledger
from .store import RecordCache, missing, now_iso, sha256

ACRE_HA = 0.40468564224
SOURCE = "manual:import"
INPUT_KINDS = {"spray": "spray", "fertiliser": "fertiliser", "fertilizer": "fertiliser"}
RATE_UNITS = {"kg/ha": "kg/ha", "l/ha": "L/ha"}
_INPUTS = RecordCache("contracts.sqlite")
DATE_ONLY_HOUR = 8
MAX_GAP_H = 96
MAX_SPAN_DAYS = 366
READING_TOLERANCE_CM = 1.0
DRY_PAIR_RAIN_MM = 1.0
MIN_VERDICT_PAIRS = 10
FARM_ID = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{1,40}$")
ASSET_ID = re.compile(r"^[A-Za-z][A-Za-z0-9-]{0,30}$")
ASSET_KINDS = ("pump", "drone", "sluice", "gate")
MAX_KML_BYTES = 10 * 1024 * 1024
NEEDS_OFFSET = "give the farm's UTC offset, for example +06:30"
NO_REPORTER = "no reporter: add a reporter column or give the reporter's name"
ASSUMPTIONS = {
    "scored_pairs": f"two readings of the same field at most {MAX_GAP_H} h apart",
    "inflow": "a rise larger than the rain that fell, plus 1 cm reading tolerance, is water "
    "the model cannot know about (irrigation, canal or a neighbour); it is counted, not scored",
    "below_surface": "below the soil surface the model treats soil water as open water; "
    "the error there shows that simplification",
    "date_only": f"a reading with a date but no time is taken at {DATE_ONLY_HOUR}:00 local",
    "weather": "reanalysis for the farm's grid cell, not an on-farm rain gauge",
    "status": "TO VERIFY: screening rules until a field calibration",
}


def field_id(name: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_-]+", "-", name.strip()).strip("-")[:40]
    if not clean:
        return "F-" + hashlib.sha256(name.strip().encode("utf-8")).hexdigest()[:6]
    return clean if clean[0].isalpha() else f"F-{clean}"


def device_for(farm_id: str, parcel_id: str) -> str:
    return f"{farm_id}-{parcel_id}-tube"


def _ring(points: list[list[Any]]) -> list[list[float]]:
    ring = [[round(float(p[1]), 6), round(float(p[0]), 6)] for p in points]
    return ring if ring and ring[0] == ring[-1] else [*ring, ring[0]]


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _kml_rings(text: str) -> Iterator[tuple[str, list[list[float]]]]:
    for mark in ET.fromstring(text).iter():
        if _local(mark.tag) != "Placemark":
            continue
        name = next(((c.text or "").strip() for c in mark if _local(c.tag) == "name"), "")
        polygons = [e for e in mark.iter() if _local(e.tag) == "Polygon"]
        for j, polygon in enumerate(polygons, 1):
            outer = next((e for e in polygon.iter() if _local(e.tag) == "outerBoundaryIs"), polygon)
            coords = next((e.text for e in outer.iter() if _local(e.tag) == "coordinates"), None)
            if coords:
                label = f"{name}-{j}" if name and len(polygons) > 1 else name
                yield label, _ring([token.split(",")[:2] for token in coords.split()])


def _geojson_rings(doc: dict[str, Any]) -> Iterator[tuple[str, list[list[float]]]]:
    if doc.get("type") == "FeatureCollection":
        features = doc.get("features") or []
    elif doc.get("type") == "Feature":
        features = [doc]
    else:
        features = [{"geometry": doc}]
    for feature in features:
        geom = feature.get("geometry") or {}
        props = feature.get("properties") or {}
        name = str(props.get("field") or props.get("name") or props.get("Name") or "").strip()
        if geom.get("type") == "Polygon":
            yield name, _ring(geom["coordinates"][0])
        elif geom.get("type") == "MultiPolygon":
            parts = geom["coordinates"]
            for j, polygon in enumerate(parts, 1):
                yield (f"{name}-{j}" if name and len(parts) > 1 else name), _ring(polygon[0])


def _kmz_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            kml = [n for n in archive.namelist() if n.lower().endswith(".kml")]
            if not kml:
                raise ValueError(f"{path.name}: no KML inside the KMZ")
            info = archive.getinfo("doc.kml" if "doc.kml" in kml else kml[0])
            if info.file_size > MAX_KML_BYTES:
                raise ValueError(f"{path.name}: the KML inside is larger than 10 MB")
            return archive.read(info).decode("utf-8-sig")
    except zipfile.BadZipFile as exc:
        raise ValueError(f"{path.name}: not a KMZ file") from exc


def read_boundaries(path: Path) -> dict[str, list[list[float]]]:
    suffix = path.suffix.lower()
    text = _kmz_text(path) if suffix == ".kmz" else path.read_text(encoding="utf-8-sig")
    try:
        found = list(
            _kml_rings(text) if suffix in (".kml", ".kmz") else _geojson_rings(json.loads(text))
        )
    except (ET.ParseError, AttributeError, TypeError, KeyError, IndexError) as exc:
        raise ValueError(f"{path.name}: not a readable KML or GeoJSON boundary file") from exc
    out: dict[str, list[list[float]]] = {}
    for i, (name, ring) in enumerate(found, 1):
        key = field_id(name) if name else f"F-{i:02d}"
        if len(ring) < 4:
            raise ValueError(f"{path.name}: {name or key} needs at least three corners")
        if not all(-90 <= lat <= 90 and -180 <= lon <= 180 for lat, lon in ring):
            raise ValueError(f"{path.name}: {name or key} has a point outside the globe")
        problem = geometry.ring_problem(ring)
        if problem:
            raise ValueError(f"{path.name}: {name or key} is not a usable field, {problem}")
        if key in out:
            raise ValueError(f"{path.name}: two boundaries are both named {key}")
        out[key] = ring
    if not out:
        raise ValueError(f"{path.name}: no polygon found")
    return out


def _rows(path: Path) -> list[tuple[int, dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return [
            (n, {k.strip().lower(): (v or "").strip() for k, v in row.items() if k})
            for n, row in enumerate(csv.DictReader(fh), 2)
        ]


def _number(row: dict[str, str], key: str, where: str) -> float | None:
    if not row.get(key):
        return None
    try:
        return float(row[key])
    except ValueError as exc:
        raise ValueError(f"{where}: {key} {row[key]!r} is not a number") from exc


def read_fields(path: Path) -> list[dict[str, Any]]:
    stages = {s.lower(): s for s in STAGE_KC}
    out = []
    for n, row in _rows(path):
        where = f"{path.name} line {n}"
        name = row.get("field", "")
        if not name:
            raise ValueError(f"{where}: field is empty")
        crop_id = row.get("crop") or "rice_lowland"
        try:
            crops.get_crop(crop_id)
        except KeyError as exc:
            rice = ", ".join(c["id"] for c in crops.catalog() if c["id"].startswith("rice"))
            raise ValueError(f"{where}: unknown crop {crop_id!r}; rice crops: {rice}") from exc
        if row.get("planted"):
            try:
                date.fromisoformat(row["planted"])
            except ValueError as exc:
                raise ValueError(f"{where}: planted must be YYYY-MM-DD") from exc
        stage = row.get("stage", "")
        if stage and stage.lower() not in stages:
            raise ValueError(f"{where}: stage must be one of {', '.join(STAGE_KC)}")
        area = _number(row, "area", where)
        unit = (row.get("area_unit") or "ha").lower()
        if unit not in ("ha", "acre", "acres", "ac"):
            raise ValueError(f"{where}: area_unit must be ha or acre")
        if area is not None and area <= 0:
            raise ValueError(f"{where}: area must be above zero")
        lat, lon = _number(row, "lat", where), _number(row, "lon", where)
        if (lat is None) != (lon is None) or (
            lat is not None and lon is not None and not (-90 <= lat <= 90 and -180 <= lon <= 180)
        ):
            raise ValueError(f"{where}: give both lat and lon, in degrees")
        out.append(
            {
                "id": field_id(name),
                "name": name,
                "crop_id": crop_id,
                "variety": row.get("variety") or None,
                "planted": row.get("planted") or None,
                "stage": stages.get(stage.lower()) if stage else None,
                "area_ha": round(area * ACRE_HA, 3) if area and unit != "ha" else area,
                "lat": lat,
                "lon": lon,
            }
        )
    ids = [f["id"] for f in out]
    if len(set(ids)) != len(ids):
        raise ValueError(f"{path.name}: two rows map to the same field id")
    return out


def _quote(text: str) -> str:
    return text.replace('"', "'").replace("\n", " ")


def parcel_block(
    farm_id: str, pid: str, row: dict[str, Any], ring: list[list[float]] | None
) -> str:
    lines = [f"parcel {pid} {{"]
    if row.get("name") and row["name"] != pid:
        lines.append(f'    name: "{_quote(row["name"])}"')
    if ring:
        lines.append(f"    boundary: {ring}")
    if row.get("area_ha"):
        lines.append(f"    area: {row['area_ha']} ha")
    lines.append(f"    crop_id: {row.get('crop_id') or 'rice_lowland'}")
    if row.get("variety"):
        lines.append(f'    crop: "{_quote(row["variety"])}"')
    if row.get("stage"):
        lines.append(f'    stage: "{row["stage"]}"')
    if row.get("planted"):
        lines.append(f'    planted: "{row["planted"]}"')
    lines.append(f'    sensors {{ water_depth: "{device_for(farm_id, pid)}" }}')
    lines.append("}")
    return "\n".join(lines)


class ParcelExists(ValueError):
    pass


def add_parcels(farm_id: str, rings: dict[str, list[list[float]]], added_by: str) -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None:
        raise KeyError(farm_id)
    text, verdict = loaded
    have = {p["id"]: p.get("boundary") for p in (verdict["contract"] or {}).get("parcels", [])}
    for pid, ring in rings.items():
        if pid in have:
            raise ParcelExists(f"field {pid} already exists in {farm_id}")
        clash = next(
            (o for o, other in have.items() if other and geometry.rings_overlap(ring, other)), None
        )
        if clash:
            raise ValueError(f"field {pid} overlaps {clash}; draw it beside it, not over it")
        have[pid] = ring
    blocks = "\n\n".join(parcel_block(farm_id, pid, {}, ring) for pid, ring in rings.items())
    out = live.register(farm_id, text.rstrip() + "\n\n" + blocks + "\n", added_by)
    return {**out, "added": list(rings)}


def build_contract(
    farm_id: str,
    name: str,
    country: str,
    fields: list[dict[str, Any]],
    boundaries: dict[str, list[list[float]]],
    sources: str,
    standard: str | None = None,
    assets: list[dict[str, Any]] | None = None,
) -> tuple[str, list[str]]:
    if not FARM_ID.match(farm_id):
        raise ValueError("farm id: a letter, then letters, digits, - or _ (2-41 characters)")
    if not re.fullmatch(r"[A-Z]{2}", country):
        raise ValueError("country: two capital letters, e.g. MM")
    rows = {f["id"]: f for f in fields}
    ids = list(dict.fromkeys([*rows, *boundaries]))
    if not ids:
        raise ValueError("no fields: give a boundary file, a field sheet, or both")
    notes: list[str] = []
    points: list[tuple[float, float]] = []
    parcels: list[str] = []
    for pid in ids:
        row = rows.get(pid, {})
        ring = boundaries.get(pid)
        area = row.get("area_ha")
        if ring:
            corners = ring[:-1]
            points.append(
                (
                    sum(p[0] for p in corners) / len(corners),
                    sum(p[1] for p in corners) / len(corners),
                )
            )
            drawn = contract.ring_area_ha(ring)
            if geometry.area_mismatch(area, drawn):
                notes.append(f"{pid}: field sheet says {area} ha, the boundary measures {drawn} ha")
        elif row.get("lat") is not None:
            points.append((row["lat"], row["lon"]))
        if not row:
            notes.append(
                f"{pid}: boundary has no row in the field sheet; crop rice_lowland, no date"
            )
        elif not row.get("planted"):
            notes.append(f"{pid}: no planting date; crop age is unknown")
        parcels.append(parcel_block(farm_id, pid, row, ring))
    if not points:
        raise ValueError("no location: give a boundary, or lat and lon, for at least one field")
    blocks = [*parcels, *_asset_blocks(assets or [], set(ids))]
    header = (
        f"// Agronomic contract made by `agriquill onboard` on {date.today().isoformat()}\n"
        f"// from the farm's own files: {sources}.\n"
        "// The rules below are AgriQill defaults (TO VERIFY); replace them with the farm's\n"
        "// or the buyer's rules before plans are relied on. Add pumps, drones and sensors\n"
        "// as assets.\n\n"
    )
    farm = live.FARM_BLOCK.format(
        farm_id=farm_id,
        name=_quote(name),
        country=country,
        lat=round(sum(p[0] for p in points) / len(points), 6),
        lon=round(sum(p[1] for p in points) / len(points), 6),
        standard=f"    standard: {standard}" if standard else "",
    )
    return header + farm + "\n" + "\n\n".join(blocks) + "\n", notes


def _asset_blocks(assets: list[dict[str, Any]], fields: set[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for asset in assets:
        aid, kind, served = asset["id"], asset["kind"], list(asset.get("serves") or [])
        if not ASSET_ID.match(aid):
            raise ValueError(
                f"asset {aid!r}: a letter, then letters, digits or - (1-31 characters)"
            )
        if aid in seen:
            raise ValueError(f"two assets are both named {aid}")
        if kind not in ASSET_KINDS:
            raise ValueError(f"asset {aid}: kind must be one of {', '.join(ASSET_KINDS)}")
        unknown = [f for f in served if f not in fields]
        if unknown:
            raise ValueError(
                f"asset {aid} serves {unknown[0]!r}, which is not a field of this farm"
            )
        seen.add(aid)
        serves = f" serves: [{', '.join(served)}]" if served else ""
        label = _quote(asset.get("label") or aid)
        out.append(f'asset {aid} {{ kind: {kind} label: "{label}"{serves} }}')
    return out


def _offset(text: str) -> timezone:
    found = re.fullmatch(r"([+-])(\d{2}):?(\d{2})", text.strip())
    if not found:
        raise ValueError("utc offset must look like +06:30")
    sign = -1 if found.group(1) == "-" else 1
    return timezone(sign * timedelta(hours=int(found.group(2)), minutes=int(found.group(3))))


def _stamp(text: str, tz: timezone | None) -> tuple[str, bool]:
    text = text.strip()
    if len(text) == 10:
        day = date.fromisoformat(text)
        if tz is None:
            raise ValueError(f"a date without a time: {NEEDS_OFFSET}")
        return datetime(day.year, day.month, day.day, DATE_ONLY_HOUR, tzinfo=tz).isoformat(), True
    moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if moment.tzinfo is None:
        if tz is None:
            raise ValueError(f"a time without a UTC offset: {NEEDS_OFFSET}")
        moment = moment.replace(tzinfo=tz)
    return moment.isoformat(), False


def _water_devices(spec: dict[str, Any]) -> dict[str, str]:
    out = {}
    for parcel in spec["parcels"]:
        device = contract.terms_for(spec, parcel["id"]).get("sensors", {}).get("water_depth")
        if device:
            out[parcel["id"]] = device
    return out


def import_readings(
    farm_id: str, path: Path, utc_offset: str | None = None, reporter: str | None = None
) -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    devices = _water_devices(loaded[1]["contract"])
    tz = _offset(utc_offset) if utc_offset else None
    out: dict[str, Any] = {"stored": 0, "duplicate": 0, "assumed_time": 0, "rejected": []}
    for n, row in _rows(path):
        name = row.get("field", "")
        device = devices.get(name) or devices.get(field_id(name))
        raw = row.get("water_depth_cm") or row.get("depth_cm") or row.get("water_level_cm")
        who = row.get("reporter") or reporter
        try:
            if device is None:
                raise ValueError(f"field {name!r} is not in the contract")
            if not who:
                raise ValueError(NO_REPORTER)
            value = float(raw or "")
            stamp, assumed = _stamp(row.get("observed_at") or row.get("date") or "", tz)
            result = telemetry.ingest(device, stamp, {"water_depth_cm": value}, SOURCE, who)
        except ValueError as exc:
            out["rejected"].append({"line": n, "reason": str(exc)})
            continue
        if result["rejected"]:
            out["rejected"].append({"line": n, "reason": result["rejected"][0]["reason"]})
        elif result["stored"]:
            out["stored"] += 1
            out["assumed_time"] += assumed
        else:
            out["duplicate"] += 1
    return out


def _spec(farm_id: str) -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    return loaded[1]["contract"]


def _input_row(
    farm_id: str,
    parcels: set[str],
    row: dict[str, str],
    tz: timezone | None,
    reporter: str | None,
) -> dict[str, Any]:
    name = row.get("field", "")
    parcel = next((p for p in (name, field_id(name)) if p in parcels), None)
    if parcel is None:
        raise ValueError(f"field {name!r} is not in the contract")
    who = row.get("reporter") or reporter
    if not who:
        raise ValueError(NO_REPORTER)
    product = row.get("product", "")
    if not product:
        raise ValueError("product is empty")
    kind = INPUT_KINDS.get(row.get("kind", "").lower())
    if kind is None:
        raise ValueError("kind must be spray or fertiliser")
    unit = RATE_UNITS.get((row.get("rate_unit") or "kg/ha").lower())
    if unit is None:
        raise ValueError("rate_unit must be kg/ha or L/ha")
    rate = _number(row, "rate", "row")
    if rate is not None and not 0 < rate < float("inf"):
        raise ValueError("rate must be above zero")
    n_pct = _number(row, "n_pct", "row")
    if n_pct is not None and not 0 <= n_pct <= 100:
        raise ValueError("n_pct must be between 0 and 100")
    when = row.get("applied_at") or row.get("date")
    if not when:
        raise ValueError("applied_at or date is required")
    stamp, assumed = _stamp(when, tz)
    return {
        "farm_id": farm_id,
        "field": parcel,
        "applied_at": datetime.fromisoformat(stamp).astimezone(UTC).isoformat(timespec="seconds"),
        "time_known": not assumed,
        "product": product,
        "kind": kind,
        "rate": rate,
        "rate_unit": unit,
        "n_pct": n_pct,
        "reporter": who,
        "source": SOURCE,
    }


def import_inputs(
    farm_id: str, path: Path, utc_offset: str | None = None, reporter: str | None = None
) -> dict[str, Any]:
    parcels = {p["id"] for p in _spec(farm_id)["parcels"]}
    tz = _offset(utc_offset) if utc_offset else None
    ledger = get_ledger(get_settings().ledger_path)
    out: dict[str, Any] = {"stored": 0, "duplicate": 0, "assumed_time": 0, "rejected": []}
    for n, row in _rows(path):
        try:
            payload = _input_row(farm_id, parcels, row, tz, reporter)
        except ValueError as exc:
            out["rejected"].append({"line": n, "reason": str(exc)})
            continue
        key = f"{farm_id}|{payload['field']}|{payload['applied_at']}|{payload['product']}"
        if _INPUTS.get("input", key) is not None:
            out["duplicate"] += 1
            continue
        digest = sha256(json.dumps(payload, sort_keys=True).encode("utf-8"))
        _INPUTS.put("input", key, payload, f"agriquill:input/{farm_id}", digest, None)
        ledger.append(
            "input_logged",
            {
                "farm_id": farm_id,
                "field": payload["field"],
                "applied_at": payload["applied_at"],
                "product": payload["product"],
                "kind": payload["kind"],
                "sha256": digest,
            },
        )
        out["stored"] += 1
        out["assumed_time"] += not payload["time_known"]
    return out


def _kc(stage: str | None) -> float:
    return RICE_KC[STAGE_KC.get(stage or "", "mid")]


def _score(pairs: list[dict[str, Any]]) -> dict[str, Any] | None:
    scored = [p for p in pairs if not p["inflow"]]
    if not scored:
        return None
    model = [abs(p["actual_cm"] - p["predicted_cm"]) for p in scored]
    still = [abs(p["actual_cm"] - p["start_cm"]) for p in scored]
    return {
        "pairs": len(scored),
        "model_mae_cm": round(mean(model), 2),
        "no_change_mae_cm": round(mean(still), 2),
        "model_bias_cm": round(mean(p["actual_cm"] - p["predicted_cm"] for p in scored), 2),
        "within_2cm_pct": round(100 * sum(e <= 2.0 for e in model) / len(model)),
    }


def _pairs(
    rows: list[dict[str, Any]],
    hourly: dict[str, list[Any]],
    index: dict[str, int],
    offset: int,
    kc: float,
    perc: float,
) -> tuple[list[dict[str, Any]], Counter[str]]:
    rain, et0 = hourly["precipitation"], hourly["et0_fao_evapotranspiration"]
    pairs: list[dict[str, Any]] = []
    skipped: Counter[str] = Counter()
    for a, b in zip(rows, rows[1:], strict=False):
        ia = index.get(local_hour(datetime.fromisoformat(a["observed_at"]), offset))
        ib = index.get(local_hour(datetime.fromisoformat(b["observed_at"]), offset))
        if ia is None or ib is None:
            skipped["outside the weather record"] += 1
            continue
        if not 0 < ib - ia <= MAX_GAP_H:
            skipped[f"same hour or more than {MAX_GAP_H} h apart"] += 1
            continue
        window_rain, window_et0 = rain[ia:ib], et0[ia:ib]
        if any(v is None for v in (*window_rain, *window_et0)):
            skipped["weather not in the archive yet"] += 1
            continue
        rain_mm = sum(window_rain)
        etc_mm = sum(window_et0) * kc
        hours = ib - ia
        predicted = a["value"] + (rain_mm - etc_mm - perc * hours / 24.0) / 10.0
        pairs.append(
            {
                "from": a["observed_at"],
                "to": b["observed_at"],
                "hours": hours,
                "start_cm": a["value"],
                "actual_cm": b["value"],
                "predicted_cm": round(predicted, 2),
                "rain_mm": round(rain_mm, 1),
                "etc_mm": round(etc_mm, 1),
                "inflow": b["value"] - a["value"] > rain_mm / 10.0 + READING_TOLERANCE_CM,
            }
        )
    return pairs, skipped


def _seepage(pairs: list[dict[str, Any]]) -> list[float]:
    return [
        round(
            (p["rain_mm"] - p["etc_mm"] - (p["actual_cm"] - p["start_cm"]) * 10.0)
            / (p["hours"] / 24.0),
            1,
        )
        for p in pairs
        if not p["inflow"]
        and p["rain_mm"] < DRY_PAIR_RAIN_MM
        and p["start_cm"] >= 0
        and p["actual_cm"] < p["start_cm"]
    ]


def _gate_failed(reason: str | None) -> bool:
    return reason is not None and not reason.startswith("horizon") and "beyond" not in reason


def _spray_days(hourly: dict[str, list[Any]], spec: dict[str, Any]) -> dict[str, Any]:
    durations = contract.terms_for(spec).get("schedule", {}).get("durations_h") or {}
    duration = max(1, round(float(durations.get("spray", 1))))
    mask = window_mask(hourly, "spray", contract.gates_for(spec), duration)
    days: dict[str, int] = {}
    reasons: Counter[str] = Counter()
    for i, stamp in enumerate(hourly["time"]):
        if hourly["wind_speed_10m"][i] is None or hourly["is_day"][i] == 0:
            continue
        days.setdefault(stamp[:10], 0)
        failure = mask[i]
        if failure is None:
            days[stamp[:10]] += 1
        elif _gate_failed(failure):
            reasons[failure.split(":")[0]] += 1
    closed = sorted(d for d, open_hours in days.items() if open_hours == 0)
    return {
        "days": len(days),
        "days_without_safe_hour": len(closed),
        "closed_days": closed,
        "blocked_hours_by_gate": dict(reasons.most_common()),
        "spray_hours": duration,
        "rule": "wind at most 3 m/s (drones never fly above 5.5 m/s), Delta-T inside "
        "the contract band, and no washout rain in the 6 h after",
    }


def backtest(farm_id: str, client: httpx.Client | None = None) -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    spec = loaded[1]["contract"]
    tracks = {
        pid: rows
        for pid, device in _water_devices(spec).items()
        if len(rows := telemetry.series(device, "water_depth_cm")) >= 2
    }
    if not tracks:
        return {
            "farm_id": farm_id,
            "status": "NO_READINGS",
            "missing": [missing("water_depth", "no field has two readings; import the sheet")],
        }
    first = min(rows[0]["observed_at"] for rows in tracks.values())
    last = max(rows[-1]["observed_at"] for rows in tracks.values())
    end = min(datetime.fromisoformat(last).date() + timedelta(days=1), datetime.now(UTC).date())
    start = max(
        datetime.fromisoformat(first).date() - timedelta(days=1),
        end - timedelta(days=MAX_SPAN_DAYS),
    )
    lat, lon = spec["farm"]["location"]
    wx = weather.fetch_archive_hourly(lat, lon, start, end, client)
    if wx.get("hourly") is None:
        return {"farm_id": farm_id, "status": "NO_WEATHER", "missing": wx["missing"]}
    hourly = wx["hourly"]
    offset = int(wx.get("utc_offset_seconds") or 0)
    index = {t: i for i, t in enumerate(hourly["time"])}
    stages = {p["id"]: p.get("stage") for p in spec["parcels"]}
    fields: list[dict[str, Any]] = []
    everything: list[dict[str, Any]] = []
    gaps: list[dict[str, str]] = []
    for pid, rows in tracks.items():
        perc = contract.terms_for(spec, pid).get("hydrology", {}).get("percolation_mm_day")
        if perc is None:
            gaps.append(missing(f"{pid}.percolation", "contract declares no percolation rate"))
            continue
        kc = _kc(stages.get(pid))
        pairs, skipped = _pairs(rows, hourly, index, offset, kc, perc)
        everything.extend(pairs)
        fields.append(
            {
                "id": pid,
                "readings": len(rows),
                "kc": kc,
                "percolation_mm_day": perc,
                "inflow_events": sum(p["inflow"] for p in pairs),
                "skipped": dict(skipped),
                "score": _score(pairs),
                "ponded": _score([p for p in pairs if p["start_cm"] >= 0]),
                "below_surface": _score([p for p in pairs if p["start_cm"] < 0]),
                "pairs": pairs,
            }
        )
    seepage = sorted(_seepage(everything))
    return {
        "farm_id": farm_id,
        "status": "OK",
        "generated_at": now_iso(),
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "weather": {"source": wx["source"], "timezone": wx.get("timezone")},
        "method": {
            "equation": "next depth = depth + (rain - ET0 x Kc - percolation) / 10, hour by hour",
            "kc_source": RICE_KC_SOURCE,
            "baseline": "no change: the next reading equals the last one",
            "assumptions": ASSUMPTIONS,
        },
        "overall": _score(everything),
        "inflow_events": sum(p["inflow"] for p in everything),
        "fields": fields,
        "seepage_mm_day": {
            "median": seepage[len(seepage) // 2] if len(seepage) >= 3 else None,
            "pairs": len(seepage),
            "reason": None
            if len(seepage) >= 3
            else "needs 3 dry, falling, ponded reading pairs to estimate",
        },
        "spray_history": _spray_days(hourly, spec),
        "missing": gaps,
    }


def spray_history(
    farm_id: str, days: int = 30, client: httpx.Client | None = None
) -> dict[str, Any]:
    spec = _spec(farm_id)
    today = datetime.now(UTC).date()
    start, end = today - timedelta(days=days), today - timedelta(days=1)
    lat, lon = spec["farm"]["location"]
    wx = weather.fetch_archive_hourly(lat, lon, start, end, client)
    if wx.get("hourly") is None:
        return {"status": "NO_WEATHER", "missing": wx["missing"]}
    return {
        "status": "OK",
        **_spray_days(wx["hourly"], spec),
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "weather": {"source": wx["source"]},
    }


def _spray_weather(
    record: dict[str, Any],
    hourly: dict[str, list[Any]],
    offset: int,
    index: dict[str, int],
    mask: list[str | None],
) -> tuple[dict[str, Any] | None, str | None]:
    local = local_hour(datetime.fromisoformat(record["applied_at"]), offset)
    wind = hourly["wind_speed_10m"]
    if record["time_known"]:
        i = index.get(local)
        if i is None or wind[i] is None:
            return None, None
        failure = mask[i]
        found = {
            "wind_ms": wind[i],
            "delta_t_c": hour_delta_t(hourly, i),
            "rain_6h_mm": washout_mm(hourly["precipitation"], i, i + 1),
            "failure": failure,
        }
        return found, (f"sprayed in unsafe weather: {failure}" if _gate_failed(failure) else None)
    daylight = [
        i
        for t, i in index.items()
        if t[:10] == local[:10] and hourly["is_day"][i] == 1 and wind[i] is not None
    ]
    if not daylight:
        return None, None
    safe = sum(mask[i] is None for i in daylight)
    return (
        {"safe_daylight_hours": safe, "time_known": False},
        None if safe else "no safe spraying hour that day",
    )


_NATURAL_QUALIFIERS = {"bio", "organic", "natural", "botanical", "microbial"}
_PRODUCT_CLASSES = {"herbicide", "pesticide", "fungicide", "insecticide"}
_BASAL_DAYS = 14


def _banned_match(product: str, item: str) -> bool:
    words = [w.removesuffix("s") for w in re.findall(r"[a-z0-9]+", product.lower())]
    name = item.removeprefix("synthetic_")
    term = [w.removesuffix("s") for w in name.split("_")]
    size = len(term)
    natural_ok = item.startswith("synthetic_") and name in _PRODUCT_CLASSES
    return any(
        words[i : i + size] == term
        and not (natural_ok and i and words[i - 1] in _NATURAL_QUALIFIERS)
        for i in range(len(words) - size + 1)
    )


def _uncountable(record: dict[str, Any]) -> str | None:
    if record["rate"] is None or record["n_pct"] is None:
        return "without a rate or n_pct"
    if record["rate_unit"] != "kg/ha":
        return "with a rate not in kg/ha"
    return None


def _planted(parcel: dict[str, Any]) -> date | None:
    try:
        return date.fromisoformat(str(parcel.get("planted")))
    except ValueError:
        return None


def audit_inputs(farm_id: str, client: httpx.Client | None = None) -> dict[str, Any]:
    spec = _spec(farm_id)
    records = sorted(
        (r for r in _INPUTS.items("input") if r["farm_id"] == farm_id),
        key=lambda r: r["applied_at"],
    )
    if not records:
        return {
            "farm_id": farm_id,
            "status": "NO_INPUTS",
            "applications": [],
            "missing": [
                missing("inputs", "no spray or fertiliser records; import the inputs sheet")
            ],
        }
    standard = spec["farm"]["standard"]
    listed = safety.prohibited_for(standard)
    banned = listed or ()
    planted = {p["id"]: _planted(p) for p in spec["parcels"]}
    undated: set[str] = set()
    uncounted: dict[str, dict[str, int]] = {}
    first = datetime.fromisoformat(records[0]["applied_at"]).date()
    last = datetime.fromisoformat(records[-1]["applied_at"]).date()
    end = min(last + timedelta(days=1), datetime.now(UTC).date())
    start = min(first - timedelta(days=1), end)
    lat, lon = spec["farm"]["location"]
    wx = weather.fetch_archive_hourly(lat, lon, start, end, client)
    hourly = wx.get("hourly")
    gaps = list(wx["missing"]) if hourly is None else []
    offset = int(wx.get("utc_offset_seconds") or 0)
    index = {t: i for i, t in enumerate(hourly["time"])} if hourly else {}
    masks: dict[str, list[str | None]] = {}
    totals: dict[str, float] = {}
    no_cap = False
    applications: list[dict[str, Any]] = []
    for record in records:
        field, product = record["field"], record["product"]
        flags = [
            f"{product} is not allowed under {standard} ({item})"
            for item in banned
            if _banned_match(product, item)
        ]
        found = None
        if hourly is not None and record["kind"] == "spray":
            if field not in masks:
                masks[field] = window_mask(hourly, "spray", contract.gates_for(spec, field), 1)
            found, flag = _spray_weather(record, hourly, offset, index, masks[field])
            if flag:
                flags.append(flag)
            if found is None:
                gaps.append(
                    missing(f"{field}.weather", f"no archive weather for {record['applied_at']}")
                )
        if record["kind"] == "fertiliser":
            since = planted.get(field)
            if since is None:
                undated.add(field)
            applied = datetime.fromisoformat(record["applied_at"]).date()
            in_season = since is None or applied >= since - timedelta(days=_BASAL_DAYS)
            reason = _uncountable(record)
            if in_season and reason:
                counts = uncounted.setdefault(field, {})
                counts[reason] = counts.get(reason, 0) + 1
            elif in_season:
                added = record["rate"] * record["n_pct"] / 100
                before = totals.get(field, 0.0)
                totals[field] = round(before + added, 2)
                cap = contract.terms_for(spec, field).get("yield", {}).get("max_canopy_n_kg_ha")
                if cap is None:
                    no_cap = True
                else:
                    step = nitrogen(before, added, cap)
                    if not step["ok"]:
                        flags.append(
                            f"nitrogen {step['total_kg_ha']} kg/ha passes the contract cap of "
                            f"{cap} kg/ha"
                        )
        local = None
        if hourly is not None:
            moment = datetime.fromisoformat(record["applied_at"]) + timedelta(seconds=offset)
            local = moment.strftime("%Y-%m-%d" if not record["time_known"] else "%Y-%m-%d %H:%M")
        applications.append({**record, "flags": flags, "weather": found, "local_time": local})
    if no_cap:
        gaps.append(missing("nitrogen_cap", "contract declares no nitrogen cap"))
    for field in sorted(undated):
        gaps.append(
            missing(
                f"{field}.planted",
                "no planting date; nitrogen sums the fertiliser records of every season",
            )
        )
    for field, counts in uncounted.items():
        total = sum(counts.values())
        noun = "record" if total == 1 else "records"
        why = ", ".join(f"{n} {reason}" for reason, n in counts.items())
        gaps.append(
            missing(
                f"{field}.nitrogen",
                f"{total} fertiliser {noun} not counted ({why}); the total is a lower bound",
            )
        )
    return {
        "farm_id": farm_id,
        "status": "OK" if hourly is not None else "NO_WEATHER",
        "standard": standard,
        "applications": applications,
        "flagged": sum(bool(a["flags"]) for a in applications),
        "nitrogen_kg_ha": totals,
        "nitrogen_uncounted": {f: sum(c.values()) for f, c in uncounted.items()},
        "banned_checked": listed is not None,
        "weather": {"source": wx["source"]} if hourly is not None else None,
        "missing": gaps,
    }


def farm_check(farm_id: str, client: httpx.Client | None = None) -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    verdict = loaded[1]
    spec = verdict["contract"]
    lat, lon = spec["farm"]["location"]
    ground = asyncio.run(soil.fetch_soil(lat, lon)) if client is None else None
    history = backtest(farm_id, client)
    watched = live.watch(farm_id, client)
    ledger = get_ledger(get_settings().ledger_path)
    return {
        "farm_id": farm_id,
        "name": spec["farm"]["name"],
        "location": [lat, lon],
        "generated_at": now_iso(),
        "contract": {
            "sha256": f"sha256:{verdict['sha256']}",
            "valid": verdict["is_valid"],
            "fields": len(spec["parcels"]),
            "area_ha": round(sum(p.get("area_ha") or 0 for p in spec["parcels"]), 2),
            "to_verify": sum(1 for d in verdict["diagnostics"] if d["code"] == "AGRI-W020"),
        },
        "soil": ground,
        "backtest": history,
        "spray_recent": spray_history(farm_id, 30, client),
        "inputs": audit_inputs(farm_id, client),
        "today": watched["live"],
        "proposals": watched["proposals"],
        "ledger": {"valid": ledger.verify(), "entries": len(ledger.entries())},
    }


def records_check(farm_id: str, client: httpx.Client | None = None) -> dict[str, Any]:
    history = backtest(farm_id, client)
    if "fields" in history:
        history["fields"] = [
            {k: v for k, v in f.items() if k != "pairs"} for f in history["fields"]
        ]
    return {
        "farm_id": farm_id,
        "backtest": history,
        "spray_recent": spray_history(farm_id, 30, client),
        "inputs": audit_inputs(farm_id, client),
    }


def _cm(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1f} cm"


def _spray_text(spray: dict[str, Any]) -> str:
    names = {"delta_t": "Delta-T", "washout": "washout rain"}
    gates = ", ".join(f"{names.get(k, k)} {v} h" for k, v in spray["blocked_hours_by_gate"].items())
    return (
        f"On {spray['days_without_safe_hour']} of {spray['days']} days there was no daylight "
        f"hour safe to start a {spray['spray_hours']} h spray. Rule: {spray['rule']}. "
        f"Daylight hours blocked, by rule: {gates or 'none'}."
    )


def _records_lines(inputs: dict[str, Any]) -> list[str]:
    if inputs["status"] == "NO_INPUTS":
        return ["No records imported."]
    apps = inputs["applications"]
    noun = "record" if len(apps) == 1 else "records"
    lines = [f"{len(apps)} {noun}, {inputs['flagged']} flagged."]
    if inputs["status"] != "OK":
        lines.append(f"Weather checks not run: {inputs['missing'][0]['reason']}.")
    if not inputs["standard"]:
        lines.append("The contract declares no standard, so banned inputs were not checked.")
    elif not inputs["banned_checked"]:
        lines.append(f"No banned-input check ran: AgriQill has no list for {inputs['standard']}.")
    bullets = [
        f"- {a['local_time'] or a['applied_at'][:16].replace('T', ' ') + ' UTC'} "
        f"{a['field']} {a['product']}: {'; '.join(a['flags'])}"
        for a in apps
        if a["flags"]
    ]
    totals, skipped = inputs["nitrogen_kg_ha"], inputs["nitrogen_uncounted"]
    for f in [*totals, *(f for f in skipped if f not in totals)]:
        n = skipped.get(f, 0)
        noun = "record" if n == 1 else "records"
        note = f"{n} fertiliser {noun} could not be counted"
        if f not in totals:
            bullets.append(f"- Nitrogen applied to {f}: not known, {note}")
        elif n:
            bullets.append(
                f"- Nitrogen applied to {f}: {totals[f]} kg/ha or more (a lower bound), {note}"
            )
        else:
            bullets.append(f"- Nitrogen applied to {f}: {totals[f]} kg/ha")
    return [*lines, "", *bullets] if bullets else lines


def to_markdown(check: dict[str, Any]) -> str:
    c, bt, today = check["contract"], check["backtest"], check["today"]
    out = [
        f"# Farm check: {check['name']}",
        "",
        f"Farm id `{check['farm_id']}` at {check['location'][0]}, {check['location'][1]}. "
        f"Made {check['generated_at']} by AgriQill from the farm's own files and public data. "
        "Nothing in this report is a field-validated yield or saving.",
        "",
        "## The farm",
        "",
        f"- {c['fields']} fields, {c['area_ha']} ha, contract "
        f"{'valid' if c['valid'] else 'INVALID'} (`{c['sha256'][:19]}`), "
        f"{c['to_verify']} rules still TO VERIFY.",
    ]
    layers = (check.get("soil") or {}).get("layers") or []
    if layers:
        top = layers[0]
        out.append(
            f"- Topsoil (SoilGrids 250 m estimate, not a soil test): clay {top['clay_perc']} %, "
            f"silt {top['silt_perc']} %, sand {top['sand_perc']} %, pH {top['ph_h2o']}."
        )
    elif check.get("soil"):
        out.append(f"- Soil: unknown ({check['soil']['missing'][0]['reason']}).")
    out += ["", "## 1. AgriQill's water model against your own readings", ""]
    if bt["status"] != "OK":
        out.append(f"Not run: {bt['missing'][0]['reason']}.")
    else:
        overall = bt["overall"]
        out += [
            f"Period {bt['period']['start']} to {bt['period']['end']}. Weather: "
            f"{bt['weather']['source']['provider']}. Each reading is predicted from the one "
            "before it and that period's rain and evaporation, then compared with what was "
            "measured. The baseline guesses no change.",
            "",
            "| Field | Readings | Pairs scored | AgriQill error | No-change error | Within 2 cm |"
            " Water from outside |",
            "|---|---|---|---|---|---|---|",
        ]
        for f in bt["fields"]:
            s = f["score"] or {}
            out.append(
                f"| {f['id']} | {f['readings']} | {s.get('pairs', 0)} | "
                f"{_cm(s.get('model_mae_cm'))} | {_cm(s.get('no_change_mae_cm'))} | "
                f"{s.get('within_2cm_pct', 'n/a')}{' %' if s else ''} | {f['inflow_events']} |"
            )
        out.append("")
        if overall:
            better = overall["model_mae_cm"] < overall["no_change_mae_cm"]
            verdict = (
                "The model tracked this farm better than no change."
                if better
                else "The model did not beat no change here; its rules need calibrating "
                "to this farm before plans rely on it."
            )
            if overall["pairs"] < MIN_VERDICT_PAIRS:
                verdict = f"Only {overall['pairs']} pairs: a first look, not a verdict."
            out += [
                f"- Over {overall['pairs']} pairs AgriQill was off by "
                f"{_cm(overall['model_mae_cm'])} on average; guessing no change was off by "
                f"{_cm(overall['no_change_mae_cm'])}. {verdict}",
                f"- {bt['inflow_events']} rises were larger than the rain could explain "
                "(irrigation or inflow). AgriQill counts them instead of scoring them.",
            ]
        seep = bt["seepage_mm_day"]
        declared = bt["fields"][0]["percolation_mm_day"] if bt["fields"] else None
        out.append(
            f"- Seepage measured on dry days: {seep['median']} mm/day over {seep['pairs']} pairs "
            f"(the contract assumes {declared} mm/day)."
            if seep["median"] is not None
            else f"- Seepage: not estimated; {seep['reason']}."
        )
        out.append(f"- {_spray_text(bt['spray_history'])}")
    recent = check["spray_recent"]
    out += ["", "## 2. Spray safety, last 30 days", ""]
    if recent["status"] != "OK":
        out.append(f"Not run: {recent['missing'][0]['reason']}.")
    else:
        out.append(
            f"Period {recent['period']['start']} to {recent['period']['end']}. Weather: "
            f"{recent['weather']['source']['provider']}. {_spray_text(recent)}"
        )
    out += ["", "## 3. Your spray and fertiliser records", ""]
    out += _records_lines(check["inputs"])
    out += ["", "## 4. Today's plan from live weather", ""]
    if today["status"] != "OK":
        out.append(
            f"Not run: {today['missing'][0]['reason'] if today['missing'] else 'no weather'}."
        )
    else:
        for paddy in today["paddies"]:
            state = (
                f"{_cm(paddy['now'])} ({paddy['source'].lower()})"
                if paddy.get("now") is not None
                else f"unknown: {paddy['missing'][0]['reason']}"
            )
            out.append(f"- {paddy['id']} water now: {state}")
        for task in today["tasks"]:
            when = task["schedule"].get("start") or task.get("blocked_reason") or "not scheduled"
            out.append(f"- {task['title']}: {when}")
        out.append(f"- New proposals waiting for a person: {len(check['proposals'])}")
    ledger = check["ledger"]
    out += [
        "",
        "## 5. Proof",
        "",
        f"- Ledger: {ledger['entries']} records, chain "
        f"{'verified' if ledger['valid'] else 'FAILED verification'}.",
        "",
        "## Limits",
        "",
        "- Weather is reanalysis for the farm's grid cell, not a gauge on the farm.",
        "- Irrigation was not in the files, so rises from it are counted, not predicted.",
        "- Rules marked TO VERIFY are AgriQill defaults until the farm or buyer confirms them.",
        "- Inputs are matched by product name only, against the terms the standard lists; "
        "a product sold under a trade name can pass unflagged.",
    ]
    every = [
        *today.get("missing", []),
        *(bt.get("missing") or []),
        *(check["spray_recent"].get("missing") or []),
        *check["inputs"]["missing"],
    ]
    gaps = list({(m["field"], m["reason"]): m for m in every}.values())
    if gaps:
        out += ["", "## Missing data", ""] + [f"- {m['field']}: {m['reason']}" for m in gaps]
    return "\n".join(out) + "\n"
