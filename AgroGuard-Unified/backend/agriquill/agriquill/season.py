from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from typing import Any

from . import pest
from .farmers import DEFAULT_THRESHOLDS
from .flows import (
    EF1_FLOODED_RICE,
    FRAC_GAS,
    FRAC_LEACH_WET,
    IPCC_N2O,
    RICE_HEIGHT_M,
    RICE_KCB,
    RICE_P,
    RICE_ZR_M,
    dual_kc,
    ks,
    n_source,
    taw_mm,
    u2_from_u10,
)
from .pid import Pid
from .sitecontext import HEAT_C, HEAT_SOURCE

__all__ = ["EF1_FLOODED_RICE", "FRAC_GAS", "FRAC_LEACH_WET", "run"]

ORYZA = (
    "ORYZA2000 (Bouman et al. 2001, IRRI), crop file IR72.D92: SUBDD hourly heat units, PHENOL, "
    "SUBLAI2 exponential leaf growth, partitioning tables, NCROP demand; fetched 2026-10-23"
)
KINIRY = (
    "Kiniry, McCauley, Xie and Arnold 2001, Agron. J. 93:1354-1361, doi:10.2134/agronj2001.1354: "
    "RUE 2.39 g MJ-1 intercepted PAR, k 0.37 (U.S. cultivars, TO VERIFY for tropical varieties)"
)
COUSENS = "Cousens 1985, J. Agric. Sci. 105:513-521: YL = I d / (1 + I d / A)"
STATUS = "uncalibrated"
PID_BASIS = "on the ponded depth at the start of each day"

# ORYZA2000 IR72 crop file. Local varieties need their own development rates (TO VERIFY).
TBD, TOD, TMD, TBLV = 8.0, 30.0, 42.0, 8.0
DVRJ, DVRI, DVRP, DVRR = 0.000773, 0.000758, 0.000784, 0.001784
SHCKD, SHCKL = 0.4, 0.25
RGRLMX, RGRLMN = 0.0085, 0.0040
ASLA, BSLA, CSLA, DSLA, SLAMAX = 0.0024, 0.0025, -4.5, 0.14, 0.0045
LAPE = 0.0001
FSHTB = ((0.0, 0.50), (0.43, 0.75), (1.0, 1.0), (2.5, 1.0))
FLVTB = ((0.0, 0.60), (0.5, 0.60), (0.75, 0.30), (1.0, 0.0), (2.5, 0.0))
FSTTB = ((0.0, 0.40), (0.5, 0.40), (0.75, 0.70), (1.0, 0.40), (1.2, 0.0), (2.5, 0.0))
FSOTB = ((0.0, 0.0), (0.75, 0.0), (1.0, 0.60), (1.2, 1.0), (2.5, 1.0))
DRLVT = ((0.0, 0.0), (0.6, 0.0), (1.0, 0.015), (1.6, 0.025), (2.1, 0.05), (2.5, 0.05))
NMAXLT = ((0.0, 0.053), (0.4, 0.053), (0.75, 0.040), (1.0, 0.028), (2.0, 0.022), (2.5, 0.015))
NMINLT = ((0.0, 0.025), (1.0, 0.012), (2.1, 0.007), (2.5, 0.007))
NMAXUP, RFNLV, FNLVI = 8.0, 0.004, 0.025
TESTSET = 0.00001
SPGF, WGRMX = 64900.0, 0.0000249
FRPAR = 0.5
RUE_G_MJ, K_PAR = 2.39, 0.37

PHASES = (
    (0.4, "vegetative"),
    (0.65, "photoperiod-sensitive"),
    (1.0, "panicle formation"),
    (2.0, "grain filling"),
)


def lint(table: Sequence[tuple[float, float]], x: float) -> float:
    if x <= table[0][0]:
        return table[0][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:], strict=False):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return table[-1][1]


def heat_units(tmax: float, tmin: float, tbd: float, tod: float, tmd: float) -> float:
    """ORYZA2000 SUBDD: 24 hourly temperatures from a cosine, bilinear above the optimum."""
    tm, total = (tmax + tmin) / 2, 0.0
    for i in range(1, 25):
        td = tm + 0.5 * abs(tmax - tmin) * math.cos(0.2618 * (i - 14))
        if tbd < td < tmd:
            if td > tod:
                td = tod - (td - tod) * (tod - tbd) / (tmd - tod)
            total += (td - tbd) / 24
    return total


