"""NASA POWER climate + SoilGrids pH lookups, and the /location-weather endpoint built on them.

All HTTP is mocked: these tests never reach NASA or ISRIC.
"""

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services import climate

pytestmark = pytest.mark.asyncio


def _nasa(t2m=28.1, rain=3.38, rh=68.4) -> dict:
    return {
        "properties": {
            "parameter": {
                "T2M": {"ANN": t2m},
                "PRECTOTCORR": {"ANN": rain},
                "RH2M": {"ANN": rh},
            }
        }
    }


def _soil(*means) -> dict:
    depths = [{"label": f"d{i}", "values": {"mean": m}} for i, m in enumerate(means)]
    return {"properties": {"layers": [{"name": "phh2o", "depths": depths}]}}


@pytest.fixture(autouse=True)
def _fresh_state(monkeypatch):
    climate._cache.clear()
    monkeypatch.setattr(climate, "SOIL_MIN_GAP_S", 0)  # don't slow the tests
    yield
    climate._cache.clear()


def _mock_http(monkeypatch, handler) -> list[httpx.Request]:
    seen: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    monkeypatch.setattr(
        climate,
        "_client",
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )
    return seen


async def test_climate_converts_nasa_daily_rain_to_annual_mm(monkeypatch) -> None:
    seen = _mock_http(monkeypatch, lambda r: httpx.Response(200, json=_nasa(28.07, 3.38, 68.43)))
    result = await climate.fetch_climate(16.87, 96.19)
    assert result == climate.Climate(temperature_c=28.1, rainfall_annual_mm=1235, humidity_pct=68)
    assert seen[0].url.params["parameters"] == "T2M,PRECTOTCORR,RH2M"
    assert seen[0].url.params["latitude"] == "16.8700"


async def test_climate_is_cached_per_grid_cell(monkeypatch) -> None:
    seen = _mock_http(monkeypatch, lambda r: httpx.Response(200, json=_nasa()))
    await climate.fetch_climate(16.87, 96.19)
    await climate.fetch_climate(16.80, 96.21)  # same 0.25 degree cell
    assert len(seen) == 1


async def test_climate_rejects_nasa_fill_values(monkeypatch) -> None:
    _mock_http(monkeypatch, lambda r: httpx.Response(200, json=_nasa(-999, -999, -999)))
    with pytest.raises(climate.ClimateUnavailableError):
        await climate.fetch_climate(0.0, -30.0)


async def test_climate_reports_nasa_outage(monkeypatch) -> None:
    _mock_http(monkeypatch, lambda r: httpx.Response(503))
    with pytest.raises(climate.ClimateUnavailableError):
        await climate.fetch_climate(16.87, 96.19)


async def test_soil_ph_averages_depths_and_scales_by_ten(monkeypatch) -> None:
    _mock_http(monkeypatch, lambda r: httpx.Response(200, json=_soil(61, 62, 63)))
    soil = await climate.fetch_soil_ph(17.07, 96.2)
    assert soil is not None and soil.value == 6.2


async def test_soil_ph_retries_nearby_when_point_has_no_data(monkeypatch) -> None:
    answers = iter([_soil(None, None, None), _soil(None, None, None), _soil(58, 60, 62)])
    seen = _mock_http(monkeypatch, lambda r: httpx.Response(200, json=next(answers)))
    soil = await climate.fetch_soil_ph(21.95, 96.08)
    assert soil is not None and soil.value == 6.0
    assert len(seen) == 3
    assert seen[0].url.params["lat"] != seen[1].url.params["lat"] or (
        seen[0].url.params["lon"] != seen[1].url.params["lon"]
    )


async def test_soil_ph_gives_up_and_remembers_when_no_data_anywhere(monkeypatch) -> None:
    seen = _mock_http(monkeypatch, lambda r: httpx.Response(200, json=_soil(None, None, None)))
    assert await climate.fetch_soil_ph(61.19, -149.91) is None
    calls = len(seen)
    assert calls == len(climate.SOIL_OFFSETS_DEG)
    assert await climate.fetch_soil_ph(61.19, -149.91) is None
    assert len(seen) == calls  # the miss was cached


async def test_soil_ph_failure_is_not_cached(monkeypatch) -> None:
    state = {"up": False}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_soil(61, 61, 61)) if state["up"] else httpx.Response(429)

    _mock_http(monkeypatch, handler)
    assert await climate.fetch_soil_ph(16.6, 95.6) is None  # rate limited
    state["up"] = True
    soil = await climate.fetch_soil_ph(16.6, 95.6)
    assert soil is not None and soil.value == 6.1


# ── the endpoint ──────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def api():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


def _patch_lookups(monkeypatch, climate_value, soil_value):
    from app.services import weather

    async def fake_climate(lat, lon):
        if isinstance(climate_value, Exception):
            raise climate_value
        return climate_value

    async def fake_soil(lat, lon):
        return soil_value

    monkeypatch.setattr(weather, "fetch_climate", fake_climate)
    monkeypatch.setattr(weather, "fetch_soil_ph", fake_soil)


YANGON = climate.Climate(temperature_c=28.1, rainfall_annual_mm=1235, humidity_pct=68)


async def test_endpoint_inside_myanmar_uses_soilgrids_ph(monkeypatch, api) -> None:
    _patch_lookups(monkeypatch, YANGON, climate.SoilPh(6.2))
    response = await api.post(
        "/api/v1/location-weather", json={"latitude": 16.87, "longitude": 96.19}
    )
    body = response.json()
    assert response.status_code == 200
    assert body["region"]["in_myanmar"] is True
    assert body["region"]["name_en"] == "Yangon Region"
    assert body["current"]["rainfall_annual_mm"] == 1235
    assert body["current"]["soil_pH_estimate"] == 6.2
    assert body["current"]["soil_ph_source"] == "soilgrids"
    assert body["current"]["rainfall_7d_mm"] == pytest.approx(1235 / 52.18, abs=0.1)


async def test_endpoint_falls_back_to_regional_ph_inside_myanmar(monkeypatch, api) -> None:
    _patch_lookups(monkeypatch, YANGON, None)
    body = (
        await api.post("/api/v1/location-weather", json={"latitude": 16.87, "longitude": 96.19})
    ).json()
    assert body["current"]["soil_ph_source"] == "regional_estimate"
    assert body["current"]["soil_pH_estimate"] == 6.2


async def test_endpoint_outside_myanmar_has_no_made_up_region_or_ph(monkeypatch, api) -> None:
    cold = climate.Climate(temperature_c=1.9, rainfall_annual_mm=822, humidity_pct=86)
    _patch_lookups(monkeypatch, cold, None)
    body = (
        await api.post(
            "/api/v1/location-weather", json={"latitude": 61.1953, "longitude": -149.914}
        )
    ).json()
    assert body["region"] == {
        "name_en": "Outside Myanmar",
        "name_my": "မြန်မာနိုင်ငံပြင်ပ",
        "in_myanmar": False,
    }
    assert body["current"]["soil_pH_estimate"] is None
    assert body["current"]["soil_ph_source"] == "unavailable"
    assert body["current"]["temperature_c"] == 1.9


async def test_endpoint_reports_502_when_nasa_is_down(monkeypatch, api) -> None:
    _patch_lookups(
        monkeypatch, climate.ClimateUnavailableError("NASA POWER is not reachable right now."), None
    )
    response = await api.post(
        "/api/v1/location-weather", json={"latitude": 16.87, "longitude": 96.19}
    )
    assert response.status_code == 502
    assert "NASA POWER" in response.json()["detail"]
