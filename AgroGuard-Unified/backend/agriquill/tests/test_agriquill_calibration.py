import pytest

from agriquill import calibration

MEASURED = 4000.0
DRIFTING = [(3000.0, MEASURED), (3600.0, MEASURED), (4400.0, MEASURED)]
BIASED = [(2000.0, 4000.0), (2200.0, 4300.0), (1800.0, 3700.0)]


def test_the_factor_is_the_median_of_measured_over_engine():
    assert calibration.factor(DRIFTING) == pytest.approx(4000 / 3600)
    assert calibration.factor(BIASED) == pytest.approx(2.0)


def test_leave_one_out_error_matches_the_hand_computation():
    expected = (24.2424 + 0.9091 + 34.4444) / 3
    assert calibration.leave_one_out(DRIFTING) == pytest.approx(expected, abs=0.01)
    biased = (0.2525 + 3.7467 + 3.8080) / 3
    assert calibration.leave_one_out(BIASED) == pytest.approx(biased, abs=0.01)


def test_a_steady_bias_is_promoted_when_it_beats_the_raw_engine_and_the_baseline():
    out = calibration.calibrate(BIASED, baseline_mape=15.0)
    assert out["status"] == "promoted"
    assert out["factor"] == pytest.approx(2.0)
    assert out["raw_mape_pct"] > 50 and out["leave_one_out_mape_pct"] < 3


def test_a_drifting_engine_stays_in_shadow_because_calibrating_makes_it_worse():
    out = calibration.calibrate(DRIFTING, baseline_mape=15.0)
    assert out["status"] == "shadow"
    assert out["raw_mape_pct"] == pytest.approx(15.0, abs=0.01)
    assert out["leave_one_out_mape_pct"] > out["raw_mape_pct"]
    assert "raw engine" in out["reason"]


def test_calibration_that_does_not_beat_the_national_baseline_stays_in_shadow():
    out = calibration.calibrate(BIASED, baseline_mape=1.0)
    assert out["status"] == "shadow" and "national baseline" in out["reason"]


def test_fewer_than_three_seasons_gives_no_factor_and_says_why():
    out = calibration.calibrate(BIASED[:2], baseline_mape=15.0)
    assert out["status"] == "shadow" and out["factor"] is None
    assert out["pairs"] == 2 and "2 of 3" in out["reason"]


def test_an_engine_with_no_yield_is_left_out_not_counted_as_zero():
    out = calibration.calibrate([*BIASED, (0.0, 4000.0)], baseline_mape=15.0)
    assert out["pairs"] == 3 and out["status"] == "promoted"


def test_a_missing_baseline_blocks_promotion():
    out = calibration.calibrate(BIASED, baseline_mape=None)
    assert out["status"] == "shadow" and "baseline" in out["reason"]


def test_every_result_names_its_rule_and_basis():
    out = calibration.calibrate(BIASED, baseline_mape=15.0)
    assert "leave-one-out" in out["basis"] and "our rule" in out["rule"]
