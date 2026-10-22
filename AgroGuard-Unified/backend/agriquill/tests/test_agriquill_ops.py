from datetime import date

import numpy as np
from fastapi.testclient import TestClient

from agriquill import crops, farmers, forecast
from agriquill.api.main import create_app

client = TestClient(create_app())

HISTORY_DAYS = 60
HORIZON = 10


def _weather(days: int, seed: int) -> tuple[list[float], list[float]]:
    rng = np.random.default_rng(seed)
    rain = np.where(rng.random(days) < 0.25, rng.gamma(2.0, 9.0, days), 0.0)
    temp = 27 + 2 * np.sin(np.arange(days) / 5) + rng.normal(0, 0.4, days)
    return rain.round(2).tolist(), temp.round(2).tolist()


def _depth(rain: list[float], start: float, seed: int) -> list[float]:
    rng = np.random.default_rng(seed)
    level = start
    out = []
    for r in rain:
        level = level - 0.9 + 0.085 * r + rng.normal(0, 0.15)
        if level < -15:
            level = 5.0
        level = min(level, 8.0)
        out.append(round(level, 2))
    return out


def _series(count: int = 4) -> tuple[list[forecast.SeriesInput], list[float], list[float]]:
    rain, temp = _weather(HISTORY_DAYS + HORIZON, seed=1)
    series = [
        forecast.SeriesInput(f"pd_{i}", _depth(rain, 4.0 - i * 3, seed=10 + i)[:HISTORY_DAYS])
        for i in range(count)
    ]
    return series, rain, temp


def test_forecast_is_deterministic_with_ordered_quantiles():
    series, rain, temp = _series()
    args = (series, rain[:HISTORY_DAYS], temp[:HISTORY_DAYS], rain[HISTORY_DAYS:])
    first = forecast.forecast(*args)
    second = forecast.forecast(*args)
    assert first["method"] in {
        forecast.PERSISTENCE,
        forecast.DAMPED_TREND,
        forecast.WATER_BALANCE,
        forecast.HYBRID,
    }
    assert first["series"] == second["series"]
    for band in first["series"].values():
        assert len(band["p50"]) == HORIZON
        assert all(
            lo <= mid <= hi
            for lo, mid, hi in zip(band["p10"], band["p50"], band["p90"], strict=True)
        )


def test_forecast_beats_persistence_on_drying_paddies():
    series, rain, temp = _series(6)
    out = forecast.forecast(series, rain[:HISTORY_DAYS], temp[:HISTORY_DAYS], rain[HISTORY_DAYS:])
    assert out["backtest"]["skill_vs_persistence"] > 0


def test_water_balance_recovers_rain_gain_and_masks_irrigation():
    series, rain, temp = _series(6)
    out = forecast.forecast(series, rain[:HISTORY_DAYS], temp[:HISTORY_DAYS], rain[HISTORY_DAYS:])
    assert abs(out["physics"]["rain_gain_cm_per_mm"] - 0.085) < 0.02
    assert abs(out["physics"]["mean_daily_loss_cm"] - 0.9) < 0.15
    events = forecast.management_events(
        np.asarray(series[0].target), np.asarray(rain[:HISTORY_DAYS])
    )
    assert events.any()


def test_neural_residual_candidate_competes_when_data_is_sufficient():
    series, rain, temp = _series(6)
    cfg = forecast.ForecastConfig(min_neural_windows=20, epochs=40)
    out = forecast.forecast(
        series, rain[:HISTORY_DAYS], temp[:HISTORY_DAYS], rain[HISTORY_DAYS:], cfg
    )
    assert forecast.HYBRID in out["backtest"]["candidates"]
    assert out["backtest"]["neural_candidate"] == "scored"
    assert out["method"] == min(
        out["backtest"]["candidates"], key=out["backtest"]["candidates"].get
    )


def test_band_coverage_counts_readings_inside_p10_p90():
    band = {"p10": [0.0, 0.0, 0.0], "p50": [1.0, 1.0, 1.0], "p90": [2.0, 2.0, 2.0]}
    assert forecast.inside_band(band, np.asarray([1.0, 2.0, 2.5])) == 2


