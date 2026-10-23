from __future__ import annotations

import math
import warnings
from collections.abc import Mapping
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import yaml

from .season import STATUS, VAR_UNITS
from .season_aquacrop import _applied_irrigation

ENGINE = "wofost"
NAME = "PCSE WOFOST 7.3"
PARAMS = Path(__file__).parent / "data" / "wofost"
VARIETY = "Rice_HYV_IR8"
SOURCE = (
    "PCSE 6.0.13 Wofost73_WLP_CWB; crop parameters WOFOST_crop_parameters branch wofost73 "
    "at commit 3612078ae36a949a35b8712cc6deddf279b7fe81 (EUPL 1.2), variety Rice_HYV_IR8: tropical "
    "transplanted rice after Van Heemst 1988 (edepot.wur.nl/218353)"
)
NITROGEN = (
    "not modelled: the tropical rice ecotype (rice_irri) has WOFOST 7 photosynthesis terms "
    "(AMAXTB), not the AMAX_REF terms the N-limited WOFOST 8.1 needs"
)
NOT_MODELLED = f"not modelled by {NAME}"
CO2_PPM = 360.0  # PCSE site data documented default
# FAO-56 Eq. 17 vapour pressure, Eq. 47 wind at 2 m; Angstrom 0.25/0.50 as FAO-56 Eq. 35.
ANGSTA, ANGSTB = 0.25, 0.50


def crop_parameters() -> dict[str, Any]:
    doc = yaml.safe_load((PARAMS / "rice.yaml").read_text(encoding="utf-8"))
    variety = doc["CropParameters"]["Varieties"][VARIETY]
    return {k: v[0] for k, v in variety.items() if k != "Metadata"}


def _es(t: float) -> float:
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def _null(reason: str) -> dict[str, Any]:
    return {"value": None, "reason": reason}


def _val(value: float, unit: str) -> dict[str, Any]:
    return {"value": round(float(value), 3), "unit": unit}


