from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agriquill import contract, cropvalue, live, store
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.data import regions

client = TestClient(create_app())


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


def test_parcel_boundary_must_be_a_closed_ring():
    good = (
        "farm f { location: [1, 1] }\n"
        "parcel A { boundary: [[1, 1], [1, 1.001], [1.001, 1.001], [1, 1]] }"
    )
    out = contract.verify(good)
    assert out["is_valid"] and out["contract"]["parcels"][0]["area_ha"] > 0
    bad = contract.verify("farm f { location: [1, 1] }\nparcel A { boundary: [[1, 1], [2, 2]] }")
    assert "AGRI-E026" in {d["code"] for d in bad["diagnostics"]}


def test_demo_paddies_use_real_osm_boundaries_with_matching_area():
    spec = live.load("farm_ayeyarwady_demo")[1]["contract"]
    for parcel in spec["parcels"]:
        assert parcel["osm"].startswith("way/")
        assert abs(parcel["boundary_area_ha"] - parcel["area_ha"]) <= 0.02


def test_region_facts_classify_spi_and_format_calendar():
    assert regions.spi_class(1.68) == "very wet"
    assert regions.spi_class(-0.4) == "near normal"
    assert regions.spi_class(-2.3) == "extremely dry"
    assert regions.spi_class(None) is None
    assert (
        regions._window({"day": "1", "month": "6"}, {"day": "31", "month": "7"})
        == "1 Jun to 31 Jul"
    )
    ts = regions.to_typescript()
    assert "export const REGION_FACTS" in ts and "Maubin, Ayeyarwady" in ts


def test_crop_options_multiply_only_same_basis(monkeypatch):
    region = {
        "town": "Testville",
        "country": "Thailand",
        "iso3": "THA",
        "rainfall": {
            "series": [{"period": f"2026-{m:02d}", "precip_mm": 100.0} for m in range(1, 13)]
        },
        "weather": {"elevation_m": 20.0, "summary": {"tmax_mean_c": 32.0, "tmin_mean_c": 24.0}},
    }
    monkeypatch.setattr(cropvalue.regions, "get", lambda town: region)

    def fake_yield(iso3, item, element):
        return {
            "records": [
                {
                    "value": 1200.0,
                    "unit": "kg/ha",
                    "year": 2024,
                    "flag": "A",
                    "flag_meaning": "Official figure",
                    "item": item,
                }
            ],
            "source": {"sha256": "sha256:x"},
        }

    monkeypatch.setattr(cropvalue.fao_pack, "faostat_qcl", fake_yield)
    prices = {
        "crops": {
            "coffee": {"usd_per_tonne": 3690.0, "month": "2026-09", "series": "Coffee, Robusta"},
            "rice": {"usd_per_tonne": 482.0, "month": "2026-09", "series": "Rice, Thai 5%"},
        },
        "source": {"sha256": "sha256:y"},
    }
    out = cropvalue.options("Testville", prices)
    rows = {r["id"]: r for r in out["options"]}
    assert out["site"]["annual_rain_mm"] == 1200.0 and out["site"]["mean_temp_c"] == 28.0
    assert rows["coffee"]["gross_value_usd_ha"] == round(1.2 * 3690)
    assert rows["rice"]["gross_value_usd_ha"] is None
    assert rows["rice"]["gross_value_reason"].startswith("not multiplied")
    assert rows["durian"]["gross_value_reason"] == "no national yield"
    assert "not profit" in out["note"]


RING = [
    [16.730844, 95.597508],
    [16.730959, 95.598255],
    [16.730581, 95.598427],
    [16.730844, 95.597508],
]


def test_osm_ring_reads_a_closed_way_and_rejects_anything_else():
    import httpx

    def handler(request: httpx.Request) -> httpx.Response:
        nodes = [
            {"type": "node", "id": i, "lat": p[0], "lon": p[1]} for i, p in enumerate(RING[:3])
        ]
        way = {"type": "way", "id": 1, "nodes": [0, 1, 2, 0]}
        return httpx.Response(200, json={"elements": [*nodes, way]})

    mock = httpx.Client(transport=httpx.MockTransport(handler))
    assert live.osm_ring("way/1", mock) == RING
    assert live.osm_ring("relation/1", mock) is None
    down = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503)))
    assert live.osm_ring("way/1", down) is None


def test_site_contract_carries_the_osm_boundary(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(live, "osm_ring", lambda osm, client=None: RING)
    site = {"osm": "way/9", "name": "F", "lat": 16.73, "lon": 95.598, "area_ha": 0.3,
            "country_iso2": "MM", "crop_id": "rice_lowland"}
    out = live.create_from_site(site, "Daw Hla")
    assert out["contract"]["parcels"][0]["boundary"] == RING


def test_contract_from_site_and_listing(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(live, "osm_ring", lambda osm, client=None: None)
    body = {
        "osm": "way/652768658",
        "name": "Maubin field",
        "lat": 16.7307,
        "lon": 95.598,
        "area_ha": 0.35,
        "country_iso2": "MM",
        "created_by": "Daw Hla",
    }
    r = client.post("/api/v1/agriquill/contracts/from-site", json=body)
    assert r.status_code == 200, r.text
    assert client.post("/api/v1/agriquill/contracts/from-site", json=body).status_code == 409
    ids = {c["farm_id"] for c in client.get("/api/v1/agriquill/contracts").json()["contracts"]}
    assert {"farm_ayeyarwady_demo", "site-way-652768658"} <= ids
