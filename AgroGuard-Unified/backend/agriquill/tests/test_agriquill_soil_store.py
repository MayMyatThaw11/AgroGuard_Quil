import asyncio
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest

from agriquill import store
from agriquill.config import get_settings
from agriquill.data import soil

PROPS = ["sand", "silt", "clay", "phh2o", "soc", "cec"]


def raw(mean: float | None = 300.0) -> dict[str, Any]:
    layers = [
        {
            "name": prop,
            "unit_measure": {"mapped_units": "g/kg"},
            "depths": [{"label": d, "values": {"mean": mean}} for d in soil.SOIL_DEPTHS],
        }
        for prop in PROPS
    ]
    return {"geometry": {"coordinates": [95.1, 17.1]}, "properties": {"layers": layers}}


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    soil._CACHE._store.clear()
    yield
    store.close_all()
    soil._CACHE._store.clear()
    settings.data_dir = saved


def serve(monkeypatch: pytest.MonkeyPatch, handler: Callable[[httpx.Request], httpx.Response]):
    calls: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return handler(request)

    monkeypatch.setattr(soil.obs, "TimedAsyncTransport", lambda name: httpx.MockTransport(respond))
    return calls


def down(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("soil service down", request=request)


def test_a_good_profile_survives_a_restart_and_an_outage(monkeypatch: pytest.MonkeyPatch):
    serve(monkeypatch, lambda request: httpx.Response(200, json=raw()))
    first = asyncio.run(soil.fetch_soil(17.1, 95.1))
    assert first["provider"] == "ISRIC_SoilGrids_2.0" and first["layers"]

    soil._CACHE._store.clear()
    serve(monkeypatch, down)
    again = asyncio.run(soil.fetch_soil(17.1, 95.1))
    assert again["layers"] == first["layers"]
    assert again["provider"] == "ISRIC_SoilGrids_2.0"
    assert again["from_store"] is True and again["retrieved_at"]


def test_a_stored_profile_is_used_without_asking_the_service_again(monkeypatch: pytest.MonkeyPatch):
    calls = serve(monkeypatch, lambda request: httpx.Response(200, json=raw()))
    asyncio.run(soil.fetch_soil(17.1, 95.1))
    soil._CACHE._store.clear()
    asyncio.run(soil.fetch_soil(17.1, 95.1))
    assert len(calls) == 1


def test_a_masked_point_is_not_stored_and_a_later_good_answer_is(monkeypatch: pytest.MonkeyPatch):
    serve(monkeypatch, lambda request: httpx.Response(200, json=raw(None)))
    masked = asyncio.run(soil.fetch_soil(17.1, 95.1))
    assert masked["provider"] == "unavailable" and masked["layers"] == []
    serve(monkeypatch, lambda request: httpx.Response(200, json=raw()))
    assert asyncio.run(soil.fetch_soil(17.1, 95.1))["layers"]


def test_an_outage_with_nothing_stored_still_invents_no_layers(monkeypatch: pytest.MonkeyPatch):
    serve(monkeypatch, down)
    out = asyncio.run(soil.fetch_soil(17.1, 95.1))
    assert out["provider"] == "unavailable" and out["layers"] == []


def test_a_stored_profile_belongs_to_its_own_point(monkeypatch: pytest.MonkeyPatch):
    serve(monkeypatch, lambda request: httpx.Response(200, json=raw()))
    asyncio.run(soil.fetch_soil(17.1, 95.1))
    soil._CACHE._store.clear()
    serve(monkeypatch, down)
    other = asyncio.run(soil.fetch_soil(10.0, 105.0))
    assert other["provider"] == "unavailable"


def masked_below(north_of: float):
    def handler(request: httpx.Request) -> httpx.Response:
        lat = float(request.url.params["lat"])
        return httpx.Response(200, json=raw(300.0 if lat > north_of else None))

    return handler


def test_a_masked_point_borrows_the_nearest_valid_cell_and_says_so(monkeypatch: pytest.MonkeyPatch):
    calls = serve(monkeypatch, masked_below(17.1 + 0.002))
    out = asyncio.run(soil.fetch_soil(17.1, 95.1))
    assert out["provider"] == "ISRIC_SoilGrids_2.0" and out["layers"]
    assert out["substituted"]["distance_m"] == 250
    assert "TO VERIFY" in out["substituted"]["basis"]
    assert abs(out["substituted"]["latitude"] - 17.1) > 0.002
    assert len(calls) <= 1 + 8


def test_a_valid_point_is_not_substituted(monkeypatch: pytest.MonkeyPatch):
    serve(monkeypatch, lambda request: httpx.Response(200, json=raw()))
    assert "substituted" not in asyncio.run(soil.fetch_soil(17.1, 95.1))


def test_nothing_valid_within_the_search_radius_says_how_far_it_looked(
    monkeypatch: pytest.MonkeyPatch,
):
    serve(monkeypatch, lambda request: httpx.Response(200, json=raw(None)))
    out = asyncio.run(soil.fetch_soil(17.1, 95.1))
    assert out["provider"] == "unavailable" and out["layers"] == []
    assert "within 750 m" in out["missing"][0]["reason"]


def test_a_borrowed_profile_is_stored_for_the_original_point(monkeypatch: pytest.MonkeyPatch):
    serve(monkeypatch, masked_below(17.1 + 0.002))
    asyncio.run(soil.fetch_soil(17.1, 95.1))
    soil._CACHE._store.clear()
    serve(monkeypatch, down)
    again = asyncio.run(soil.fetch_soil(17.1, 95.1))
    assert (
        again["layers"]
        and again["from_store"] is True
        and again["substituted"]["distance_m"] == 250
    )
