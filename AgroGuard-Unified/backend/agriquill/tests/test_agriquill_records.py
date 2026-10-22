import json
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import certificates, cropvalue, evidence_pack, fumigation, live, lots, store
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.ledger import get_ledger

client = TestClient(create_app())
BASE = "/api/v1/agriquill/farms/farm_r"
ANN = {"X-AgriQuill-Write-Token": "code-a"}
CONTRACT = """farm farm_r {
    name: "Records farm"
    country: MM
    standard: EU_2018_848
}

parcel p1 {
    area: 1 ha
    crop: "rice"
}

parcel p2 {
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
    settings.users = SecretStr("Ann:code-a:crew,manager:farm_r")
    monkeypatch.setattr(
        cropvalue, "_yield", lambda iso3, item: {"t_ha": 3.9, "t_ha_5y": [3.8, 4.0], "year": 2024}
    )
    monkeypatch.setattr(live, "build_live", lambda farm_id: {"weather": {"days": []}})
    live.register("farm_r", CONTRACT, "Ann")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def ledger_intact() -> bool:
    return get_ledger(get_settings().ledger_path).verify()


def test_a_prefix_read_uses_the_primary_key_index():
    cache = store.RecordCache("contracts.sqlite")
    cache.put("lot", "farm_r|L1", {"farm_id": "farm_r"}, "test", "sha256:x", None)
    conn, _ = store.connect("contracts.sqlite")
    plan = conn.execute(
        f"EXPLAIN QUERY PLAN {store.PREFIX_QUERY}", ("lot", "farm_r|", "farm_r}")
    ).fetchall()
    detail = " ".join(row["detail"] for row in plan)
    assert "USING INDEX sqlite_autoindex_records_1" in detail and "SCAN" not in detail


def test_one_farm_among_a_thousand_reads_only_its_own_rows():
    rows = []
    for n in range(1000):
        farm = f"synthetic_{n}"
        for k in range(5):
            cert = {"kind": "gap", "number": f"G-{k}", "expires": "2030-01-01", "farm_id": farm}
            event = {"store": "W", "applied_at": f"2026-01-0{k + 1}", "product": "P"}
            fum = {**event, "parcels": ["p1"], "farm_id": farm, "blocks_organic": []}
            lot = {"id": f"L{k}", "farm_id": farm, "mass_kg": 1.0, "moisture": [], "mill": None}
            rows += [
                ("certificate", f"{farm}|gap|G-{k}", cert),
                ("fumigation", f"{farm}|W|2026-01-0{k + 1}|P", fum),
                ("lot", f"{farm}|L{k}", lot),
            ]
    conn, lock = store.connect("contracts.sqlite")
    with lock:
        conn.executemany(
            "INSERT INTO records VALUES (?, ?, 0, NULL, 'sha256:x', 'test', ?)",
            [(source, key, json.dumps(payload)) for source, key, payload in rows],
        )
        conn.commit()
    for farm in ("synthetic_1", "synthetic_10", "synthetic_999"):
        cal = certificates.calendar(farm, date(2026, 1, 1))["certificates"]
        assert len(cal) == 5 and {c["farm_id"] for c in cal} == {farm}
        assert {r["farm_id"] for r in fumigation.history(farm)} == {farm}
        assert len(lots.farm_lots_raw(farm)) == 5
    assert certificates.calendar("synthetic_1000")["certificates"] == []


def test_fifty_crews_logging_moisture_at_once_lose_no_reading():
    lots.record(
        "farm_r",
        {"id": "L1", "parcels": ["p1"], "harvested_on": "2026-11-20", "mass_kg": 100.0},
        "Ann",
    )

    def log(n: int) -> None:
        reading = {"measured_at": f"2026-11-21T08:{n:02d}:00+06:30", "moisture_pct": 18.0}
        lots.add_moisture("farm_r", "L1", reading, "Ann")

    with ThreadPoolExecutor(max_workers=50) as pool:
        list(pool.map(log, range(50)))
    assert len(lots.get("farm_r", "L1")["moisture"]) == 50
    assert ledger_intact()


def test_a_failed_update_writes_nothing():
    cache = store.RecordCache("contracts.sqlite")
    cache.put("lot", "farm_r|L9", {"n": 1}, "test", "sha256:x", None)

    def broken(old):
        raise ValueError("refused")

    with pytest.raises(ValueError):
        cache.update("lot", "farm_r|L9", broken, "test")
    assert cache.get("lot", "farm_r|L9")["payload"] == {"n": 1}


CERT = {
    "kind": "organic",
    "number": "OC-1",
    "issuer": "Cert",
    "country": "MM",
    "issued": "2026-01-01",
    "expires": "2027-01-01",
    "added_by": "Ann",
}
FUMIGATION = {
    "store": "W1",
    "parcels": ["p1"],
    "product": "Phostoxin",
    "active_ingredient": "aluminium phosphide",
    "method": "synthetic_chemical",
    "applied_at": "2026-10-01",
    "recorded_by": "Ann",
}
LOT = {
    "id": "L1",
    "parcels": ["p1"],
    "harvested_on": "2026-10-10",
    "mass_kg": 3000.0,
    "recorded_by": "Ann",
}


def fix(changes, reason="typo on the paper form"):
    return {"changes": changes, "reason": reason, "corrected_by": "Ann"}


VOID = {"reason": "entered twice", "voided_by": "Ann"}


def test_certificates_are_corrected_then_voided_and_stay_in_the_pack():
    made = client.post(f"{BASE}/certificates", json=CERT, headers=ANN).json()
    url = f"{BASE}/certificates/{made['id']}"
    bad = client.patch(url, json=fix({"expires": "2025-01-01"}), headers=ANN)
    assert bad.status_code == 422
    assert client.patch(url, json=fix({"number": "OC-2"}), headers=ANN).status_code == 422
    ok = client.patch(url, json=fix({"issuer": "Control Union"}), headers=ANN)
    assert ok.status_code == 200 and ok.json()["issuer"] == "Control Union"
    assert client.delete(url, params=VOID, headers=ANN).json()["void_reason"] == "entered twice"
    assert client.delete(url, params=VOID, headers=ANN).status_code == 409
    assert client.patch(url, json=fix({"issuer": "X"}), headers=ANN).status_code == 409
    assert client.post(f"{BASE}/certificates", json=CERT, headers=ANN).status_code == 409
    listed = client.get(f"{BASE}/certificates", headers=ANN).json()
    assert listed["certificates"] == [] and listed["total"] == 0
    shown = client.get(f"{BASE}/certificates?include_voided=true", headers=ANN).json()
    assert shown["certificates"][0]["voided_at"] and shown["alerts"] == []
    pack = evidence_pack.build("farm_r", "p1")
    assert pack["certificates"][0]["voided_at"] and pack["receipt"]["ledger_intact"]
    kinds = [e["kind"] for e in get_ledger(get_settings().ledger_path).entries()]
    assert kinds[-2:] == ["record_corrected", "record_voided"]
    corrected = get_ledger(get_settings().ledger_path).entries()[-2]["payload"]
    assert corrected["old"] == {"issuer": "Cert"} and corrected["new"] == {
        "issuer": "Control Union"
    }


def test_a_voided_fumigation_blocks_no_plot_but_stays_on_record():
    made = client.post(f"{BASE}/fumigations", json=FUMIGATION, headers=ANN).json()
    assert made["blocks_organic"] == ["p1"]
    url = f"{BASE}/fumigations/{made['id']}"
    moved = client.patch(url, json=fix({"parcels": ["p1", "p2"]}), headers=ANN).json()
    assert moved["blocks_organic"] == ["p1", "p2"] and set(moved["checks"]) == {"p1", "p2"}
    assert client.patch(url, json=fix({"parcels": ["ghost"]}), headers=ANN).status_code == 422
    assert client.patch(url, json=fix({"method": "smoke"}), headers=ANN).status_code == 422
    assert client.delete(url, params=VOID, headers=ANN).status_code == 200
    hidden = client.get(f"{BASE}/fumigations", headers=ANN)
    assert hidden.json() == [] and hidden.headers["X-Total-Count"] == "0"
    kept = client.get(f"{BASE}/fumigations?include_voided=true", headers=ANN).json()
    assert kept[0]["voided_at"] and kept[0]["blocks_organic"] == []
    assert kept[0]["checks"]["p1"]["result"] == "blocked"
    pack = evidence_pack.build("farm_r", "p1")
    assert pack["fumigations"][0]["void_reason"] == "entered twice"
    assert ledger_intact()


def test_lots_are_corrected_paged_and_voided():
    for n in range(3):
        body = {**LOT, "id": f"L{n}", "harvested_on": f"2026-10-1{n}"}
        assert client.post(f"{BASE}/lots", json=body, headers=ANN).status_code == 200
    page = client.get(f"{BASE}/lots?limit=2&offset=1", headers=ANN).json()
    assert [lot["id"] for lot in page["lots"]] == ["L1", "L0"] and page["total"] == 3
    assert client.get(f"{BASE}/lots?limit=501", headers=ANN).status_code == 422
    url = f"{BASE}/lots/L0"
    assert client.patch(url, json=fix({"mass_kg": -1}), headers=ANN).status_code == 422
    moved = client.patch(url, json=fix({"parcels": ["p1", "p2"]}), headers=ANN).json()
    assert moved["estimate"]["kg"] == 12000
    assert client.delete(url, params=VOID, headers=ANN).status_code == 200
    reading = {"measured_at": "2026-11-21T08:00:00+06:30", "moisture_pct": 18, "recorded_by": "Ann"}
    assert client.post(f"{url}/moisture", json=reading, headers=ANN).status_code == 409
    assert client.post(f"{BASE}/lots", json=LOT | {"id": "L0"}, headers=ANN).status_code == 409
    assert [lot["id"] for lot in client.get(f"{BASE}/lots", headers=ANN).json()["lots"]] == [
        "L2",
        "L1",
    ]
    assert client.patch(f"{BASE}/lots/nope", json=fix({"mass_kg": 1}), headers=ANN).status_code == (
        404
    )
    assert ledger_intact()


def test_correct_and_void_need_the_write_code():
    assert client.patch(f"{BASE}/lots/L0", json=fix({"mass_kg": 1})).status_code == 401
    assert client.delete(f"{BASE}/lots/L0", params=VOID).status_code == 401
