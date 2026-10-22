import numpy as np

from agriquill import forecast


def test_the_split_conformal_radius_uses_the_finite_sample_rank():
    assert forecast.conformal_quantile([float(v) for v in range(1, 10)]) == 8.0
    assert forecast.conformal_quantile([1.0, 2.0, 3.0]) is None


def synthetic(paddies: int, horizon: int, band_half: float, seed: int = 7):
    rng = np.random.default_rng(seed)
    points = {i: np.zeros(horizon) for i in range(paddies)}
    actual = {i: rng.normal(0, 1, horizon) for i in range(paddies)}
    old = {i: {"p10": [-band_half] * horizon, "p90": [band_half] * horizon} for i in range(paddies)}
    return points, actual, old


def test_conformal_bands_reach_80_percent_where_a_too_narrow_band_does_not():
    out = forecast.conformal_check(*synthetic(80, 5, band_half=0.3))
    assert out["pairs"] == 200
    assert 0.7 <= out["coverage"] <= 0.9
    assert out["old_coverage"] < 0.5


def test_conformal_stays_in_shadow_without_enough_paddies():
    out = forecast.conformal_check(*synthetic(4, 5, band_half=0.3))
    assert out["status"] == "shadow" and out["pairs"] == 0
