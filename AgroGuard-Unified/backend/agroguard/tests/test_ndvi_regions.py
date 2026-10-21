"""NDVI regions, district outlines and the NDVI-vs-weather correlation. NASA POWER is mocked."""

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services import agriculture_data as ad
from app.services import climate

pytestmark = pytest.mark.asyncio


def test_every_ndvi_region_has_names_a_level_and_a_centre():
    regions = ad.ndvi_regions()
    assert len(regions) == 94
    for region in regions:
        assert region["name_en"] and region["name_my"], region["PCODE"]
        assert region["level"] in ("state", "district")
        assert -90 < region["latitude"] < 90 and -180 < region["longitude"] < 180
    states = {r["PCODE"] for r in regions if r["level"] == "state"}
    assert all(r["state_pcode"] in states for r in regions if r["level"] == "district")


def test_boundaries_are_small_named_districts():
    boundaries = ad.ndvi_boundaries()
    assert len(boundaries["features"]) == 80
    feature = boundaries["features"][0]
    assert feature["properties"]["name_en"] != feature["properties"]["PCODE"]
    assert feature["geometry"]["type"] in ("Polygon", "MultiPolygon")
    assert ad.DATA_DIR.joinpath("mmr_districts.geojson").stat().st_size < 1_000_000


def _monthly_nasa(rain_for, temp_for, start=2021, end=2026) -> dict:
    rain, temp = {}, {}
    for year in range(start, end + 1):
        for month in range(1, 13):
            stamp = f"{year}{month:02d}"
            rain[stamp] = rain_for(month)
            temp[stamp] = temp_for(month)
        rain[f"{year}13"] = 3.0  # NASA's annual summary row must be ignored
        temp[f"{year}13"] = 25.0
    return {"properties": {"parameter": {"PRECTOTCORR": rain, "T2M": temp}}}


@pytest.fixture(autouse=True)
def _fresh_cache():
    climate._cache.clear()
    yield
    climate._cache.clear()


def _mock_nasa(monkeypatch, payload, status=200):
    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=payload)

    monkeypatch.setattr(
        climate,
        "_client",
        lambda timeout: httpx.AsyncClient(transport=httpx.MockTransport(respond), timeout=timeout),
    )


async def _get(pcode: str) -> httpx.Response:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        return await client.get(
            "/api/v1/analytics/ndvi-environment-correlation", params={"pcode": pcode}
        )


async def test_correlation_pairs_months_and_reports_two_factors(monkeypatch):
    # rainfall that follows the wet season (June to October), flat temperature
    wet = lambda m: 10.0 if 6 <= m <= 10 else 1.0  # noqa: E731
    _mock_nasa(monkeypatch, _monthly_nasa(wet, lambda m: 27.0))
    response = await _get("MMR010")
    assert response.status_code == 200
    body = response.json()
    assert set(body["correlations"]) == {"rainfall_mm", "temperature_c"}
    assert body["sample_count"] >= 24
    assert all(c is None or -1 <= c <= 1 for c in body["correlations"].values())
    assert body["correlations"]["temperature_c"] is None  # a flat series has no correlation
    assert "NASA POWER" in body["source"]


async def test_unknown_region_and_nasa_outage_are_clear_errors(monkeypatch):
    assert (await _get("MMR999")).status_code == 404
    _mock_nasa(monkeypatch, {}, status=503)
    assert (await _get("MMR010")).status_code == 502


async def test_regions_endpoint_serves_names():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        response = await client.get("/api/v1/analytics/ndvi-regions")
        outlines = await client.get("/api/v1/analytics/ndvi-boundaries")
    assert response.status_code == 200 and outlines.status_code == 200
    assert {"PCODE", "name_en", "name_my", "level"} <= set(response.json()[0])
