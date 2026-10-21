from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

from .. import contract, crops, cropvalue, jobs, knowledge, live, onboard, ops, safety
from ..config import get_settings
from ..data import (
    chirps,
    ecocrop,
    fao_pack,
    gfw_forest,
    gfw_marine,
    gleam,
    nasapower,
    regions,
)
from ..data.soil import fetch_soil
from ..data.weather import fetch_weather
from ..ledger import Ledger, get_ledger


def _ledger() -> Ledger:
    return get_ledger(get_settings().ledger_path)


def soil_query(latitude: float, longitude: float) -> dict[str, Any]:
    return asyncio.run(fetch_soil(latitude, longitude))


def weather_forecast(latitude: float, longitude: float) -> dict[str, Any]:
    return asyncio.run(fetch_weather(latitude, longitude))


def _server_wind(farm_id: str) -> tuple[float | None, str]:
    """Wind the server can vouch for: the on-site anemometer (reading at most 30 min old),
    else today's forecast maximum from Open-Meteo (stricter than any single hour)."""
    onsite = live.fresh_wind(farm_id)
    if onsite is not None:
        return float(onsite["value"]), "on-site anemometer"
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        return None, "unavailable"
    lat, lon = spec["farm"]["location"]
    try:
        forecast = asyncio.run(fetch_weather(lat, lon))
    except Exception:
        return None, "unavailable"
    return float(forecast["daily"][0]["wind_speed_max_ms"]), "Open-Meteo forecast maximum today"


def drone_spray_guard(current_wind_speed_ms: float, farm_id: str | None = None) -> dict[str, Any]:
    """Halt a mission if wind is over the ceiling.

    The agent's own wind figure is never trusted alone: with a farm_id the server also reads
    its on-site or forecast wind and the higher value decides. With no farm_id only the
    agent's figure can be checked, and the answer says so (wind_verified is false).
    """
    wind = current_wind_speed_ms
    source = "agent-supplied"
    verified = False
    if farm_id:
        server, server_source = _server_wind(farm_id)
        if server is None:
            detail = f"no on-site or forecast wind available for farm {farm_id}"
            _ledger().append(
                "drone_spray_rejected", {"farm_id": farm_id, "code": "REJECTED_INVALID_TELEMETRY"}
            )
            return {
                "status": "REJECTED_INVALID_TELEMETRY",
                "permitted": False,
                "detail": detail,
                "wind_verified": False,
            }
        if server >= wind:
            wind, source = server, server_source
        verified = True
    try:
        safety.check_wind(wind)
    except safety.SafetyError as exc:
        _ledger().append(
            "drone_spray_rejected",
            {"wind_speed_ms": wind, "code": exc.code, **({"farm_id": farm_id} if farm_id else {})},
        )
        return {
            "status": exc.code,
            "permitted": False,
            "detail": exc.detail,
            "wind_used": {"value_ms": wind, "source": source},
            "wind_verified": verified,
        }
    _ledger().append(
        "drone_spray_permitted",
        {"wind_speed_ms": wind, **({"farm_id": farm_id} if farm_id else {})},
    )
    return {
        "status": "PERMITTED",
        "permitted": True,
        "wind_used": {"value_ms": wind, "source": source},
        "wind_verified": verified,
    }


def lorawan_actuate(
    *,
    device_id: str,
    command: str,
    wind_speed_ms: float | None = None,
    declared_inputs: list[str] | None = None,
    standard: str | None = None,
    requested_minutes: float | None = None,
    **human_only: Any,
) -> dict[str, Any]:
    """Phase A only: run the safety gates and ask a named person to approve in the app.

    This tool can never complete an actuation. The PIN, the confirmation and the
    one-time token belong to the person approving, so none of them can be passed here
    and no token is returned.
    """
    if human_only:
        raise ValueError(
            f"lorawan_actuate does not accept {sorted(human_only)}: a named person approves "
            "actuation in the app (/actuation/approve), never an agent"
        )
    verdict = safety.evaluate_actuation(
        "irrigation_valve",
        wind_speed_ms=wind_speed_ms,
        declared_inputs=declared_inputs,
        standard=standard,
        requested_minutes=requested_minutes,
        issue_token=False,
    )
    _ledger().append(
        "lorawan_actuate",
        {
            "device_id": device_id,
            "command": command,
            "status": verdict["status"],
            "failure": verdict["failure"],
        },
    )
    return {
        "status": verdict["status"],
        "failure": verdict["failure"],
        "notes": verdict["notes"],
        "downlink": None,
        "next_step": (
            "Gates passed. A named person must approve this job in the app before anything is sent."
            if verdict["status"] == "PENDING_APPROVAL"
            else None
        ),
    }


