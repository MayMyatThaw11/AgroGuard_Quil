from __future__ import annotations

import hashlib
import re
import threading
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from . import contract, crops, farmers, fusion, rehearse, schedule, telemetry
from .agronomy import RICE_KC, RICE_KC_SOURCE, STAGE_KC
from .config import get_settings
from .data import flood, sentinel1, sentinel2, weather
from .ledger import get_ledger
from .store import RecordCache, missing, now_iso

PARCELS = Path(__file__).resolve().parents[1] / "parcels"
SEEDS = {"farm_ayeyarwady_demo": PARCELS / "delta_demo_coop.agri"}
PAST_DAYS = 14
FORECAST_DAYS = 8
ANCHOR_MAX_AGE = timedelta(days=PAST_DAYS)
ONSITE_WIND_MAX_AGE = timedelta(minutes=30)
FRESH_READING_H = 3.0
PROPOSAL_WINDOW_H = 36
_STORE = RecordCache("contracts.sqlite")
_PROPOSALS = threading.Lock()


class ContractRejected(ValueError):
    def __init__(self, verdict: dict[str, Any]) -> None:
        super().__init__("contract has errors")
        self.verdict = verdict


class ProposalConflict(ValueError):
    pass


def _ledger() -> Any:
    return get_ledger(get_settings().ledger_path)


def register(farm_id: str, text: str, registered_by: str = "system") -> dict[str, Any]:
    verdict = contract.verify(text)
    found = (verdict["contract"] or {}).get("farm", {}).get("id")
    if not verdict["is_valid"] or found != farm_id:
        if verdict["is_valid"]:
            verdict["diagnostics"].append(
                {
                    "code": "AGRI-E030",
                    "severity": "ERROR",
                    "line": 1,
                    "column": 1,
                    "message": f"contract declares farm {found!r}, not {farm_id!r}",
                    "recommendation": f"Write farm {farm_id} {{ ... }}.",
                }
            )
        raise ContractRejected(verdict)
    owners = device_owners()
    devices = declared_devices(verdict["contract"])
    taken = sorted(d for d in devices if owners.get(d, set()) - {farm_id})
    if taken:
        verdict["is_valid"] = False
        verdict["diagnostics"].append(
            {
                "code": "AGRI-E031",
                "severity": "ERROR",
                "line": 1,
                "column": 1,
                "message": f"sensor {taken[0]} is already declared by another farm",
                "recommendation": "Use the id printed on your own sensor.",
            }
        )
        raise ContractRejected(verdict)
    digest = f"sha256:{verdict['sha256']}"
    record = {
        "farm_id": farm_id,
        "text": text,
        "registered_by": registered_by,
        "registered_at": now_iso(),
    }
    _STORE.put("contract", farm_id, record, f"agriquill:contract/{farm_id}", digest, None)
    _ledger().append(
        "contract_registered",
        {"farm_id": farm_id, "sha256": digest, "registered_by": registered_by},
    )
    return {**verdict, "farm_id": farm_id, "registered_at": record["registered_at"]}


def add_herd(farm_id: str, herd: dict[str, Any], added_by: str) -> dict[str, Any]:
    loaded = load(farm_id)
    if loaded is None:
        raise KeyError(farm_id)
    text, verdict = loaded
    existing = {h["id"] for h in (verdict["contract"] or {}).get("herds", [])}
    if herd["id"] in existing:
        raise ValueError(f"herd {herd['id']} already exists")
    lines = [f"herd {herd['id']} {{", f"    kind: {herd['kind']}"]
    if herd.get("species"):
        lines.append(f'    species: "{herd["species"]}"')
    lines.append(f"    count: {int(herd['count'])}")
    if herd.get("paddy"):
        lines.append(f"    paddy: {herd['paddy']}")
    if herd.get("min_water_cm") is not None:
        lines.append(f"    min_water: {herd['min_water_cm']} cm")
    if herd.get("min_oxygen_mg_l") is not None:
        lines.append(f"    min_oxygen: {herd['min_oxygen_mg_l']} mg/L")
    lines.append("}")
    return register(farm_id, text.rstrip() + "\n\n" + "\n".join(lines) + "\n", added_by)


FARM_BLOCK = """farm {farm_id} {{
    name: "{name}"
    country: {country}
    location: [{lat}, {lon}]
{standard}
    hydrology {{
        regime: AWD_SAFE
        trigger_irrig_below: -15 cm
        flowering_lock_depth: 3 cm .. 5 cm
        reflood_depth: 5 cm
        percolation: 3 mm/day
    }}

    actuation_gates {{
        max_wind_speed: 5.5 m/s
        valid_delta_t: 2.0 C .. 8.0 C
        max_rain_6h_post: 10.0 mm
    }}

    schedule {{
        crew: 1
        irrigate: 3 h
        scout: 1 h
    }}
}}
"""

SITE_TEMPLATE = (
    """// Agronomic contract created from a mapped farm site.
// Boundary from OpenStreetMap (ODbL). Crop stage, planting date, sensors and assets
// are not known yet: the cooperative fills them in before plans are relied on.

"""
    + FARM_BLOCK
    + """
parcel F-01 {{
    osm: "{osm}"
{boundary}    area: {area} ha
    crop_id: {crop_id}
    sensors {{ water_depth: "{farm_id}-F-01-tube" }}
}}
"""
)


