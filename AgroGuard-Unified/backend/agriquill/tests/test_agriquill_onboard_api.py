import base64
import io
import zipfile
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import live, onboard, store
from agriquill.api.main import create_app
from agriquill.config import get_settings

client = TestClient(create_app())
BASE = "/api/v1/agriquill"
FARM = "cust_farm"
SQUARE = [[95.59, 16.728], [95.591, 16.728], [95.591, 16.729], [95.59, 16.729], [95.59, 16.728]]
ADMIN = {"X-AgriQuill-Write-Token": "admin-code"}
ANN = {"X-AgriQuill-Write-Token": "code-a"}
CREW = {"X-AgriQuill-Write-Token": "code-c"}
USERS = (
    "Admin:admin-code:crew,manager; Ann:code-a:crew,manager:cust_farm; Cid:code-c:crew:cust_farm"
)
COORDS = " ".join(f"{lon},{lat},0" for lon, lat in SQUARE)
KML = (
    '<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2">'
    "<Document><Placemark><name>North field</name><Polygon><outerBoundaryIs><LinearRing>"
    f"<coordinates>{COORDS}</coordinates></LinearRing></outerBoundaryIs></Polygon>"
    "</Placemark></Document></kml>"
)
FIELDS = (
    "field,crop,variety,planted,stage,area,area_unit\n"
    "North field,rice_lowland,Paw San Hmwe,2026-08-01,Tillering,2.9,acre\n"
    "South plot,rice_fish,,2026-08-05,,,\n"
)


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.users = SecretStr(USERS)
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def body(**extra: Any) -> dict[str, Any]:
    return {
        "name": "Ko Aung's farm",
        "country": "MM",
        "registered_by": "Ann",
        "boundaries": {"filename": "Farm.KML", "text": KML},
        "fields_csv": FIELDS,
        **extra,
    }


def onboard_farm(payload: dict[str, Any], farm_id: str = FARM, headers: dict[str, str] = ANN):
    return client.post(f"{BASE}/farms/{farm_id}/onboard", json=payload, headers=headers)


