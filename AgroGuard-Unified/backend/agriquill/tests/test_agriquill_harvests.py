from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import live, lots, store
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.ledger import get_ledger
from tests.test_agriquill_provenance import bare_numbers

client = TestClient(create_app())
BASE = "/api/v1/agriquill/farms/farm_h"
ANN = {"X-AgriQuill-Write-Token": "code-a"}
CREW = {"X-AgriQuill-Write-Token": "code-c"}
CONTRACT = """farm farm_h {
    name: "Harvest farm"
    country: MM
    location: [16.73, 94.77]
}

parcel P1 {
    area: 1 ha
    crop: "rice"
}

parcel P2 {
    crop: "rice"
}
"""


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.users = SecretStr("Ann:code-a:crew,manager:farm_h;Cid:code-c:crew:farm_h")
    live.register("farm_h", CONTRACT, "Ann")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def body(**kw: Any) -> dict[str, Any]:
    base = {
        "parcel": "P1",
        "harvested_on": "2025-10-20",
        "method": "whole_field_weighed",
        "fresh_kg": 5000,
        "moisture_pct": 20,
        "recorded_by": "Ann",
    }
    base.update(kw)
    return base


def add(**kw: Any):
    return client.post(f"{BASE}/harvests", json=body(**kw), headers=ANN)


def test_whole_field_yield_matches_the_hand_computation():
    r = add()
    assert r.status_code == 200, r.text
    out = r.json()["yield"]
    assert out["dry_kg_ha"] == pytest.approx(5000 * 80 / 100, abs=0.05)
    assert out["kg_ha_14"] == pytest.approx(5000 * 80 / 86, abs=0.05)
    assert out["area_ha"] == 1.0 and "contract" in out["area_basis"]
    assert "Field to Market" in out["standard_source"]


def test_a_crop_cut_uses_the_cut_area_not_the_parcel():
    r = add(method="crop_cut", fresh_kg=3.2, moisture_pct=22, cut_area_m2=5)
    assert r.status_code == 200, r.text
    out = r.json()["yield"]
    assert out["dry_kg_ha"] == pytest.approx(3.2 * 78 / 100 / 0.0005, abs=0.05)
    assert out["kg_ha_14"] == pytest.approx(3.2 * 78 / 86 / 0.0005, abs=0.05)


def test_a_crop_cut_without_its_area_is_refused():
    assert add(method="crop_cut", fresh_kg=3.2).status_code == 422


def test_unknown_moisture_keeps_the_weight_and_leaves_the_yield_null_with_a_reason():
    r = add(moisture_pct=None)
    assert r.status_code == 200
    out = r.json()
    assert out["fresh_kg"] == 5000
    assert out["yield"]["dry_kg_ha"] is None and out["yield"]["kg_ha_14"] is None
    assert out["yield"]["reason"] == "moisture at weighing unknown"


def test_a_parcel_without_an_area_gives_a_null_yield_with_a_reason():
    out = add(parcel="P2").json()["yield"]
    assert out["dry_kg_ha"] is None and "no area" in out["reason"]


def test_an_unknown_parcel_is_refused_and_a_crew_token_cannot_record():
    assert add(parcel="NOPE").status_code == 422
    assert client.post(f"{BASE}/harvests", json=body(), headers=CREW).status_code in (401, 403)
    assert client.post(f"{BASE}/harvests", json=body()).status_code in (401, 403)


def test_a_weight_no_plot_can_give_is_flagged_not_hidden(monkeypatch):
    monkeypatch.setattr(
        lots, "estimate_kg", lambda spec, parcels: {"kg": 3980, "basis": ["national high"]}
    )
    out = add(fresh_kg=60000).json()
    assert out["fresh_kg"] == 60000 and out["flags"]


def test_the_same_day_twice_is_a_conflict_until_the_first_is_voided():
    assert add().status_code == 200
    assert add().status_code == 409
    v = client.delete(
        f"{BASE}/harvests/P1~2025-10-20",
        params={"reason": "typed in the wrong field", "voided_by": "Ann"},
        headers=ANN,
    )
    assert v.status_code == 200 and v.json()["voided_at"]
    assert add(fresh_kg=4800).status_code == 200


