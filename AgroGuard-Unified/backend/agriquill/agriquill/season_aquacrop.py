from __future__ import annotations

import warnings
from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any

from . import season
from .season import STATUS, VAR_UNITS

ENGINE = "aquacrop"
NAME = "AquaCrop-OSPy"
SOURCE = (
    "AquaCrop-OSPy 3.1.0 (Kelly and Foster 2021, Agric. Water Manag. 253:106976), "
    "crop file PaddyRice: transplanted, calendar days, maturity 104 d, WP 19 g/m2, HI0 0.43"
)
NOT_MODELLED = f"not modelled by {NAME}"
MAX_IRRIGATION_MM = 300.0


def _null(reason: str) -> dict[str, Any]:
    return {"value": None, "reason": reason}


def _val(value: float, unit: str) -> dict[str, Any]:
    return {"value": round(float(value), 3), "unit": unit}


def _applied_irrigation(plan: Mapping[str, Any], inputs: Mapping[str, Any]) -> dict[str, float]:
    own = season.run(plan, inputs)
    out = {}
    for row in own["days"]:
        depth = row["vars"].get("irrigation_mm", {}).get("value")
        if depth:
            out[row["date"]] = float(depth)
    return out


def run(plan: Mapping[str, Any], inputs: Mapping[str, Any]) -> dict[str, Any]:
    import pandas as pd
    from aquacrop import (
        AquaCropModel,
        Crop,
        FieldMngt,
        InitialWaterContent,
        IrrigationManagement,
        Soil,
    )

    texture = (inputs.get("hydraulics") or {}).get("inputs")
    if not texture:
        return {"status": "failed", "reason": "soil texture unknown: AquaCrop needs sand, clay, OM"}
    transplant = date.fromisoformat(plan["transplant_date"])
    duration = int(plan["duration_days"])
    days = [transplant + timedelta(days=i) for i in range(duration)]
    weather = {d["date"]: d for d in inputs["weather"]["days"]}
    gap = next((d.isoformat() for d in days if d.isoformat() not in weather), None)
    if gap:
        return {
            "status": "failed",
            "reason": f"weather missing for {gap}; AquaCrop needs every day",
        }

    rows = [weather[d.isoformat()] for d in days]
    frame = pd.DataFrame(
        {
            "MinTemp": [r["tmin_c"] for r in rows],
            "MaxTemp": [r["tmax_c"] for r in rows],
            "Precipitation": [r["rain_mm"] for r in rows],
            "ReferenceET": [max(r["et0_mm"], 0.1) for r in rows],
            "Date": pd.to_datetime([d.isoformat() for d in days]),
        }
    )
    soil = Soil("custom")
    soil.add_layer_from_texture(
        thickness=1.0,
        Sand=texture["sand_pct"],
        Clay=texture["clay_pct"],
        OrgMat=texture["om_pct"],
        penetrability=100,
    )
    reflood = (plan.get("water") or {}).get("reflood_cm")
    applied = _applied_irrigation(plan, inputs)
    schedule = pd.DataFrame(
        {"Date": pd.to_datetime(list(applied)), "Depth": list(applied.values())}
    )
    model = AquaCropModel(
        transplant.strftime("%Y/%m/%d"),
        days[-1].strftime("%Y/%m/%d"),
        frame,
        soil,
        Crop("PaddyRice", planting_date=transplant.strftime("%m/%d")),
        InitialWaterContent(value=["SAT"]),
        IrrigationManagement(irrigation_method=3, Schedule=schedule, MaxIrr=MAX_IRRIGATION_MM),
        FieldMngt(
            bunds=True,
            z_bund=float(plan["bund_height_cm"]) / 100,
            bund_water=float(reflood) * 10 if reflood is not None else 0.0,
        ),
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.run_model(till_termination=True)
    growth = model.get_crop_growth()
    flux = model.get_water_flux()
    results = model.get_simulation_results()
    harvest = str(results["Harvest Date (YYYY/MM/DD)"].iloc[0])[:10] if len(results) else None
    dry = float(results["Dry yield (tonne/ha)"].iloc[0]) * 1000 if len(results) else None

    out_rows = []
    for i, when in enumerate(days):
        cells: dict[str, dict[str, Any]] = {k: _null(NOT_MODELLED) for k in VAR_UNITS}
        if i < len(growth) and i < len(flux):
            g, f = growth.iloc[i], flux.iloc[i]
            cells["canopy_cover"] = _val(g["canopy_cover"], "fraction")
            cells["biomass_kg_ha"] = _val(g["biomass"] * 10, "kg DM/ha")
            cells["yield_kg_ha"] = _val(g["DryYield"] * 1000, "kg DM/ha")
            cells["ponded_mm"] = _val(f["surface_storage"], "mm")
            cells["runoff_mm"] = _val(f["Runoff"], "mm")
            cells["irrigation_mm"] = _val(f["IrrDay"], "mm")
            potential = float(f["TrPot"])
            cells["soil_water_ks"] = (
                _val(min(1.0, float(f["Tr"]) / potential), "-")
                if potential > 0
                else _null("no potential transpiration this day")
            )
        out_rows.append(
            {"date": when.isoformat(), "das": i, "stage": None, "vars": cells, "balance": None}
        )
    windows = [{"kind": "harvest", "start": harvest, "end": harvest, "detail": "AquaCrop harvest"}]
    return {
        "engine": ENGINE,
        "status": STATUS,
        "days": out_rows,
        "windows": windows if harvest else [],
        "summary": {
            "yield_kg_ha": _val(dry, "kg DM/ha") if dry is not None else _null("no harvest"),
            "maturity_date": harvest,
            "planned_harvest": (transplant + timedelta(days=duration)).isoformat(),
        },
        "method": {
            "model": "AquaCrop-OSPy water-driven growth: canopy cover, transpiration x WP, HI",
            "soil": "one 1 m layer from texture via AquaCrop's own Saxton & Rawls 2006",
            "water": "bunds at the plan height; irrigation is the plan's events plus the reflood "
            "rule as applied by the own water bucket, so both engines get the same water",
            "soil_water_ks": "daily Tr / TrPot (water stress on transpiration)",
            "not_modelled": ["nitrogen", "weeds", "pesticides", "development stage (DVS)"],
        },
        "sources": {"model": SOURCE},
    }
