import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from agriquill import contract, live, store, telemetry
from agriquill.api.main import create_app

from .test_agriquill_fusion import _weather

client = TestClient(create_app())
FARM = "farm_ayeyarwady_demo"


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    from agriquill.config import get_settings

    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def mock():
    return httpx.Client(
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, content=json.dumps(_weather()).encode())
        )
    )


def test_demo_contract_parses_herds_with_floors():
    out = contract.verify(live.load(FARM)[0])
    assert out["is_valid"], out["diagnostics"]
    herds = {h["id"]: h for h in out["contract"]["herds"]}
    assert herds["FISH-04"]["min_water_cm"] == 10.0 and herds["FISH-04"]["min_oxygen_mg_l"] == 3.0
    assert herds["DUCK-06"]["paddy"] == "PD-06"


def test_herd_in_unknown_paddy_is_an_error_and_fish_need_a_floor():
    base = "farm f { location: [1, 1] }\nparcel P1 { area: 1 ha }\n"
    bad = contract.verify(base + "herd X { kind: fish count: 5 paddy: P9 }")
    codes = {d["code"] for d in bad["diagnostics"]}
    assert "AGRI-E025" in codes and "AGRI-W024" in codes
    odd = contract.verify(base + "herd Y { kind: dragons count: 1 }")
    assert "AGRI-W023" in {d["code"] for d in odd["diagnostics"]}


def test_animals_block_draining_and_low_oxygen_raises_aeration():
    now = (datetime.now(UTC) - timedelta(minutes=10)).isoformat(timespec="seconds")
    telemetry.ingest("PD-07-tube", now, {"water_depth_cm": 6.0}, "manual", "Ko Min")
    telemetry.ingest("herd:FISH-04", now, {"dissolved_oxygen_mg_l": 2.1}, "manual", "Ko Min")
    out = live.watch(FARM, mock())
    drains = [t for t in out["live"]["tasks"] if t["title"].startswith("Drain PD-07")]
    assert drains and drains[0]["blocked_reason"].startswith("ANIMALS_PRESENT")
    assert any(p["text"].startswith("Aerate PD-04") for p in out["proposals"])
    fish = next(h for h in out["live"]["herds"] if h["id"] == "FISH-04")
    assert fish["latest"]["dissolved_oxygen_mg_l"]["value"] == 2.1


def test_add_herd_through_api_updates_the_contract():
    body = {"id": "GOAT-01", "kind": "goats", "count": 12, "added_by": "Daw Hla"}
    r = client.post(f"/api/v1/agriquill/contracts/{FARM}/herds", json=body)
    assert r.status_code == 200, r.text
    herds = {h["id"] for h in live.load(FARM)[1]["contract"]["herds"]}
    assert "GOAT-01" in herds
    assert client.post(f"/api/v1/agriquill/contracts/{FARM}/herds", json=body).status_code == 409
    bad = client.post(
        f"/api/v1/agriquill/contracts/{FARM}/herds",
        json={**body, "id": "FISH-9", "kind": "fish", "paddy": "PD-99"},
    )
    assert bad.status_code == 422