def crop_catalog(country: str | None = None, category: str | None = None) -> dict[str, Any]:
    return {"crops": crops.catalog(country=country, category=category)}


def ecocrop_lookup(query: str | None = None, limit: int = 20) -> dict[str, Any]:
    if query:
        exact = ecocrop.get(query)
        if exact is not None:
            return {"crops": [exact]}
    return {"crops": ecocrop.search(query, limit)}


def ecocrop_screen(
    crop: str,
    mean_temp_c: float | None = None,
    annual_rain_mm: float | None = None,
    elevation_m: float | None = None,
    soil_ph: float | None = None,
) -> dict[str, Any]:
    record = ecocrop.get(crop)
    if record is None:
        return {"error": f"crop {crop} not in the local EcoCrop store", "crop": crop}
    site = {
        "mean_temp_c": mean_temp_c,
        "annual_rain_mm": annual_rain_mm,
        "elevation_m": elevation_m,
        "soil_ph": soil_ph,
    }
    return ecocrop.screen(record, site)


def faostat_qcl(
    country: str,
    item: str,
    element: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    live: bool = False,
) -> dict[str, Any]:
    return fao_pack.faostat_qcl(country, item, element, year_from, year_to, live)


def fao_crop_calendar(country: str, crop: str | None = None) -> dict[str, Any]:
    return fao_pack.crop_calendar(country, crop)


def chirps_rainfall(
    latitude: float, longitude: float, start: str, end: str, step: str = "monthly"
) -> dict[str, Any]:
    return chirps.rainfall(
        latitude, longitude, date.fromisoformat(start), date.fromisoformat(end), step
    )


def nasa_power_daily(latitude: float, longitude: float, start: str, end: str) -> dict[str, Any]:
    return nasapower.daily(latitude, longitude, date.fromisoformat(start), date.fromisoformat(end))


def et0_fao56(latitude: float, longitude: float, day: str) -> dict[str, Any]:
    return nasapower.et0(latitude, longitude, date.fromisoformat(day))


def farm_region_data(
    town: str | None = None, farm_id: str | None = None, sections: list[str] | None = None
) -> dict[str, Any]:
    if farm_id:
        out = regions.for_farm(farm_id)
    elif town:
        out = regions.get(town)
    else:
        return regions.listing()
    if not sections:
        return out
    blocks = set(regions.BLOCKS)
    return {k: v for k, v in out.items() if k not in blocks or k in sections}


def gleam_evaporation_stress(
    latitude: float, longitude: float, year: int | None = None
) -> dict[str, Any]:
    return gleam.stress(latitude, longitude, year)


def gleam_daily(
    latitude: float,
    longitude: float,
    start: str,
    end: str,
    variables: list[str] | None = None,
) -> dict[str, Any]:
    return gleam.daily(
        latitude,
        longitude,
        date.fromisoformat(start),
        date.fromisoformat(end),
        tuple(variables) if variables else ("Et", "S", "SMrz"),
    )


def gfw_forest_compliance(
    latitude: float, longitude: float, radius_km: float = 1.0
) -> dict[str, Any]:
    return gfw_forest.compliance(latitude, longitude, radius_km)


def gfw_dataset_search(query: str, limit: int = 10) -> dict[str, Any]:
    return gfw_forest.search_datasets(query, limit)


