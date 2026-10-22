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
    out = flows.water({"stage": "Flowering"}, days, 3.0, {"2026-10-22": 2.0})
    first, second = out["days"]
    assert first["transpiration_mm"] == pytest.approx(1.15 * 4.0, abs=0.01)
    assert first["evaporation_bound"] == "ponded"
    assert second["evaporation_bound"].startswith("upper bound: water depth unknown")
    assert second["ks"] == {"value": None, "reason": "tube water depth unknown for this day"}
    assert out["total"]["percolation_mm"] == 6.0
    out_mm = out["total"]["transpiration_mm"] + out["total"]["evaporation_mm"] + 6.0
    assert out["net_mm"] == pytest.approx(round(10.0 - out_mm, 1))
    assert {m["field"] for m in out["unknown"]} == {
        "irrigation_mm",
        "seepage_mm",
        "runoff_mm",
        "theta_fc_wp",
    }


def dry_days(n, et0=5.0):
    return [
        {
            "date": f"2026-10-{i + 1:02d}",
            "rain_mm": 0.0,
            "et0_mm": et0,
            "u2_ms": 2.0,
            "rh_min_pct": 45.0,
        }
        for i in range(n)
    ]


def test_flooded_or_saturated_field_has_no_water_stress():
    days = dry_days(2)
    out = flows.water({"stage": "Flowering"}, days, None, {"2026-10-01": 0.0, "2026-10-02": 4.0})
    assert [d["ks"]["value"] for d in out["days"]] == [1.0, 1.0]
    assert out["days"][0]["ks"]["basis"] == flows.SATURATED
    assert out["days"][0]["transpiration_mm"] == pytest.approx(1.15 * 5.0, abs=0.01)
    assert out["ks"]["value"] == 1.0 and out["ks"]["reason"] is None
    assert out["ks"]["source"] == flows.FAO56_CH8


def test_dry_field_without_soil_limits_leaves_ks_null_and_transpiration_an_upper_bound():
    days = dry_days(2)
    out = flows.water({"stage": "Flowering"}, days, None, {"2026-10-01": 2.0, "2026-10-02": -10.0})
    drying = out["days"][1]
    assert drying["ks"] == {"value": None, "reason": "soil water limits unknown"}
    assert drying["transpiration_bound"].startswith("upper bound: no water stress applied")
    assert drying["transpiration_mm"] == pytest.approx(1.15 * 5.0, abs=0.01)
    assert out["ks"]["value"] is None and out["ks"]["reason"] == "soil water limits unknown"
    assert out["ks"]["inputs"]["theta_fc"] is None
    assert out["ks"]["inputs"]["tube_level_cm"]["2026-10-02"] == -10.0


def test_ks_follows_fao56_eq_82_to_84():
    taw = flows.taw_mm(0.40, 0.20, 1.0)
    assert taw == pytest.approx(200.0)
    assert flows.ks(30.0, taw, 0.20) == 1.0
    assert flows.ks(40.0, taw, 0.20) == 1.0
    assert flows.ks(120.0, taw, 0.20) == pytest.approx(80 / 160)
    assert flows.ks(200.0, taw, 0.20) == 0.0


def test_root_zone_balance_cuts_transpiration_once_depletion_passes_raw():
    days = dry_days(9)
    levels = {d["date"]: -5.0 for d in days} | {"2026-10-01": 2.0}
    soil = {"theta_fc": 0.40, "theta_wp": 0.20, "source": "test profile"}
    out = flows.water({"stage": "Flowering"}, days, None, levels, soil)
    coeff = flows.dual_kc(1.15, 2.0, 45.0, flows.RICE_HEIGHT_M)
    use = coeff["kc"] * 5.0
    eighth, ninth = out["days"][7], out["days"][8]
    assert eighth["ks"]["depletion_mm"] == pytest.approx(round(6 * use, 1))
    assert eighth["ks"]["value"] == 1.0 and eighth["ks"]["raw_mm"] == 40.0
    expected = (200 - 7 * use) / (200 - 40)
    assert ninth["ks"]["value"] == pytest.approx(round(expected, 3))
    assert ninth["transpiration_mm"] == pytest.approx(round(expected * 1.15 * 5.0, 2))
    assert ninth["transpiration_bound"].startswith("lower bound")
    assert out["ks"]["value"] == ninth["ks"]["value"]
    assert "theta_fc_wp" not in {m["field"] for m in out["unknown"]}


