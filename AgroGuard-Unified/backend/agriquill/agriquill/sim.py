from __future__ import annotations

import hashlib
import math
from typing import Any

# Deterministic, fast, MONOTONIC-non-negative physiological surrogate.
# Fixture only: analytic logistic curve for Beta timing envelope tests.
# Design targets (<250 ms, ~1.8% vs physical baseline) live in docs only,
# never in result payloads. Real ONNX/AquaCrop is a drop-in (TO VERIFY).


def _seed(*parts: object) -> float:
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return int(digest[:16], 16) / float(2**64)


def simulate(
    *,
    parcel_id: str,
    days: int,
    soil_organic_carbon: float = 2.0,
    avg_rainfall_mm: float = 200.0,
    water_regime: str = "AWD",
) -> dict[str, Any]:
    days = max(1, min(int(days), 365))
    s = _seed(parcel_id, water_regime, soil_organic_carbon, avg_rainfall_mm)

    # Per-day biomass is a logistic approach to a parcel-dependent asymptote.
    k = 0.05 + 0.02 * s
    carrying = 4.0 + 6.0 * s + min(max(avg_rainfall_mm, 0.0) / 500.0, 4.0)
    carrying += min(max(soil_organic_carbon, 0.0) / 2.0, 2.0)

    biomass: list[float] = []
    for day in range(days):
        b = carrying / (1.0 + math.exp(-k * (day - days * 0.4)))
        biomass.append(round(max(b, 0.0), 4))

    # Enforce invariants: non-negative and non-decreasing.
    for i in range(1, len(biomass)):
        if biomass[i] < biomass[i - 1]:
            biomass[i] = biomass[i - 1]

    peak = max(biomass) if biomass else 0.0
    yield_t_ha = round(max(peak * 0.62, 0.0), 3)
    return {
        "parcel_id": parcel_id,
        "engine": "analytic-logistic-fixture",
        "simulation_days": days,
        "water_regime": water_regime,
        "biomass_trajectory": biomass,
        "peak_biomass_t_ha": round(peak, 4),
        "yield_estimate_t_ha": yield_t_ha,
    }


def build_simulation_snapshot(
    parcel_id: str,
    day_index: int,
    season_days: int = 120,
    scenario_id: str = "demo-awd-baseline",
) -> dict[str, Any]:
    day_index = max(1, min(int(day_index), season_days))
    s = _seed(parcel_id, scenario_id)
    k = 0.05 + 0.02 * s
    carrying = 4.0 + 6.0 * s
    day = 1.0 + (day_index / season_days) * (season_days - 1)
    raw = carrying / (1.0 + math.exp(-k * (day - season_days * 0.4)))
    canopy = round(min(1.0, max(0.0, raw / carrying)), 4)
    phase = (day_index / season_days) * math.pi * 2
    stress = round(min(1.0, max(0.0, 0.3 + s * 0.3 + math.sin(phase) * (0.12 + s * 0.1))), 4)
    biomass = round(max(0.0, raw), 4)

    raw_hash = f"{parcel_id}|{scenario_id}|{day_index}|{season_days}".encode()
    input_hash = hashlib.sha256(raw_hash).hexdigest()[:16]
    run_id = f"run_{input_hash[:8]}"

    stage = "Emergence"
    if day_index > 15:
        stage = "Tillering"
    if day_index > 45:
        stage = "Stem Elongation"
    if day_index > 70:
        stage = "Panicle Initiation"
    if day_index > 90:
        stage = "Flowering / Anthesis"
    if day_index > 105:
        stage = "Grain Filling / Ripening"

    zone_states = [
        {
            "zoneId": f"{parcel_id}_z1",
            "zoneName": "Lowland Basin Zone A",
            "crop": "Paddy Rice",
            "variety": "Paw San Hmwe",
            "canopyFraction": {
                "value": canopy,
                "unit": "fraction",
                "provenance": "SIMULATED",
                "sourceId": "analytic-logistic-fixture",
                "retrievedAt": "2026-04-21T00:00:00.000Z",
                "quality": "VALID",
                "uncertainty": {
                    "lower": round(max(0.0, canopy - 0.05), 4),
                    "upper": round(min(1.0, canopy + 0.05), 4),
                    "method": "logistic-bounds",
                },
            },
            "stressIndex": stress,
            "stressEvidence": {
                "value": stress,
                "unit": "index",
                "provenance": "SIMULATED",
                "sourceId": "analytic-logistic-fixture",
                "retrievedAt": "2026-04-21T00:00:00.000Z",
                "quality": "VALID",
            },
            "biomassTPerHa": {
                "value": biomass,
                "unit": "t/ha",
                "provenance": "SIMULATED",
                "sourceId": "analytic-logistic-fixture",
                "retrievedAt": "2026-04-21T00:00:00.000Z",
                "quality": "VALID",
                "uncertainty": {
                    "lower": round(max(0.0, biomass - 0.3), 4),
                    "upper": round(biomass + 0.3, 4),
                    "method": "logistic-band",
                },
            },
            "areaHa": {
                "value": 4.5,
                "unit": "ha",
                "provenance": "SIMULATED",
                "sourceId": "seed-geometry",
                "retrievedAt": "2026-04-21T00:00:00.000Z",
                "quality": "VALID",
            },
            "growthStage": stage,
            "limitations": [
                "Demonstration fixture - not calibrated against physical field sensors"
            ],
        }
    ]

    weather_state = {
        "airTempC": {
            "value": round(28.0 + 4.0 * math.sin(phase), 1),
            "unit": "°C",
            "provenance": "SIMULATED",
            "sourceId": "fixture-meteo",
            "retrievedAt": "2026-04-21T00:00:00.000Z",
            "quality": "VALID",
        },
        "rainfallMm": {
            "value": round(max(0.0, 5.0 + 10.0 * math.sin(phase + 1)), 1),
            "unit": "mm",
            "provenance": "SIMULATED",
            "sourceId": "fixture-meteo",
            "retrievedAt": "2026-04-21T00:00:00.000Z",
            "quality": "VALID",
        },
        "windSpeedMs": {
            "value": 3.4,
            "unit": "m/s",
            "provenance": "SIMULATED",
            "sourceId": "fixture-anemometer",
            "retrievedAt": "2026-04-21T00:00:00.000Z",
            "quality": "VALID",
        },
        "sourceLabel": "Open-Meteo Historical Reanalysis (Fixture)",
    }

    return {
        "runId": run_id,
        "scenarioId": scenario_id,
        "scenarioLabel": "AWD precision schedule (fixture)",
        "timestamp": "2026-04-21T00:00:00.000Z",
        "dayIndex": day_index,
        "seasonDays": season_days,
        "zoneStates": zone_states,
        "weatherState": weather_state,
        "operations": [],
        "modelVersion": "analytic-logistic-fixture",
        "inputHash": input_hash,
        "calibrationStatus": "UNCALIBRATED",
    }
