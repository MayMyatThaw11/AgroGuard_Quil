from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr

from agriquill import store
from agriquill.config import get_settings
from agriquill.data import prices

PRICE = {"status": "ok", "provenance": "modelled", "latest_mmk_kg": 4200.0, "market": "88 ward"}


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    fields = ("data_dir", "ledger_path", "agroguard_url", "agroguard_service_key")
    saved = {name: getattr(settings, name) for name in fields}
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.agroguard_url = "http://agroguard.test"
    settings.agroguard_service_key = SecretStr("service-key")
    yield
    store.close_all()
    for name, value in saved.items():
        setattr(settings, name, value)


class Recorder:
    def __init__(self, response: httpx.Response | Exception) -> None:
        self.response = response
        self.calls: list[dict] = []

    def __call__(self, url: str, **kwargs) -> httpx.Response:
        self.calls.append({"url": url, **kwargs})
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def ok() -> httpx.Response:
    return httpx.Response(200, json=PRICE, request=httpx.Request("GET", "http://agroguard.test"))


def test_client_sends_service_key_and_query(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = Recorder(ok())
    monkeypatch.setattr(prices.httpx, "get", fake)
    assert prices.trend("onion", 16.8, 96.2) == PRICE
    [call] = fake.calls
    assert call["url"] == "http://agroguard.test/api/v1/market/prices"
    assert call["headers"]["X-Service-Key"] == "service-key"
    assert call["params"]["produce"] == "onion"


def test_client_caches_6h(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = Recorder(ok())
    monkeypatch.setattr(prices.httpx, "get", fake)
    prices.trend("onion", 16.8, 96.2)
    prices.trend("onion", 16.8, 96.2)
    assert len(fake.calls) == 1
    assert prices.TTL_S == 6 * 3600


def test_client_returns_missing_when_agroguard_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(prices.httpx, "get", Recorder(httpx.ConnectError("down")))
    result = prices.trend("onion", 16.8, 96.2)
    assert result["field"] == "price"
    assert "did not answer" in result["reason"]


def test_client_missing_when_not_configured() -> None:
    get_settings().agroguard_url = None
    assert prices.trend("onion", 16.8, 96.2)["field"] == "price"