OSM_WAY_URL = "https://www.openstreetmap.org/api/0.6/way/{id}/full.json"
OSM_USER_AGENT = "AgriQuill/0.1 (AgroGuard prototype; boundary lookup)"


def osm_ring(osm: str, client: httpx.Client | None = None) -> list[list[float]] | None:
    kind, _, way_id = osm.partition("/")
    if kind != "way" or not way_id.isdigit():
        return None
    own = client or httpx.Client(
        timeout=get_settings().http_timeout_s, headers={"User-Agent": OSM_USER_AGENT}
    )
    try:
        resp = own.get(OSM_WAY_URL.format(id=way_id))
        resp.raise_for_status()
        elements = resp.json()["elements"]
    except (httpx.HTTPError, ValueError, KeyError):
        return None
    finally:
        if client is None:
            own.close()
    nodes = {e["id"]: (e["lat"], e["lon"]) for e in elements if e.get("type") == "node"}
    way = next((e for e in elements if e.get("type") == "way"), None)
    ring = [nodes[n] for n in (way or {}).get("nodes", []) if n in nodes]
    if len(ring) < 4 or ring[0] != ring[-1]:
        return None
    return [[round(lat, 6), round(lon, 6)] for lat, lon in ring]


def site_farm_id(osm: str) -> str:
    return "site-" + re.sub(r"[^A-Za-z0-9]", "-", osm)


def create_from_site(site: dict[str, Any], created_by: str) -> dict[str, Any]:
    farm_id = site_farm_id(site["osm"])
    if _STORE.get("contract", farm_id) is not None:
        raise ValueError(f"{farm_id} already has a contract")
    ring = osm_ring(site["osm"])
    text = SITE_TEMPLATE.format(
        boundary=f"    boundary: {ring}\n" if ring else "",
        farm_id=farm_id,
        name=site["name"].replace('"', "'"),
        country=site["country_iso2"],
        lat=round(site["lat"], 6),
        lon=round(site["lon"], 6),
        osm=site["osm"],
        area=round(site["area_ha"], 2),
        crop_id=site["crop_id"],
        standard="",
    )
    return register(farm_id, text, created_by)


def listing() -> list[dict[str, Any]]:
    out = []
    for farm_id in sorted(set(SEEDS) | set(contract_farms())):
        loaded = load(farm_id)
        if loaded is None or loaded[1]["contract"] is None:
            continue
        spec = loaded[1]["contract"]
        out.append(
            {
                "farm_id": farm_id,
                "name": spec["farm"]["name"],
                "location": spec["farm"]["location"],
                "parcels": len(spec["parcels"]),
                "area_ha": round(sum(p.get("area_ha") or 0 for p in spec["parcels"]), 2),
                "herds": len(spec.get("herds", [])),
                "osm": [p["osm"] for p in spec["parcels"] if p.get("osm")],
                "valid": loaded[1]["is_valid"],
                "seed": farm_id in SEEDS,
            }
        )
    return out


def contract_farms() -> list[str]:
    return [r["farm_id"] for r in _STORE.items("contract")]


def declared_devices(spec: dict[str, Any]) -> set[str]:
    blocks = [spec["farm"]["terms"], *(p["terms"] for p in spec["parcels"])]
    sensors = [b.get("sensors", {}) for b in blocks]
    sensors += [h.get("sensors", {}) for h in spec.get("herds", [])]
    return {device for s in sensors for device in s.values()}


def device_owners() -> dict[str, set[str]]:
    owners: dict[str, set[str]] = {}
    for farm_id in sorted(set(SEEDS) | set(contract_farms())):
        loaded = load(farm_id)
        spec = loaded[1]["contract"] if loaded else None
        if spec is None:
            continue
        herds = {herd_device(h["id"]) for h in spec.get("herds", [])}
        for device in declared_devices(spec) | herds:
            owners.setdefault(device, set()).add(farm_id)
    return owners


def proposal_farm(proposal_id: str) -> str | None:
    found = _STORE.get("proposal", proposal_id)
    return None if found is None else found["payload"]["farm_id"]


def load(farm_id: str) -> tuple[str, dict[str, Any]] | None:
    stored = _STORE.get("contract", farm_id)
    if stored is not None:
        text = stored["payload"]["text"]
    elif farm_id in SEEDS and SEEDS[farm_id].is_file():
        text = SEEDS[farm_id].read_text(encoding="utf-8")
    else:
        return None
    return text, contract.verify(text)


def _local_hour(moment: datetime, offset_s: int) -> str:
    return (moment.astimezone(UTC) + timedelta(seconds=offset_s)).strftime("%Y-%m-%dT%H:00")


def _index_at(times: list[str], stamp: str) -> int:
    return next((i for i, t in enumerate(times) if t >= stamp), len(times))


def _kc(stage: str | None) -> float:
    return RICE_KC[STAGE_KC.get(stage or "", "mid")]


