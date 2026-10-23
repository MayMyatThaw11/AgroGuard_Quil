import json
import math
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from agriquill import sitecontext, store
from agriquill.api.main import create_app
from agriquill.config import get_settings

client = TestClient(create_app())
SQUARE = [[16.7, 95.6], [16.7, 95.61], [16.71, 95.61], [16.71, 95.6], [16.7, 95.6]]


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    sitecontext._HOT.clear()
    for breaker in sitecontext._BREAKERS.values():
        breaker.reset()
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def spec(*parcels: dict[str, Any]) -> dict[str, Any]:
    return {"farm": {"location": [16.72, 95.59]}, "parcels": list(parcels)}


def archive(start: date, days: int, tmax: Any) -> dict[str, list[Any]]:
    time = [(start + timedelta(days=i)).isoformat() for i in range(days)]
    return {
        "time": time,
        "temperature_2m_max": [tmax(d) for d in time],
        "temperature_2m_mean": [27.0] * days,
        "precipitation_sum": [5.0] * days,
        "et0_fao_evapotranspiration": [4.0] * days,
        "shortwave_radiation_sum": [18.0] * days,
    }


def test_ring_sampling_uses_every_distinct_corner_and_their_mean():
    other = [[16.8, 95.7], [16.8, 95.71], [16.81, 95.7], [16.8, 95.7]]
    pts = sitecontext.sample_points(spec({"boundary": SQUARE}, {"boundary": other}))
    assert len(pts["ring"]) == 7
    assert pts["centroid"] == pytest.approx((16.7471, 95.6471), abs=1e-4)
    assert "7 boundary corners" in pts["basis"]


def test_without_a_boundary_the_farm_point_is_used_and_says_so():
    pts = sitecontext.sample_points(spec({"id": "p1"}))
    assert pts["ring"] == [] and pts["centroid"] == (16.72, 95.59)
    assert "no spread" in pts["basis"]


def test_a_large_ring_is_thinned_to_the_elevation_api_limit():
    ring = [[16.7 + i * 1e-4, 95.6] for i in range(300)]
    pts = sitecontext.sample_points(spec({"boundary": ring}))
    assert len(pts["ring"]) == sitecontext.MAX_POINTS


def test_volcano_distance_on_a_known_point_matches_the_pack():
    pack = sitecontext.load_volcanoes()
    assert pack is not None, "run job gvp_volcano_sync to build the pack"
    popa = next(v for v in pack["volcanoes"] if v["number"] == 275080)
    assert popa["name"] == "Popa" and pack["source_url"].startswith(sitecontext.GVP_WFS)
    hit = sitecontext.nearest_volcano([(popa["lat"], popa["lon"] - 0.1)], pack)
    assert hit["volcano"]["number"] == 275080
    assert hit["km"] == pytest.approx(111.19 * math.cos(math.radians(popa["lat"])) * 0.1, abs=0.05)


def test_haversine_one_degree_of_latitude():
    assert sitecontext.haversine_km((0.0, 0.0), (1.0, 0.0)) == pytest.approx(111.19, abs=0.01)


def test_heat_days_count_the_window_in_every_archive_year():
    hot = {"2023-03-10", "2023-03-11", "2024-03-12"}
    daily = archive(date(2023, 1, 1), 731, lambda d: 36.0 if d in hot else 33.0)
    window = {"from": "2026-03-08", "to": "2026-03-14"}
    out = sitecontext.heat_days(daily, window)
    assert out["per_year"] == {"2023": 2, "2024": 1}
    assert out["mean_days"] == 1.5 and out["max_days"] == 2 and out["years_with_heat"] == 2


def test_heat_days_leave_out_a_year_with_gaps_instead_of_counting_zero():
    daily = archive(date(2023, 1, 1), 731, lambda d: None if d.startswith("2023-03") else 34.0)
    out = sitecontext.heat_days(daily, {"from": "2026-03-08", "to": "2026-03-14"})
    assert out["per_year"] == {"2024": 0} and out["years_left_out"] == ["2023"]


def test_flowering_is_thirty_days_before_the_season_ends():
    windows, skipped = sitecontext.flowering_windows(
        spec(
            {"id": "p1", "crop_id": "rice_lowland", "planted": "2026-06-24"},
            {"id": "p2", "crop_id": "rice_lowland"},
        )
    )
    assert windows[0]["flowering"] == "2026-09-22"
    assert (windows[0]["from"], windows[0]["to"]) == ("2026-09-15", "2026-09-29")
    assert skipped == ["p2: planting date missing or not ISO"]