def test_root_zone_balance_needs_a_flooded_day_to_start_from():
    soil = {"theta_fc": 0.40, "theta_wp": 0.20}
    out = flows.water({"stage": "Flowering"}, dry_days(1), None, {"2026-10-01": -5.0}, soil)
    assert out["days"][0]["ks"]["value"] is None
    assert out["ks"]["reason"].startswith("no flooded day")


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


def test_urea_releases_its_carbon_as_co2_by_ipcc_eq_11_13():
    out = flows.nitrogen([fert("Urea 46%", 100, 46), fert("Compost", 1000, 1.5)], "AWD_SAFE")
    assert out["urea_kg_ha"] == 100
    assert out["co2_urea_kg_ha"] == pytest.approx(round(100 * 0.20 * 44 / 12, 1))
    assert out["co2_urea_range_kg_ha"] == [round(100 * 0.10 * 44 / 12, 1), out["co2_urea_kg_ha"]]


def test_co2_equivalent_uses_ar6_gwp100_and_keeps_unlogged_fuel_out():
    ch4 = flows.methane({"planted": None}, "AWD_SAFE", 2.0)
    n = flows.nitrogen([fert("Urea 46%", 100, 46)], "AWD_SAFE")
    out = flows.climate(ch4, n)
    n2o_kg = (n["n2o_direct_kg_n_ha"] + n["n2o_indirect_kg_n_ha"]) * 44 / 28
    assert out["terms"]["ch4"]["co2e_kg_ha"] == pytest.approx(round(ch4["kg_ha"] * 27.0, 1))
    assert out["terms"]["n2o"]["co2e_kg_ha"] == pytest.approx(round(n2o_kg * 273, 1))
    assert (
        out["terms"]["fuel"]["co2e_kg_ha"] is None
        and "not logged" in out["terms"]["fuel"]["reason"]
    )
    known = [t["co2e_kg_ha"] for t in out["terms"].values() if t["co2e_kg_ha"] is not None]
    assert out["co2e_kg_ha"] == pytest.approx(round(sum(known), 1), abs=0.2)
    assert out["range_kg_ha"][0] < out["co2e_kg_ha"] < out["range_kg_ha"][1]


def test_unlogged_fertiliser_leaves_n2o_and_urea_out_instead_of_counting_zero():
    out = flows.climate(flows.methane({"planted": None}, "AWD_SAFE", 1.0), flows.nitrogen([], None))
    assert out["terms"]["n2o"]["co2e_kg_ha"] is None
    assert set(out["left_out"]) == {"n2o", "urea_co2", "fuel"}
    assert out["co2e_kg_ha"] == out["terms"]["ch4"]["co2e_kg_ha"]


def test_co2_equivalent_is_null_when_methane_is_unknown():
    out = flows.climate(flows.methane({}, "SOMETHING", 1.0), flows.nitrogen([], None))
    assert out["co2e_kg_ha"] is None and out["reason"]


def test_continuous_flooding_uses_its_own_direct_n2o_factor_and_bad_rows_are_counted_out():
    out = flows.nitrogen([fert("Ammonium sulphate", 100, 21), fert("Urea", 50, None)], "CONTINUOUS")
    assert out["factors"]["EF1FR"] == 0.003 and out["not_counted"] == 1
    assert out["applications"][0]["source"] == "synthetic"
    assert flows.nitrogen([fert("Urea", 1, 46, unit="L/ha")], None)["not_counted"] == 1
