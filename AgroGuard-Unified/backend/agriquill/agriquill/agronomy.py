from __future__ import annotations

import math

FAO56_SOURCE = "FAO Irrigation and Drainage Paper 56, chapters 3-4 (https://www.fao.org/4/x0490e/)"
SIGMA = 4.903e-9


def _es(t_c: float) -> float:
    return 0.6108 * math.exp(17.27 * t_c / (t_c + 237.3))


def extraterrestrial_radiation(latitude_rad: float, day_of_year: int) -> float:
    dr = 1 + 0.033 * math.cos(2 * math.pi * day_of_year / 365)
    decl = 0.409 * math.sin(2 * math.pi * day_of_year / 365 - 1.39)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(latitude_rad) * math.tan(decl))))
    return (
        24
        * 60
        / math.pi
        * 0.0820
        * dr
        * (
            ws * math.sin(latitude_rad) * math.sin(decl)
            + math.cos(latitude_rad) * math.cos(decl) * math.sin(ws)
        )
    )


def fao56_eto(
    tmax_c: float,
    tmin_c: float,
    rh_mean_pct: float,
    wind2_ms: float,
    solar_mj_m2_day: float,
    elevation_m: float = 0.0,
    latitude_rad: float = 0.0,
    day_of_year: int = 180,
    ea_kpa: float | None = None,
) -> float:
    tmean = (tmax_c + tmin_c) / 2.0
    es = (_es(tmax_c) + _es(tmin_c)) / 2.0
    ea = es * rh_mean_pct / 100.0 if ea_kpa is None else ea_kpa
    delta = 4098.0 * _es(tmean) / (tmean + 237.3) ** 2
    gamma = 0.000665 * 101.3 * ((293.0 - 0.0065 * elevation_m) / 293.0) ** 5.26
    ra = extraterrestrial_radiation(latitude_rad, day_of_year)
    rso = (0.75 + 2e-5 * elevation_m) * ra
    ratio = min(solar_mj_m2_day / rso, 1.0) if rso > 0 else 1.0
    rns = 0.77 * solar_mj_m2_day
    rnl = (
        SIGMA
        * ((tmax_c + 273.16) ** 4 + (tmin_c + 273.16) ** 4)
        / 2.0
        * (0.34 - 0.14 * math.sqrt(max(ea, 0.0)))
        * (1.35 * ratio - 0.35)
    )
    rn = rns - rnl
    u2 = max(wind2_ms, 0.0)
    num = 0.408 * delta * rn + gamma * 900.0 / (tmean + 273.0) * u2 * (es - ea)
    den = delta + gamma * (1.0 + 0.34 * u2)
    return round(max(num / den, 0.0), 3)


def crop_etc(eto_mm_day: float, kc: float) -> float:
    """ETc = Kc x ETo. Kc must come from versioned stage table (TO VERIFY locally)."""
    if kc <= 0:
        raise ValueError("Kc must be positive")
    return round(eto_mm_day * kc, 3)


RICE_KC = {"initial": 1.05, "mid": 1.20, "end": 0.75}
RICE_KC_SOURCE = (
    "FAO Irrigation and Drainage Paper 56, Table 12 (rice: Kc ini 1.05, mid 1.20, end 0.90-0.60; "
    "end taken as midpoint 0.75)"
)
STAGE_KC = {
    "Tillering": "initial",
    "Panicle Initiation": "mid",
    "Flowering": "mid",
    "Ripening": "end",
}


def awd_balance(
    depth0_cm: float,
    rain_mm: list[float],
    irrigation_mm: list[float],
    et0_mm: list[float],
    kc: float,
    percolation_mm_day: float,
) -> list[float]:
    if not len(rain_mm) == len(irrigation_mm) == len(et0_mm):
        raise ValueError("rain, irrigation and et0 must have the same length")
    depths = [round(depth0_cm, 2)]
    for rain, irr, et0 in zip(rain_mm, irrigation_mm, et0_mm, strict=True):
        delta_mm = rain + irr - crop_etc(et0, kc) - percolation_mm_day
        depths.append(round(depths[-1] + delta_mm / 10.0, 2))
    return depths


# Pinned AquaCrop adapter placeholder: sandboxed worker contract, no model bundled.
AQUACROP_PIN = {"model": "AquaCrop", "version": "7.3-python-TO VERIFY", "status": "UNPARAMETERIZED"}


def aquacrop_stub_info() -> dict[str, str]:
    return dict(AQUACROP_PIN)
