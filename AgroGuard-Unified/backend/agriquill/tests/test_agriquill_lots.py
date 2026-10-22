from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import cropvalue, live, lots, store
from agriquill.api.main import create_app
from agriquill.config import get_settings

client = TestClient(create_app())
URL = "/api/v1/agriquill/farms/farm_l/lots"
ANN = {"X-AgriQuill-Write-Token": "code-a"}
CONTRACT = """farm farm_l {
    name: "Lot farm"
    country: MM
}

parcel paw {
    area: 1 ha
    crop: "Paw San Hmwe"
}

parcel other {
    area: 2 ha
    crop: "rice"
}
"""


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.users = SecretStr("Ann:code-a:crew,manager:farm_l")
    monkeypatch.setattr(
        cropvalue, "_yield", lambda iso3, item: {"t_ha": 3.9, "t_ha_5y": [3.8, 4.0], "year": 2024}
    )
    live.register("farm_l", CONTRACT, "Ann")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def lot(lot_id="L1", parcels=("paw",), mass=3000.0, certifier=None):
    return {
        "id": lot_id,
        "parcels": list(parcels),
        "harvested_on": "2026-11-20",
        "mass_kg": mass,
        "certifier": certifier,
    }


def test_a_lot_heavier_than_its_plots_plus_tolerance_is_flagged():
    ok = lots.record("farm_l", lot(mass=3700), "Ann")
    assert ok["estimate"]["limit_kg"] == round(3370 * 1.1) and ok["flags"] == []
    heavy = lots.record("farm_l", lot("L2", mass=4000), "Ann")
    assert heavy["flags"] and heavy["flags"][0].startswith("heavier than its plots")
    mixed = lots.record("farm_l", lot("L3", ("paw", "other"), mass=11000), "Ann")
    assert mixed["estimate"]["kg"] == 3370 + 8000 and mixed["flags"] == []


def test_one_lot_has_one_certification_body():
    lots.record("farm_l", lot(certifier="CertA"), "Ann")
    assert lots.record("farm_l", lot(certifier="CertA"), "Ann")["certifier"] == "CertA"
    with pytest.raises(lots.LotConflict, match="one certification body"):
        lots.record("farm_l", lot(certifier="CertB"), "Ann")


def test_storing_above_14_percent_moisture_warns():
    lots.record("farm_l", lot(), "Ann")
    reading = {"measured_at": "2026-11-21T08:00:00+06:30", "drying_method": "sun"}
    drying = lots.add_moisture(
        "farm_l", "L1", {**reading, "moisture_pct": 18.0, "storage": None}, "Ann"
    )
    assert drying["flags"] == []
    stored = lots.add_moisture(
        "farm_l",
        "L1",
        {
            **reading,
            "measured_at": "2026-11-22T08:00:00+06:30",
            "moisture_pct": 16.0,
            "storage": "sack",
        },
        "Ann",
    )
    assert any("above 14" in f for f in stored["flags"])


def test_a_lot_over_the_buyers_broken_percent_is_flagged_before_sale():
    lots.record("farm_l", lot(), "Ann")
    out = lots.add_mill("farm_l", "L1", {"broken_pct": 7.0, "buyer_max_broken_pct": 5.0}, "Ann")
    assert any("over the buyer's 5.0" in f for f in out["flags"])


def test_the_wettest_lot_facing_the_most_rain_dries_first():
    rows = [
        {"id": "a", "farm_id": "f1", "moisture_now": 18.0},
        {"id": "b", "farm_id": "f2", "moisture_now": 22.0},
        {"id": "c", "farm_id": "f3", "moisture_now": 18.0},
        {"id": "d", "farm_id": "f1", "moisture_now": 13.0},
    ]
    order = lots.drying_order(rows, {"f1": 2.0, "f2": 0.0, "f3": 30.0})
    assert [o["lot"] for o in order] == ["b", "c", "a"]


def test_api_records_lots_and_refuses_a_second_certifier():
    body = {**lot(certifier="CertA"), "recorded_by": "Ann"}
    assert client.post(URL, json=body, headers=ANN).status_code == 200
    second = client.post(URL, json={**body, "certifier": "CertB"}, headers=ANN)
    assert second.status_code == 409 and second.json()["code"] == "CONFLICT"
    unknown = client.post(
        f"{URL}/nope/mill", json={"broken_pct": 1, "recorded_by": "Ann"}, headers=ANN
    )
    assert unknown.status_code == 404