def test_every_backtest_candidate_reports_band_coverage_as_x_of_n():
    series, rain, temp = _series(6)
    cfg = forecast.ForecastConfig(min_neural_windows=20, epochs=40)
    out = forecast.forecast(
        series, rain[:HISTORY_DAYS], temp[:HISTORY_DAYS], rain[HISTORY_DAYS:], cfg
    )
    coverage = out["backtest"]["band_coverage"]
    assert set(coverage) == set(out["backtest"]["candidates"])
    expected_n = out["backtest"]["series_scored"] * HORIZON
    for entry in coverage.values():
        assert entry["n"] == expected_n and 0 <= entry["inside"] <= entry["n"]
    assert out["backtest"]["coverage"] == coverage[out["method"]]
    assert out["backtest"]["coverage_shown"] == (expected_n >= forecast.MIN_COVERAGE_N)


def test_interval_score_is_width_plus_scaled_misses():
    band = {"p10": [0.0, 0.0], "p50": [1.0, 1.0], "p90": [2.0, 2.0]}
    inside = forecast.interval_score(band, np.asarray([1.0, 1.5]))
    assert inside == 2.0
    missed = forecast.interval_score(band, np.asarray([3.0, -1.0]))
    assert missed == 2.0 + (2 / 0.2) * 1.0


def test_pinball_loss_penalises_each_quantile_asymmetrically():
    import torch

    pred = torch.tensor([[[0.0, 0.0, 0.0]]])
    truth = torch.tensor([[1.0]])
    loss = forecast.pinball_loss(pred, truth).item()
    assert abs(loss - (0.1 + 0.5 + 0.9) / 3) < 1e-6


def test_quantile_heads_run_in_shadow_and_promote_only_on_the_plan_rule():
    series, rain, temp = _series(6)
    cfg = forecast.ForecastConfig(min_neural_windows=20, epochs=40)
    out = forecast.forecast(
        series, rain[:HISTORY_DAYS], temp[:HISTORY_DAYS], rain[HISTORY_DAYS:], cfg
    )
    shadow = out["backtest"]["quantile_heads"]
    assert shadow["pairs"] == out["backtest"]["series_scored"] * HORIZON
    rule = (
        shadow["pairs"] >= forecast.MIN_PROMOTION_PAIRS
        and shadow["interval_score"] < shadow["mc_interval_score"]
        and abs(shadow["coverage"] - 0.8) < abs(shadow["mc_coverage"] - 0.8)
    )
    assert shadow["promoted"] is rule
    assert set(out["backtest"]["interval_score"]) == set(out["backtest"]["candidates"])
    for band in out["series"].values():
        assert all(
            a <= b <= c for a, b, c in zip(band["p10"], band["p50"], band["p90"], strict=True)
        )


def test_forecast_falls_back_on_short_history():
    out = forecast.forecast(
        [forecast.SeriesInput("pd", [5, 4, 3, 2, 1, 0, -1, -2])],
        [0.0] * 8,
        [27.0] * 8,
        [0.0] * 5,
        forecast.ForecastConfig(horizon=5),
    )
    assert out["method"] == forecast.METHOD_FALLBACK
    assert out["series"]["pd"]["p50"][0] < -2


def _calm_weather(days: int, wind: float = 2.0) -> list[farmers.WeatherDay]:
    return [farmers.WeatherDay(0.0, 30.0, 70.0, wind) for _ in range(days)]


def _paddy(stage: str = "Tillering", depth_now: float = -8.0) -> farmers.PaddyState:
    return farmers.PaddyState("PD-01", "rice_lowland", stage, 40, 0.8, [depth_now] * 20, [0.7] * 20)


ASSETS = [
    farmers.Asset("P-01", "pump", "Intake pump", "off", ("PD-01",)),
    farmers.Asset("S-01", "sluice", "Outlet", "closed", ("PD-01",)),
    farmers.Asset("D-01", "drone", "Drone", "standby"),
    farmers.Asset("T-01", "tractor", "Tractor", "idle"),
]