def _paddy_depth(
    parcel: dict[str, Any],
    terms: dict[str, Any],
    hourly: dict[str, list[Any]],
    offset_s: int,
    now_index: int,
) -> dict[str, Any]:
    device = terms.get("sensors", {}).get("water_depth")
    out: dict[str, Any] = {
        "id": parcel["id"],
        "stage": parcel.get("stage"),
        "device_id": device,
        "missing": [],
    }
    if not device:
        out["missing"].append(missing("water_depth", "no water_depth sensor declared"))
        return out
    out["sensor"] = telemetry.health(device, "water_depth_cm")
    since = (datetime.now(UTC) - ANCHOR_MAX_AGE).isoformat(timespec="seconds")
    readings = telemetry.series(device, "water_depth_cm", since)
    if not readings:
        latest = telemetry.latest(device, "water_depth_cm")
        reason = (
            f"latest reading from {device} is older than {PAST_DAYS} days; log a new one"
            if latest
            else f"no reading from {device}; log one tube reading to start"
        )
        out["missing"].append(missing("water_depth", reason))
        return out
    perc = terms.get("hydrology", {}).get("percolation_mm_day")
    if perc is None:
        out["missing"].append(missing("water_depth", "contract declares no percolation rate"))
        return out
    kc = _kc(parcel.get("stage"))
    fused = fusion.kalman_depth(readings, hourly, offset_s, now_index, kc, perc)
    if fused["now"] is None:
        out["missing"].append(missing("water_depth", fused["reason"]))
        out["flags"] = fused.get("flags", [])
        return out
    last = readings[-1]
    age_h = (datetime.now(UTC) - datetime.fromisoformat(last["observed_at"])).total_seconds() / 3600
    out.update(
        source="MEASURED" if age_h <= FRESH_READING_H else "DERIVED",
        now=fused["now"],
        sigma_cm=fused["sigma_cm"],
        series=[p["depth_cm"] for p in fused["past"]],
        series_dates=[p["date"] for p in fused["past"]],
        band=fused["band"],
        band_dates=fused["band_dates"],
        flags=fused["flags"],
        method={
            "filter": "scalar Kalman filter over an hourly water balance",
            "equation": "D(t+1) = D(t) + rain - ET0 x Kc - percolation",
            "readings_used": fused["updates"],
            "last_reading": {k: last[k] for k in ("value", "observed_at", "source", "sha256")},
            "kc": kc,
            "kc_source": RICE_KC_SOURCE,
            "percolation_mm_day": perc,
            "irrigation_assumed_mm": 0.0,
            "assumptions": fusion.ASSUMPTIONS,
        },
    )
    return out


def fresh_wind(farm_id: str) -> dict[str, Any] | None:
    loaded = load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    device = contract.terms_for(spec).get("sensors", {}).get("wind") if spec else None
    reading = telemetry.latest(device, "wind_ms") if device else None
    if reading is None:
        return None
    age = datetime.now(UTC) - datetime.fromisoformat(reading["observed_at"])
    if age > ONSITE_WIND_MAX_AGE:
        return None
    return {"device_id": device, **{k: reading[k] for k in ("value", "observed_at", "sha256")}}


def _onsite_wind(spec: dict[str, Any], future: dict[str, list[Any]]) -> dict[str, Any] | None:
    device = contract.terms_for(spec).get("sensors", {}).get("wind")
    if not device:
        return None
    reading = telemetry.latest(device, "wind_ms")
    if reading is None:
        return {"device_id": device, "used": False, "reason": "no wind reading yet"}
    age = datetime.now(UTC) - datetime.fromisoformat(reading["observed_at"])
    if age > ONSITE_WIND_MAX_AGE:
        return {"device_id": device, "used": False, "reason": "wind reading older than 30 min"}
    forecast_now = future["wind_speed_10m"][0] if future["wind_speed_10m"] else None
    stricter = max(reading["value"], forecast_now or 0.0)
    if future["wind_speed_10m"]:
        future["wind_speed_10m"][0] = stricter
    return {
        "device_id": device,
        "used": True,
        "measured_ms": reading["value"],
        "forecast_ms": forecast_now,
        "applied_ms": stricter,
        "observed_at": reading["observed_at"],
        "sha256": reading["sha256"],
    }


HERD_METRICS = ("head_count", "feed_kg", "mortality", "dissolved_oxygen_mg_l", "water_temp_c")


def herd_device(herd_id: str) -> str:
    return f"herd:{herd_id}"


def _herd_status(herd: dict[str, Any]) -> dict[str, Any]:
    out = dict(herd)
    readings: dict[str, Any] = {}
    for metric in HERD_METRICS:
        devices = [herd_device(herd["id"])]
        if metric == "dissolved_oxygen_mg_l" and herd["sensors"].get("dissolved_oxygen"):
            devices.insert(0, herd["sensors"]["dissolved_oxygen"])
        found = [r for r in (telemetry.latest(d, metric) for d in devices) if r]
        if found:
            last = max(found, key=lambda r: r["observed_at"])
            readings[metric] = {
                k: last[k] for k in ("value", "unit", "observed_at", "source", "reporter")
            }
    out["latest"] = readings
    count = readings.get("head_count", {}).get("value")
    out["count_now"] = int(count) if count is not None else herd.get("count")
    oxygen = readings.get("dissolved_oxygen_mg_l", {}).get("value")
    floor = herd.get("min_oxygen_mg_l")
    out["alerts"] = (
        [f"dissolved oxygen {oxygen} mg/L is below {floor} mg/L: aerate or exchange water"]
        if oxygen is not None and floor is not None and oxygen < floor
        else []
    )
    return out


