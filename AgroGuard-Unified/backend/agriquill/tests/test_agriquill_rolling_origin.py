import numpy as np

from agriquill import forecast


def targets(days: int) -> list[np.ndarray]:
    return [10 - (0.2 + 0.05 * k) * np.arange(days, dtype=float) for k in range(3)]


def test_rolling_origins_pool_more_pairs_than_one_cut():
    cfg = forecast.ForecastConfig(horizon=5, window=10)
    rain = np.zeros(80)
    out = forecast.rolling_origins(targets(80), rain, cfg, origins=4)
    assert out["origins"] == 4
    assert out["pairs"] == 4 * 3 * 5
    assert set(out["mae"]) == {forecast.PERSISTENCE, forecast.DAMPED_TREND, forecast.WATER_BALANCE}
    assert [o["cut"] for o in out["per_origin"]] == [75, 70, 65, 60]


def test_older_origins_never_see_later_days():
    cfg = forecast.ForecastConfig(horizon=5, window=10)
    rain = np.zeros(80)
    base = forecast.rolling_origins(targets(80), rain, cfg, origins=4)
    changed = targets(80)
    for t in changed:
        t[75:] += 7.0
    moved = forecast.rolling_origins(changed, rain, cfg, origins=4)
    assert moved["per_origin"][0] != base["per_origin"][0]
    assert moved["per_origin"][1:] == base["per_origin"][1:]


def test_short_history_uses_only_the_origins_it_can_train():
    cfg = forecast.ForecastConfig(horizon=5, window=10)
    out = forecast.rolling_origins(targets(35), np.zeros(35), cfg, origins=4)
    assert out["origins"] == 3 and out["pairs"] == 3 * 3 * 5


def test_forecast_reports_the_rolling_origin_block():
    cfg = forecast.ForecastConfig(horizon=3)
    days = 70
    out = forecast.forecast(
        [forecast.SeriesInput("p", list(10 - 0.2 * np.arange(days)))],
        [0.0] * days,
        [30.0] * days,
        [0.0, 0.0, 0.0],
        cfg,
    )
    rolling = out["backtest"]["rolling_origin"]
    assert rolling["origins"] >= 2 and rolling["rain"].startswith("observed")
