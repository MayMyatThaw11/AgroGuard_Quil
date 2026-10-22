from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import fumigation, live, store
from agriquill.api.main import create_app
from agriquill.config import get_settings

client = TestClient(create_app())
URL = "/api/v1/agriquill/farms/farm_f/fumigations"
ANN = {"X-AgriQuill-Write-Token": "code-a"}
CONTRACT = """farm farm_f {
    name: "Store test"
    standard: EU_2018_848
}

parcel eu_plot {
    area: 1 ha
}

parcel nop_plot {
    area: 1 ha
    standard: USDA_NOP
}
"""


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.users = SecretStr("Ann:code-a:crew,manager:farm_f")
    live.register("farm_f", CONTRACT, "Ann")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def event(**extra):
    return {
        "store": "Warehouse 1",
        "parcels": ["eu_plot", "nop_plot"],
        "product": "Phostoxin tablets",
        "active_ingredient": "aluminium phosphide",
        "method": "synthetic_chemical",
        "applied_at": "2026-10-20",
        **extra,
    }


def test_a_banned_fumigant_blocks_the_eu_lot_and_is_conditional_under_nop():
    out = fumigation.record("farm_f", event(), "Ann")
    assert out["blocks_organic"] == ["eu_plot"]
    assert out["checks"]["eu_plot"]["code"] == "AGRI-E035"
    assert out["checks"]["eu_plot"]["clause"].endswith("not in Reg (EU) 2021/1165 Annex I")
    nop = out["checks"]["nop_plot"]
    assert nop["result"] == "conditional" and nop["clause"] == "7 CFR 205.271(d)"


def test_hermetic_storage_matches_no_listed_item():
    out = fumigation.record(
        "farm_f", event(product="Hermetic bag", active_ingredient=None, method="hermetic"), "Ann"
    )
    assert out["blocks_organic"] == []
    assert {c["result"] for c in out["checks"].values()} == {"no_listed_item"}


def test_an_unrecorded_standard_is_reported_unchecked_not_passed():
    assert (
        fumigation.verdict("ASOA_ORGANIC", "Phostoxin", None, "synthetic_chemical")["result"]
        == "unchecked"
    )
    assert fumigation.verdict(None, "Phostoxin", None, "synthetic_chemical")["result"] == (
        "no_standard"
    )


def test_unknown_parcel_is_refused():
    with pytest.raises(ValueError, match="unknown parcel"):
        fumigation.record("farm_f", event(parcels=["ghost"]), "Ann")


def test_api_records_and_lists_fumigations():
    body = {**event(), "recorded_by": "Ann"}
    assert client.post(URL, json=body, headers=ANN).status_code == 200
    listed = client.get(URL, headers=ANN).json()
    assert listed[0]["blocks_organic"] == ["eu_plot"]
    assert client.post(URL, json={**body, "method": "smoke"}, headers=ANN).status_code == 422
