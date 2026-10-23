import math
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import live, sites, store
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.ledger import get_ledger

client = TestClient(create_app())
SITES_URL = "/api/v1/agriquill/sites"
ANN = {"X-AgriQuill-Write-Token": "code-a"}
CONTRACT = """farm farm_s {
    name: "Supplier farm"
    country: MM
}

parcel P1 {
    area: 1 ha
    crop: "rice"
}
"""
ACRE_M2 = 4046.8564224


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.users = SecretStr("Ann:code-a:crew,manager:farm_s")
    live.register("farm_s", CONTRACT, "Ann")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def square(site_id: str, acres: float, precision: str | None = "ward_corridor_simulated_parcel"):
    side = math.sqrt(acres * ACRE_M2)
    lat0, lon0 = 17.0978, 95.1808
    dlat = side / 110574.0
    dlon = side / (111320.0 * math.cos(math.radians(lat0)))
    ring = [
        [lon0, lat0],
        [lon0 + dlon, lat0],
        [lon0 + dlon, lat0 + dlat],
        [lon0, lat0 + dlat],
        [lon0, lat0],
    ]
    props = {"id": site_id, "name": "Test Mill A", "capacity_tons": "60-100"}
    if precision is not None:
        props["precision_level"] = precision
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def fc(features):
    return {"type": "FeatureCollection", "features": features}


def ledger_kinds() -> list[str]:
    return [e["kind"] for e in get_ledger(get_settings().ledger_path).entries()]


def test_upload_keeps_precision_label_and_area():
    out = sites.upload(fc([square("test_a", 0.42)]), "Ann")
    s = out["sites"][0]
    assert s["precision_level"] == "ward_corridor_simulated_parcel"
    assert abs(s["area_ha"] - 0.17) < 0.01
    assert s["properties"]["capacity_tons"] == "60-100"
    assert abs(s["centroid"][0] - 17.0979) < 0.001 and abs(s["centroid"][1] - 95.1809) < 0.001


def test_feature_without_precision_level_is_refused():
    with pytest.raises(ValueError, match="precision_level"):
        sites.upload(fc([square("x", 1, precision=None)]), "Ann")


def test_open_ring_and_non_polygon_are_refused():
    bad = square("x", 1)
    bad["geometry"]["coordinates"][0].pop()
    with pytest.raises(ValueError, match="closed"):
        sites.upload(fc([bad]), "Ann")
    point = square("y", 1)
    point["geometry"] = {"type": "Point", "coordinates": [95.0, 17.0]}
    with pytest.raises(ValueError, match="Polygon"):
        sites.upload(fc([point]), "Ann")


def test_upload_twice_upserts():
    sites.upload(fc([square("test_a", 1)]), "Ann")
    sites.upload(fc([square("test_a", 1)]), "Ann")
    assert [s["id"] for s in sites.listing()] == ["test_a"]
    assert ledger_kinds().count("site_upload") == 2


def test_link_lists_supplier_and_unlink_removes():
    sites.upload(fc([square("test_a", 1)]), "Ann")
    sites.link("farm_s", "P1", "test_a", "Ann")
    assert sites.listing()[0]["suppliers"] == [{"farm_id": "farm_s", "parcel_id": "P1"}]
    sites.link("farm_s", "P1", None, "Ann")
    assert sites.listing()[0]["suppliers"] == []
    assert ledger_kinds().count("site_link") == 2


def test_link_unknown_parcel_or_site_is_keyerror():
    sites.upload(fc([square("test_a", 1)]), "Ann")
    with pytest.raises(KeyError):
        sites.link("farm_s", "NOPE", "test_a", "Ann")
    with pytest.raises(KeyError):
        sites.link("farm_s", "P1", "no_site", "Ann")


def test_routes_need_manager_to_write_and_list_reads():
    body = {"collection": fc([square("test_a", 1)]), "uploaded_by": "Ann"}
    assert client.post(SITES_URL, json=body).status_code in (401, 403)
    ok = client.post(SITES_URL, json=body, headers=ANN)
    assert ok.status_code == 200, ok.text
    assert [s["id"] for s in client.get(SITES_URL, headers=ANN).json()["sites"]] == ["test_a"]
    link = client.patch(
        "/api/v1/agriquill/farms/farm_s/parcels/P1/delivers-to",
        json={"site_id": "test_a", "linked_by": "Ann"},
        headers=ANN,
    )
    assert link.status_code == 200, link.text
    bad = client.post(
        SITES_URL,
        json={"collection": fc([square("x", 1, precision=None)]), "uploaded_by": "Ann"},
        headers=ANN,
    )
    assert bad.status_code == 422
