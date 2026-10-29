import json
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.endpoints.market_prices import router, service_or_user
from app.core.config import get_settings
from app.services import regional_market, rtfp

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "rtfp_mmr_sample.json").read_text(encoding="utf-8"))
MARKET = {"mkt_name": "88 ward", "adm1_name": "Yangon", "lat": "16.85", "lon": "96.27"}


@pytest.fixture(autouse=True)
def clean_cache():
    rtfp.clear_cache()
    yield
    rtfp.clear_cache()


@pytest.fixture
def offline_rtfp(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(rtfp, "markets", lambda: [MARKET])
    monkeypatch.setattr(rtfp, "market_rows", lambda name: FIXTURE["data"])


def test_parse_fixture_rows() -> None:
    series = rtfp.parse(FIXTURE["data"], "onions")
    assert [p["month"] for p in series] == sorted(p["month"] for p in series)
    assert len(series) == 7
    assert all(p["close_mmk"] > 0 for p in series)


def test_trend_change_3m_pct() -> None:
    series = [{"month": f"2026-0{m}-01", "close_mmk": v} for m, v in [(1, 1000.0), (2, 1030.0), (3, 1060.0), (4, 1100.0)]]
    assert rtfp.change_pct(series, 3) == 10.0


def test_trend_uses_nearest_market(offline_rtfp) -> None:
    result = rtfp.trend("onion", 16.80, 96.20)
    assert result["status"] == "ok"
    assert result["market"] == "88 ward"
    assert result["latest_mmk_kg"] == rtfp.parse(FIXTURE["data"], "onions")[-1]["close_mmk"]
    assert result["provenance"] == "modelled"
    assert result["source"]["url"] == rtfp.RTFP_URL


def test_tomato_has_no_series(offline_rtfp) -> None:
    result = rtfp.trend("tomato", 16.8, 96.2)
    assert result["status"] == "missing"
    assert "tomato" in result["reason"]


def test_fetch_failure_returns_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(rtfp.httpx, "get", boom)
    result = rtfp.trend("onion", 16.8, 96.2)
    assert result["status"] == "missing"


def build(signed_in: bool) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    if signed_in:
        app.dependency_overrides[service_or_user] = lambda: None
    return TestClient(app)


def test_composition_prefers_fresh_measured_then_rtfp_then_unquoted(offline_rtfp, monkeypatch: pytest.MonkeyPatch) -> None:
    service = regional_market.RegionalMarketService()
    monkeypatch.setattr(regional_market, "regional_market_service", service)
    client = build(signed_in=True)

    service.ingest_raw_quote("Taunggyi", "Onion", 900.0, "tonne", "USD")
    measured = client.get("/api/v1/market/prices", params={"produce": "onion", "market": "Taunggyi", "lat": 20.78, "lon": 97.03}).json()
    assert measured["provenance"] == "measured"

    modelled = client.get("/api/v1/market/prices", params={"produce": "onion", "lat": 16.8, "lon": 96.2}).json()
    assert modelled["provenance"] == "modelled"

    nothing = client.get("/api/v1/market/prices", params={"produce": "tomato", "lat": 16.8, "lon": 96.2}).json()
    assert nothing["provenance"] == "unavailable"
    assert nothing["reason"]


def test_endpoint_requires_service_key_or_user(offline_rtfp, monkeypatch: pytest.MonkeyPatch) -> None:
    params = {"produce": "onion", "lat": 16.8, "lon": 96.2}
    assert build(signed_in=False).get("/api/v1/market/prices", params=params).status_code == 401
    forged = build(signed_in=False).get("/api/v1/market/prices", params=params, headers={"Authorization": "Bearer a.b.c"})
    assert forged.status_code == 401
    monkeypatch.setenv("AGROGUARD_INTERNAL_SERVICE_KEY", "k" * 32)
    get_settings.cache_clear()
    try:
        ok = build(signed_in=False).get("/api/v1/market/prices", params=params, headers={"X-Service-Key": "k" * 32})
        assert ok.status_code == 200
    finally:
        get_settings.cache_clear()
