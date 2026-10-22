from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import certificates, store
from agriquill.api.main import create_app
from agriquill.config import get_settings

client = TestClient(create_app())
BASE = "/api/v1/agriquill"
ANN = {"X-AgriQuill-Write-Token": "code-a"}
CREW = {"X-AgriQuill-Write-Token": "code-c"}
TODAY = date(2026, 5, 1)


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    settings.users = SecretStr("Ann:code-a:crew,manager:farm_a; Cid:code-c:crew:farm_a")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def cert(kind: str, expires: date, number: str = "C-1") -> dict[str, str]:
    return {
        "kind": kind,
        "number": number,
        "issuer": "Department of Agriculture",
        "country": "TH",
        "issued": "2024-01-01",
        "expires": expires.isoformat(),
    }


def test_an_item_expiring_in_59_days_alerts_and_one_in_61_does_not():
    certificates.add("farm_a", cert("gap", TODAY + timedelta(days=59), "G-1"), "Ann")
    certificates.add("farm_a", cert("organic", TODAY + timedelta(days=61), "O-1"), "Ann")
    out = certificates.calendar("farm_a", TODAY)
    assert [c["number"] for c in out["alerts"]] == ["G-1"]
    assert out["alerts"][0]["alert"] == "due"


def test_alert_levels_follow_60_and_14_days():
    assert certificates.alert_level(61) is None
    assert certificates.alert_level(60) == "due"
    assert certificates.alert_level(14) == "urgent"
    assert certificates.alert_level(-1) == "expired"


def test_china_registration_reminds_before_30_june_even_with_a_later_expiry():
    certificates.add("farm_a", cert("china_exporter_registration", date(2027, 3, 1)), "Ann")
    row = certificates.calendar("farm_a", TODAY)["certificates"][0]
    assert row["due"] == "2026-06-30" and row["due_for"] == "renewal deadline"
    assert row["alert"] == "due" and row["deadline_status"] == "TO VERIFY"


def test_other_farms_certificates_stay_out_of_the_calendar():
    certificates.add("farm_b", cert("gap", TODAY + timedelta(days=5)), "Ann")
    assert certificates.calendar("farm_a", TODAY)["certificates"] == []


URL = f"{BASE}/farms/farm_a/certificates"


def test_api_records_a_certificate_for_a_manager_only():
    body = {**cert("gap", date(2030, 1, 1)), "added_by": "Ann"}
    ok = client.post(URL, json=body, headers=ANN)
    assert ok.status_code == 200, ok.text
    assert client.post(URL, json=body, headers=CREW).status_code == 403
    listed = client.get(URL, headers=ANN).json()
    assert listed["certificates"][0]["label"].startswith("Good Agricultural Practice")


def test_api_rejects_an_expiry_before_the_issue_date_and_unknown_kinds():
    bad = {**cert("gap", date(2023, 1, 1)), "added_by": "Ann"}
    assert client.post(URL, json=bad, headers=ANN).status_code == 422
    odd = {**cert("passport", date(2030, 1, 1)), "added_by": "Ann"}
    assert client.post(URL, json=odd, headers=ANN).status_code == 422
