import pytest

from agriquill import waterplan


def test_trench_volume_and_surface() -> None:
    t = waterplan.trench_geometry(length_m=100, top_w_m=2.0, depth_m=0.5)
    assert t["bottom_w_m"] == 1.0
    assert t["volume_m3"] == 75.0
    assert t["surface_m2"] == 200.0


def test_trench_rejects_a_slope_that_closes_the_bottom() -> None:
    with pytest.raises(ValueError, match="bottom"):
        waterplan.trench_geometry(length_m=50, top_w_m=1.0, depth_m=1.0)


def test_trench_share_never_beyond_ten_percent_of_the_field() -> None:
    plan = waterplan.size_trench(area_ha=1.0, perimeter_m=400, share=0.08, depth_m=0.6)
    assert plan["surface_m2"] <= 1000
    assert plan["share"] == pytest.approx(0.08, abs=0.005)
    with pytest.raises(ValueError, match="share"):
        waterplan.size_trench(area_ha=1.0, perimeter_m=400, share=0.2, depth_m=0.6)


def test_open_water_evaporation_follows_fao56_open_water_kc() -> None:
    assert waterplan.evaporation_mm(5.0) == pytest.approx(5.25)


def test_level_falls_by_evaporation_plus_seepage_and_rises_with_rain() -> None:
    days = [{"date": f"2026-11-{d:02d}", "rain_mm": 0.0, "et0_mm": 5.0} for d in range(1, 11)]
    run = waterplan.simulate_level(days, start_cm=60.0, seep_mm_day=2.0)
    assert run[-1]["level_cm"] == pytest.approx(60.0 - 10 * 0.725, abs=1e-6)
    days[4]["rain_mm"] = 40.0
    wet = waterplan.simulate_level(days, start_cm=60.0, seep_mm_day=2.0)
    assert wet[-1]["level_cm"] > run[-1]["level_cm"] + 3.9


def test_level_never_goes_below_zero_and_overflow_is_capped() -> None:
    dry = waterplan.simulate_level(
        [{"date": "d", "rain_mm": 0.0, "et0_mm": 9.0}] * 30, start_cm=5.0, seep_mm_day=3.0
    )
    assert min(r["level_cm"] for r in dry) == 0.0
    flood = waterplan.simulate_level(
        [{"date": "d", "rain_mm": 300.0, "et0_mm": 1.0}],
        start_cm=60.0,
        seep_mm_day=1.0,
        full_cm=70.0,
    )
    assert flood[0]["level_cm"] == 70.0 and flood[0]["spill_mm"] > 0


def test_first_below_names_the_date_and_refill_volume() -> None:
    days = [{"date": f"2026-11-{d:02d}", "rain_mm": 0.0, "et0_mm": 6.0} for d in range(1, 29)]
    run = waterplan.simulate_level(days, start_cm=50.0, seep_mm_day=3.0)
    hit = waterplan.first_below(run, 30.0)
    assert hit is not None and hit["date"] == "2026-11-22"
    assert waterplan.refill_m3(run[-1]["level_cm"], 50.0, surface_m2=400.0) == pytest.approx(
        (50.0 - run[-1]["level_cm"]) / 100 * 400, abs=1e-6
    )
    assert waterplan.first_below(run[:5], 30.0) is None


def test_hazen_williams_head_loss_matches_the_hand_calculation() -> None:
    assert waterplan.hazen_williams_loss_m(
        q_l_s=10, length_m=100, d_mm=100, c=140
    ) == pytest.approx(1.67, abs=0.03)


def test_pipe_size_takes_the_smallest_diameter_inside_velocity_and_loss_limits() -> None:
    pipe = waterplan.pipe_size(q_l_s=10, length_m=100, max_loss_m=2.0, material="hdpe")
    assert pipe["d_mm"] == 110
    assert pipe["velocity_m_s"] <= 1.5 and pipe["loss_m"] <= 2.0
    smaller = waterplan.pipe_size(q_l_s=2, length_m=50, max_loss_m=3.0, material="pvc")
    assert smaller["d_mm"] < pipe["d_mm"]
    with pytest.raises(ValueError, match="no standard"):
        waterplan.pipe_size(q_l_s=400, length_m=1000, max_loss_m=1.0, material="pvc")


def test_pump_power_is_rho_g_q_h_over_efficiency() -> None:
    assert waterplan.pump_kw(q_l_s=10, head_m=12, efficiency=0.6) == pytest.approx(1.962, abs=0.001)


def test_refill_days_from_pump_flow_and_daily_hours() -> None:
    assert waterplan.refill_days(volume_m3=72.0, pump_l_s=5.0, hours_per_day=4.0) == pytest.approx(
        1.0
    )
    assert waterplan.refill_days(volume_m3=0.0, pump_l_s=5.0, hours_per_day=4.0) == 0.0
