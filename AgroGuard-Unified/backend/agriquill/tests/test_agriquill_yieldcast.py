import math

import numpy as np

from agriquill import yieldcast


def series(n=40, growth=0.02, noise=0.03, seed=1, start=1980):
    rng = np.random.default_rng(seed)
    logs = np.log(2000.0) + growth * np.arange(n) + rng.normal(0, noise, n)
    return {start + i: float(math.exp(v)) for i, v in enumerate(logs)}


def test_every_forecast_uses_only_earlier_years():
    data = {"AAA": series(), "BBB": series(seed=2, growth=0.01)}
    base = yieldcast.backtest(data, test_years=range(2010, 2020))
    changed = {k: dict(v) for k, v in data.items()}
    changed["AAA"][2019] *= 3
    moved = yieldcast.backtest(changed, test_years=range(2010, 2020))
    early = [p for p in base["pairs"] if p["year"] < 2019]
    assert early == [p for p in moved["pairs"] if p["year"] < 2019]


def test_a_steady_trend_is_caught_by_the_trend_and_missed_by_persistence():
    data = {"AAA": series(noise=0.0, growth=0.03), "BBB": series(noise=0.0, growth=0.02, seed=3)}
    out = yieldcast.backtest(data, test_years=range(2005, 2020))
    assert out["scores"]["linear_trend"]["mape_pct"] < 0.01
    assert out["scores"]["persistence"]["mape_pct"] > 1.0


def test_the_run_replicates_exactly_with_the_same_seed():
    data = {"AAA": series(), "BBB": series(seed=2)}
    a = yieldcast.backtest(data, test_years=range(2012, 2020))
    b = yieldcast.backtest(data, test_years=range(2012, 2020))
    assert a["scores"] == b["scores"] and a["data_sha256"] == b["data_sha256"]


def test_hit_rates_and_the_promotion_rule_are_reported_per_candidate():
    data = {"AAA": series(), "BBB": series(seed=2), "CCC": series(seed=4, growth=0.015)}
    out = yieldcast.backtest(data, test_years=range(2005, 2020))
    for score in out["scores"].values():
        assert set(score) >= {"mape_pct", "within_5_pct", "within_10_pct", "pairs"}
    assert out["baseline"] == "mean_5y" and out["chosen"] in out["scores"]
    assert out["pairs_total"] == 3 * 15


def test_persistence_check_counts_years_within_ten_percent():
    s = {2000 + i: 1000.0 for i in range(16)}
    s[2015] = 1200.0
    out = yieldcast.persistence_check(s)
    assert out["n"] == 15 and out["within_10"] == 14 and out["years"] == "2001-2015"
    assert yieldcast.persistence_check({2000: 1.0, 2001: 1.0}) is None


def test_short_series_are_left_out_with_a_reason():
    out = yieldcast.backtest({"AAA": series(n=8)}, test_years=range(1985, 1988))
    assert out["pairs_total"] == 0 and out["skipped"]["AAA"]
