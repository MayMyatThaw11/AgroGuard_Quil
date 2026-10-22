from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any

from . import contract, live, onboard
from .agronomy import STAGE_KC
from .store import missing

FAO56 = "FAO-56 (fao.org/4/x0490e), Table 17 Kcb, Eq. 47, 71, 72, 75, 76; fetched 2026-10-22"
# Table 17, rice: Kcb ini 1.00, mid 1.15, end 0.70-0.45 (end taken as the midpoint).
RICE_KCB = {"initial": 1.00, "mid": 1.15, "end": 0.575}
RICE_HEIGHT_M = 1.0  # Table 12 maximum crop height for rice
KC_MIN = 0.15  # FAO-56 Eq. 76 guidance for bare-soil Kc under typical conditions
WET_RH_PCT = 90.0  # leaf-wetness proxy threshold, TO VERIFY against a local blast model

FAO56_CH8 = (
    "FAO-56 Ch. 8 (https://www.fao.org/4/x0490e/x0490e0e.htm), Eq. 80, 82-86 and Table 22; "
    "fetched 2026-10-22"
)
RICE_ZR_M = 1.0  # Table 22 rice 0.5-1.0 m; footnote 1: the larger value models soil water stress
RICE_P = 0.20  # Table 22 rice; footnote 4 says "0.20 of saturation"
SATURATED = "water at or above the surface: root zone at or above field capacity, Dr = 0 (Eq. 86)"

IPCC = (
    "IPCC 2019 Refinement Vol. 4 Ch. 5, Eq. 5.2, Tables 5.11, 5.11A, 5.12, 5.13 "
    "(ipcc-nggip.iges.or.jp/public/2019rf), fetched 2026-10-22"
)
EF_SEA = (1.22, 0.83, 1.81)  # kg CH4/ha/day, Southeast Asia, Table 5.11
SEA_SEASON_DAYS = 102  # Table 5.11A, Southeast Asia default cultivation period
SF_WATER = {
    "continuous": (1.00, 0.73, 1.27, "continuously flooded"),
    "single": (0.71, 0.53, 0.94, "single drainage period"),
    "awd": (0.55, 0.41, 0.72, "multiple drainage periods (AWD)"),
    "rainfed": (0.54, 0.39, 0.74, "regular rainfed"),
}
SF_PRE_DEFAULT = (1.00, 0.88, 1.12, "non-flooded pre-season under 180 days (default)")


def u2_from_u10(u10: float) -> float:
    """FAO-56 Eq. 47 for a wind speed measured at 10 m."""
    return u10 * 4.87 / math.log(67.8 * 10 - 5.42)


def kc_max(kcb: float, u2: float, rh_min: float, height_m: float) -> float:
    """FAO-56 Eq. 72."""
    climate = 1.2 + (0.04 * (u2 - 2) - 0.004 * (rh_min - 45)) * (height_m / 3) ** 0.3
    return max(climate, kcb + 0.05)


def cover_fraction(kcb: float, kcmax: float, height_m: float) -> float:
    """FAO-56 Eq. 76."""
    if kcb <= KC_MIN:
        return 0.0
    return min(((kcb - KC_MIN) / (kcmax - KC_MIN)) ** (1 + 0.5 * height_m), 0.99)


def dual_kc(
    kcb: float, u2: float, rh_min: float, height_m: float, kr: float = 1.0
) -> dict[str, float]:
    """FAO-56 Eq. 71 with few = 1 - fc (Eq. 75, the whole surface wets under flooding)."""
    top = kc_max(kcb, u2, rh_min, height_m)
    few = 1 - cover_fraction(kcb, top, height_m)
    ke = min(kr * (top - kcb), few * top)
    return {
        "kcb": kcb,
        "ke": round(ke, 3),
        "kc": round(kcb + ke, 3),
        "kc_max": round(top, 3),
        "few": round(few, 3),
    }


def es_kpa(t_c: float) -> float:
    """FAO-56 Eq. 11."""
    return 0.6108 * math.exp(17.27 * t_c / (t_c + 237.3))