def _protect_animals(tasks: list[dict[str, Any]], herds: list[dict[str, Any]]) -> None:
    hosted: dict[str, list[dict[str, Any]]] = {}
    for herd in herds:
        if herd.get("paddy"):
            hosted.setdefault(herd["paddy"], []).append(herd)
    for task in tasks:
        animals = hosted.get(task.get("paddy_id") or "")
        actuation = task.get("actuation") or {}
        if not animals or task.get("blocked_reason"):
            continue
        names = ", ".join(f"{h['kind']} {h['id']}" for h in animals)
        if actuation.get("command") == "spray":
            task["blocked_reason"] = f"ANIMALS_PRESENT: move or protect {names} before spraying"
        elif (
            actuation.get("target") == "sluice_gate"
            and "Drain" in task["title"]
            and any(h["kind"] in contract.WATER_ANIMALS for h in animals)
        ):
            task["blocked_reason"] = f"ANIMALS_PRESENT: harvest or move {names} before draining"


def _days_since(planted: Any, today: date) -> int | None:
    try:
        return (today - date.fromisoformat(str(planted))).days
    except ValueError:
        return None


def build_live(farm_id: str, client: Any = None) -> dict[str, Any]:
    loaded = load(farm_id)
    if loaded is None:
        raise KeyError(farm_id)
    text, verdict = loaded
    spec = verdict["contract"]
    if not verdict["is_valid"] or spec is None:
        raise ContractRejected(verdict)
    location = spec["farm"]["location"]
    if not location or len(location) != 2:
        raise ValueError("contract farm block needs location: [lat, lon]")
    wx = weather.fetch_hourly(location[0], location[1], PAST_DAYS, FORECAST_DAYS, client)
    gaps: list[dict[str, str]] = list(wx.get("missing", []))
    if wx.get("hourly") is None:
        return {"farm_id": farm_id, "status": "NO_WEATHER", "missing": gaps, "tasks": []}
    hourly = wx["hourly"]
    offset = int(wx.get("utc_offset_seconds") or 0)
    now_stamp = _local_hour(datetime.now(UTC), offset)
    now_index = _index_at(hourly["time"], now_stamp)
    future = {k: v[now_index:] for k, v in hourly.items()}
    past = {k: v[:now_index] for k, v in hourly.items()}
    past_days = [d for d in weather.daily_from_hourly(past) if d["hours"] == 24]
    onsite = _onsite_wind(spec, future)
    future_days = weather.daily_from_hourly(future)
    today = date.fromisoformat(now_stamp[:10])

    herds = [_herd_status(h) for h in spec.get("herds", [])]
    herd_floor: dict[str, float] = {}
    for herd in herds:
        if herd["paddy"] and herd.get("min_water_cm") is not None:
            herd_floor[herd["paddy"]] = max(
                herd_floor.get(herd["paddy"], -100.0), herd["min_water_cm"]
            )
    paddies: list[farmers.PaddyState] = []
    bands: dict[str, dict[str, list[float]]] = {}
    report: list[dict[str, Any]] = []
    for parcel in spec["parcels"]:
        terms = contract.terms_for(spec, parcel["id"])
        crop_id = parcel.get("crop_id") or ""
        try:
            crops.get_crop(crop_id)
        except (KeyError, ValueError):
            gaps.append(missing(f"{parcel['id']}.crop_id", f"unknown crop {crop_id!r}"))
            continue
        depth = _paddy_depth(parcel, terms, hourly, offset, now_index)
        days = _days_since(parcel.get("planted"), today)
        if days is None:
            depth["missing"].append(missing("planted", "planting date missing or not ISO"))
            days = 0
        series: list[float] = []
        if depth.get("now") is not None and depth["band"]["p50"]:
            series = [*depth["series"], depth["now"]]
            bands[parcel["id"]] = depth["band"]
        paddies.append(
            farmers.PaddyState(
                parcel["id"],
                crop_id,
                str(parcel.get("stage") or ""),
                days,
                float(parcel.get("area_ha") or 0.0),
                series,
                [],
                (),
                herd_floor.get(parcel["id"]),
            )
        )
        report.append(depth)
    plan = farmers.plan_operations(
        paddies,
        bands,
        [
            farmers.WeatherDay(d["rain_mm"], d["temp_c"], d["rh_pct"], d["wind_ms"])
            for d in future_days
        ],
        [
            farmers.Asset(a["id"], a["kind"], a["label"], a["status"], tuple(a["serves"]))
            for a in spec["assets"]
        ],
        today,
        spec["farm"]["standard"],
        contract.to_thresholds(spec) or None,
        future,
    )
    sched_terms = contract.terms_for(spec).get("schedule", {})
    gates_by_paddy: dict[str | None, dict[str, Any]] = {
        p["id"]: contract.gates_for(spec, p["id"]) for p in spec["parcels"]
    }
    gates_by_paddy[None] = contract.gates_for(spec)
    _protect_animals(plan["tasks"], herds)
    solved = schedule.solve(
        plan["tasks"],
        future,
        gates_by_paddy,
        sched_terms.get("durations_h"),
        sched_terms.get("crew"),
        positions=contract.parcel_positions(spec),
        travel_kmh=sched_terms.get("travel_kmh"),
    )
    return {
        "farm_id": farm_id,
        "status": "OK",
        "generated_at": now_iso(),
        "local_now": now_stamp,
        "utc_offset_seconds": offset,
        "contract_sha256": f"sha256:{verdict['sha256']}",
        "weather": {
            "source": wx["source"],
            "stale": wx.get("stale", False),
            "timezone": wx.get("timezone"),
            "licence": wx.get("licence"),
            "days": future_days,
            "past_days": past_days,
        },
        "hourly": future,
        "onsite_wind": onsite,
        "paddies": report,
        "herds": herds,
        "forecast_series": bands,
        "tasks": solved["tasks"],
        "schedule": solved["summary"],
        "crew": plan["crew"],
        "thresholds": plan["thresholds"],
        "approval_policy": plan["approval_policy"],
        "missing": gaps + [m for p in report for m in p["missing"]],
    }


