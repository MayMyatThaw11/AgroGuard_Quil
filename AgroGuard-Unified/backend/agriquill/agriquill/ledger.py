from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _canon(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


@dataclass
class LedgerEntry:
    seq: int
    timestamp: str
    kind: str
    payload: dict[str, Any]
    prev_hash: str
    hash: str = ""
    v: int = 1

    def to_dict(self) -> dict[str, Any]:
        out = {
            "seq": self.seq,
            "timestamp": self.timestamp,
            "kind": self.kind,
            "payload": self.payload,
            "prev_hash": self.prev_hash,
            "hash": self.hash,
        }
        if self.v >= 2:
            out["v"] = self.v
        return out


def _body(e: LedgerEntry) -> dict[str, Any]:
    body = {"seq": e.seq, "kind": e.kind, "payload": e.payload, "prev_hash": e.prev_hash}
    if e.v >= 2:
        body["timestamp"] = e.timestamp
        body["v"] = e.v
    return body


def _digest(e: LedgerEntry) -> str:
    return f"sha256:{hashlib.sha256(_canon(_body(e)).encode('utf-8')).hexdigest()}"


class Ledger:
    """Append-only SHA-256 chain. Any edit to a past entry changes every
    subsequent hash, so tampering is detectable. Entries from v2 on also hash
    their timestamp. Appends hold a SQLite lock beside the file, so several
    processes (API, MCP server, CLI) extend one chain instead of forking it.
    One lock connection is opened per ledger and used only under the thread lock."""

    def __init__(self, path: str | Path | None = None) -> None:
        self._lock = threading.Lock()
        self._path = Path(path) if path else None
        self._lock_conn: sqlite3.Connection | None = None
        self._entries: list[LedgerEntry] = []
        self._offset = 0
        self._sync()

    def _sync(self) -> None:
        if not self._path or not self._path.exists():
            return
        with self._path.open("rb") as fh:
            fh.seek(self._offset)
            for line in fh:
                if not line.endswith(b"\n"):
                    break
                if line.strip(b"\x00 \t\r\n"):  # a crash can leave a NUL-filled line
                    self._entries.append(LedgerEntry(**json.loads(line)))
                self._offset += len(line)

    @contextmanager
    def _process_lock(self) -> Iterator[None]:
        if not self._path:
            yield
            return
        if self._lock_conn is None:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._lock_conn = sqlite3.connect(
                f"{self._path}.lock", timeout=30, check_same_thread=False
            )
        conn = self._lock_conn
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield
        finally:
            conn.rollback()

    def close(self) -> None:
        with self._lock:
            if self._lock_conn is not None:
                self._lock_conn.close()
                self._lock_conn = None

    def head_hash(self) -> str:
        with self._lock:
            self._sync()
            return self._entries[-1].hash if self._entries else "GENESIS"

    def append(self, kind: str, payload: dict[str, Any]) -> LedgerEntry:
        with self._lock, self._process_lock():
            self._sync()
            entry = LedgerEntry(
                seq=len(self._entries),
                timestamp=datetime.now(UTC).isoformat(),
                kind=kind,
                payload=payload,
                prev_hash=self._entries[-1].hash if self._entries else "GENESIS",
                v=2,
            )
            entry.hash = _digest(entry)
            self._entries.append(entry)
            if self._path:
                line = (json.dumps(entry.to_dict()) + "\n").encode("utf-8")
                with self._path.open("ab") as fh:
                    fh.write(line)
                self._offset += len(line)
            return entry

    def verify(self) -> bool:
        with self._lock:
            self._sync()
            prev = "GENESIS"
            for e in self._entries:
                if e.prev_hash != prev or e.hash != _digest(e):
                    return False
                prev = e.hash
            return True

    def entries(self) -> list[dict[str, Any]]:
        with self._lock:
            self._sync()
            return [e.to_dict() for e in self._entries]


# Process-wide singleton per path. The API router and MCP tools must share one
# in-memory chain and one append handle, otherwise two ledgers write
# interleaved, independently-sequenced chains into the same JSONL file.
_INSTANCES: dict[str, Ledger] = {}
_REGISTRY_LOCK = threading.Lock()


def get_ledger(path: str | Path) -> Ledger:
    key = str(Path(path).resolve())
    with _REGISTRY_LOCK:
        ledger = _INSTANCES.get(key)
        if ledger is None:
            ledger = Ledger(key)
            _INSTANCES[key] = ledger
        return ledger


def close_all() -> None:
    with _REGISTRY_LOCK:
        ledgers = list(_INSTANCES.values())
    for ledger in ledgers:
        ledger.close()
