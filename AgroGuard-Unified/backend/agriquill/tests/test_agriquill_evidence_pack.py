import hashlib
import json
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import certificates, cropvalue, evidence_pack, fumigation, live, lots, store
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.onboard import _INPUTS

client = TestClient(create_app())
ANN = {"X-AgriQuill-Write-Token": "code-a"}
CONTRACT = """farm farm_e {
    name: "Pack farm"
    country: MM
    standard: EU_2018_848
}

parcel p1 {
    area: 1 ha
    crop: "Paw San Hmwe"
    sell_as: organic
    planted: "2026-06-15"
    conversion_start: "2024-01-01"
}
"""


@pytest.fixture(autouse=True)
def farm(tmp_path: Path, monkeypatch) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.users = SecretStr("Ann:code-a:crew,manager:farm_e")
    monkeypatch.setattr(cropvalue, "_yield", lambda iso3, item: {"t_ha": None, "reason": "test"})
    live.register("farm_e", CONTRACT, "Ann")
    for applied, product in (
        ("2026-07-01T08:00:00+06:30", "Compost tea"),
        ("2026-07-20T08:00:00+06:30", "Roundup <script>alert(1)</script> glyphosate"),
    ):
        row = {
            "farm_id": "farm_e",
            "field": "p1",
            "applied_at": applied,
            "product": product,
            "kind": "spray",
        }
        _INPUTS.put("input", f"farm_e|p1|{applied}", row, "test", "sha256:x", None)
    certificates.add(
        "farm_e",
        {
            "kind": "organic",
            "number": "OC-1",
            "issuer": "Cert",
            "country": "MM",
            "issued": "2026-01-01",
            "expires": "2027-01-01",
        },
        "Ann",
    )
    fumigation.record(
        "farm_e",
        {
            "store": "W1",
            "parcels": ["p1"],
            "product": "Phostoxin",
            "active_ingredient": "aluminium phosphide",
            "method": "synthetic_chemical",
            "applied_at": "2026-10-01",
        },
        "Ann",
    )
    lots.record(
        "farm_e",
        {
            "id": "L1",
            "parcels": ["p1"],
            "harvested_on": "2026-10-10",
            "mass_kg": 3000.0,
            "certifier": "Cert",
        },
        "Ann",
    )
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def test_a_certifier_can_check_one_plot_season_from_the_pack_alone():
    pack = evidence_pack.build("farm_e", "p1", date(2026, 6, 1), date(2026, 12, 31))
    assert pack["conversion"]["qualifies"] is True
    banned = [i for i in pack["inputs"] if i["banned_item"]]
    assert [i["banned_item"] for i in banned] == ["glyphosate"]
    assert banned[0]["clause"].startswith("Reg (EU) 2018/848")
    assert pack["certificates"][0]["number"] == "OC-1"
    assert pack["fumigations"][0]["blocks_organic"] == ["p1"]
    assert pack["lots"][0]["certifier"] == "Cert"
    receipt = pack.pop("receipt")
    digest = hashlib.sha256(
        json.dumps(pack, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    assert receipt["pack_sha256"] == f"sha256:{digest}"
    assert receipt["ledger_intact"] is True and receipt["banned_inputs"] == 1


def test_the_season_window_keeps_other_seasons_out():
    pack = evidence_pack.build("farm_e", "p1", date(2026, 7, 10), date(2026, 7, 31))
    assert [i["product"].split()[0] for i in pack["inputs"]] == ["Roundup"]


def test_html_escapes_what_farmers_typed_and_csv_has_a_row_per_field():
    pack = evidence_pack.build("farm_e", "p1")
    page = evidence_pack.to_html(pack)
    assert "<script>" not in page and "&lt;script&gt;" in page
    lines = evidence_pack.to_csv(pack).splitlines()
    assert lines[0] == "section,field,value" and any(
        line.startswith("plot,parcel,p1") for line in lines
    )


def test_api_serves_the_pack_as_csv_and_refuses_an_unknown_plot():
    url = "/api/v1/agriquill/contracts/farm_e/evidence-pack"
    r = client.get(url, params={"parcel": "p1", "format": "csv"}, headers=ANN)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert client.get(url, params={"parcel": "nope"}, headers=ANN).status_code == 404
