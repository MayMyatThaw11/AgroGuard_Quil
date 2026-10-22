from datetime import date

import httpx
import numpy as np
import pytest

from agriquill import forecast
from agriquill.data import weather


def test_issued_rain_takes_lead_k_from_previous_day_k():
    def handler(request: httpx.Request) -> httpx.Response:
        times = [f"2026-10-{d:02d}T{h:02d}:00" for d in (11, 12) for h in range(24)]
        hourly = {
            "time": times,
            "precipitation_previous_day1": [1.0] * 24 + [9.0] * 24,
            "precipitation_previous_day2": [9.0] * 24 + [0.5] * 24,
        }
        return httpx.Response(200, json={"hourly": hourly})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    out = weather.issued_rain(16.7, 95.6, date(2026, 10, 10), 2, client)
    assert out["rain_mm"] == [24.0, 12.0]


def test_a_gap_in_the_issued_forecast_is_reported_not_filled():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"hourly": {"time": [], "precipitation_previous_day1": []}})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    out = weather.issued_rain(16.7, 95.6, date(2026, 10, 10), 1, client)
    assert out["rain_mm"] is None and "day-1" in out["missing"][0]["reason"]


def series(days: int) -> list[float]:
    return list(10 - 0.2 * np.arange(days))


def test_the_backtest_says_which_rain_it_used():
    rain, temp = [0.0] * 60, [30.0] * 60
    cfg = forecast.ForecastConfig(horizon=3)
    seen = forecast.forecast([forecast.SeriesInput("p", series(60))], rain, temp, [0, 0, 0], cfg)
    assert seen["backtest"]["backtest_rain"].startswith("observed, optimistic")
    fair = forecast.forecast(
        [forecast.SeriesInput("p", series(60))], rain, temp, [0, 0, 0], cfg, [5.0, 0.0, 0.0]
    )
    assert fair["backtest"]["backtest_rain"] == "forecast issued at the cut"
    with pytest.raises(ValueError, match="rain_issued"):
        forecast.forecast(
            [forecast.SeriesInput("p", series(60))], rain, temp, [0, 0, 0], cfg, [1.0]
        )
