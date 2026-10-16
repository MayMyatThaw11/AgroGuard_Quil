from __future__ import annotations

from fastapi.testclient import TestClient

from agriquill import fleet
from agriquill.api.main import create_app

client = TestClient(create_app())
URL = "/api/v1/agriquill/fleet/fields"


def test_fixture_has_3600_fields_and_unique_ids() -> None:
    fields = fleet._build(fleet.DEFAULT_SEED)
    assert len(fields) == 3600
    assert len({f["id"] for f in fields}) == 3600


def test_default_page_is_100_fields_and_repeatable() -> None:
    first = client.get(URL).json()
    second = client.get(URL).json()
    assert len(first["fields"]) == 100
    assert first["fields"] == second["fields"]
    assert first["fields"][0]["id"] == "AY-0001"


def test_status_counts_match_filter_and_safe_depth_override() -> None:
    base = client.get(URL, params={"limit": 1}).json()
    stricter = client.get(URL, params={"limit": 1, "awd_safe_depth_cm": -5}).json()
    assert stricter["counts"]["alert"] >= base["counts"]["alert"]
    alerts = client.get(URL, params={"status": "alert", "limit": 20}).json()
    assert all(f["status"] == "alert" for f in alerts["fields"])
    assert alerts["total"] == base["counts"]["alert"]


def test_region_filter_and_validation() -> None:
    mandalay = client.get(URL, params={"region": "MD", "limit": 500}).json()
    assert mandalay["total"] == 420
    assert client.get(URL, params={"region": "XX"}).status_code == 422
    assert client.get(URL, params={"limit": 4000}).status_code == 422
    assert client.get(URL, params={"awd_safe_depth_cm": 3}).status_code == 422
