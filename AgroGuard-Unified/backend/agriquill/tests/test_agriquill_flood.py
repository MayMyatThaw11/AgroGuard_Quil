import math
from datetime import date

import numpy as np
import pytest

from agriquill.data import flood


def test_gumbel_l_moments_recover_a_known_distribution():
    rng = np.random.default_rng(11)
    sample = rng.gumbel(loc=200.0, scale=40.0, size=4000).tolist()
    fit = flood.gumbel_fit(sample)
    assert fit is not None
    assert fit["xi"] == pytest.approx(200.0, rel=0.03)
    assert fit["alpha"] == pytest.approx(40.0, rel=0.05)
    q10 = 200.0 - 40.0 * math.log(-math.log(1 - 1 / 10))
    assert flood.return_level(fit, 10) == pytest.approx(q10, rel=0.03)


def test_fit_is_withheld_on_too_few_years():
    assert flood.gumbel_fit([100.0] * (flood.MIN_YEARS - 1)) is None


def test_annual_maxima_skip_years_with_too_many_gaps():
    times = [f"2020-{m:02d}-01" for m in range(1, 13)] + ["2021-01-01"]
    values = [float(m) for m in range(1, 13)] + [500.0]
    out = flood.annual_maxima(times, values, min_days=12)
    assert out == [{"year": 2020, "max": 12.0, "month": 12}]


def test_ensemble_chance_is_the_share_of_members_above_the_level():
    times = ["2026-10-22", "2026-10-23", "2026-10-24"]
    members = {
        "river_discharge": [1.0, 5.0, 2.0],
        "river_discharge_member01": [1.0, 1.0, 9.0],
        "river_discharge_member02": [1.0, 1.0, 1.0],
        "river_discharge_member03": [1.0, 1.0, 1.0],
    }
    out = flood.exceedance(times, members, 4.0)
    assert out["members"] == 4 and out["above"] == 2
    assert out["chance"] == 0.5
    assert out["first_date"] == "2026-10-23"
    assert flood.exceedance(times, members, 50.0)["first_date"] is None


def test_risk_levels_follow_the_chance_of_the_two_and_five_year_flows():
    assert flood.risk_level(0.6, 0.5) == "high"
    assert flood.risk_level(0.4, 0.1) == "watch"
    assert flood.risk_level(0.1, 0.0) == "low"
    assert flood.risk_level(None, None) == "unknown"


def test_early_harvest_only_when_the_crop_can_mature_before_the_flood():
    today = date(2026, 10, 22)
    near = flood.advice("high", "2026-11-05", date(2026, 7, 1), 120, today)
    assert near["action"] == "harvest_early"
    assert "2026-11-05" in near["text"] and "before that date" in near["text"]
    late = flood.advice("high", "2026-11-05", date(2026, 7, 10), 120, today)
    assert late["action"] == "harvest_early" and "2 days after" in late["text"]
    far = flood.advice("high", "2026-11-05", date(2026, 9, 20), 120, today)
    assert far["action"] == "protect"
    assert flood.advice("low", None, date(2026, 9, 20), 120, today)["action"] == "none"
    assert flood.advice("high", "2026-11-05", None, 120, today)["action"] == "protect"


def test_planting_window_clears_the_usual_peak_month():
    out = flood.planting_window([8, 8, 9, 8, 10, 8, 9], 120)
    assert out["peak_month"] == 8
    assert out["plant_by_month"] == 4


def test_elevation_is_reported_against_the_dem_error():
    near_sea = flood.sea_level([2.0, 2.0, 3.0])
    assert near_sea["mean_m"] == 2.3 and near_sea["within_dem_error"] is True
    high = flood.sea_level([40.0, 42.0])
    assert high["within_dem_error"] is False
    assert flood.sea_level([])["mean_m"] is None


def _cell(values: list[float | None], times: list[str]) -> dict:
    return {
        "latitude": 16.7,
        "longitude": 95.6,
        "daily": {"time": times, "river_discharge": values},
    }


def test_a_failed_refresh_serves_the_last_good_copy_and_says_so(monkeypatch: pytest.MonkeyPatch):
    import httpx

    from agriquill import store
    from agriquill.config import get_settings

    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    tmp = __import__("tempfile").mkdtemp()
    settings.data_dir, settings.ledger_path = tmp, f"{tmp}/ledger.jsonl"
    store.close_all()
    try:
        calls = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            calls["n"] += 1
            if calls["n"] == 1:
                return httpx.Response(200, json=[_cell([1.0], ["2026-10-22"])])
            return httpx.Response(429, json={"reason": "Minutely API request limit exceeded"})

        client = httpx.Client(transport=httpx.MockTransport(handler))
        out: dict = {"missing": []}
        first = flood._cached(client, "k", {}, -1.0, out)
        again = flood._cached(client, "k", {}, -1.0, out)
        assert first == again and calls["n"] == 2
        assert "rate limit" in out["missing"][0]["reason"]
        assert "showing data from" in out["missing"][0]["reason"]
        with pytest.raises(httpx.HTTPStatusError):
            flood._cached(client, "other", {}, -1.0, {"missing": []})
    finally:
        store.close_all()
        settings.data_dir, settings.ledger_path = saved
