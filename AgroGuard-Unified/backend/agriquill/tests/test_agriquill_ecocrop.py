from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from agriquill.api.main import create_app
from agriquill.data import ecocrop
from agriquill.mcp.server import select_tools

DATA = Path(__file__).parent / "data"
client = TestClient(create_app())


def test_datasheet_parses_the_published_rice_ranges() -> None:
    html = (DATA / "ecocrop_datasheet_1574.html").read_text(encoding="utf-8")
    rice = ecocrop.parse_datasheet(html, 1574, "Oryza sativa")
    assert rice["temperature_c"]["optimal"] == [20.0, 30.0]
    assert rice["temperature_c"]["absolute"] == [10.0, 36.0]
    assert rice["rainfall_mm"]["optimal"] == [1500.0, 2000.0]
    assert rice["soil_ph"]["absolute"] == [4.5, 9.0]
    assert rice["altitude_m"]["absolute"] == [None, 2500.0]
    assert rice["soil_drainage"]["optimal"].startswith("poorly")
    assert rice["killing_temp_rest_c"] is None
    assert rice["crop_cycle_days"] == [80.0, 180.0]
    assert rice["source"]["url"].endswith("dataSheet?id=1574")


def test_crop_list_maps_names_to_codes() -> None:
    found = ecocrop.parse_list((DATA / "ecocrop_list_o.html").read_text(encoding="utf-8"))
    assert found["Oryza sativa"] == 1574
    assert found["Olea europaea"] == 1553


def test_screen_never_hides_an_absolute_limit() -> None:
    html = (DATA / "ecocrop_datasheet_1574.html").read_text(encoding="utf-8")
    rice = ecocrop.parse_datasheet(html, 1574, "Oryza sativa")
    good = ecocrop.screen(
        rice, {"mean_temp_c": 27, "annual_rain_mm": 1800, "elevation_m": None, "soil_ph": 6}
    )
    assert good["verdict"] == "conditional"
    assert {f["status"] for f in good["factors"]} == {"within_optimal", "unknown"}
    acid = ecocrop.screen(
        rice, {"mean_temp_c": 27, "annual_rain_mm": 1800, "elevation_m": 5, "soil_ph": 5}
    )
    assert [f["status"] for f in acid["factors"]] == [
        "within_optimal",
        "within_optimal",
        "within_absolute",
        "within_absolute",
    ]
    assert acid["verdict"] == "conditional"
    ideal = ecocrop.screen(
        rice, {"mean_temp_c": 27, "annual_rain_mm": 1800, "elevation_m": None, "soil_ph": 6}
    )
    assert ideal["verdict"] != "suitable"
    cold = ecocrop.screen(
        rice, {"mean_temp_c": 8, "annual_rain_mm": 1800, "elevation_m": 5, "soil_ph": 6}
    )
    assert cold["verdict"] == "contraindicated"
    blank = ecocrop.screen(
        rice, {"mean_temp_c": None, "annual_rain_mm": None, "elevation_m": None, "soil_ph": None}
    )
    assert blank["verdict"] == "unknown"


def test_local_store_serves_the_asean_set() -> None:
    names = {c["name"] for c in ecocrop.load()["crops"]}
    assert set(ecocrop.ASEAN_CROPS) <= names
    res = client.get("/api/v1/agriquill/ecocrop/crops", params={"q": "oryza"})
    assert res.status_code == 200
    assert any(c["code"] == 1574 for c in res.json()["crops"])
    assert client.get("/api/v1/agriquill/ecocrop/crops/1574").json()["name"] == "Oryza sativa"
    assert client.get("/api/v1/agriquill/ecocrop/crops/unknown-plant").status_code == 404
    screened = client.post(
        "/api/v1/agriquill/ecocrop/screen",
        json={"crop": "Oryza sativa", "mean_temp_c": 27.5, "annual_rain_mm": 2400, "soil_ph": 5.8},
    ).json()
    assert screened["verdict"] in {"suitable", "conditional", "contraindicated", "unknown"}
    assert screened["source"]["provider"].startswith("FAO EcoCrop")


def test_agents_get_ecocrop_as_read_only_mcp_tools() -> None:
    tools = select_tools(allow_actuation=False)
    assert {"ecocrop_lookup", "ecocrop_screen"} <= set(tools)
    rice = tools["ecocrop_lookup"]["fn"]({"query": "Oryza sativa"})["crops"]
    assert rice[0]["code"] == 1574
    out = tools["ecocrop_screen"]["fn"]({"crop": "Zea mays", "mean_temp_c": 26})
    assert out["crop"]["name"] == "Zea mays"
    assert tools["ecocrop_screen"]["fn"]({"crop": "nothing"})["error"]