def gfw_coastal_vessels(
    latitude: float,
    longitude: float,
    radius_km: float = 20.0,
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    return gfw_marine.coastal_vessels(
        latitude,
        longitude,
        radius_km,
        date.fromisoformat(start) if start else None,
        date.fromisoformat(end) if end else None,
    )


def gfw_vessel_search(query: str, limit: int = 10) -> dict[str, Any]:
    return gfw_marine.vessel_search(query, limit)


def knowledge_search(query: str, limit: int = 8) -> dict[str, Any]:
    return knowledge.search(query, limit)


def jobs_status() -> dict[str, Any]:
    return {"jobs": jobs.catalog()}


def ops_plan_preview(payload: dict[str, Any]) -> dict[str, Any]:
    plan = ops.build_plan(payload)
    plan["ledger_commit_hash"] = None
    plan["note"] = "Preview only: not written to the ledger and no actuation is performed."
    return plan


def contract_verify(text: str) -> dict[str, Any]:
    return contract.verify(text)


def ops_plan_live_preview(farm_id: str) -> dict[str, Any]:
    plan = live.build_live(farm_id)
    plan.pop("hourly", None)
    plan["ledger_commit_hash"] = None
    plan["note"] = "Preview only: no proposal is raised and no actuation is performed."
    return plan


def _for_farm(fn: Any, farm_id: str) -> dict[str, Any]:
    try:
        return fn(farm_id)
    except KeyError:
        return {"error": "no contract for this farm"}


def farm_summary(farm_id: str) -> dict[str, Any]:
    return _for_farm(live.summary, farm_id)


def farm_records_check(farm_id: str) -> dict[str, Any]:
    return _for_farm(onboard.records_check, farm_id)


def proposals_list(farm_id: str | None = None) -> dict[str, Any]:
    return {"proposals": live.proposals(farm_id)}


def proposal_rehearsal(proposal_id: str) -> dict[str, Any]:
    found = live.proposal(proposal_id)
    if found is None:
        return {"error": "no such proposal"}
    return {
        k: found.get(k)
        for k in ("proposal_id", "farm_id", "status", "text", "rehearsal", "season", "outcome")
    }


def rehearsal_outcomes(farm_id: str) -> dict[str, Any]:
    rows = live.proposals(farm_id)
    return {
        "farm_id": farm_id,
        "summary": live.decisions(rows),
        "scored": [
            {"proposal_id": r["proposal_id"], "text": r["text"], "outcome": r["outcome"]}
            for r in rows
            if r.get("outcome")
        ],
    }


def farm_location(farm_id: str) -> dict[str, Any]:
    loaded = live.load(farm_id)
    if loaded is None:
        return {"error": "no contract for this farm"}
    spec = loaded[1]["contract"]
    if spec is None:
        return {"farm_id": farm_id, "error": "the registered contract does not parse"}
    return {
        "farm_id": farm_id,
        "name": spec["farm"]["name"],
        "country": spec["farm"]["country"],
        "location": spec["farm"]["location"],
        "parcels": [
            {"id": p["id"], "area_ha": p["area_ha"], "has_outline": p["boundary"] is not None}
            for p in spec["parcels"]
        ],
    }


TOOLS = {
    "soil_query": {
        "description": "ISRIC SoilGrids 6-layer soil profile for a coordinate.",
        "input_schema": {
            "type": "object",
            "properties": {"latitude": {"type": "number"}, "longitude": {"type": "number"}},
            "required": ["latitude", "longitude"],
        },
        "fn": lambda a: soil_query(a["latitude"], a["longitude"]),
        "impl": soil_query,
    },
    "weather_forecast": {
        "description": "14-day Open-Meteo forecast for a coordinate.",
        "input_schema": {
            "type": "object",
            "properties": {"latitude": {"type": "number"}, "longitude": {"type": "number"}},
            "required": ["latitude", "longitude"],
        },
        "fn": lambda a: weather_forecast(a["latitude"], a["longitude"]),
        "impl": weather_forecast,
    },
    "crop_catalog": {
        "description": "ASEAN crop catalog with problems, practices and FAO-56 Kc; filter by "
        "ISO country code and category.",
        "input_schema": {
            "type": "object",
            "properties": {"country": {"type": "string"}, "category": {"type": "string"}},
        },
        "fn": lambda a: crop_catalog(a.get("country"), a.get("category")),
        "impl": crop_catalog,
    },
    "ecocrop_lookup": {
        "description": "FAO EcoCrop environmental requirements (temperature, rainfall, pH, "
        "altitude, soil depth, texture, fertility, salinity, drainage, light, climate zone, "
        "photoperiod, crop cycle) from the local JSON store. Search by scientific name or code.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
        },
        "fn": lambda a: ecocrop_lookup(a.get("query"), a.get("limit", 20)),
        "impl": ecocrop_lookup,
    },
    "ecocrop_screen": {
        "description": "Screen site values against a crop's EcoCrop optimal and absolute "
        "ranges. Returns suitable, conditional, contraindicated or unknown per factor; "
        "missing site values stay unknown.",
        "input_schema": {
            "type": "object",
            "properties": {
                "crop": {"type": "string"},
                "mean_temp_c": {"type": "number"},
                "annual_rain_mm": {"type": "number"},
                "elevation_m": {"type": "number"},
                "soil_ph": {"type": "number"},
            },
            "required": ["crop"],
        },
        "fn": lambda a: ecocrop_screen(**a),
        "impl": ecocrop_screen,
    },
    "faostat_qcl": {
        "description": "FAOSTAT Crops and livestock products (QCL): production, area harvested, "
        "yield, stocks and other elements by ASEAN country (ISO3, ISO2 or name) and item (name "
        "or FAOSTAT code), with FAO flags. Reads the local pack; live=true queries the FAOSTAT "
        "API with the configured token.",
        "input_schema": {
            "type": "object",
            "properties": {
                "country": {"type": "string"},
                "item": {"type": "string"},
                "element": {"type": "string"},
                "year_from": {"type": "integer"},
                "year_to": {"type": "integer"},
                "live": {"type": "boolean"},
            },
            "required": ["country", "item"],
        },
        "fn": lambda a: faostat_qcl(**a),
        "impl": faostat_qcl,
    },
    "fao_crop_calendar": {
        "description": "FAO Crop Calendar sowing and harvest windows, growing period and sowing "
        "rate by agro-ecological zone. ASEAN coverage is Myanmar and Timor-Leste only; other "
        "countries return a reason, not a guess.",
        "input_schema": {
            "type": "object",
            "properties": {"country": {"type": "string"}, "crop": {"type": "string"}},
            "required": ["country"],
        },
        "fn": lambda a: fao_crop_calendar(a["country"], a.get("crop")),
        "impl": fao_crop_calendar,
    },
    "chirps_rainfall": {
        "description": "CHIRPS v2.0 observed rainfall at a point (0.05 deg, 50S-50N): monthly "
        "from 1981 or daily up to 92 days, with percentile and SPI-3 against 1991-2020 when the "
        "series covers the baseline. Dates are ISO (YYYY-MM-DD).",
        "input_schema": {
            "type": "object",
            "properties": {
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "start": {"type": "string", "format": "date"},
                "end": {"type": "string", "format": "date"},
                "step": {"type": "string", "enum": ["monthly", "daily"]},
            },
            "required": ["latitude", "longitude", "start", "end"],
        },
        "fn": lambda a: chirps_rainfall(**a),
        "impl": chirps_rainfall,
    },
    "nasa_power_daily": {
        "description": "NASA POWER daily solar radiation, Tmax, Tmin, RH2M, wind at 2 m and "
        "corrected rain at a point, with units. Missing days are null with a reason.",
        "input_schema": {
            "type": "object",
            "properties": {
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "start": {"type": "string", "format": "date"},
                "end": {"type": "string", "format": "date"},
            },
            "required": ["latitude", "longitude", "start", "end"],
        },
        "fn": lambda a: nasa_power_daily(**a),
        "impl": nasa_power_daily,
    },
    "et0_fao56": {
        "description": "FAO-56 Penman-Monteith reference ET0 for one day from NASA POWER inputs, "
        "with the inputs and equation references.",
        "input_schema": {
            "type": "object",
            "properties": {
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "day": {"type": "string", "format": "date"},
            },
            "required": ["latitude", "longitude", "day"],
        },
        "fn": lambda a: et0_fao56(**a),
        "impl": et0_fao56,
    },
    "farm_region_data": {
        "description": "Precomputed real-data snapshot for the region of the demo farms: CHIRPS "
        "rainfall with percentile and SPI-3, NASA POWER 30-day weather and FAO-56 ET0, GLEAM "
        "evaporation and stress, FAOSTAT rice area, yield and production, and the FAO crop "
        "calendar where covered. Give town or farm_id; give neither to list regions. Pass "
        "sections to receive only the blocks you need (the crop calendar is large). Every "
        "block carries its source and hash. Demo region table only: for a customer farm use "
        "farm_location and the latitude/longitude tools.",
        "input_schema": {
            "type": "object",
            "properties": {
                "town": {"type": "string"},
                "farm_id": {"type": "string"},
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["rainfall", "weather", "evaporation", "faostat", "crop_calendar"],
                    },
                },
            },
        },
        "fn": lambda a: farm_region_data(**a),
        "impl": farm_region_data,
    },
    "gleam_evaporation_stress": {
        "description": "GLEAM v4.3 satellite-based land evaporation for a 0.1 degree cell and year "
        "(default latest): monthly E, Ep, Et, Eb (mm/month), evaporative stress factor S and "
        "root-zone soil moisture SMrz, with annual totals. Data end with the latest published "
        "year. First read of a cell takes about a minute.",
        "input_schema": {
            "type": "object",
            "properties": {
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "year": {"type": "integer"},
            },
            "required": ["latitude", "longitude"],
        },
        "fn": lambda a: gleam_evaporation_stress(**a),
        "impl": gleam_evaporation_stress,
    },
    "gleam_daily": {
        "description": "GLEAM v4.3 daily series (up to 92 days within one year) for Et, S, SMrz "
        "or any of E, Ep, Ei, Eb, Es, Ew, Ec (mm/day).",
        "input_schema": {
            "type": "object",
            "properties": {
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "start": {"type": "string", "format": "date"},
                "end": {"type": "string", "format": "date"},
                "variables": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["latitude", "longitude", "start", "end"],
        },
        "fn": lambda a: gleam_daily(**a),
        "impl": gleam_daily,
    },
    "gfw_forest_compliance": {
        "description": "Global Forest Watch screening around a point (radius 0.05 to 25 km): "
        "UMD tree cover loss since 2021 (canopy >= 30 percent), primary forest loss, VIIRS fire "
        "alerts for the last 30 days with the dataset's latest date, and Clark Labs aquaculture "
        "pond area. Satellite screening only, not an EUDR or ASOA compliance certificate.",
        "input_schema": {
            "type": "object",
            "properties": {
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "radius_km": {"type": "number"},
            },
            "required": ["latitude", "longitude"],
        },
        "fn": lambda a: gfw_forest_compliance(**a),
        "impl": gfw_forest_compliance,
    },
    "gfw_dataset_search": {
        "description": "Search the Global Forest Watch Data API catalog by words in the dataset "
        "name, title or overview.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["query"],
        },
        "fn": lambda a: gfw_dataset_search(**a),
        "impl": gfw_dataset_search,
    },
    "gfw_coastal_vessels": {
        "description": "Global Fishing Watch AIS apparent fishing effort (hours by flag) and "
        "fishing events within a radius (1 to 100 km) of a coastal point, up to 366 days, default "
        "the 90 days ending 5 days ago. AIS only: vessels without AIS are not seen.",
        "input_schema": {
            "type": "object",
            "properties": {
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "radius_km": {"type": "number"},
                "start": {"type": "string", "format": "date"},
                "end": {"type": "string", "format": "date"},
            },
            "required": ["latitude", "longitude"],
        },
        "fn": lambda a: gfw_coastal_vessels(**a),
        "impl": gfw_coastal_vessels,
    },
    "gfw_vessel_search": {
        "description": "Search the Global Fishing Watch public vessel identity registry by "
        "name or MMSI.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["query"],
        },
        "fn": lambda a: gfw_vessel_search(**a),
        "impl": gfw_vessel_search,
    },
    "knowledge_search": {
        "description": "Keyword search over the AgriQill docs, BrainAgroguard vault and the 37 "
        "technique families. Returns cited passages (path#Lline) marked VERIFIED or TO VERIFY.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["query"],
        },
        "fn": lambda a: knowledge_search(a["query"], a.get("limit", 8)),
        "impl": knowledge_search,
    },
    "jobs_status": {
        "description": "List data jobs (FAOSTAT, crop calendar, EcoCrop, docs index) and their "
        "last run, so an agent can tell how fresh each local store is.",
        "input_schema": {"type": "object", "properties": {}},
        "fn": lambda a: jobs_status(),
        "impl": jobs_status,
    },
    "ops_plan_preview": {
        "description": "Forecast paddy water and draft farmer-crew tasks from a farm payload "
        "(same body as POST /ops/plan). Read-only preview: proposals only, no ledger write.",
        "input_schema": {
            "type": "object",
            "properties": {"payload": {"type": "object"}},
            "required": ["payload"],
        },
        "fn": lambda a: ops_plan_preview(a["payload"]),
        "impl": ops_plan_preview,
    },
    "contract_verify": {
        "description": "Parse and verify an .agri agronomic contract: hydrology, spray gates, "
        "nitrogen cap and ROI terms, with unit conversion and TO VERIFY warnings.",
        "input_schema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
        "fn": lambda a: contract_verify(a["text"]),
        "impl": contract_verify,
    },
    "ops_plan_live_preview": {
        "description": "Plan a registered farm contract from live Open-Meteo hourly weather and "
        "field telemetry, with CP-SAT task times and gate reasons. Preview only, no proposals.",
        "input_schema": {
            "type": "object",
            "properties": {"farm_id": {"type": "string"}},
            "required": ["farm_id"],
        },
        "fn": lambda a: ops_plan_live_preview(a["farm_id"]),
        "impl": ops_plan_live_preview,
    },
    "crop_options": {
        "description": "Rank ASEAN export and local crops for a demo town: EcoCrop suitability, "
        "national FAOSTAT yield, World Bank world price and gross value per ha where yield and "
        "price share a basis. Gross value is not profit. Demo towns only; other towns return a "
        "reason, not a guess.",
        "input_schema": {
            "type": "object",
            "properties": {"town": {"type": "string"}},
            "required": ["town"],
        },
        "fn": lambda a: cropvalue.options(a["town"]),
        "impl": cropvalue.options,
    },
    "field_monitoring_status": {
        "description": "Per-paddy monitoring layers for a contract farm: LoRaWAN sensor health "
        "(stale, stuck, battery), latest scout tube reading, Kalman water estimate with sigma "
        "and leak or inflow flags, on-site wind, and the satellite layer status.",
        "input_schema": {
            "type": "object",
            "properties": {"farm_id": {"type": "string"}},
            "required": ["farm_id"],
        },
        "fn": lambda a: live.monitoring(a["farm_id"]),
        "impl": live.monitoring,
    },
    "farm_summary": {
        "description": "Read-only. Dashboard summary of a contract farm: contract validity and "
        "area, monitoring coverage, weather status, scheduled and blocked work, proposal "
        "counts and ledger validity. Changes nothing on the farm; a first weather lookup "
        "may be logged.",
        "input_schema": {
            "type": "object",
            "properties": {"farm_id": {"type": "string"}},
            "required": ["farm_id"],
        },
        "fn": lambda a: farm_summary(a["farm_id"]),
        "impl": farm_summary,
    },
    "farm_records_check": {
        "description": "Read-only. Check a farm's own records against weather: model versus "
        "logged water depth, recent spray days, and logged inputs against the contract. "
        "Values that did not load are null with a reason. Changes nothing on the farm; a "
        "first weather lookup may be logged.",
        "input_schema": {
            "type": "object",
            "properties": {"farm_id": {"type": "string"}},
            "required": ["farm_id"],
        },
        "fn": lambda a: farm_records_check(a["farm_id"]),
        "impl": farm_records_check,
    },
    "proposals_list": {
        "description": "Read-only. Agent proposals with their status, newest first, for one "
        "farm or all farms. Approving or rejecting happens in the AgriQill app after sign-in.",
        "input_schema": {
            "type": "object",
            "properties": {"farm_id": {"type": "string"}},
        },
        "fn": lambda a: proposals_list(a.get("farm_id")),
        "impl": proposals_list,
    },
    "proposal_rehearsal": {
        "description": "Read-only. The twin rehearsal sealed with a water proposal before anyone "
        "decided: daily water level if approved, if not, and if the forecast rain fails, with "
        "the water volume, the season context (CHIRPS SPI, NASA POWER, GLEAM, FAOSTAT) and, "
        "once a later reading exists, the scored outcome.",
        "input_schema": {
            "type": "object",
            "properties": {"proposal_id": {"type": "string"}},
            "required": ["proposal_id"],
        },
        "fn": lambda a: proposal_rehearsal(a["proposal_id"]),
        "impl": proposal_rehearsal,
    },
    "rehearsal_outcomes": {
        "description": "Read-only. How AgriQill's rehearsals compared with what the field "
        "measured after approved jobs: count, share inside the band and mean absolute error.",
        "input_schema": {
            "type": "object",
            "properties": {"farm_id": {"type": "string"}},
            "required": ["farm_id"],
        },
        "fn": lambda a: rehearsal_outcomes(a["farm_id"]),
        "impl": rehearsal_outcomes,
    },
    "farm_location": {
        "description": "Read-only. Name, country, location [lat, lon] and parcel ids (with area "
        "and whether an outline is drawn) of a registered contract farm, so the latitude and "
        "longitude tools can be called for a customer farm.",
        "input_schema": {
            "type": "object",
            "properties": {"farm_id": {"type": "string"}},
            "required": ["farm_id"],
        },
        "fn": lambda a: farm_location(a["farm_id"]),
        "impl": farm_location,
    },
    "drone_spray_guard": {
        "description": "Hard halt mission if wind > 5.5 m/s. With farm_id the server also reads "
        "its own wind (on-site anemometer, else today's forecast maximum) and the higher value "
        "decides; without it only your figure is checked and the result says it is unverified.",
        "input_schema": {
            "type": "object",
            "properties": {
                "current_wind_speed_ms": {"type": "number"},
                "farm_id": {"type": "string"},
            },
            "required": ["current_wind_speed_ms"],
        },
        "fn": lambda a: drone_spray_guard(a["current_wind_speed_ms"], a.get("farm_id")),
        "impl": drone_spray_guard,
    },
    "lorawan_actuate": {
        "description": "Ask for a LoRaWAN actuation: runs the safety gates and records a ledger "
        "receipt, then waits for a named person to approve in the app. It never sends anything "
        "and takes no PIN, confirmation or token.",
        "input_schema": {
            "type": "object",
            "properties": {
                "device_id": {"type": "string"},
                "command": {"type": "string"},
                "wind_speed_ms": {"type": "number"},
                "declared_inputs": {"type": "array", "items": {"type": "string"}},
                "standard": {"type": "string"},
                "requested_minutes": {"type": "number"},
            },
            "required": ["device_id", "command"],
            "additionalProperties": False,
        },
        "fn": lambda a: lorawan_actuate(**a),
        "impl": lorawan_actuate,
    },
}
