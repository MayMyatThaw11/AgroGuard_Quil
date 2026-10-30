import json

import pytest
from fastapi.testclient import TestClient

from agriquill import onboard
from agriquill.api.main import create_app
from agriquill.config import SMALL_MEDIUM_MAX_HA

client = TestClient(create_app())


def square(side_deg: float, lat: float = 17.1, lon: float = 96.05) -> list[list[float]]:
    return [
        [lon, lat],
        [lon + side_deg, lat],
        [lon + side_deg, lat + side_deg],
        [lon, lat + side_deg],
        [lon, lat],
    ]


def ring(side_deg: float, lon: float = 96.05) -> list[list[float]]:
    return [[p[1], p[0]] for p in square(side_deg, lon=lon)]


def test_limit_is_10_ha() -> None:
    assert SMALL_MEDIUM_MAX_HA == 10.0


def test_small_farm_passes() -> None:
    onboard.check_farm_size({"F1": ring(0.001)})


def test_farm_over_10_ha_is_rejected() -> None:
    with pytest.raises(ValueError, match="up to 10 ha"):
        onboard.check_farm_size({"F1": ring(0.0035)})


def test_fields_added_to_a_farm_count_together() -> None:
    with pytest.raises(ValueError):
        onboard.check_farm_size({"F2": ring(0.0022, lon=96.06)}, existing_ha=8.0)


def test_onboarding_a_12_ha_boundary_is_422() -> None:
    geo = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "F1"},
                "geometry": {"type": "Polygon", "coordinates": [square(0.0035)]},
            }
        ],
    }
    body = {
        "name": "Big farm",
        "country": "MM",
        "registered_by": "Tester",
        "boundaries": {"filename": "f.geojson", "text": json.dumps(geo)},
    }
    response = client.post("/api/v1/agriquill/farms/farm_big_test/onboard", json=body)
    assert response.status_code == 422
    assert "10 ha" in json.dumps(response.json())
