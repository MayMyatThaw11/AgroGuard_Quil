import pytest

from agriquill import flows


def test_dual_kc_at_mid_season_matches_the_fao56_single_kc_for_rice():
    mid = flows.dual_kc(flows.RICE_KCB["mid"], u2=2.0, rh_min=45.0, height_m=flows.RICE_HEIGHT_M)
    assert mid["kc_max"] == pytest.approx(1.20, abs=1e-3)
    assert mid["kc"] == pytest.approx(1.20, abs=1e-3)
    assert mid["ke"] == pytest.approx(0.05, abs=1e-3)


def test_kc_max_never_falls_below_kcb_plus_005_and_rises_with_wind_and_dry_air():
    assert flows.kc_max(1.15, u2=0.5, rh_min=90, height_m=1.0) == pytest.approx(1.20)
    assert flows.kc_max(1.0, u2=4.0, rh_min=30, height_m=1.0) > flows.kc_max(1.0, 2.0, 45, 1.0)


def test_drier_soil_cuts_evaporation_through_kr():
    wet = flows.dual_kc(1.0, 2.0, 45.0, 1.0, kr=1.0)
    dry = flows.dual_kc(1.0, 2.0, 45.0, 1.0, kr=0.2)
    assert dry["ke"] < wet["ke"] and dry["kcb"] == wet["kcb"]


def test_wind_at_10_m_is_reduced_to_2_m_by_fao56_eq_47():
    assert flows.u2_from_u10(1.0) == pytest.approx(0.748, abs=1e-3)


def test_vpd_and_wet_hours_follow_fao56_vapour_pressure():
    out = flows.canopy([{"t": 30.0, "rh": 60.0}, {"t": 25.0, "rh": 95.0}])
    assert out["vpd_kpa_max"] == pytest.approx(4.243 * 0.4, abs=0.01)
    assert out["wet_hours"] == 1


def test_awd_methane_uses_the_southeast_asia_tier1_factors():
    out = flows.methane({"planted": None}, "AWD_SAFE", 2.0)
    assert out["factors"] == {"EFc": 1.22, "SFw": 0.55, "SFp": 1.0, "SFo": 1.0}
    assert out["kg_ha"] == pytest.approx(round(1.22 * 0.55 * 102, 1))
    assert out["continuous_flooding_kg_ha"] == pytest.approx(round(1.22 * 102, 1))
    assert out["saved_vs_flooding_kg_ha"] > 0 and out["farm_kg"] == pytest.approx(out["kg_ha"] * 2)
    assert out["range_kg_ha"][0] < out["kg_ha"] < out["range_kg_ha"][1]


def test_contract_dates_set_the_season_and_unknown_regimes_stay_null():
    dated = flows.methane({"planted": "2026-06-01", "harvest": "2026-09-29"}, "CONTINUOUS", None)
    assert dated["season_days"] == 120 and dated["farm_kg"] is None
    assert flows.methane({}, "SOMETHING", 1.0)["kg_ha"] is None


def test_water_terms_split_et_and_keep_unmeasured_terms_null():
    days = [
        {"date": "2026-10-22", "rain_mm": 10.0, "et0_mm": 4.0, "u2_ms": 2.0, "rh_min_pct": 45.0},
        {"date": "2026-10-23", "rain_mm": 0.0, "et0_mm": 5.0, "u2_ms": 2.0, "rh_min_pct": 45.0},
    ]
    out = flows.water({"stage": "Flowering"}, days, 3.0, {"2026-10-22": True})
    first, second = out["days"]
    assert first["transpiration_mm"] == pytest.approx(1.15 * 4.0, abs=0.01)
    assert first["evaporation_bound"] == "ponded"
    assert second["evaporation_bound"].startswith("upper bound: water depth unknown")
    assert out["total"]["percolation_mm"] == 6.0
    out_mm = out["total"]["transpiration_mm"] + out["total"]["evaporation_mm"] + 6.0
    assert out["net_mm"] == pytest.approx(round(10.0 - out_mm, 1))
    assert {m["field"] for m in out["unknown"]} == {"irrigation_mm", "seepage_mm", "runoff_mm"}


def fert(product, rate, n_pct, unit="kg/ha"):
    return {
        "kind": "fertiliser",
        "product": product,
        "rate": rate,
        "n_pct": n_pct,
        "rate_unit": unit,
        "applied_at": "2026-07-01T08:00:00+06:30",
    }


def test_logged_nitrogen_follows_the_ipcc_tier1_fractions():
    out = flows.nitrogen(
        [fert("Urea 46%", 100, 46), fert("Cow manure compost", 1000, 1.5)], "AWD_SAFE"
    )
    assert out["applied_kg_n_ha"] == 61.0
    assert out["volatilised_kg_n_ha"] == pytest.approx(round(46 * 0.15 + 15 * 0.21, 1))
    assert out["leached_kg_n_ha"] == pytest.approx(round(61 * 0.24, 1))
    assert out["n2o_direct_kg_n_ha"] == pytest.approx(round(61 * 0.005, 2))
    assert out["factors"]["EF1FR"] == 0.005


def test_continuous_flooding_uses_its_own_direct_n2o_factor_and_bad_rows_are_counted_out():
    out = flows.nitrogen([fert("Ammonium sulphate", 100, 21), fert("Urea", 50, None)], "CONTINUOUS")
    assert out["factors"]["EF1FR"] == 0.003 and out["not_counted"] == 1
    assert out["applications"][0]["source"] == "synthetic"
    assert flows.nitrogen([fert("Urea", 1, 46, unit="L/ha")], None)["not_counted"] == 1