def sla(dvs: float) -> float:
    return min(SLAMAX, ASLA + BSLA * math.exp(CSLA * (dvs - DSLA)))


def stage_of(dvs: float) -> str:
    if dvs >= 2.0:
        return "mature"
    return next(name for top, name in PHASES if dvs < top)


def _kcb(dvs: float) -> float:
    # shortcut: FAO-56 stage picked from DVS (initial < 0.4, mid < 1.5, end), TO VERIFY
    return RICE_KCB["initial" if dvs < 0.4 else "mid" if dvs < 1.5 else "end"]


def _val(value: Any, unit: str, **extra: Any) -> dict[str, Any]:
    out = {"value": round(value, 3) if isinstance(value, float) else value, "unit": unit}
    return {**out, **extra}


def _null(reason: str) -> dict[str, Any]:
    return {"value": None, "reason": reason}


VAR_UNITS = {
    "dvs": "-",
    "lai": "m2/m2",
    "canopy_cover": "fraction",
    "biomass_kg_ha": "kg DM/ha",
    "yield_kg_ha": "kg DM/ha",
    "ponded_mm": "mm",
    "tube_cm": "cm",
    "runoff_mm": "mm",
    "irrigation_mm": "mm",
    "pid_error_mm": "mm",
    "soil_water_ks": "-",
    "soil_n_kg_ha": "kg N/ha",
    "n_uptake_kg_ha": "kg N/ha",
    "n_demand_kg_ha": "kg N/ha",
    "n_factor": "-",
    "weed_loss_pct": "%",
    "residue": "g a.i./ha",
    "heat_day": "bool",
    "blast": "bool",
}


def _blast_days(hourly: Mapping[str, Sequence[Any]] | None) -> dict[str, bool] | None:
    result = pest.shadow_blast(
        hourly, DEFAULT_THRESHOLDS["blast_temp_min_c"], DEFAULT_THRESHOLDS["blast_temp_max_c"], []
    )
    if not result.get("available"):
        return None
    return {d["date"]: bool(d["flag"]) for d in result["days"]}


def _events(plan: Mapping[str, Any], kind: str) -> list[dict[str, Any]]:
    return [e for e in plan.get("events", []) if e.get("kind") == kind]