def test_water_steward_proposes_reflood_with_human_approval():
    band = {"p10": [-12, -15, -18], "p50": [-10, -13, -16], "p90": [-8, -11, -14]}
    out = farmers.plan_operations(
        [_paddy()], {"PD-01": band}, _calm_weather(3), ASSETS, date(2026, 10, 10)
    )
    task = next(t for t in out["tasks"] if t["agent"] == "water_steward")
    assert task["actuation"] == {"target": "irrigation_valve", "command": "open"}
    assert task["requires_human_approval"] is True
    assert task["day_offset"] == 1
    assert task["asset_id"] == "P-01"


def test_water_steward_holds_pump_when_rain_is_coming():
    band = {"p10": [-14, -16, -17], "p50": [-12, -15, -16], "p90": [-10, -13, -14]}
    weather = [farmers.WeatherDay(25.0, 27.0, 85.0, 2.0)] + _calm_weather(2)
    out = farmers.plan_operations([_paddy()], {"PD-01": band}, weather, ASSETS, date(2026, 10, 10))
    task = next(t for t in out["tasks"] if t["agent"] == "water_steward")
    assert task["actuation"] is None
    assert "Hold" in task["title"]


def test_drone_is_grounded_when_every_day_exceeds_wind_ceiling():
    humid = [farmers.WeatherDay(1.0, 24.0, 95.0, 7.5) for _ in range(4)]
    band = {"p10": [0] * 4, "p50": [1] * 4, "p90": [2] * 4}
    out = farmers.plan_operations(
        [_paddy(depth_now=1.0)],
        {"PD-01": band},
        humid,
        ASSETS,
        date(2026, 10, 10),
        standard="ASEAN_ORGANIC_ASOA",
    )
    drone = next(t for t in out["tasks"] if t["agent"] == "drone_pilot")
    assert drone["blocked_reason"] == "REJECTED_WIND_EXCEEDED"
    assert drone["actuation"] is None
    pest = next(t for t in out["tasks"] if t["agent"] == "pest_watcher")
    assert "synthetic_urea" in pest["detail"]


def test_pest_watcher_resolves_the_asoa_alias():
    humid = [farmers.WeatherDay(1.0, 24.0, 95.0, 2.0) for _ in range(4)]
    band = {"p10": [0] * 4, "p50": [1] * 4, "p90": [2] * 4}
    args = ([_paddy(depth_now=1.0)], {"PD-01": band}, humid, ASSETS, date(2026, 10, 10))
    for standard in ("ASOA_ORGANIC", "ASOA_ORGANIC_V2"):
        out = farmers.plan_operations(*args, standard=standard)
        pest = next(t for t in out["tasks"] if t["agent"] == "pest_watcher")
        assert "synthetic_urea" in pest["detail"]
    plain = farmers.plan_operations(*args, standard=None)
    pest = next(t for t in plain["tasks"] if t["agent"] == "pest_watcher")
    assert "do not use" not in pest["detail"]


def test_reflood_without_a_pump_says_so_and_stays_a_proposal():
    band = {"p10": [-12, -15, -18], "p50": [-10, -13, -16], "p90": [-8, -11, -14]}
    no_pump = [a for a in ASSETS if a.kind not in ("pump", "sluice")]
    out = farmers.plan_operations(
        [_paddy()], {"PD-01": band}, _calm_weather(3), no_pump, date(2026, 10, 10)
    )
    task = next(t for t in out["tasks"] if t["agent"] == "water_steward")
    assert task["asset_id"] is None
    assert "No pump is registered for PD-01" in task["detail"]
    assert "no pump registered for PD-01" in task["evidence"]
    assert task["requires_human_approval"] is True


def test_rice_is_listed_for_every_asean_country():
    for code in crops.ASEAN_COUNTRIES:
        ids = {c["id"] for c in crops.catalog(country=code)}
        assert "rice_lowland" in ids


def test_ops_crops_endpoint_filters_and_rejects_unknown_country():
    ok = client.get("/api/v1/agriquill/ops/crops", params={"country": "VN", "category": "orchard"})
    assert ok.status_code == 200
    assert {c["category"] for c in ok.json()["crops"]} == {"orchard"}
    bad = client.get("/api/v1/agriquill/ops/crops", params={"country": "US"})
    assert bad.status_code == 422


