import pytest

from agriquill import gates
from agriquill.agronomy import RICE_KC, awd_balance
from agriquill.safety import prohibited_for


def _hourly(n, wind=2.0, t=30.0, wet=25.0, rain=0.0):
    return {
        "time": [f"h{i}" for i in range(n)],
        "temperature_2m": [t] * n,
        "relative_humidity_2m": [60.0] * n,
        "wet_bulb_temperature_2m": [wet] * n,
        "precipitation": [rain] * n,
        "wind_speed_10m": [wind] * n,
    }


def test_stull_matches_psychrometric_check_value():
    assert gates.wet_bulb_stull(20.0, 50.0) == pytest.approx(13.7, abs=0.1)


def test_stull_outside_valid_range_is_none():
    assert gates.wet_bulb_stull(20.0, 2.0) is None


def test_delta_t_edges_are_inclusive():
    hourly = _hourly(10, t=30.0, wet=22.0)
    assert gates.hour_failure(hourly, 0, ("delta_t",), {"delta_t_c": (2.0, 8.0)}) is None
    hourly = _hourly(10, t=30.0, wet=21.9)
    assert gates.hour_failure(hourly, 0, ("delta_t",), {"delta_t_c": (2.0, 8.0)}).startswith(
        "delta_t"
    )
    hourly = _hourly(10, t=30.0, wet=28.5)
    assert "delta_t" in gates.hour_failure(hourly, 0, ("delta_t",), {"delta_t_c": (2.0, 8.0)})


def test_delta_t_falls_back_to_stull_without_wet_bulb():
    hourly = _hourly(3)
    hourly["wet_bulb_temperature_2m"] = [None] * 3
    assert gates.hour_delta_t(hourly, 0) is not None


def test_washout_blocks_rain_in_six_hours_after_application():
    hourly = _hourly(12)
    hourly["precipitation"][4] = 11.0
    mask = gates.window_mask(hourly, "spray", gates.DEFAULT_GATES, duration_h=1)
    assert mask[0] is not None and mask[0].startswith("washout")
    assert mask[4] is not None
    assert mask[5] is None


def test_washout_beyond_forecast_is_not_a_pass():
    mask = gates.window_mask(_hourly(8), "spray", gates.DEFAULT_GATES)
    assert mask[-1] is not None


def test_contract_cannot_relax_the_wind_ceiling():
    hourly = _hourly(10, wind=6.3)
    mask = gates.window_mask(hourly, "flight", {"max_wind_ms": 9.0})
    assert all(m and m.startswith("wind") for m in mask)


def test_missing_wind_blocks():
    hourly = _hourly(10)
    hourly["wind_speed_10m"][0] = None
    assert gates.window_mask(hourly, "flight", {})[0] == "wind:missing"


def test_nitrogen_cap():
    assert gates.nitrogen(70.0, 10.0, 85.0)["ok"] is True
    assert gates.nitrogen(80.0, 10.0, 85.0)["ok"] is False


def test_marginal_roi_without_evidence_is_null():
    result = gates.marginal_roi(None, 50.0, 1.5)
    assert result["ok"] is None and result["reason"]
    assert gates.marginal_roi(90.0, 50.0, 1.5)["ok"] is True


def test_awd_balance():
    assert awd_balance(-5.0, [0.0] * 2, [0.0] * 2, [0.0] * 2, 1.2, 0.0) == [-5.0, -5.0, -5.0]
    depths = awd_balance(0.0, [0.0], [0.0], [5.0], RICE_KC["mid"], 4.0)
    assert depths[-1] == pytest.approx(-1.0)


def test_asoa_organic_alias():
    assert "synthetic_urea" in prohibited_for("ASOA_ORGANIC")