def test_unknown_heat_and_volcano_are_null_with_a_reason(monkeypatch):
    heat = sitecontext._heat(spec({"id": "p1", "crop_id": "rice_lowland"}), None, "", None, None, 0)
    assert heat["value"] is None and "planting date" in heat["reason"]
    assert "35" in heat["threshold"] and "TO VERIFY" in heat["threshold"]
    monkeypatch.setattr(sitecontext, "load_volcanoes", lambda: None)
    volcano = sitecontext._volcano([(16.7, 95.6)], 0)
    assert volcano["value"] is None and "gvp_volcano_sync" in volcano["reason"]


def test_climate_failure_gives_null_with_the_upstream_reason():
    facts = sitecontext.climate_facts(None, "2016-2025", 0, "Climate archive unavailable (X)")
    assert facts["rainMm"]["value"] is None
    assert facts["rainMm"]["reason"] == "Climate archive unavailable (X)"


def test_surroundings_measure_coastline_vertices_from_every_point():
    body = {
        "elements": [
            {"type": "area", "tags": {"landuse": "farmland"}},
            {
                "type": "way",
                "tags": {"natural": "coastline"},
                "geometry": [{"lat": 16.3, "lon": 95.6}, {"lat": 16.4, "lon": 95.6}],
            },
            {"type": "node", "lat": 16.71, "lon": 95.6, "tags": {"waterway": "river"}},
        ]
    }
    found = sitecontext.surroundings(body, [(16.7, 95.6), (16.6, 95.6)])
    assert found["inside"] == ["farmland"]
    assert found["near"]["coast"] == pytest.approx([33.36, 22.24], abs=0.01)
    fact = sitecontext._distance_fact("coastKm", "Coast", ["coast"], 50, found["near"], 0, {}, "m")
    assert fact["value"] == 22.2 and fact["spread"] == {"min": 22.2, "max": 33.4, "n": 2}
    empty = sitecontext._distance_fact("townKm", "Town", ["town"], 15, found["near"], 0, {}, "m")
    assert empty["value"] is None and empty["beyondKm"] == 15


def fake_upstream(request: httpx.Request) -> httpx.Response:
    url = str(request.url)
    if "archive-api" in url:
        return httpx.Response(200, json={"daily": archive(date(2016, 1, 1), 3653, lambda d: 30.0)})
    if "elevation" in url:
        n = len(request.url.params["latitude"].split(","))
        return httpx.Response(200, json={"elevation": [2.0] * n})
    if "soilgrids" in url:
        return httpx.Response(503)
    return httpx.Response(504)


def test_route_returns_ring_facts_with_outside_calls_stubbed(monkeypatch):
    transport = httpx.MockTransport(fake_upstream)
    real = httpx.Client

    def stub_client(*args: Any, **kwargs: Any) -> httpx.Client:
        return real(transport=transport, headers=kwargs.get("headers"))

    monkeypatch.setattr(sitecontext.httpx, "Client", stub_client)
    monkeypatch.setattr("agriquill.resilience.time.sleep", lambda s: None)
    monkeypatch.setattr("agriquill.resilience.random.random", lambda: 0.0)
    r = client.get("/api/v1/agriquill/contracts/farm_ayeyarwady_demo/site-context")
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["farm_id"] == "farm_ayeyarwady_demo" and out["samples"]["n"] > 5
    facts = out["facts"]
    assert facts["elevationM"]["value"] == 2 and facts["elevationM"]["spread"]["n"] > 5
    assert facts["rainMm"]["value"] == 1826 and facts["rainMm"]["source"]["sha256"]
    assert (
        facts["finePct"]["value"] is None and "SoilGrids unavailable" in facts["finePct"]["reason"]
    )
    assert facts["coastKm"]["value"] is None and "OpenStreetMap" in facts["coastKm"]["reason"]
    assert facts["heatDays"]["value"] == 0.0 and facts["heatDays"]["verify"] == "TO VERIFY"
    assert facts["volcanoKm"]["volcano"]["name"] == "Popa"
    assert set(out["failed"]) == {"soilgrids", "overpass"}
    again = client.get("/api/v1/agriquill/farms/farm_ayeyarwady_demo/site-context")
    assert again.status_code == 200
    assert client.get("/api/v1/agriquill/contracts/nope/site-context").status_code == 404


def test_pack_rows_carry_name_number_and_position():
    pack = json.loads(sitecontext.VOLCANO_PACK.read_text(encoding="utf-8"))
    row = pack["volcanoes"][0]
    assert {"name", "number", "lat", "lon", "url"} <= set(row)
    assert pack["fetched_at"] and pack["sha256"].startswith("sha256:")
