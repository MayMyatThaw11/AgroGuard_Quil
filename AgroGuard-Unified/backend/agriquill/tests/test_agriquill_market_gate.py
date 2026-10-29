from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.data import pinksheet

client = TestClient(create_app())
BASE = "/api/v1/agriquill/market"


@pytest.fixture(autouse=True)
def restore_flag() -> Iterator[None]:
    settings = get_settings()
    saved = settings.farm_market_enabled
    yield
    settings.farm_market_enabled = saved


def test_market_routes_404_when_disabled() -> None:
    get_settings().farm_market_enabled = False
    assert client.get(f"{BASE}/status").status_code == 404


def test_market_routes_open_when_enabled() -> None:
    get_settings().farm_market_enabled = True
    response = client.get(f"{BASE}/status")
    assert response.status_code == 200
    assert response.json() == {"enabled": True}


def test_enabled_endpoint_answers_in_both_states() -> None:
    settings = get_settings()
    settings.farm_market_enabled = False
    assert client.get(f"{BASE}/enabled").json() == {"enabled": False}
    settings.farm_market_enabled = True
    assert client.get(f"{BASE}/enabled").json() == {"enabled": True}


def test_benchmarks_unaffected_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pinksheet, "benchmarks", lambda: {"ok": True})
    get_settings().farm_market_enabled = False
    response = client.get(f"{BASE}/benchmarks")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_flag_defaults_to_off() -> None:
    assert type(get_settings()).model_fields["farm_market_enabled"].default is False
