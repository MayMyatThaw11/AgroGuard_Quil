import hashlib
import json
from pathlib import Path

from agriquill.ledger import Ledger, _canon


def test_two_writers_on_one_file_extend_one_chain(tmp_path: Path):
    path = tmp_path / "ledger.jsonl"
    api = Ledger(path)
    mcp = Ledger(path)
    api.append("a", {"n": 1})
    mcp.append("b", {"n": 2})
    api.append("c", {"n": 3})
    fresh = Ledger(path)
    assert [e["seq"] for e in fresh.entries()] == [0, 1, 2]
    assert fresh.verify() and api.verify() and mcp.verify()
    assert api.head_hash() == mcp.head_hash() == fresh.head_hash()


def test_a_nul_filled_line_left_by_a_crash_is_skipped(tmp_path: Path):
    path = tmp_path / "ledger.jsonl"
    Ledger(path).append("a", {"n": 1})
    with path.open("ab") as fh:
        fh.write(b"\x00" * 64 + b"\n")
    ledger = Ledger(path)
    ledger.append("b", {"n": 2})
    assert [e["seq"] for e in Ledger(path).entries()] == [0, 1]
    assert ledger.verify()


def test_editing_a_timestamp_breaks_the_chain(tmp_path: Path):
    path = tmp_path / "ledger.jsonl"
    ledger = Ledger(path)
    ledger.append("proposal_decided", {"decision": "approved"})
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    rows[0]["timestamp"] = "2020-01-01T00:00:00+00:00"
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    assert Ledger(path).verify() is False


def test_entries_written_before_timestamps_were_hashed_still_verify(tmp_path: Path):
    path = tmp_path / "ledger.jsonl"
    body = {"seq": 0, "kind": "old", "payload": {"x": 1}, "prev_hash": "GENESIS"}
    digest = "sha256:" + hashlib.sha256(_canon(body).encode("utf-8")).hexdigest()
    old = {**body, "timestamp": "2026-10-01T00:00:00+00:00", "hash": digest}
    path.write_text(json.dumps(old) + "\n", encoding="utf-8")
    ledger = Ledger(path)
    ledger.append("new", {"x": 2})
    assert Ledger(path).verify() is True
