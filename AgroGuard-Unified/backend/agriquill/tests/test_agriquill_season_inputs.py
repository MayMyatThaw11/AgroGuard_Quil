from collections.abc import Iterator
from datetime import date
from pathlib import Path

import httpx
import pytest
from aquacrop import Soil

from agriquill import live, season_inputs, store
from agriquill.config import get_settings
from agriquill.data import weather

NO_BOUNDARY = """farm farm_n {
    name: "No boundary farm"
    country: MM
    location: [16.73, 94.77]
}

parcel P1 {
    area: 1 ha
    crop: "rice"
}
"""


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def test_hydraulics_matches_an_independent_saxton_rawls_implementation():
    layer = {"sand_perc": 20.0, "clay_perc": 45.0, "soc_g_kg": 15.0}
    got = season_inputs.hydraulics(layer)
    om_pct = 15.0 / 10 * season_inputs.SOC_TO_OM
    wp, fc, sat, _ = Soil("Loam").calculate_soil_hydraulic_properties(0.20, 0.45, om_pct)
    assert abs(got["theta_wp"] - wp) <= 0.001
    assert abs(got["theta_fc"] - fc) <= 0.001
    assert abs(got["theta_sat"] - sat) <= 0.001
    assert got["theta_wp"] < got["theta_fc"] < got["theta_sat"]
    assert "Saxton" in got["source"]


def test_hydraulics_refuses_a_layer_without_texture():
    assert (
        season_inputs.hydraulics({"sand_perc": None, "clay_perc": 30.0, "soc_g_kg": 10.0}) is None
    )


def _daily(days: dict[str, list]) -> dict:
    return {
        "latitude": 16.73,
        "longitude": 94.77,
        "elevation": 4.0,
        "utc_offset_seconds": 23400,
        "daily_units": {
            "temperature_2m_max": "°C",
            "precipitation_sum": "mm",
            "shortwave_radiation_sum": "MJ/m²",
            "wind_speed_10m_mean": "m/s",
        },
        "daily": days,
    }


def test_fetch_archive_daily_parses_and_drops_null_days():
    body = _daily(
        {
            "time": ["2025-07-01", "2025-07-02", "2025-07-03"],
            "temperature_2m_max": [32.4, 29.5, 28.5],
            "temperature_2m_min": [25.2, 25.2, 25.0],
            "precipitation_sum": [12.8, 16.3, 31.1],
            "shortwave_radiation_sum": [22.26, None, 8.06],
            "et0_fao_evapotranspiration": [4.99, 2.51, 1.7],
            "wind_speed_10m_mean": [2.1, 3.0, 4.2],
            "relative_humidity_2m_min": [62, 80, 85],
            "relative_humidity_2m_max": [96, 98, 99],
        }
    )
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=body)))
    out = weather.fetch_archive_daily(16.73, 94.77, date(2025, 7, 1), date(2025, 7, 3), client)
    assert [d["date"] for d in out["days"]] == ["2025-07-01", "2025-07-03"]
    assert out["days"][0] == {
        "date": "2025-07-01",
        "tmax_c": 32.4,
        "tmin_c": 25.2,
        "rain_mm": 12.8,
        "srad_mj_m2": 22.26,
        "et0_mm": 4.99,
        "wind_ms": 2.1,
        "rh_min_pct": 62.0,
        "rh_max_pct": 96.0,
    }
    assert out["missing"] == [
        {"field": "weather_day", "reason": "2025-07-02: shortwave_radiation_sum null"}
    ]
    assert out["source"]["provider"] == weather.ARCHIVE_DAILY_PROVIDER


def test_fetch_archive_daily_failure_is_missing_not_raised():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503)))
    out = weather.fetch_archive_daily(16.73, 94.77, date(2025, 7, 1), date(2025, 7, 3), client)
    assert out["days"] == [] and out["source"] is None
    assert out["missing"][0]["field"] == "weather"


def test_site_inputs_without_boundary_uses_farm_location(monkeypatch):
    live.register("farm_n", NO_BOUNDARY, "Ann")
    seen = {}

    def daily(lat, lon, start, end, client=None):
        seen["daily"] = (lat, lon, start, end)
        return {"days": [], "missing": [], "source": None}

    monkeypatch.setattr(season_inputs.weather, "fetch_archive_daily", daily)
    monkeypatch.setattr(
        season_inputs.weather,
        "fetch_archive_hourly",
        lambda *a, **k: {"hourly": None, "missing": [], "source": None},
    )

    async def soil(lat, lon):
        return {
            "provider": "test",
            "layers": [{"depth": "0-5cm", "sand_perc": 20, "clay_perc": 45, "soc_g_kg": 15}],
        }

    monkeypatch.setattr(season_inputs, "fetch_soil", soil)
    out = season_inputs.site_inputs("farm_n", "P1", date(2025, 7, 1), 120)
    assert (out["lat"], out["lon"]) == (16.73, 94.77)
    assert out["location_basis"] == "farm location: no parcel boundary drawn"
    assert seen["daily"][2:] == (date(2025, 7, 1), date(2025, 10, 29))
    assert out["hydraulics"]["theta_fc"] > 0


def stub_site(monkeypatch: pytest.MonkeyPatch, soil_reply: dict) -> None:
    live.register("farm_n", NO_BOUNDARY, "Ann")

    async def soil(lat, lon):
        return soil_reply

    monkeypatch.setattr(season_inputs, "fetch_soil", soil)
    monkeypatch.setattr(
        season_inputs.weather,
        "fetch_archive_daily",
        lambda *a, **k: {"days": [], "missing": [], "source": None},
    )
    monkeypatch.setattr(
        season_inputs.weather,
        "fetch_archive_hourly",
        lambda *a, **k: {"hourly": None, "missing": [], "source": None},
    )


def test_a_borrowed_soil_cell_is_named_in_the_inputs(monkeypatch):
    note = {"distance_m": 250, "latitude": 16.7, "longitude": 94.8, "basis": "x"}
    stub_site(monkeypatch, {"provider": "test", "layers": [], "substituted": note})
    out = season_inputs.site_inputs("farm_n", "P1", date(2025, 7, 1), 120)
    assert "250 m" in out["soil_note"] and "TO VERIFY" in out["soil_note"]


def test_a_soil_cell_at_the_point_has_no_note(monkeypatch):
    stub_site(monkeypatch, {"provider": "test", "layers": []})
    assert season_inputs.site_inputs("farm_n", "P1", date(2025, 7, 1), 120)["soil_note"] is None
