from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import sitecontext, store
from agriquill.api import main
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.data import weather

client = TestClient(create_app())

UNITS = {
    "time": "iso8601",
    "interval": "seconds",
    "temperature_2m": "°C",
    "relative_humidity_2m": "%",
    "precipitation": "mm",
    "rain": "mm",
    "weather_code": "wmo code",
    "cloud_cover": "%",
    "wind_speed_10m": "m/s",
    "wind_direction_10m": "°",
    "wind_gusts_10m": "m/s",
    "is_day": "",
    "visibility": "m",
}
NOW = {
    "time": "2026-10-24T10:30",
    "interval": 900,
    "temperature_2m": 29.1,
    "relative_humidity_2m": 78,
    "precipitation": 1.4,
    "rain": 1.4,
    "weather_code": 61,
    "cloud_cover": 90,
    "wind_speed_10m": 3.2,
    "wind_direction_10m": 215,
    "wind_gusts_10m": 6.8,
    "is_day": 1,
    "visibility": 8200.0,
}


def upstream(current: dict[str, Any] | None = None, units: dict[str, str] | None = None) -> dict:
    return {
        "latitude": 16.72,
        "longitude": 95.59,
        "elevation": 12.0,
        "timezone": "Asia/Yangon",
        "utc_offset_seconds": 23400,
        "current_units": units or UNITS,
        "current": current or NOW,
    }


def mock(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def ok(body: dict | None = None) -> httpx.Client:
    return mock(lambda request: httpx.Response(200, json=body or upstream()))


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


def test_current_conditions_come_back_in_metres_per_second_with_their_source():
    out = weather.fetch_current(16.72, 95.59, client=ok())
    assert out["provenance"] == "RETRIEVED"
    assert out["current"]["weather_code"] == 61
    assert out["current"]["wind_speed_10m"] == 3.2
    assert out["units"]["wind_speed_10m"] == "m/s"
    assert out["time"] == "2026-10-24T10:30"
    assert out["missing"] == []
    assert out["source"]["url"].startswith(get_settings().openmeteo_endpoint)
    assert "wind_speed_unit=ms" in out["source"]["url"]


def test_a_field_the_provider_leaves_out_is_null_with_a_reason():
    body = upstream(current={k: v for k, v in NOW.items() if k != "visibility"})
    out = weather.fetch_current(16.72, 95.59, client=ok(body))
    assert out["current"]["visibility"] is None
    assert [m["field"] for m in out["missing"]] == ["visibility"]
    assert out["missing"][0]["reason"]


def test_a_wind_reported_in_another_unit_is_refused_not_converted_by_guess():
    body = upstream(units={**UNITS, "wind_speed_10m": "km/h"})
    out = weather.fetch_current(16.72, 95.59, client=ok(body))
    assert out["current"] is None
    assert "wind_speed_10m" in out["missing"][0]["reason"]


def test_a_rate_limited_first_read_is_null_with_a_reason_never_a_fill():
    out = weather.fetch_current(
        16.72, 95.59, client=mock(lambda request: httpx.Response(429, json={"error": True}))
    )
    assert out["current"] is None
    assert out["source"] is None
    assert "Open-Meteo unavailable" in out["missing"][0]["reason"]


def test_a_failed_refresh_serves_the_last_good_reading_marked_stale():
    settings = get_settings()
    saved = settings.weather_now_ttl_s
    settings.weather_now_ttl_s = -1.0
    try:
        weather.fetch_current(16.72, 95.59, client=ok())
        out = weather.fetch_current(16.72, 95.59, client=mock(lambda request: httpx.Response(429)))
    finally:
        settings.weather_now_ttl_s = saved
    assert out["stale"] is True
    assert out["current"]["weather_code"] == 61
    assert "Open-Meteo unavailable" in out["stale_reason"]


def test_a_fresh_reading_is_not_fetched_twice():
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(200, json=upstream())

    weather.fetch_current(16.72, 95.59, client=mock(handler))
    out = weather.fetch_current(16.72, 95.59, client=mock(handler))
    assert len(calls) == 1 and out["stale"] is False


def test_the_weather_route_returns_the_envelope(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        main, "fetch_current", lambda lat, lon: weather.fetch_current(lat, lon, client=ok())
    )
    response = client.get("/api/v1/agriquill/weather/now", params={"lat": 16.72, "lon": 95.59})
    assert response.status_code == 200
    assert response.json()["current"]["temperature_2m"] == 29.1


@pytest.mark.parametrize("params", [{"lat": 91, "lon": 95}, {"lat": 16, "lon": 181}, {"lat": 16}])
def test_the_weather_route_rejects_a_bad_position(params: dict[str, float]):
    assert client.get("/api/v1/agriquill/weather/now", params=params).status_code == 422


def test_the_weather_route_needs_a_sign_in_when_the_server_has_a_token():
    settings = get_settings()
    settings.write_token = SecretStr("not-the-caller")
    response = client.get("/api/v1/agriquill/weather/now", params={"lat": 16.72, "lon": 95.59})
    assert response.status_code == 401


PACK = {
    "source_url": "https://example.test/gvp",
    "fetched_at": "2026-10-01T00:00:00+00:00",
    "sha256": "0" * 64,
    "box": {"south": -11.0, "north": 28.5, "west": 92.0, "east": 141.0, "margin_deg": 2.0},
    "volcanoes": [
        {"number": 264020, "name": "Agung", "lat": -8.342, "lon": 115.508},
        {"number": 263250, "name": "Merapi", "lat": -7.54, "lon": 110.446},
    ],
}


def test_the_nearest_volcano_is_found_without_any_outside_call(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(sitecontext, "load_volcanoes", lambda: PACK)
    response = client.get("/api/v1/agriquill/volcano/nearest", params={"lat": -8.37, "lon": 115.13})
    body = response.json()
    assert response.status_code == 200
    assert body["volcano"]["name"] == "Agung"
    assert body["km"] == pytest.approx(41.7, abs=0.6)
    assert body["source"]


def test_a_place_outside_the_packed_box_is_null_with_a_reason(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(sitecontext, "load_volcanoes", lambda: PACK)
    response = client.get("/api/v1/agriquill/volcano/nearest", params={"lat": 48.0, "lon": 2.0})
    body = response.json()
    assert body["volcano"] is None and body["km"] is None
    assert "outside" in body["missing"][0]["reason"]


def test_without_the_volcano_pack_the_answer_is_null_with_a_reason(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(sitecontext, "load_volcanoes", lambda: None)
    response = client.get("/api/v1/agriquill/volcano/nearest", params={"lat": -8.37, "lon": 115.13})
    body = response.json()
    assert response.status_code == 200
    assert body["volcano"] is None and body["km"] is None
    assert body["missing"][0]["reason"]