def test_listing_hides_voided_rows_and_pages():
    add(harvested_on="2025-10-20")
    add(harvested_on="2024-10-18", fresh_kg=4500)
    client.delete(
        f"{BASE}/harvests/P1~2024-10-18",
        params={"reason": "duplicate", "voided_by": "Ann"},
        headers=ANN,
    )
    live_rows = client.get(f"{BASE}/harvests", headers=ANN).json()
    assert live_rows["total"] == 1 and live_rows["harvests"][0]["harvested_on"] == "2025-10-20"
    every = client.get(f"{BASE}/harvests", params={"include_voided": True}, headers=ANN).json()
    assert every["total"] == 2
    one = client.get(f"{BASE}/harvests", params={"limit": 1, "offset": 1}, headers=ANN).json()
    assert len(one["harvests"]) == 0 and one["total"] == 1


def test_correcting_the_moisture_recomputes_the_yield_and_writes_the_ledger():
    add()
    r = client.patch(
        f"{BASE}/harvests/P1~2025-10-20",
        json={"changes": {"moisture_pct": 24}, "reason": "meter re-read", "corrected_by": "Ann"},
        headers=ANN,
    )
    assert r.status_code == 200, r.text
    row = r.json()
    assert row["yield"]["dry_kg_ha"] == pytest.approx(5000 * 76 / 100, abs=0.05)
    assert row["correction_reason"] == "meter re-read"
    kinds = [e["kind"] for e in get_ledger(get_settings().ledger_path).entries()]
    assert "harvest_recorded" in kinds and "record_corrected" in kinds


def test_the_date_and_the_parcel_cannot_be_corrected():
    add()
    r = client.patch(
        f"{BASE}/harvests/P1~2025-10-20",
        json={"changes": {"harvested_on": "2025-10-21"}, "reason": "x", "corrected_by": "Ann"},
        headers=ANN,
    )
    assert r.status_code == 422 and "void the record" in r.text


def test_a_future_harvest_date_is_refused():
    assert add(harvested_on="2999-01-01").status_code == 422


PLAN = {
    "transplant_date": "2025-07-01",
    "duration_days": 110,
    "seedbed_days": 0,
    "hills_per_m2": 25,
    "plants_per_hill": 3,
    "water": {"regime": "continuous", "awd_threshold_cm": None, "reflood_cm": 5},
    "bund_height_cm": 20,
    "trench": None,
    "fish": False,
    "percolation_mm_day": 2,
    "soil_n_kg_ha": 30,
    "events": [],
    "weather_years": [2025],
}


def test_every_number_in_a_harvest_record_carries_provenance():
    add(plan=PLAN)
    rows = client.get(f"{BASE}/harvests", headers=ANN).json()
    assert rows["harvests"][0]["plan"]["hills_per_m2"] == 25
    assert bare_numbers(rows["harvests"]) == []


def test_the_evidence_pack_lists_harvests_with_voided_ones_marked():
    add()
    add(harvested_on="2024-10-18", fresh_kg=4500)
    client.delete(
        f"{BASE}/harvests/P1~2024-10-18",
        params={"reason": "duplicate", "voided_by": "Ann"},
        headers=ANN,
    )
    pack = client.get(
        "/api/v1/agriquill/farms/farm_h/evidence-pack", params={"parcel": "P1"}, headers=ANN
    )
    if pack.status_code == 404:
        pack = client.get(
            "/api/v1/agriquill/contracts/farm_h/evidence-pack",
            params={"parcel": "P1"},
            headers=ANN,
        )
    assert pack.status_code == 200, pack.text
    rows = pack.json()["harvests"]
    assert [h["harvested_on"] for h in rows] == ["2025-10-20", "2024-10-18"]
    assert rows[1]["voided_at"] and not rows[0].get("voided_at")
    assert "plan" not in rows[0]
