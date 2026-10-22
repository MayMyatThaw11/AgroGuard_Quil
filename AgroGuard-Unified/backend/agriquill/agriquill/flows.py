from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any

from . import contract, live
from .agronomy import STAGE_KC
from .store import missing

FAO56 = "FAO-56 (fao.org/4/x0490e), Table 17 Kcb, Eq. 47, 71, 72, 75, 76; fetched 2026-10-22"
# Table 17, rice: Kcb ini 1.00, mid 1.15, end 0.70-0.45 (end taken as the midpoint).
RICE_KCB = {"initial": 1.00, "mid": 1.15, "end": 0.575}
RICE_HEIGHT_M = 1.0  # Table 12 maximum crop height for rice
KC_MIN = 0.15  # FAO-56 Eq. 76 guidance for bare-soil Kc under typical conditions
WET_RH_PCT = 90.0  # leaf-wetness proxy threshold, TO VERIFY against a local blast model

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


def water(
    parcel: Mapping[str, Any],
    days: Sequence[Mapping[str, Any]],
    perc: float | None,
    ponded: Mapping[str, bool],
) -> dict[str, Any]:
    kcb = RICE_KCB[STAGE_KC.get(str(parcel.get("stage") or ""), "mid")]
    rows = []
    for day in days:
        wet = ponded.get(day["date"])
        coeff = dual_kc(kcb, day["u2_ms"], day["rh_min_pct"], RICE_HEIGHT_M)
        rows.append(
            {
                "date": day["date"],
                "rain_mm": day["rain_mm"],
                "transpiration_mm": round(coeff["kcb"] * day["et0_mm"], 2),
                "evaporation_mm": round(coeff["ke"] * day["et0_mm"], 2),
                "evaporation_bound": "ponded"
                if wet
                else "upper bound: water depth unknown, wet surface assumed"
                if wet is None
                else "upper bound: drying soil not modelled",
                "percolation_mm": perc,
                "kc": coeff,
            }
        )
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
        ],
        "method": "rain in; T = Kcb x ET0, E = Ke x ET0 (FAO-56 dual Kc); contract percolation",
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
    parcels = []
    for p in spec["parcels"]:
        hydro = contract.terms_for(spec, p["id"]).get("hydrology", {})
        report = reports.get(p["id"]) or {}
        p50 = (report.get("band") or {}).get("p50") or []
        ponded = dict(zip(report.get("band_dates") or [], [v > 0 for v in p50], strict=False))
        parcels.append(
            {
                "id": p["id"],
                "stage": p.get("stage"),
                "water": water(p, days, hydro.get("percolation_mm_day"), ponded),
                "methane": methane(p, hydro.get("regime"), p.get("area_ha")),
            }
        )
    return {
        "farm_id": farm_id,
        "status": "OK",
        "days": [{"date": d["date"], "et0_mm": d["et0_mm"], "canopy": d["canopy"]} for d in days],
        "parcels": parcels,
        "sources": {"water": FAO56, "methane": IPCC, "weather": current["weather"]["source"]},
        "provenance": "modelled",
    }