SATELLITE_LAYER = {
    "status": "not_connected",
    "reason": "Sentinel-1 SAR and Sentinel-2 NDVI access is TO VERIFY (see OPEN_QUESTIONS); "
    "no satellite value is used",
}


def monitoring(
    farm_id: str, client: Any = None, current: dict[str, Any] | None = None
) -> dict[str, Any]:
    live = current or build_live(farm_id, client)
    if live["status"] != "OK":
        return {"farm_id": farm_id, "status": live["status"], "missing": live["missing"]}
    paddies = []
    counts = {"sensor_ok": 0, "scout_72h": 0, "model": 0, "unknown": 0}
    for paddy in live["paddies"]:
        device = paddy.get("device_id")
        scout = None
        if device:
            since = (datetime.now(UTC) - ANCHOR_MAX_AGE).isoformat(timespec="seconds")
            manual = [
                r
                for r in telemetry.series(device, "water_depth_cm", since)
                if r["source"] == "manual"
            ]
            if manual:
                last = manual[-1]
                age_h = (
                    datetime.now(UTC) - datetime.fromisoformat(last["observed_at"])
                ).total_seconds() / 3600
                scout = {
                    "value_cm": last["value"],
                    "observed_at": last["observed_at"],
                    "reporter": last["reporter"],
                    "photo_evidence": last.get("evidence"),
                    "age_h": round(age_h, 1),
                }
                counts["scout_72h"] += age_h <= 72
        sensor = paddy.get("sensor")
        lorawan = sensor is not None and str(sensor.get("last_source", "")).startswith("lorawan")
        counts["sensor_ok"] += bool(lorawan and sensor and sensor["status"] == "ok")
        has_model = paddy.get("now") is not None
        counts["model"] += has_model
        counts["unknown"] += not has_model
        paddies.append(
            {
                "id": paddy["id"],
                "sensor": sensor,
                "scout": scout,
                "model": {
                    "depth_cm": paddy.get("now"),
                    "sigma_cm": paddy.get("sigma_cm"),
                    "source": paddy.get("source"),
                    "flags": paddy.get("flags", []),
                    "series": paddy.get("series", []),
                    "series_dates": paddy.get("series_dates", []),
                    "band": paddy.get("band"),
                    "band_dates": paddy.get("band_dates", []),
                }
                if has_model
                else None,
                "satellite": SATELLITE_LAYER,
                "missing": paddy["missing"],
            }
        )
    return {
        "farm_id": farm_id,
        "status": "OK",
        "generated_at": live["generated_at"],
        "weather": live["weather"]["source"],
        "weather_station": live["onsite_wind"] or {"declared": False},
        "coverage": {**counts, "paddies": len(paddies)},
        "paddies": paddies,
    }


def satellite(farm_id: str, days: int = 60) -> dict[str, Any]:
    loaded = load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    parcels = []
    for parcel in loaded[1]["contract"]["parcels"]:
        ring = parcel.get("boundary")
        if not ring or len(ring) < 4 or ring[0] != ring[-1]:
            continue
        parcels.append({"id": parcel["id"], **sentinel2.paddy_series(ring, days)})
    return {"farm_id": farm_id, "window_days": days, "parcels": parcels, "provenance": "DERIVED"}


def _season_days(crop_id: str | None) -> int | None:
    try:
        return crops.get_crop(crop_id or "rice_lowland").season_days
    except KeyError:
        return None


def risk(farm_id: str) -> dict[str, Any]:
    loaded = load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    parcels = loaded[1]["contract"]["parcels"]
    rings = [p["boundary"] for p in parcels if p.get("boundary") and len(p["boundary"]) >= 4]
    if not rings:
        return {
            "farm_id": farm_id,
            "level": "unknown",
            "missing": [missing("river_discharge", "add a field boundary to read flood risk")],
        }
    corners = [pt for ring in rings for pt in ring[:-1]]
    out = flood.site_risk([*corners, corners[0]])
    today = datetime.now(UTC).date()
    main = out.get("main")
    out["parcels"] = []
    for p in parcels:
        season = _season_days(p.get("crop_id"))
        planted = date.fromisoformat(p["planted"]) if p.get("planted") else None
        out["parcels"].append(
            {
                "id": p["id"],
                "planted": p.get("planted"),
                "season_days": season,
                "advice": flood.advice(
                    out.get("level", "unknown"), out.get("flood_date"), planted, season, today
                ),
                "planting": flood.planting_window(main["peak_months"], season) if main else None,
            }
        )
    return {"farm_id": farm_id, **out}