def _plan_body() -> dict:
    rain, temp = _weather(HISTORY_DAYS + HORIZON, seed=3)
    history = [
        {"rain_mm": r, "temp_c": t, "rh_pct": 80.0, "wind_ms": 3.0}
        for r, t in zip(rain[:HISTORY_DAYS], temp[:HISTORY_DAYS], strict=True)
    ]
    future = [
        {"rain_mm": r, "temp_c": t, "rh_pct": 92.0, "wind_ms": 3.0}
        for r, t in zip(rain[HISTORY_DAYS:], temp[HISTORY_DAYS:], strict=True)
    ]
    paddies = [
        {
            "id": f"PD-0{i}",
            "crop_id": "rice_lowland",
            "stage": "Tillering",
            "days_since_planting": 45,
            "area_ha": 0.6,
            "water_depth_cm": _depth(rain, 2.0 - i * 4, seed=i)[:HISTORY_DAYS],
            "ndvi": [0.7] * HISTORY_DAYS,
        }
        for i in range(1, 4)
    ]
    body = {
        "farm_id": "farm_demo",
        "country": "MM",
        "standard": "ASEAN_ORGANIC_ASOA",
        "start_date": "2026-10-10",
        "paddies": paddies,
        "weather_history": history,
        "weather_forecast": future,
        "assets": [{"id": "P-01", "kind": "pump", "label": "Intake pump", "status": "off"}],
    }
    return body


def test_ops_plan_endpoint_returns_forecast_and_crew_tasks():
    res = client.post("/api/v1/agriquill/ops/plan", json=_plan_body())
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["forecast"]["horizon_days"] == HORIZON
    assert set(data["forecast"]["series"]) == {"PD-01", "PD-02", "PD-03"}
    assert len(data["crew"]) == 5
    assert data["ledger_commit_hash"]
    assert all(t["requires_human_approval"] == (t["actuation"] is not None) for t in data["tasks"])


def test_ops_plan_fetches_the_rain_issued_at_the_cut_when_a_location_is_sent(monkeypatch):
    seen = {}

    def fake(lat, lon, cut, horizon, client=None):
        seen.update(lat=lat, lon=lon, cut=cut, horizon=horizon)
        return {"rain_mm": [2.0] * horizon, "source": "stub", "cut": cut.isoformat(), "missing": []}

    monkeypatch.setattr("agriquill.api.main.issued_rain", fake)
    body = {**_plan_body(), "lat": 16.7, "lon": 95.6}
    data = client.post("/api/v1/agriquill/ops/plan", json=body).json()
    assert seen["horizon"] == HORIZON and str(seen["cut"]) == "2026-09-29"
    assert data["forecast"]["issued_rain"] == {"source": "stub", "cut": "2026-09-29"}
    if data["forecast"]["backtest"]:
        assert data["forecast"]["backtest"]["backtest_rain"] == "forecast issued at the cut"


def test_ops_plan_keeps_observed_rain_and_says_why_when_issued_rain_is_missing(monkeypatch):
    gap = {
        "rain_mm": None,
        "missing": [{"field": "rain_mm", "reason": "previous runs unavailable"}],
    }
    monkeypatch.setattr("agriquill.api.main.issued_rain", lambda *a, **k: gap)
    body = {**_plan_body(), "lat": 16.7, "lon": 95.6}
    data = client.post("/api/v1/agriquill/ops/plan", json=body).json()
    assert data["forecast"]["issued_rain"] == {"missing": gap["missing"]}
    if data["forecast"]["backtest"]:
        assert data["forecast"]["backtest"]["backtest_rain"].startswith("observed, optimistic")


