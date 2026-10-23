import hashlib
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from agriquill import store, vault
from agriquill.api.main import create_app
from agriquill.config import get_settings
from agriquill.ledger import get_ledger

FARM = "farm_ayeyarwady_demo"


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def test_the_vault_has_every_zone_and_the_agents_rules() -> None:
    base = vault.ensure()
    for zone in vault.ZONES:
        assert (base / zone).is_dir()
    assert "human/" in (base / "AGENTS.md").read_text(encoding="utf-8")


def test_a_farm_file_round_trips_through_front_matter() -> None:
    out = vault.write_farm(FARM)
    loaded = vault.read_farm(FARM)
    assert loaded is not None
    front, body = loaded
    assert front.farm_id == FARM and front.paddies and front.contract_sha256.startswith("sha256:")
    assert body.startswith(f"# Farm {FARM}")
    assert out["farm"]["paddies"][0]["id"] == front.paddies[0].id


def test_unknown_values_are_null_with_a_reason_not_filled() -> None:
    front = vault.write_farm(FARM)["farm"]
    for key in ("soil_properties", "financial_state", "sensor_confidence_score"):
        assert key not in front and front["missing"][key]


def test_every_write_is_chained_with_the_file_hash() -> None:
    out = vault.write_farm(FARM)
    data = (vault.root() / out["path"]).read_bytes()
    ledger = get_ledger(get_settings().ledger_path)
    assert ledger.verify()
    assert out["sha256"] == f"sha256:{hashlib.sha256(data).hexdigest()}"
    assert ledger.head_hash() == out["ledger_hash"]


def test_code_never_writes_the_human_zone_or_leaves_the_vault() -> None:
    with pytest.raises(vault.VaultError):
        vault.write("human/scouting_notes/x.md", "x")
    with pytest.raises(vault.VaultError):
        vault.write("../escape.md", "x")
    with pytest.raises(vault.VaultError):
        vault.farm_rel("../x")


def test_notes_are_added_never_overwritten_and_size_limited() -> None:
    first = vault.add_note(FARM, "Brown spots on lower leaves, plot 2.", "Ann")
    second = vault.add_note(FARM, "Same spots, now on plot 3.", "Ann")
    assert first["path"] != second["path"]
    listed = vault.notes(FARM)
    assert {n["text"] for n in listed} == {
        "Brown spots on lower leaves, plot 2.",
        "Same spots, now on plot 3.",
    }
    with pytest.raises(vault.VaultError):
        vault.add_note(FARM, "x" * (vault.NOTE_LIMIT + 1), "Ann")
    with pytest.raises(vault.VaultError):
        vault.add_note(FARM, "   ", "Ann")


def test_a_body_line_is_appended_once() -> None:
    vault.write_farm(FARM)
    vault.append_body(FARM, "- 2026-10-23: depth band unknown")
    assert vault.append_body(FARM, "- 2026-10-23: depth band unknown")["unchanged"]
    loaded = vault.read_farm(FARM)
    assert loaded is not None and loaded[1].count("2026-10-23") == 1


def _stub_live(farm_id: str, client: object = None) -> dict[str, object]:
    return {
        "paddies": [
            {"id": "P1", "now": 4.2, "sigma_cm": 1.1, "source": "MEASURED", "band": None},
            {"id": "P2", "now": None, "missing": [{"field": "water_depth", "reason": "no tube"}]},
        ]
    }


def _stub_et0(lat: float, lon: float, day: date, client: object = None) -> dict[str, object]:
    return {"et0_mm_day": None, "missing": [{"field": "et0", "reason": "fill value"}]}


def test_dawn_sync_writes_known_depth_and_unknowns_with_reasons(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(vault.live, "build_live", _stub_live)
    monkeypatch.setattr(vault.nasapower, "et0", _stub_et0)
    day = date(2026, 10, 23)
    out = vault.dawn_sync(today=day)
    assert out["farms"][FARM]["status"] == "OK"
    loaded = vault.read_farm(FARM)
    assert loaded is not None
    body = loaded[1]
    assert "P1 water depth: 4.2 cm" in body
    assert "P2 water depth: unknown (no tube)" in body
    assert "ET0 2026-10-20: unknown (fill value)" in body
    assert (vault.root() / "daily" / "2026-10-23.md").exists()
    assert (vault.root() / "machine" / "kalman_water_bands" / f"{FARM}-2026-10-23.md").exists()


def test_two_dawn_runs_on_one_day_keep_one_section(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vault.live, "build_live", _stub_live)
    monkeypatch.setattr(vault.nasapower, "et0", _stub_et0)
    day = date(2026, 10, 23)
    vault.dawn_sync(today=day)
    vault.dawn_sync(today=day)
    loaded = vault.read_farm(FARM)
    assert loaded is not None and loaded[1].count("## Dawn sync 2026-10-23") == 1


def test_a_failed_plan_leaves_depth_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(farm_id: str, client: object = None) -> dict[str, object]:
        raise TimeoutError

    monkeypatch.setattr(vault.live, "build_live", broken)
    monkeypatch.setattr(vault.nasapower, "et0", _stub_et0)
    out = vault.dawn_sync(today=date(2026, 10, 23))
    assert "unknown (live plan failed: TimeoutError)" in out["farms"][FARM]["lines"][0]


@pytest.fixture
def api() -> Iterator[TestClient]:
    settings = get_settings()
    saved = settings.users
    settings.users = SecretStr(f"Ann:code-a:crew,manager:{FARM}; Bob:code-b:crew:farm_other")
    yield TestClient(create_app())
    settings.users = saved


BASE = f"/api/v1/agriquill/farms/{FARM}/vault"
ANN = {"X-AgriQuill-Write-Token": "code-a"}


def test_the_farm_file_is_served_with_notes_and_councils(api: TestClient) -> None:
    note = {"text": "Water at the low corner is green.", "added_by": "Ann"}
    assert api.post(f"{BASE}/notes", json=note, headers=ANN).status_code == 200
    evaluation = {
        "field_id": "P1",
        "stage": "Flowering",
        "verdicts": {"alpha": {"verdict": "HOLD", "untraced_numbers": []}},
        "notes": ["[CIRCUIT_BREAKER_INTERCEPT] Invariant B Violated: SKU 'X' banned."],
    }
    sent = api.post(
        f"{BASE}/council", json={"evaluation": evaluation, "sent_by": "Ann"}, headers=ANN
    )
    assert sent.status_code == 200 and sent.json()["council"]["intercepts"]
    got = api.get(BASE, headers=ANN).json()
    assert got["markdown"].startswith("---\n") and got["farm"]["farm_id"] == FARM
    assert got["notes"][0]["text"] == note["text"]
    assert got["councils"][0]["verdicts"] == {"alpha": "HOLD"}


def test_vault_writes_need_the_farm_and_the_right_name(api: TestClient) -> None:
    note = {"text": "x", "added_by": "Ann"}
    assert api.post(f"{BASE}/notes", json=note).status_code == 401
    bob = {"X-AgriQuill-Write-Token": "code-b"}
    assert (
        api.post(f"{BASE}/notes", json={**note, "added_by": "Bob"}, headers=bob).status_code == 403
    )
    assert (
        api.post(f"{BASE}/notes", json={**note, "added_by": "Bob"}, headers=ANN).status_code == 403
    )
    big = {"text": "x" * (vault.NOTE_LIMIT + 1), "added_by": "Ann"}
    assert api.post(f"{BASE}/notes", json=big, headers=ANN).status_code == 422