def radar(farm_id: str, days: int = 60) -> dict[str, Any]:
    loaded = load(farm_id)
    if loaded is None or loaded[1]["contract"] is None:
        raise KeyError(farm_id)
    status = monitoring(farm_id)
    depth = {
        p["id"]: (p["model"]["series_dates"], p["model"]["series"])
        for p in status.get("paddies", [])
        if p.get("model") and p["model"].get("series_dates")
    }
    parcels = []
    for parcel in loaded[1]["contract"]["parcels"]:
        ring = parcel.get("boundary")
        if not ring or len(ring) < 4 or ring[0] != ring[-1]:
            continue
        parcels.append(
            {"id": parcel["id"], **sentinel1.paddy_radar(ring, days, depth.get(parcel["id"]))}
        )
    return {"farm_id": farm_id, "window_days": days, "shadow": True, "parcels": parcels}


def summary(farm_id: str, client: Any = None) -> dict[str, Any]:
    loaded = load(farm_id)
    if loaded is None:
        raise KeyError(farm_id)
    verdict = loaded[1]
    spec = verdict["contract"] or {}
    current = build_live(farm_id, client)
    status = monitoring(farm_id, current=current)
    plan_tasks = current.get("tasks", [])
    rows = proposals(farm_id)
    ledger = _ledger()
    blocked = [t for t in plan_tasks if t.get("blocked_reason")]
    return {
        "farm_id": farm_id,
        "name": spec.get("farm", {}).get("name"),
        "contract": {
            "valid": verdict["is_valid"],
            "sha256": f"sha256:{verdict['sha256']}",
            "standard": spec.get("farm", {}).get("standard"),
            "parcels": len(spec.get("parcels", [])),
            "area_ha": round(sum(p.get("area_ha") or 0 for p in spec.get("parcels", [])), 2),
            "to_verify": sum(1 for d in verdict["diagnostics"] if d["code"] == "AGRI-W020"),
        },
        "monitoring": status.get("coverage"),
        "weather": status.get("weather"),
        "work": {
            "tasks": len(plan_tasks),
            "scheduled": sum(
                1 for t in plan_tasks if (t.get("schedule") or {}).get("status") == "scheduled"
            ),
            "blocked": [{"title": t["title"], "reason": t["blocked_reason"]} for t in blocked],
        },
        "proposals": {
            "open": sum(1 for r in rows if r["status"] == "proposed"),
            "approved": sum(1 for r in rows if r["status"] == "approved"),
            "rejected": sum(1 for r in rows if r["status"] == "rejected"),
        },
        "decisions": decisions(rows),
        "ledger": {
            "valid": ledger.verify(),
            "entries": len(ledger.entries()),
            "head": ledger.head_hash(),
        },
        "missing": status.get("missing", []),
    }


def _describe(
    task: dict[str, Any], paddies: dict[str, dict[str, Any]], days: list[dict[str, Any]]
) -> str:
    sched = task["schedule"]
    when = f"{sched['start'][11:16]}-{sched['end'][11:16]} on {sched['start'][:10]}"
    reason = task["detail"]
    paddy = paddies.get(task.get("paddy_id") or "")
    if paddy and paddy.get("now") is not None:
        reason = f"{paddy['id']} at {paddy['now']} cm ({paddy['source'].lower()})"
    rain_72h = round(sum(d["rain_mm"] for d in days[:3]), 1)
    return f"{task['title']} {when}: {reason}; {rain_72h} mm rain forecast for 72 h"