def test_ops_plan_without_a_location_or_with_sent_rain_does_not_call_the_weather_api(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("issued_rain must not be called")

    monkeypatch.setattr("agriquill.api.main.issued_rain", boom)
    assert client.post("/api/v1/agriquill/ops/plan", json=_plan_body()).status_code == 200
    sent = {**_plan_body(), "lat": 16.7, "lon": 95.6, "backtest_rain_issued": [1.0] * HORIZON}
    assert client.post("/api/v1/agriquill/ops/plan", json=sent).status_code == 200


def test_ops_plan_rejects_unknown_crop():
    body = {
        "farm_id": "f",
        "country": "TH",
        "start_date": "2026-10-10",
        "paddies": [
            {
                "id": "x",
                "crop_id": "wheat",
                "stage": "Tillering",
                "days_since_planting": 1,
                "area_ha": 1,
                "water_depth_cm": [0] * 7,
                "ndvi": [0.5] * 5,
            }
        ],
        "weather_history": [{"rain_mm": 0, "temp_c": 27, "rh_pct": 70, "wind_ms": 2}] * 7,
        "weather_forecast": [{"rain_mm": 0, "temp_c": 27, "rh_pct": 70, "wind_ms": 2}],
    }
    assert client.post("/api/v1/agriquill/ops/plan", json=body).status_code == 422


def test_harvest_planner_waits_for_maturity_and_dry_days():
    weather = [farmers.WeatherDay(0.0, 30.0, 70.0, 2.0) for _ in range(10)]
    weather[5] = farmers.WeatherDay(12.0, 27.0, 90.0, 2.0)
    mature = farmers.PaddyState(
        "PD-01", "rice_lowland", "Ripening", 114, 0.8, [-10.0] * 20, [0.5] * 20
    )
    young = farmers.PaddyState(
        "PD-02", "rice_lowland", "Ripening", 95, 0.8, [-10.0] * 20, [0.5] * 20
    )
    out = farmers.plan_operations([mature, young], {}, weather, ASSETS, date(2026, 10, 10))
    harvest = [t for t in out["tasks"] if t["agent"] == "harvest_planner"]
    assert len(harvest) == 1
    assert "PD-01" in harvest[0]["title"] and "PD-02" not in harvest[0]["title"]
    assert harvest[0]["day_offset"] == 6
    assert harvest[0]["asset_id"] == "T-01"


def test_thresholds_reject_unknown_keys_and_unsafe_wind_advisory():
    import pytest

    with pytest.raises(ValueError, match="unknown threshold"):
        farmers.resolve_thresholds({"made_up": 1.0})
    with pytest.raises(ValueError, match="hard ceiling"):
        farmers.resolve_thresholds({"spray_wind_advisory_ms": 9.0})
    resolved = farmers.resolve_thresholds({"awd_safe_depth_cm": -20.0})
    assert resolved["awd_safe_depth_cm"] == -20.0
    assert resolved["spray_wind_advisory_ms"] <= 5.5


def test_salinity_gate_closes_inlet_instead_of_reflooding():
    paddy = farmers.PaddyState(
        "PD-01", "rice_shrimp", "Tillering", 40, 0.8, [-12.0] * 20, [0.7] * 20, [1.2, 2.4, 4.1]
    )
    band = {"p10": [-14, -17, -19], "p50": [-13, -16, -18], "p90": [-12, -15, -17]}
    assets = [*ASSETS, farmers.Asset("S-02", "sluice", "Inlet sluice", "open", ("PD-01",))]
    out = farmers.plan_operations(
        [paddy], {"PD-01": band}, _calm_weather(3), assets, date(2026, 10, 10)
    )
    water = [t for t in out["tasks"] if t["agent"] == "water_steward"]
    assert len(water) == 1
    assert water[0]["actuation"] == {"target": "sluice_gate", "command": "close"}
    assert water[0]["requires_human_approval"] is True


def test_drone_prefers_day_inside_spray_advisory_band():
    humid = [farmers.WeatherDay(0.0, 24.0, 95.0, w) for w in (5.0, 5.0, 2.4, 2.0)]
    band = {"p10": [0] * 4, "p50": [1] * 4, "p90": [2] * 4}
    out = farmers.plan_operations(
        [_paddy(depth_now=1.0)], {"PD-01": band}, humid, ASSETS, date(2026, 10, 10)
    )
    drone = next(t for t in out["tasks"] if t["agent"] == "drone_pilot")
    assert drone["day_offset"] == 2
    assert drone["actuation"] == {"target": "drone", "command": "scout_flight"}


def test_ops_plan_rejects_unknown_threshold_override():
    body = {
        "farm_id": "f",
        "country": "TH",
        "start_date": "2026-10-10",
        "paddies": [
            {
                "id": "x",
                "crop_id": "rice_lowland",
                "stage": "Tillering",
                "days_since_planting": 30,
                "area_ha": 1,
                "water_depth_cm": [0] * 7,
                "ndvi": [0.5] * 5,
            }
        ],
        "weather_history": [{"rain_mm": 0, "temp_c": 27, "rh_pct": 70, "wind_ms": 2}] * 7,
        "weather_forecast": [{"rain_mm": 0, "temp_c": 27, "rh_pct": 70, "wind_ms": 2}],
        "threshold_overrides": {"not_a_threshold": 1},
    }
    assert client.post("/api/v1/agriquill/ops/plan", json=body).status_code == 422


def test_mcp_read_only_catalog_exposes_ops_tools_without_actuation():
    from agriquill.mcp.server import select_tools

    read_only = select_tools(allow_actuation=False)
    assert {"crop_catalog", "ops_plan_preview"} <= set(read_only)
    assert "lorawan_actuate" not in read_only
    assert "drone_spray_guard" not in read_only
    crops_out = read_only["crop_catalog"]["fn"]({"country": "VN", "category": "orchard"})
    assert {c["category"] for c in crops_out["crops"]} == {"orchard"}


def test_dsl_linter_and_actuation_gate_share_the_prohibited_list():
    from agriquill import dsl, safety

    script = 'standard: "ASOA_ORGANIC_V2"\nmaterial: paraquat\nspray: carbamate_insecticide'
    out = dsl.lint(script)
    codes = {(d["code"], d["line"]) for d in out["diagnostics"]}
    assert ("AGRI-E010", 2) in codes and ("AGRI-E010", 3) in codes
    assert (
        safety.prohibited_for("ASOA_ORGANIC_V2") == safety.PROHIBITED_INPUTS["ASEAN_ORGANIC_ASOA"]
    )
    usda = dsl.lint('standard: "USDA_NOP"\nspray: carbamate_insecticide')
    assert usda["is_valid"] is False, "7 CFR 205.105(a): synthetics not listed in 205.601"


def test_mcp_http_transport_refuses_actuation_tools():
    import pytest

    from agriquill.mcp.server import parse_args

    assert parse_args(["--transport", "http"]).port == 8765
    with pytest.raises(SystemExit):
        parse_args(["--transport", "http", "--allow-actuation"])
    assert parse_args(["--allow-actuation"]).allow_actuation is True
    assert parse_args(["--transport", "http", "--host", "::1"]).host == "::1"
    with pytest.raises(SystemExit):
        parse_args(["--transport", "http", "--host", "0.0.0.0"])
    assert parse_args(["--host", "0.0.0.0"]).transport == "stdio"


def test_stdio_schema_advertises_declared_inputs_for_actuation():
    from agriquill.mcp import tools

    props = tools.TOOLS["lorawan_actuate"]["input_schema"]["properties"]
    assert props["declared_inputs"] == {"type": "array", "items": {"type": "string"}}


def test_ops_plan_records_the_farm_location_and_rejects_half_a_location():
    url = "/api/v1/agriquill/ops/plan"
    where = {"lat": 16.7426, "lon": 95.5842}
    res = client.post(url, json={**_plan_body(), **where})
    assert res.status_code == 200, res.text
    assert res.json()["location"] == where
    last = client.get("/api/v1/agriquill/ledger").json()["entries"][-1]
    assert last["payload"]["location"] == where
    assert client.post(url, json=_plan_body()).json()["location"] is None
    assert client.post(url, json={**_plan_body(), "lat": 16.7}).status_code == 422
    assert client.post(url, json={**_plan_body(), "lat": 120, "lon": 95}).status_code == 422