def test_onboard_registers_the_farm_and_imports_its_sheets():
    when = (datetime.now(UTC) - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M")
    day = (datetime.now(UTC) - timedelta(days=2)).date().isoformat()
    readings = (
        f"field,observed_at,water_depth_cm\nNorth field,{when},5.0\n"
        f"North field,{day},4.0\nNowhere,{when},1.0\n"
    )
    inputs = f"field,date,product,kind\nNorth field,{day},Neem oil,spray\n"
    response = onboard_farm(
        body(readings_csv=readings, inputs_csv=inputs, utc_offset="+06:30", standard="ASOA_ORGANIC")
    )
    assert response.status_code == 200, response.text
    out = response.json()
    assert out["farm_id"] == FARM and out["verdict"]["is_valid"] is True
    assert out["to_verify"] >= 1
    assert out["readings"]["stored"] == 2 and out["readings"]["assumed_time"] == 1
    assert out["readings"]["rejected"] == [
        {"line": 4, "reason": "field 'Nowhere' is not in the contract"}
    ]
    assert out["inputs"]["stored"] == 1
    spec = live.load(FARM)[1]["contract"]
    assert [p["id"] for p in spec["parcels"]] == ["North-field", "South-plot"]
    assert spec["farm"]["standard"] == "ASOA_ORGANIC"
    listed = client.get(f"{BASE}/contracts", headers=ANN).json()["contracts"]
    assert FARM in [c["farm_id"] for c in listed]
    seeds = {c["farm_id"]: c["seed"] for c in listed}
    assert seeds[FARM] is False
    assert all(seeds[f] is True for f in live.SEEDS if f in seeds)


def test_onboard_reads_a_kmz_sent_as_base64():
    packed = io.BytesIO()
    with zipfile.ZipFile(packed, "w") as archive:
        archive.writestr("doc.kml", KML)
    kmz = {"filename": "farm.kmz", "base64": base64.b64encode(packed.getvalue()).decode()}
    response = onboard_farm(body(boundaries=kmz, fields_csv=None))
    assert response.status_code == 200, response.text
    assert response.json()["readings"] is None and response.json()["inputs"] is None
    parcels = live.load(FARM)[1]["contract"]["parcels"]
    assert [p["id"] for p in parcels] == ["North-field"]


def test_onboard_turns_away_oversize_and_bad_files():
    big = "field\n" + "x\n" * 5001
    assert onboard_farm(body(readings_csv=big)).status_code == 413
    huge = {"filename": "farm.geojson", "text": " " * (2 * 1024 * 1024 + 1)}
    too_big = onboard_farm(body(boundaries=huge))
    assert too_big.status_code == 413 and "2 MB" in too_big.json()["detail"]
    for broken in ('{"type": "Polygon", "coordinates": 5}', "{not json", "[1, 2]"):
        bad = onboard_farm(body(boundaries={"filename": "farm.geojson", "text": broken}))
        assert bad.status_code == 422, broken
        assert isinstance(bad.json()["detail"], str)
    not_zip = {"filename": "farm.kmz", "base64": base64.b64encode(b"plain text").decode()}
    assert onboard_farm(body(boundaries=not_zip)).status_code == 422
    assert onboard_farm(body(boundaries={"filename": "farm.shp", "text": KML})).status_code == 422
    assert onboard_farm(body(boundaries=None, fields_csv="")).status_code == 422
    assert live.load(FARM) is None


def test_onboard_needs_a_manager_with_access_to_the_farm():
    other = onboard_farm(body(), farm_id="other_farm")
    assert other.status_code == 403 and "other_farm" in other.json()["detail"]
    crew = onboard_farm(body(registered_by="Cid"), headers=CREW)
    assert crew.status_code == 403
    someone_else = onboard_farm(body(registered_by="Admin"))
    assert someone_else.status_code == 403
    assert client.post(f"{BASE}/farms/{FARM}/onboard", json=body()).status_code == 401
    assert onboard_farm(body(registered_by="Admin"), "x", ADMIN).status_code == 422
    assert live.load(FARM) is None


def test_onboard_writes_assets_into_the_contract():
    assets = [
        {"id": "P-01", "kind": "pump", "label": "Intake pump", "serves": ["North-field"]},
        {"id": "D-01", "kind": "drone", "label": "Drone", "serves": []},
    ]
    response = onboard_farm(body(assets=assets))
    assert response.status_code == 200, response.text
    found = live.load(FARM)[1]["contract"]["assets"]
    assert [(a["id"], a["kind"], a["serves"]) for a in found] == [
        ("P-01", "pump", ["North-field"]),
        ("D-01", "drone", []),
    ]
    stray = [{"id": "P-02", "kind": "pump", "label": "Pump", "serves": ["Nowhere"]}]
    bad = onboard_farm(body(assets=stray))
    assert bad.status_code == 422 and "Nowhere" in bad.json()["detail"]
    tractor = [{"id": "T-01", "kind": "tractor", "label": "Tractor", "serves": []}]
    assert onboard_farm(body(assets=tractor)).status_code == 422


def test_kmz_with_an_oversize_kml_is_refused(tmp_path: Path):
    kmz = tmp_path / "big.kmz"
    with zipfile.ZipFile(kmz, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("doc.kml", " " * (onboard.MAX_KML_BYTES + 1))
    with pytest.raises(ValueError, match="larger than 10 MB"):
        onboard.read_boundaries(kmz)


def test_assets_in_build_contract_use_the_demo_syntax():
    rings = {"North-field": onboard._ring(SQUARE)}
    text, _ = onboard.build_contract(
        FARM,
        "Farm",
        "MM",
        [],
        rings,
        "test",
        None,
        [{"id": "S-01", "kind": "sluice", "label": 'Outlet "east"', "serves": ["North-field"]}],
    )
    assert "asset S-01 { kind: sluice label: \"Outlet 'east'\" serves: [North-field] }" in text
    assert live.register(FARM, text, "tester")["is_valid"] is True


def test_satellite_returns_a_scene_traced_series_per_bounded_parcel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agriquill.data import sentinel2

    seen: list[list[list[float]]] = []

    def fake(ring: list[list[float]], days: int = 60, client: Any = None) -> dict[str, Any]:
        seen.append(ring)
        return {"series": [{"scene_id": "S2X", "status": "clear", "ndvi": 0.7}], "missing": []}

    monkeypatch.setattr(sentinel2, "paddy_series", fake)
    assert onboard_farm(body()).status_code == 200
    out = client.get(f"{BASE}/contracts/{FARM}/satellite?days=30", headers=ANN)
    assert out.status_code == 200, out.text
    parcels = out.json()["parcels"]
    assert [p["id"] for p in parcels] == ["North-field"]
    assert parcels[0]["series"][0]["scene_id"] == "S2X"
    assert seen and seen[0][0] == seen[0][-1]
    assert client.get(f"{BASE}/contracts/{FARM}/satellite").status_code in (401, 403)


def test_radar_is_a_shadow_witness_per_bounded_parcel(monkeypatch: pytest.MonkeyPatch) -> None:
    from agriquill.data import sentinel1

    def fake(ring: list[list[float]], days: int = 60, depth: Any = None, client: Any = None):
        return {"shadow": True, "series": [{"scene_id": "S1X", "vv_db": -9.6}], "missing": []}

    monkeypatch.setattr(sentinel1, "paddy_radar", fake)
    assert onboard_farm(body()).status_code == 200
    out = client.get(f"{BASE}/contracts/{FARM}/radar?days=60", headers=ANN)
    assert out.status_code == 200, out.text
    assert out.json()["shadow"] is True
    assert out.json()["parcels"][0]["series"][0]["scene_id"] == "S1X"
    assert client.get(f"{BASE}/contracts/{FARM}/radar").status_code in (401, 403)


def test_risk_reads_one_site_and_gives_each_parcel_its_own_advice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agriquill.data import flood

    def fake(
        ring: list[list[float]], planted: Any = None, season_days: Any = None, client: Any = None
    ):
        assert ring[0] == ring[-1]
        return {"level": "high", "flood_date": "2026-11-05", "main": {"peak_months": [8, 8, 9]}}

    monkeypatch.setattr(flood, "site_risk", fake)
    assert onboard_farm(body()).status_code == 200
    out = client.get(f"{BASE}/contracts/{FARM}/risk", headers=ANN)
    assert out.status_code == 200, out.text
    parcel = out.json()["parcels"][0]
    assert out.json()["level"] == "high"
    assert parcel["advice"]["action"] in ("harvest_early", "protect")
    assert parcel["planting"]["peak_month"] == 8
    assert client.get(f"{BASE}/contracts/{FARM}/risk").status_code in (401, 403)


def geojson(name: str, ring: list[list[float]]) -> dict[str, Any]:
    import json

    feature = {
        "type": "Feature",
        "properties": {"name": name},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }
    return {"filename": "traced.geojson", "text": json.dumps(feature)}


def shifted_square(dlon: float) -> list[list[float]]:
    return [[lon + dlon, lat] for lon, lat in SQUARE]


def add_parcel(name: str, ring: list[list[float]], headers: dict[str, str] = ANN):
    payload = {"boundaries": geojson(name, ring), "registered_by": "Ann"}
    return client.post(f"{BASE}/farms/{FARM}/parcels", json=payload, headers=headers)


def test_a_second_traced_field_is_added_and_the_first_keeps_its_date():
    assert onboard_farm(body()).status_code == 200
    r = add_parcel("East field", shifted_square(0.002))
    assert r.status_code == 200, r.text
    assert r.json()["added"] == ["East-field"]
    parcels = {p["id"]: p for p in live.load(FARM)[1]["contract"]["parcels"]}
    assert set(parcels) == {"North-field", "South-plot", "East-field"}
    assert parcels["North-field"]["planted"] == "2026-08-01"
    assert parcels["East-field"]["boundary_area_ha"] > 0


def test_a_field_with_a_taken_id_is_refused():
    onboard_farm(body())
    r = add_parcel("North field", shifted_square(0.002))
    assert r.status_code == 409 and "North-field" in r.text


def test_a_field_on_top_of_another_is_refused_and_a_neighbour_is_not():
    onboard_farm(body())
    assert add_parcel("Overlap", shifted_square(0.0004)).status_code == 422
    assert add_parcel("Neighbour", shifted_square(0.001)).status_code == 200


def test_adding_a_field_needs_the_manager_token_and_the_farm():
    onboard_farm(body())
    assert add_parcel("East", shifted_square(0.002), CREW).status_code in (401, 403)
    assert client.post(f"{BASE}/farms/{FARM}/parcels", json={}).status_code in (401, 403, 422)
    missing = client.post(
        f"{BASE}/farms/nobody/parcels",
        json={"boundaries": geojson("X", SQUARE), "registered_by": "Admin"},
        headers=ADMIN,
    )
    assert missing.status_code == 404