def run(plan: Mapping[str, Any], inputs: Mapping[str, Any]) -> dict[str, Any]:
    from pcse.base import ParameterProvider, WeatherDataContainer, WeatherDataProvider
    from pcse.input import WOFOST73SiteDataProvider
    from pcse.models import Wofost73_WLP_CWB
    from pcse.util import reference_ET

    hydro = inputs.get("hydraulics")
    if not hydro:
        return {"status": "failed", "reason": "soil water limits unknown: WOFOST needs FC, WP, SAT"}
    transplant = date.fromisoformat(plan["transplant_date"])
    duration = int(plan["duration_days"])
    days = [transplant + timedelta(days=i) for i in range(duration)]
    weather = {d["date"]: d for d in inputs["weather"]["days"]}
    gap = next((d.isoformat() for d in days if d.isoformat() not in weather), None)
    if gap:
        return {"status": "failed", "reason": f"weather missing for {gap}; WOFOST needs every day"}
    lat, lon = float(inputs.get("lat") or 0.0), float(inputs.get("lon") or 0.0)
    elev = float(inputs["weather"].get("elevation_m") or 0.0)

    class Replay(WeatherDataProvider):  # type: ignore[misc]
        def __init__(self) -> None:
            super().__init__()
            after = days[-1] + timedelta(days=1)
            for when in [*days, *([after] if after.isoformat() in weather else [])]:
                d = weather[when.isoformat()]
                tmin, tmax = d["tmin_c"], d["tmax_c"]
                vap = (
                    (_es(tmin) * d["rh_max_pct"] / 100 + _es(tmax) * d["rh_min_pct"] / 100) / 2 * 10
                )
                u2 = d["wind_ms"] * 4.87 / math.log(67.8 * 10 - 5.42)
                irrad = d["srad_mj_m2"] * 1e6
                e0, es0, et0 = reference_ET(
                    DAY=when,
                    LAT=lat,
                    ELEV=elev,
                    TMIN=tmin,
                    TMAX=tmax,
                    IRRAD=irrad,
                    VAP=vap,
                    WIND=u2,
                    ANGSTA=ANGSTA,
                    ANGSTB=ANGSTB,
                )
                self._store_WeatherDataContainer(
                    WeatherDataContainer(
                        DAY=when,
                        LAT=lat,
                        LON=lon,
                        ELEV=elev,
                        IRRAD=irrad,
                        TMIN=tmin,
                        TMAX=tmax,
                        VAP=vap,
                        WIND=u2,
                        RAIN=d["rain_mm"] / 10,
                        E0=e0 / 10,
                        ES0=es0 / 10,
                        ET0=et0 / 10,
                    ),
                    when,
                )

    crop = crop_parameters()
    perc = plan.get("percolation_mm_day")
    rate_cm = float(perc) / 10 if perc is not None else 0.0
    soil = {
        "SMFCF": hydro["theta_fc"],
        "SM0": hydro["theta_sat"],
        "SMW": hydro["theta_wp"],
        "CRAIRC": 0.06,
        "SOPE": rate_cm,
        "KSUB": rate_cm,
        "RDMSOL": 100.0,
        "K0": 10.0,
    }
    reflood = (plan.get("water") or {}).get("reflood_cm")
    site = WOFOST73SiteDataProvider(
        WAV=(hydro["theta_sat"] - hydro["theta_wp"]) * 100,
        CO2=CO2_PPM,
        SSMAX=float(plan["bund_height_cm"]),
        SSI=float(reflood or 0.0),
    )
    applied = _applied_irrigation(plan, inputs)
    agro = [
        {
            transplant: {
                "CropCalendar": {
                    "crop_name": "rice",
                    "variety_name": VARIETY,
                    "crop_start_date": transplant,
                    "crop_start_type": "emergence",
                    "crop_end_date": days[-1]
                    if (days[-1] + timedelta(days=1)).isoformat() in weather
                    else days[-2],
                    "crop_end_type": "maturity",
                    "max_duration": duration,
                },
                "TimedEvents": [
                    {
                        "event_signal": "irrigate",
                        "name": "plan irrigation",
                        "comment": "",
                        "events_table": [
                            {date.fromisoformat(k): {"amount": v / 10, "efficiency": 1.0}}
                            for k, v in applied.items()
                        ],
                    }
                ]
                if applied
                else None,
                "StateEvents": None,
            }
        }
    ]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        model = Wofost73_WLP_CWB(
            ParameterProvider(cropdata=crop, soildata=soil, sitedata=site), Replay(), agro
        )
        model.run_till_terminate()
    by_day = {r["day"].isoformat(): r for r in model.get_output()}
    summary = (model.get_summary_output() or [{}])[0]
    maturity = summary.get("DOM")

    rows = []
    for i, when in enumerate(days):
        cells: dict[str, dict[str, Any]] = {k: _null(NOT_MODELLED) for k in VAR_UNITS}
        for name in ("soil_n_kg_ha", "n_uptake_kg_ha", "n_demand_kg_ha", "n_factor"):
            cells[name] = _null(NITROGEN)
        r = by_day.get(when.isoformat())
        if r is not None and r.get("DVS") is not None:
            cells["dvs"] = _val(r["DVS"], "-")
            cells["lai"] = _val(r["LAI"], "m2/m2")
            cells["biomass_kg_ha"] = _val(r["TAGP"], "kg DM/ha")
            cells["yield_kg_ha"] = _val(r["TWSO"], "kg DM/ha")
            if r.get("RFTRA") is not None:
                cells["soil_water_ks"] = _val(r["RFTRA"], "-")
        rows.append(
            {"date": when.isoformat(), "das": i, "stage": None, "vars": cells, "balance": None}
        )
    harvest = maturity.isoformat() if maturity else None
    twso = summary.get("TWSO")
    return {
        "engine": ENGINE,
        "status": STATUS,
        "days": rows,
        "windows": [{"kind": "harvest", "start": harvest, "end": harvest, "detail": "WOFOST DVS 2"}]
        if harvest
        else [],
        "summary": {
            "yield_kg_ha": _val(twso, "kg DM/ha") if twso is not None else _null("no harvest"),
            "maturity_date": harvest,
            "anthesis_date": summary["DOA"].isoformat() if summary.get("DOA") else None,
            "planned_harvest": (transplant + timedelta(days=duration)).isoformat(),
        },
        "method": {
            "model": "WOFOST 7.3 water-limited production with the classic water balance",
            "nitrogen": NITROGEN,
            "start": "crop starts at transplanting as 'emergence' with the variety's TDWI",
            "water": "surface storage capped at the bund height (SSMAX); percolation from the plan "
            "(0 when not entered); irrigation as applied by the own water bucket",
            "soil": "FC, WP and SAT from Saxton & Rawls 2006; CRAIRC 0.06 and K0 10 cm/d are "
            "WOFOST generic values (TO VERIFY); rice has air ducts (IAIRDU 1)",
            "soil_water_ks": "RFTRA, WOFOST's transpiration reduction factor",
            "not_modelled": ["nitrogen", "weeds", "pesticides", "ponded water output"],
        },
        "sources": {"model": SOURCE},
    }