def run(plan: Mapping[str, Any], inputs: Mapping[str, Any]) -> dict[str, Any]:
    transplant = date.fromisoformat(plan["transplant_date"])
    nursery = int(plan.get("seedbed_days") or 0)
    duration = int(plan["duration_days"])
    start = transplant - timedelta(days=nursery)
    weather = {d["date"]: d for d in inputs["weather"]["days"]}
    hydro = inputs.get("hydraulics")
    blast = _blast_days(inputs.get("hourly"))
    hills, per_hill = plan.get("hills_per_m2"), plan.get("plants_per_hill")
    density = hills * per_hill if hills and per_hill else None
    water = plan.get("water") or {}
    regime = water.get("regime") or "continuous"
    reflood = water.get("reflood_cm")
    reflood_mm = reflood * 10 if reflood is not None else None
    threshold = water.get("awd_threshold_cm")
    bund_mm = float(plan["bund_height_cm"]) * 10
    perc = plan.get("percolation_mm_day")
    soil_n = plan.get("soil_n_kg_ha")
    ef1 = EF1_FLOODED_RICE.get(regime, EF1_FLOODED_RICE["continuous"])

    gravity = (hydro["theta_sat"] - hydro["theta_fc"]) * RICE_ZR_M * 1000 if hydro else None
    taw = taw_mm(hydro["theta_fc"], hydro["theta_wp"], RICE_ZR_M) if hydro else None
    yield_drain = hydro["theta_sat"] - hydro["theta_fc"] if hydro else None

    sprays = _events(plan, "spray")
    irrigations: dict[str, float] = {}
    for e in _events(plan, "irrigate"):
        irrigations[e["date"]] = irrigations.get(e["date"], 0.0) + float(e["mm"])
    ferts: dict[str, list[dict[str, Any]]] = {}
    for e in _events(plan, "fertiliser"):
        ferts.setdefault(e["date"], []).append(e)
    weeds: dict[str, list[dict[str, Any]]] = {}
    for e in [*_events(plan, "weed_emergence"), *_events(plan, "weed")]:
        weeds.setdefault(e["date"], []).append(e)

    dvs = ts = tstr = tshckd = tshckl = 0.0
    lai_plant = LAPE
    lai = wlvg = wlvd = wst = wso = spikelets = 0.0
    lai_exs = wlvg_exs = 0.0
    blend, settled = 1.0, False
    anlv = anst = uptake_total = 0.0
    pool = float(soil_n) if soil_n is not None else None
    nf = 1.0
    settings = water.get("pid") or {}
    controller = (
        Pid(settings["kp"], settings["ki"], settings["kd"], 0.0, float(settings["max_mm_day"]))
        if regime == "pid" and settings
        else None
    )
    setpoint_mm = float(settings["setpoint_cm"]) * 10 if controller else 0.0
    storage = setpoint_mm if controller else float(reflood_mm or 0.0)
    cohorts: list[dict[str, Any]] = []
    residue: dict[str, float] = {}
    decay = {e["product"]: math.log(2) / float(e["dt50_days"]) for e in sprays}
    broken: str | None = None
    maturity: str | None = None
    rows: list[dict[str, Any]] = []
    heat: list[str] = []
    pi_days: list[str] = []

    for i in range(nursery + duration):
        today = (start + timedelta(days=i)).isoformat()
        das = i - nursery
        w = weather.get(today)
        if broken is None and w is None:
            broken = today
        if broken is not None:
            reason = f"weather missing for {broken}"
            rows.append(
                {
                    "date": today,
                    "das": das,
                    "stage": None,
                    "vars": {k: _null(reason) for k in VAR_UNITS},
                }
            )
            continue
        assert w is not None
        in_field = das >= 0
        hu = heat_units(w["tmax_c"], w["tmin_c"], TBD, TOD, TMD)
        hulv = heat_units(w["tmax_c"], w["tmin_c"], TBLV, TOD, TMD)
        if das == 0:
            tstr, tshckd, tshckl = ts, SHCKD * ts, SHCKL * ts
            if density:
                lai = lai_plant * density
                wlvg = lai / sla(dvs)
                wst = wlvg * lint(FSTTB, dvs) / lint(FLVTB, dvs)
                anlv, anst = FNLVI * wlvg, 0.5 * FNLVI * wst
        ts += hu
        shocked = in_field and ts < tstr + tshckd
        rate = DVRJ if dvs < 0.4 else DVRI if dvs < 0.65 else DVRP if dvs < 1.0 else DVRR
        if dvs < 2.0 and not shocked:
            dvs = min(2.0, dvs + rate * hu)
        if dvs >= 2.0 and maturity is None and in_field:
            maturity = today

        for product, k in decay.items():
            if product in residue:
                residue[product] *= math.exp(-k)
        for e in sprays:
            if e["date"] == today:
                residue[e["product"]] = residue.get(e["product"], 0.0) + float(e["rate_g_ai_ha"])

        vars_: dict[str, dict[str, Any]] = {"dvs": _val(dvs, "-")}
        balance = None
        if not in_field:
            if density:
                lai_plant += lai_plant * RGRLMX * hulv
            for name in VAR_UNITS:
                if name != "dvs":
                    vars_[name] = _null("in the nursery: the field starts at transplanting")
            rows.append({"date": today, "das": das, "stage": "nursery", "vars": vars_})
            continue

        # Water: storage above the surface is ponded water, below it a deficit from saturation.
        irrigation = irrigations.get(today, 0.0)
        tube_now = _tube(storage, yield_drain, gravity)
        if (
            reflood_mm is not None
            and regime == "continuous"
            and storage < reflood_mm
            or (
                reflood_mm is not None
                and regime == "awd"
                and threshold is not None
                and tube_now is not None
                and tube_now <= threshold
            )
        ):
            irrigation += reflood_mm - storage
        pid_error = None
        if controller is not None:
            pid_error = setpoint_mm - storage
            irrigation += controller.step(setpoint_mm, storage, 1.0)
        coeff = dual_kc(_kcb(dvs), u2_from_u10(w["wind_ms"]), w["rh_min_pct"], RICE_HEIGHT_M)
        drained = gravity is not None and storage < -gravity
        stress = 1.0
        if drained and taw is not None and gravity is not None:
            stress = ks(-storage - gravity, taw, RICE_P)
        transp = stress * coeff["kcb"] * w["et0_mm"]
        evap = coeff["ke"] * w["et0_mm"]
        loss_perc = 0.0 if drained or perc is None else float(perc)
        before = storage
        after = storage + w["rain_mm"] + irrigation - transp - evap - loss_perc
        floor = -(gravity + taw) if gravity is not None and taw is not None else None
        if floor is not None and after < floor:
            after = floor
        runoff = max(0.0, after - bund_mm)
        after -= runoff
        storage = after
        out_mm = before + w["rain_mm"] + irrigation - runoff - after
        balance = {
            "in_mm": round(w["rain_mm"] + irrigation, 3),
            "out_mm": round(out_mm, 3),
            "storage_mm": round(storage, 3),
        }
        bound = (
            {"bound": "upper bound: percolation not entered, taken as 0"} if perc is None else {}
        )
        vars_["ponded_mm"] = _val(max(storage, 0.0), "mm", **bound)
        tube = _tube(storage, yield_drain, gravity)
        vars_["tube_cm"] = (
            _val(tube, "cm", **bound)
            if tube is not None
            else _null("soil water limits unknown below the surface")
        )
        vars_["runoff_mm"] = _val(runoff, "mm", **bound)
        vars_["irrigation_mm"] = _val(irrigation, "mm")
        vars_["pid_error_mm"] = (
            _val(pid_error, "mm", bound=f"setpoint {setpoint_mm / 10:g} cm, PID {PID_BASIS}")
            if pid_error is not None
            else _null("this plan does not use the PID water regime")
        )
        vars_["soil_water_ks"] = (
            _val(stress, "-")
            if hydro
            else _val(1.0, "-", bound="upper bound: soil water limits unknown, no stress applied")
        )

        # Crop growth, leaf area and nitrogen.
        if density:
            cover = 1 - math.exp(-K_PAR * lai)
            growth = 0.0
            if dvs < 2.0:
                growth = RUE_G_MJ * FRPAR * w["srad_mj_m2"] * cover * stress * nf * 10
            shoot = growth * lint(FSHTB, dvs)
            dying = lint(DRLVT, dvs) * wlvg
            wlvg += shoot * lint(FLVTB, dvs) - dying
            wlvd += dying
            wst += shoot * lint(FSTTB, dvs)
            wso += shoot * lint(FSOTB, dvs)
            if 0.65 <= dvs < 1.0:
                spikelets += growth * SPGF
                pi_days.append(today)
            if dvs >= 1.0 and spikelets > 0:
                wso = min(wso, spikelets * WGRMX)
            if lai < 1.0 and dvs < 1.0:
                if ts >= tstr + tshckl:
                    lai += lai * (RGRLMX - (1 - nf) * (RGRLMX - RGRLMN)) * hulv
                lai_exs, wlvg_exs = lai, wlvg
            else:
                # ORYZA2000 SUBLAI2: blend Eq. 3.42 into Eq. 3.40 until simulated SLA matches.
                target = wlvg * sla(dvs)
                if not settled and wlvg > 0 and abs(lai / wlvg - sla(dvs)) / sla(dvs) < TESTSET:
                    settled = True
                if settled:
                    lai = target
                else:
                    lai = ((wlvg - wlvg_exs) * sla(dvs) + lai_exs + blend * target) / (blend + 1)
                    blend += 1
            nmaxl, nminl = lint(NMAXLT, dvs), lint(NMINLT, dvs)
            anlv = max(0.0, anlv - dying * RFNLV)
            for e in ferts.get(today, []):
                if e.get("rate_kg_ha") is None or e.get("n_pct") is None:
                    continue
                n = float(e["rate_kg_ha"]) * float(e["n_pct"]) / 100
                kept = n * (
                    1 - FRAC_GAS[n_source(str(e.get("product") or ""))] - FRAC_LEACH_WET - ef1
                )
                if pool is not None:
                    pool += max(kept, 0.0)
            leaf_need = max(0.0, nmaxl * wlvg - anlv)
            stem_need = max(0.0, 0.5 * nmaxl * wst - anst)
            need = leaf_need + stem_need
            got = min(need, NMAXUP, pool if pool is not None else math.inf)
            if need > 0:
                anlv += got * leaf_need / need
                anst += got * stem_need / need
            if pool is not None:
                pool -= got
            uptake_total += got
            fraction = anlv / wlvg if wlvg > 0 else nmaxl
            nf = (
                min(1.0, max(0.0, (fraction - nminl) / (nmaxl - nminl)))
                if pool is not None
                else 1.0
            )
            loss = _weed_loss(cohorts, weeds.get(today, []))
            yield_now = wso * (1 - loss / 100) if loss is not None else wso
            vars_["lai"] = _val(lai, "m2/m2")
            vars_["canopy_cover"] = _val(1 - math.exp(-K_PAR * lai), "fraction")
            vars_["biomass_kg_ha"] = _val(wlvg + wlvd + wst + wso, "kg DM/ha")
            vars_["yield_kg_ha"] = _val(
                yield_now,
                "kg DM/ha",
                **({} if loss is not None or not cohorts else {"bound": "weed loss not included"}),
            )
            no_n = "soil mineral N at transplanting not entered: N not limiting"
            vars_["soil_n_kg_ha"] = _val(pool, "kg N/ha") if pool is not None else _null(no_n)
            vars_["n_uptake_kg_ha"] = _val(uptake_total, "kg N/ha")
            vars_["n_demand_kg_ha"] = _val(nmaxl * wlvg + 0.5 * nmaxl * wst, "kg N/ha")
            vars_["n_factor"] = (
                _val(nf, "-") if pool is not None else _val(1.0, "-", bound=f"upper bound: {no_n}")
            )
            vars_["weed_loss_pct"] = (
                _val(loss, "%")
                if loss is not None
                else _null(
                    "no weed emergence entered"
                    if not cohorts
                    else "Cousens I and A not entered for this weed"
                )
            )
        else:
            loss = _weed_loss(cohorts, weeds.get(today, []))
            reason = "plant density (hills per m2 and plants per hill) not entered"
            for name in (
                "lai",
                "canopy_cover",
                "biomass_kg_ha",
                "yield_kg_ha",
                "soil_n_kg_ha",
                "n_uptake_kg_ha",
                "n_demand_kg_ha",
                "n_factor",
            ):
                vars_[name] = _null(reason)
            vars_["weed_loss_pct"] = (
                _val(loss, "%")
                if loss is not None
                else _null("Cousens I and A not entered for this weed")
            )
        vars_["residue"] = _val({p: round(c, 3) for p, c in residue.items()}, "g a.i./ha")
        is_heat = w["tmax_c"] >= HEAT_C and 0.9 <= dvs <= 1.1
        if is_heat:
            heat.append(today)
        vars_["heat_day"] = _val(is_heat, "bool")
        vars_["blast"] = (
            _val(blast.get(today, False), "bool", status="shadow")
            if blast is not None
            else _null("hourly replay weather unavailable")
        )
        rows.append(
            {"date": today, "das": das, "stage": stage_of(dvs), "vars": vars_, "balance": balance}
        )

    planned = (transplant + timedelta(days=duration)).isoformat()
    harvest = maturity or planned
    windows = _windows(plan, pi_days, heat, harvest, maturity is not None)
    last = rows[-1]["vars"] if rows else {}
    return {
        "engine": "own",
        "status": STATUS,
        "days": rows,
        "windows": windows,
        "summary": {
            "yield_kg_ha": last.get("yield_kg_ha", _null("no days")),
            "maturity_date": maturity,
            "planned_harvest": planned,
            "maturity_note": None
            if maturity
            else "ORYZA IR72 development rates did not reach maturity in the plan's duration",
            "heat_days": len(heat),
            "weather_missing_from": broken,
        },
        "method": {
            "growth": "biomass = RUE x 0.5 x solar radiation x (1 - exp(-k LAI)) x Ks x N factor; "
            "ORYZA2000 partitioning, leaf death and spikelet sink",
            "water": "daily bucket: ponded water above the surface overflows the bund as runoff; "
            "below the surface the perched water table falls by deficit / (theta_sat - theta_fc)",
            "nitrogen": "ORYZA2000 leaf and stem N demand, uptake capped at NMAXUP; fertiliser N "
            "net of IPCC Tier 1 seasonal losses on the application day (approximation)",
            "weeds": COUSENS + "; multispecies: densities weighted by each I, A the largest",
            "residue": "first-order decay with the label DT50",
            "pid": (
                f"discrete PID on the ponded depth, setpoint {settings['setpoint_cm']:g} cm, "
                f"Kp {settings['kp']:g}, Ki {settings['ki']:g}, Kd {settings['kd']:g}, pump limit "
                f"{settings['max_mm_day']:g} mm/day; adds water only, so rain above the setpoint "
                "is not drained; conditional-integration anti-windup"
                if controller is not None
                else None
            ),
            "not_modelled": [
                "N translocation to grain after flowering",
                "spikelet sterility from heat or cold",
                "soil evaporation reduction when the surface dries (E is an upper bound then)",
                "weed emergence-time effect (Cousens et al. 1987)",
            ],
        },
        "sources": {
            "phenology": ORYZA,
            "growth": KINIRY,
            "water": "FAO-56 dual Kc and Ch. 8 Ks (flows.py)",
            "nitrogen_losses": IPCC_N2O,
            "weeds": COUSENS,
            "heat": HEAT_SOURCE,
            "blast": pest.PEST_STATUS,
        },
    }