def canopy(hours: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    vpd = [es_kpa(h["t"]) * (1 - h["rh"] / 100) for h in hours]
    return {
        "vpd_kpa_mean": round(sum(vpd) / len(vpd), 2) if vpd else None,
        "vpd_kpa_max": round(max(vpd), 2) if vpd else None,
        "wet_hours": sum(1 for h in hours if h["rh"] >= WET_RH_PCT),
        "wet_rule": f"hours with relative humidity at or above {WET_RH_PCT:g} %, TO VERIFY",
    }


def _days(hourly: Mapping[str, list[Any]]) -> list[dict[str, Any]]:
    days: dict[str, list[dict[str, float]]] = {}
    for i, stamp in enumerate(hourly["time"]):
        values = {
            "t": hourly["temperature_2m"][i],
            "rh": hourly["relative_humidity_2m"][i],
            "u10": hourly["wind_speed_10m"][i],
            "rain": hourly["precipitation"][i],
            "et0": hourly["et0_fao_evapotranspiration"][i],
        }
        if all(v is not None for v in values.values()):
            days.setdefault(stamp[:10], []).append({k: float(v) for k, v in values.items()})
    return [
        {
            "date": d,
            "rain_mm": round(sum(h["rain"] for h in hs), 2),
            "et0_mm": round(sum(h["et0"] for h in hs), 2),
            "u2_ms": round(u2_from_u10(sum(h["u10"] for h in hs) / len(hs)), 2),
            "rh_min_pct": min(h["rh"] for h in hs),
            "canopy": canopy(hs),
        }
        for d, hs in days.items()
        if len(hs) == 24
    ]


def taw_mm(theta_fc: float, theta_wp: float, zr_m: float) -> float:
    """FAO-56 Eq. 82."""
    return 1000 * (theta_fc - theta_wp) * zr_m


def ks(depletion_mm: float, taw: float, p: float) -> float:
    """FAO-56 Eq. 83 and 84; Ks = 1 while the depletion is within RAW."""
    raw = p * taw
    if depletion_mm <= raw:
        return 1.0
    return max((taw - depletion_mm) / (taw - raw), 0.0)


def water(
    parcel: Mapping[str, Any],
    days: Sequence[Mapping[str, Any]],
    perc: float | None,
    levels: Mapping[str, float],
    soil: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    kcb = RICE_KCB[STAGE_KC.get(str(parcel.get("stage") or ""), "mid")]
    taw = taw_mm(soil["theta_fc"], soil["theta_wp"], RICE_ZR_M) if soil else None
    depletion: float | None = None
    rows = []
    for day in days:
        level = levels.get(day["date"])
        wet = None if level is None else level > 0
        coeff = dual_kc(kcb, day["u2_ms"], day["rh_min_pct"], RICE_HEIGHT_M)
        stress: dict[str, Any]
        if level is not None and level >= 0:
            depletion = 0.0
            stress = {"value": 1.0, "basis": SATURATED}
            bound = "no stress: water at or above the surface"
        elif level is None or taw is None or depletion is None:
            depletion = None
            reason = (
                "tube water depth unknown for this day"
                if level is None
                else "soil water limits unknown"
                if taw is None
                else "no flooded day before this one to start the root-zone balance from"
            )
            stress = {"value": None, "reason": reason}
            bound = f"upper bound: no water stress applied, {reason}"
        else:
            value = ks(depletion, taw, RICE_P)
            stress = {
                "value": round(value, 3),
                "depletion_mm": round(depletion, 1),
                "taw_mm": round(taw, 1),
                "raw_mm": round(RICE_P * taw, 1),
                "basis": "Eq. 84 on the depletion at the start of the day",
            }
            bound = "lower bound: Eq. 85 with irrigation, runoff and capillary rise taken as zero"
            use = (value * coeff["kcb"] + coeff["ke"]) * day["et0_mm"]
            depletion = min(max(depletion - day["rain_mm"] + use, 0.0), taw)
        factor = 1.0 if stress["value"] is None else stress["value"]
        rows.append(
            {
                "date": day["date"],
                "rain_mm": day["rain_mm"],
                "transpiration_mm": round(factor * coeff["kcb"] * day["et0_mm"], 2),
                "transpiration_bound": bound,
                "evaporation_mm": round(coeff["ke"] * day["et0_mm"], 2),
                "evaporation_bound": "ponded"
                if wet
                else "upper bound: water depth unknown, wet surface assumed"
                if wet is None
                else "upper bound: drying soil not modelled",
                "percolation_mm": perc,
                "kc": coeff,
                "ks": stress,
            }
        )
    gap = next((r["ks"] for r in rows if r["ks"]["value"] is None), None)
    total = {
        k: round(sum(r[k] for r in rows), 1)
        for k in ("rain_mm", "transpiration_mm", "evaporation_mm")
    }
    total["percolation_mm"] = round(perc * len(rows), 1) if perc is not None else None
    known_out = total["transpiration_mm"] + total["evaporation_mm"] + (total["percolation_mm"] or 0)
    return {
        "days": rows,
        "total": total,
        "net_mm": round(total["rain_mm"] - known_out, 1) if perc is not None else None,
        "unknown": [
            missing("irrigation_mm", "no applied irrigation volume is logged for these days"),
            missing("seepage_mm", "lateral seepage through the bunds is not measured"),
            missing("runoff_mm", "outflow over the bund is not measured"),
            *(
                []
                if perc is not None
                else [missing("percolation_mm", "contract declares no percolation rate")]
            ),
            *(
                []
                if soil
                else [missing("theta_fc_wp", "no field capacity or wilting point for this site")]
            ),
        ],
        "ks": {
            "value": min(r["ks"]["value"] for r in rows) if rows and gap is None else None,
            "reason": "no complete weather days" if not rows else gap["reason"] if gap else None,
            "means": "lowest daily Ks in the window; 1 is no stress, 0 is wilting point",
            "inputs": {
                "tube_level_cm": {r["date"]: levels.get(r["date"]) for r in rows},
                "tube_level_basis": "fused tube forecast median (p50)",
                "theta_fc": soil["theta_fc"] if soil else None,
                "theta_wp": soil["theta_wp"] if soil else None,
                "soil_source": soil.get("source") if soil else None,
                "zr_m": RICE_ZR_M,
                "p": RICE_P,
            },
            "assumed": [
                "Zr = 1.0 m, the top of the Table 22 rice range, which footnote 1 gives for "
                "modelling soil water stress",
                "Table 22 footnote 4 gives rice p as 0.20 of saturation; applying it to TAW "
                "from field capacity (Eq. 82) is TO VERIFY",
                "p is the Table 22 value for ETc near 5 mm/day, not adjusted for the day's ETc",
            ],
            "equations": "TAW Eq. 82, RAW Eq. 83, Ks Eq. 84, depletion Eq. 85 within Eq. 86; "
            "Ks scales Kcb only (Eq. 80)",
            "not_modelled": "stem sap flow: needs a sap-flow sensor to validate transpiration",
            "source": FAO56_CH8,
        },
        "method": "rain in; T = Ks x Kcb x ET0, E = Ke x ET0 (FAO-56 dual Kc, Ch. 8 Ks); "
        "contract percolation",
    }


def _regime(name: str | None) -> str | None:
    text = (name or "").upper()
    if "AWD" in text or "MULTIPLE" in text:
        return "awd"
    if "SINGLE" in text:
        return "single"
    if "CONTINUOUS" in text or "FLOODED" in text:
        return "continuous"
    if "RAINFED" in text:
        return "rainfed"
    return None


def methane(parcel: Mapping[str, Any], regime: str | None, area_ha: float | None) -> dict[str, Any]:
    key = _regime(regime)
    if key is None:
        return {
            "kg_ha": None,
            "reason": f"water regime {regime!r} has no IPCC scaling factor here",
            "source": IPCC,
        }
    sfw, sfp = SF_WATER[key], SF_PRE_DEFAULT
    season, season_basis = SEA_SEASON_DAYS, "Southeast Asia default season, Table 5.11A"
    planted = parcel.get("planted")
    harvest = parcel.get("harvest")
    if planted and harvest:
        season = (date.fromisoformat(str(harvest)) - date.fromisoformat(str(planted))).days
        season_basis = "planted to harvest dates in the contract"

    def seasonal(sf: tuple[float, float, float, str]) -> list[float]:
        pairs = ((EF_SEA[0], sf[0], sfp[0]), (EF_SEA[1], sf[1], sfp[1]), (EF_SEA[2], sf[2], sfp[2]))
        return [round(ef * w * pre * season, 1) for ef, w, pre in pairs]

    mid, lo, hi = seasonal(sfw)
    flooded = seasonal(SF_WATER["continuous"])
    return {
        "kg_ha": mid,
        "range_kg_ha": [lo, hi],
        "farm_kg": round(mid * area_ha, 1) if area_ha else None,
        "continuous_flooding_kg_ha": flooded[0],
        "saved_vs_flooding_kg_ha": round(flooded[0] - mid, 1),
        "regime": sfw[3],
        "season_days": season,
        "season_basis": season_basis,
        "factors": {"EFc": EF_SEA[0], "SFw": sfw[0], "SFp": sfp[0], "SFo": 1.0},
        "assumed": [sfp[3], "no organic amendment recorded, so SFo = 1"],
        "method": "EFi = EFc x SFw x SFp x SFo; season CH4 = EFi x days (IPCC Tier 1)",
        "range_note": "range multiplies the table error bounds, wider than a joint interval",
        "source": IPCC,
    }


IPCC_N2O = (
    "IPCC 2019 Refinement Vol. 4 Ch. 11, Tables 11.1 and 11.3 "
    "(ipcc-nggip.iges.or.jp/public/2019rf), fetched 2026-10-22"
)
FRAC_GAS = {"urea": 0.15, "synthetic": 0.11, "organic": 0.21}  # FracGASF / FracGASM
FRAC_LEACH_WET = 0.24  # FracLEACH-(H), wet climates
EF1_FLOODED_RICE = {"continuous": 0.003, "awd": 0.005, "single": 0.005}  # EF1FR
EF1_FR_DEFAULT = 0.004
EF4_WET, EF5 = 0.014, 0.011
ORGANIC_WORDS = ("compost", "manure", "azolla", "vermi", "bio", "organic", "green manure", "straw")


IPCC_UREA = (
    "IPCC 2006 Guidelines Vol. 4 Ch. 11 Eq. 11.13, EF 0.20 t C per t urea, -50 % uncertainty "
    "(no 2019 refinement), fetched 2026-10-22"
)
UREA_EF_C = 0.20
AR6_GWP100 = {"ch4": (27.0, 11.0), "n2o": (273.0, 130.0)}  # non-fossil CH4, Table 7.15
AR6 = "IPCC AR6 WG1 Ch. 7 Table 7.15, GWP-100 with uncertainty, fetched 2026-10-22"


def climate(ch4: Mapping[str, Any], n: Mapping[str, Any]) -> dict[str, Any]:
    """Season greenhouse gases per hectare as CO2-equivalent; a missing term is left out."""
    if ch4.get("kg_ha") is None:
        return {"co2e_kg_ha": None, "reason": ch4.get("reason") or "methane unknown", "source": AR6}
    gwp_ch4, d_ch4 = AR6_GWP100["ch4"]
    gwp_n2o, d_n2o = AR6_GWP100["n2o"]
    lo_ch4, hi_ch4 = ch4["range_kg_ha"]
    n2o = (n["n2o_direct_kg_n_ha"] + n["n2o_indirect_kg_n_ha"]) * 44 / 28
    terms = {
        "ch4": {
            "co2e_kg_ha": round(ch4["kg_ha"] * gwp_ch4, 1),
            "range": [lo_ch4 * (gwp_ch4 - d_ch4), hi_ch4 * (gwp_ch4 + d_ch4)],
            "basis": f"{ch4['kg_ha']} kg CH4 x GWP-100 {gwp_ch4}",
        },
        "n2o": {
            "co2e_kg_ha": round(n2o * gwp_n2o, 1),
            "range": [n2o * (gwp_n2o - d_n2o), n2o * (gwp_n2o + d_n2o)],
            "basis": f"{round(n2o, 3)} kg N2O (N2O-N x 44/28) x GWP-100 {gwp_n2o:g}",
        },
        "urea_co2": {
            "co2e_kg_ha": n["co2_urea_kg_ha"],
            "range": n["co2_urea_range_kg_ha"],
            "basis": "urea kg x 0.20 x 44/12",
        },
        "fuel": {
            "co2e_kg_ha": None,
            "reason": "fuel use is not logged for this farm",
            "basis": "IPCC 2006 Vol. 2 Table 1.4 diesel 74,100 kg CO2/TJ once litres are logged",
        },
    }
    if not n["applications"]:
        for key in ("n2o", "urea_co2"):
            terms[key] = {"co2e_kg_ha": None, "reason": "no fertiliser with a rate and N % logged"}
    known = [t for t in terms.values() if t["co2e_kg_ha"] is not None]
    for t in known:
        t["range"] = [round(float(v), 1) for v in t["range"]]
    return {
        "co2e_kg_ha": round(sum(t["co2e_kg_ha"] for t in known), 1),
        "range_kg_ha": [
            round(sum(t["range"][0] for t in known), 1),
            round(sum(t["range"][1] for t in known), 1),
        ],
        "terms": terms,
        "left_out": [k for k, t in terms.items() if t["co2e_kg_ha"] is None],
        "range_note": "sums each term's bounds; wider than a joint interval",
        "source": f"{AR6}; {IPCC_UREA}",
    }


def n_source(product: str) -> str:
    text = product.lower()
    if "urea" in text:
        return "urea"
    return "organic" if any(w in text for w in ORGANIC_WORDS) else "synthetic"


def nitrogen(records: Sequence[Mapping[str, Any]], regime: str | None) -> dict[str, Any]:
    """IPCC Tier 1 fate of the nitrogen the farm logged: lost to air, to water, and as N2O."""
    ef1 = EF1_FLOODED_RICE.get(_regime(regime) or "", EF1_FR_DEFAULT)
    rows, kept, skipped = [], [], 0
    for r in records:
        if r.get("kind") != "fertiliser":
            continue
        if r.get("rate") is None or r.get("n_pct") is None or r.get("rate_unit") != "kg/ha":
            skipped += 1
            continue
        kept.append(r)
        n = r["rate"] * r["n_pct"] / 100
        source = n_source(str(r.get("product") or ""))
        rows.append(
            {
                "applied_at": r["applied_at"],
                "product": r.get("product"),
                "source": source,
                "n_kg_ha": round(n, 2),
            }
        )
    urea = sum(float(r["rate"]) for r, x in zip(kept, rows, strict=True) if x["source"] == "urea")
    co2_urea = urea * UREA_EF_C * 44 / 12
    applied = sum(x["n_kg_ha"] for x in rows)
    gas = sum(x["n_kg_ha"] * FRAC_GAS[x["source"]] for x in rows)
    leach = applied * FRAC_LEACH_WET
    direct = applied * ef1
    return {
        "applied_kg_n_ha": round(applied, 1),
        "volatilised_kg_n_ha": round(gas, 1),
        "leached_kg_n_ha": round(leach, 1),
        "n2o_direct_kg_n_ha": round(direct, 2),
        "n2o_indirect_kg_n_ha": round(gas * EF4_WET + leach * EF5, 2),
        "remaining_kg_n_ha": round(applied - gas - leach - direct, 1),
        "remaining_means": "taken up by the crop or held in the soil; not measured",
        "urea_kg_ha": round(urea, 1),
        "co2_urea_kg_ha": round(co2_urea, 1),
        "co2_urea_range_kg_ha": [round(co2_urea * 0.5, 1), round(co2_urea, 1)],
        "co2_urea_source": IPCC_UREA,
        "applications": rows,
        "not_counted": skipped,
        "not_counted_reason": "fertiliser rows without a kg/ha rate or an N %" if skipped else None,
        "factors": {"EF1FR": ef1, "FracLEACH": FRAC_LEACH_WET, "EF4": EF4_WET, "EF5": EF5},
        "assumed": "wet climate (rain over 1,000 mm a year); source class from the product name",
        "source": IPCC_N2O,
    }


def farm_flows(farm_id: str) -> dict[str, Any]:
    current = live.build_live(farm_id)
    if current["status"] != "OK":
        return {"farm_id": farm_id, "status": current["status"], "missing": current["missing"]}
    loaded = live.load(farm_id)
    spec = loaded[1]["contract"] if loaded else None
    if spec is None:
        raise KeyError(farm_id)
    days = _days(current["hourly"])
    reports = {r["id"]: r for r in current.get("paddies") or []}
    inputs = [r for r in onboard._INPUTS.items("input") if r.get("farm_id") == farm_id]
    parcels = []
    for p in spec["parcels"]:
        hydro = contract.terms_for(spec, p["id"]).get("hydrology", {})
        report = reports.get(p["id"]) or {}
        p50 = (report.get("band") or {}).get("p50") or []
        levels = dict(zip(report.get("band_dates") or [], p50, strict=False))
        ch4 = methane(p, hydro.get("regime"), p.get("area_ha"))
        n = nitrogen([r for r in inputs if r.get("field") == p["id"]], hydro.get("regime"))
        parcels.append(
            {
                "id": p["id"],
                "stage": p.get("stage"),
                "water": water(p, days, hydro.get("percolation_mm_day"), levels),
                "methane": ch4,
                "nitrogen": n,
                "climate": climate(ch4, n),
            }
        )
    return {
        "farm_id": farm_id,
        "status": "OK",
        "days": [{"date": d["date"], "et0_mm": d["et0_mm"], "canopy": d["canopy"]} for d in days],
        "parcels": parcels,
        "sources": {
            "water": FAO56,
            "water_stress": FAO56_CH8,
            "methane": IPCC,
            "weather": current["weather"]["source"],
        },
        "provenance": "modelled",
    }