def percolation_estimate(
    series: list[float], past_days: list[dict[str, Any]], kc: float
) -> float | None:
    days = past_days[-len(series) :]
    estimates = sorted(
        -(series[i + 1] - series[i]) * 10.0 - days[i]["et0_mm"] * kc
        for i in range(len(series) - 1)
        if days[i]["rain_mm"] < 1.0 and series[i + 1] < series[i]
    )
    if len(estimates) < 3:
        return None
    return round(estimates[len(estimates) // 2], 1)


def _patch_proposal(farm_id: str, live: dict[str, Any]) -> dict[str, Any] | None:
    loaded = load(farm_id)
    if loaded is None:
        return None
    text, verdict = loaded
    declared = (
        contract.terms_for(verdict["contract"]).get("hydrology", {}).get("percolation_mm_day")
    )
    stages = {p["id"]: p.get("stage") for p in verdict["contract"]["parcels"]}
    found = []
    for p in live["paddies"]:
        if not p.get("device_id"):
            continue
        tail: list[float] = []
        for value in reversed(
            telemetry.daily_means(p["device_id"], "water_depth_cm", PAST_DAYS)[:-1]
        ):
            if value is None:
                break
            tail.insert(0, value)
        if len(tail) >= 4:
            found.append(
                percolation_estimate(tail, live["weather"]["past_days"], _kc(stages.get(p["id"])))
            )
    values = sorted(v for v in found if v is not None and v > 0)
    if declared is None or not values:
        return None
    measured = values[len(values) // 2]
    if abs(measured - declared) < 1.0:
        return None
    try:
        patched = contract.patch(text, f"{farm_id}.hydrology.percolation", f"{measured} mm/day")
    except KeyError:
        return None
    return {
        "text": f"Update percolation from {declared} to {measured} mm/day: measured drawdown on "
        f"dry days across {len(values)} paddies disagrees with the contract",
        "agri_patch": {"path": "hydrology.percolation", "from": declared, "to": measured},
        "patched_text": patched,
    }


def proposal(proposal_id: str) -> dict[str, Any] | None:
    found = _STORE.get("proposal", proposal_id)
    return found["payload"] if found else None


def _area(spec: dict[str, Any], paddy_id: str | None) -> float:
    return float(
        next((p.get("area_ha") or 0.0 for p in spec["parcels"] if p["id"] == paddy_id), 0.0)
    )


def score_outcomes(farm_id: str) -> list[dict[str, Any]]:
    loaded = load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        return []
    scored: list[dict[str, Any]] = []
    for row in proposals(farm_id):
        end = (row.get("schedule") or {}).get("end")
        if row["status"] != "approved" or not row.get("rehearsal") or row.get("outcome") or not end:
            continue
        paddy_id = row["task"].get("paddy_id")
        device = contract.terms_for(spec, paddy_id).get("sensors", {}).get("water_depth")
        if not device:
            continue
        since = (datetime.fromisoformat(end) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
        readings = telemetry.series(device, "water_depth_cm", since)
        outcome = rehearse.score(row["rehearsal"], readings, end, row["utc_offset_seconds"])
        if outcome is None:
            continue
        with _PROPOSALS:
            current = proposal(row["proposal_id"])
            if current is None or current.get("outcome"):
                continue
            current["outcome"] = {**outcome, "scored_at": now_iso()}
            pid = current["proposal_id"]
            _STORE.put("proposal", pid, current, f"agriquill:proposal/{pid}", pid, None)
            _ledger().append(
                "outcome",
                {
                    "proposal_id": pid,
                    "farm_id": farm_id,
                    "paddy_id": paddy_id,
                    **{
                        k: outcome[k]
                        for k in (
                            "predicted_cm",
                            "measured_cm",
                            "error_cm",
                            "inside_band",
                            "closer_to",
                            "reading_sha256",
                        )
                    },
                },
            )
        scored.append(current)
    return scored


def decisions(rows: list[dict[str, Any]]) -> dict[str, Any]:
    scored = [r["outcome"] for r in rows if r.get("outcome")]
    return {
        "rehearsed": sum(1 for r in rows if r.get("rehearsal")),
        "scored": len(scored),
        "inside_band": sum(1 for o in scored if o["inside_band"]),
        "mean_abs_error_cm": round(sum(abs(o["error_cm"]) for o in scored) / len(scored), 2)
        if scored
        else None,
        "status": rehearse.STATUS,
    }


def watch(farm_id: str, client: Any = None) -> dict[str, Any]:
    outcomes = score_outcomes(farm_id)
    live = build_live(farm_id, client)
    if live["status"] != "OK":
        return {"farm_id": farm_id, "proposals": [], "outcomes": outcomes, "live": live}
    loaded = load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    location = (spec or {}).get("farm", {}).get("location") or []
    season = rehearse.season_context(location[0], location[1]) if len(location) == 2 else None
    today = date.fromisoformat(live["local_now"][:10])
    paddies = {p["id"]: p for p in live["paddies"]}
    offset = live["utc_offset_seconds"]
    horizon_end = _local_hour(datetime.now(UTC) + timedelta(hours=PROPOSAL_WINDOW_H), offset)
    in_a_day = _local_hour(datetime.now(UTC) + timedelta(hours=24), offset)
    created: list[dict[str, Any]] = []

    def raise_proposal(seed: str, fields: dict[str, Any]) -> None:
        pid = "prop_" + hashlib.sha256(f"{farm_id}|{seed}".encode()).hexdigest()[:12]
        with _PROPOSALS:
            if _STORE.get("proposal", pid) is None:
                store_new(pid, fields)

    def store_new(pid: str, fields: dict[str, Any]) -> None:
        proposal = {
            "proposal_id": pid,
            "farm_id": farm_id,
            "status": "proposed",
            "created_at": now_iso(),
            "utc_offset_seconds": offset,
            "contract_sha256": live["contract_sha256"],
            "weather_source": live["weather"]["source"],
            "schedule": None,
            "evidence": [],
            "depth": None,
            "agri_patch": None,
            "rehearsal": None,
            "season": None,
            "outcome": None,
            **fields,
        }
        _STORE.put("proposal", pid, proposal, f"agriquill:proposal/{pid}", pid, None)
        sealed = {k: proposal[k] for k in ("proposal_id", "farm_id", "text", "contract_sha256")}
        if proposal["rehearsal"]:
            sealed["rehearsal_sha256"] = rehearse.digest(proposal["rehearsal"])
        _ledger().append("proposal", sealed)
        created.append(proposal)

    def rehearsal_for(task: dict[str, Any], sched: dict[str, Any]) -> dict[str, Any] | None:
        water = task.get("water")
        band = live["forecast_series"].get(task.get("paddy_id") or "")
        if not water or not band or spec is None:
            return None
        action_day = (date.fromisoformat(sched["start"][:10]) - today).days
        return rehearse.rehearse(
            band,
            live["weather"]["days"],
            action_day,
            water["target_cm"],
            water["floor_cm"],
            _area(spec, task.get("paddy_id")),
        )

    for task in live["tasks"]:
        sched = task.get("schedule") or {}
        if not task.get("actuation") or sched.get("status") != "scheduled":
            continue
        if sched["start"] > horizon_end:
            continue
        rehearsal = rehearsal_for(task, sched)
        raise_proposal(
            f"{task['title']}|{task.get('paddy_id')}|{sched.get('start')}",
            {
                "expires_at": sched["end"],
                "text": _describe(task, paddies, live["weather"]["days"]),
                "task": {
                    k: task[k]
                    for k in ("id", "agent", "title", "paddy_id", "asset_id", "actuation")
                },
                "schedule": sched,
                "evidence": task.get("evidence", []),
                "depth": paddies.get(task.get("paddy_id") or ""),
                "rehearsal": rehearsal,
                "season": season if rehearsal else None,
            },
        )
    for paddy in live["paddies"]:
        for flag in paddy.get("flags", []):
            raise_proposal(
                f"inspect|{paddy['id']}|{flag['observed_at']}",
                {
                    "expires_at": in_a_day,
                    "text": f"Inspect {paddy['id']}: reading {flag['reading_cm']} cm against "
                    f"{flag['predicted_cm']} cm expected ({flag['meaning']})",
                    "task": {
                        "title": f"Inspect {paddy['id']}",
                        "paddy_id": paddy["id"],
                        "actuation": None,
                    },
                    "evidence": [f"{flag['kind']} at {flag['observed_at']}"],
                },
            )
        sensor = paddy.get("sensor") or {}
        for issue in sensor.get("issues", []):
            if issue.startswith("no reading"):
                continue
            raise_proposal(
                f"sensor|{sensor['device_id']}|{issue}|{now_iso()[:10]}",
                {
                    "expires_at": in_a_day,
                    "text": f"Check sensor {sensor['device_id']} on {paddy['id']}: {issue}. "
                    "Log a tube reading by hand until it is fixed.",
                    "task": {
                        "title": f"Check sensor {sensor['device_id']}",
                        "paddy_id": paddy["id"],
                        "actuation": None,
                    },
                },
            )
    for herd in live.get("herds", []):
        oxygen = herd["latest"].get("dissolved_oxygen_mg_l", {})
        for alert in herd["alerts"]:
            raise_proposal(
                f"herd|{herd['id']}|{oxygen.get('observed_at')}",
                {
                    "expires_at": _local_hour(datetime.now(UTC) + timedelta(hours=6), offset),
                    "text": f"Aerate {herd['paddy'] or herd['id']} now: "
                    f"{herd['kind']} {herd['id']}, {alert}",
                    "task": {
                        "title": f"Aerate for {herd['id']}",
                        "paddy_id": herd["paddy"],
                        "actuation": None,
                    },
                    "evidence": [
                        f"DO reading at {oxygen.get('observed_at')} from {oxygen.get('source')}"
                    ],
                },
            )
    patch = _patch_proposal(farm_id, live)
    if patch is not None:
        raise_proposal(
            f"patch|{live['contract_sha256']}|{patch['agri_patch']['to']}",
            {
                "expires_at": _local_hour(datetime.now(UTC) + timedelta(days=7), offset),
                "text": patch["text"],
                "task": {"actuation": None},
                "agri_patch": patch["agri_patch"],
                "patched_text": patch["patched_text"],
            },
        )
    return {"farm_id": farm_id, "proposals": created, "outcomes": outcomes, "live": live}


def proposals(farm_id: str | None = None) -> list[dict[str, Any]]:
    rows = [r for r in _STORE.items("proposal") if farm_id is None or r["farm_id"] == farm_id]
    return sorted(rows, key=lambda r: r["created_at"], reverse=True)


def decide(proposal_id: str, decision: str, decided_by: str) -> dict[str, Any]:
    with _PROPOSALS:
        return _decide(proposal_id, decision, decided_by)


def _decide(proposal_id: str, decision: str, decided_by: str) -> dict[str, Any]:
    found = _STORE.get("proposal", proposal_id)
    if found is None:
        raise KeyError(proposal_id)
    proposal = found["payload"]
    if proposal["status"] != "proposed":
        raise ProposalConflict(f"proposal already {proposal['status']}")
    current = load(proposal["farm_id"])
    if current is None or f"sha256:{current[1]['sha256']}" != proposal["contract_sha256"]:
        raise ProposalConflict("contract changed since this proposal; run the watch again")
    local_now = _local_hour(datetime.now(UTC), proposal["utc_offset_seconds"])
    if local_now >= proposal["expires_at"]:
        raise ProposalConflict("proposal window has passed")
    proposal.update(status=decision, decided_by=decided_by, decided_at=now_iso())
    if decision == "approved" and proposal.get("patched_text"):
        register(proposal["farm_id"], proposal["patched_text"], decided_by)
    _STORE.put(
        "proposal", proposal_id, proposal, f"agriquill:proposal/{proposal_id}", proposal_id, None
    )
    entry = _ledger().append(
        "proposal_decided",
        {
            "proposal_id": proposal_id,
            "farm_id": proposal["farm_id"],
            "decision": decision,
            "decided_by": decided_by,
            "actuation_emitted": False,
        },
    )
    return {
        **proposal,
        "ledger_commit_hash": entry.hash,
        "next_step": "Physical actuation still runs only through /actuation/approve with a PIN."
        if decision == "approved" and proposal["task"].get("actuation")
        else None,
    }