def _tube(storage: float, yield_drain: float | None, gravity: float | None) -> float | None:
    if storage >= 0:
        return storage / 10
    if yield_drain is None or gravity is None:
        return None
    return -min(-storage, gravity) / yield_drain / 10


def _weed_loss(cohorts: list[dict[str, Any]], today: list[dict[str, Any]]) -> float | None:
    for e in today:
        if e["kind"] == "weed_emergence":
            cohorts.append(
                {"d": float(e["density_m2"]), "i": e.get("cousens_i"), "a": e.get("cousens_a")}
            )
        else:
            for c in cohorts:
                c["d"] *= 1 - float(e["removed_pct"]) / 100
    if not cohorts or any(c["i"] is None or c["a"] is None for c in cohorts):
        return None
    pressure = sum(float(c["i"]) * c["d"] for c in cohorts)
    top = max(float(c["a"]) for c in cohorts)
    return pressure / (1 + pressure / top)


def _windows(
    plan: Mapping[str, Any], pi_days: list[str], heat: list[str], harvest: str, mature: bool
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if pi_days:
        out.append(
            {
                "kind": "n_demand_pi",
                "start": pi_days[0],
                "end": pi_days[-1],
                "detail": "panicle initiation to flowering (DVS 0.65-1.0): "
                "the crop's highest N need",
            }
        )
    if heat:
        out.append(
            {
                "kind": "flowering_heat",
                "start": heat[0],
                "end": heat[-1],
                "detail": f"{len(heat)} days at or above {HEAT_C:g} C around flowering",
                "days": heat,
            }
        )
    harvest_day = date.fromisoformat(harvest)
    for e in _events(plan, "spray"):
        sprayed = date.fromisoformat(e["date"])
        if e.get("phi_days") is not None and (harvest_day - sprayed).days < int(e["phi_days"]):
            out.append(
                {
                    "kind": "phi_block",
                    "start": e["date"],
                    "end": (sprayed + timedelta(days=int(e["phi_days"]))).isoformat(),
                    "detail": f"{e['product']}: harvest {harvest} is inside the "
                    f"{e['phi_days']}-day pre-harvest interval",
                }
            )
        if e.get("fish_toxic") and plan.get("fish") and plan.get("trench"):
            out.append(
                {
                    "kind": "fish_toxic_spray",
                    "start": e["date"],
                    "end": e["date"],
                    "detail": f"{e['product']} is marked toxic to fish and fish are in the trench",
                }
            )
    out.append(
        {
            "kind": "harvest",
            "start": harvest,
            "end": harvest,
            "detail": "physiological maturity (DVS 2)" if mature else "end of the plan's duration",
        }
    )
    return out
