from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import get_settings
from .ledger import get_ledger

_LOCK = threading.Lock()
_CONNS: dict[str, tuple[sqlite3.Connection, threading.Lock]] = {}

SCHEMA = """
CREATE TABLE IF NOT EXISTS records (
    source TEXT NOT NULL,
    key TEXT NOT NULL,
    fetched_at REAL NOT NULL,
    expires_at REAL,
    sha256 TEXT NOT NULL,
    url TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (source, key)
)
"""


def sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def data_path(name: str) -> Path:
    return Path(get_settings().data_dir) / name


def connect(name: str) -> tuple[sqlite3.Connection, threading.Lock]:
    path = data_path(name).resolve()
    key = str(path)
    with _LOCK:
        found = _CONNS.get(key)
        if found is None:
            path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(key, check_same_thread=False, timeout=30)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")
            found = (conn, threading.Lock())
            _CONNS[key] = found
        return found


def close_all() -> None:
    with _LOCK:
        for conn, _ in _CONNS.values():
            conn.close()
        _CONNS.clear()


class RecordCache:
    def __init__(self, name: str = "cache.sqlite") -> None:
        self.name = name

    def _conn(self) -> tuple[sqlite3.Connection, threading.Lock]:
        conn, lock = connect(self.name)
        with lock:
            conn.execute(SCHEMA)
        return conn, lock

    def get(self, source: str, key: str) -> dict[str, Any] | None:
        conn, lock = self._conn()
        with lock:
            row = conn.execute(
                "SELECT * FROM records WHERE source = ? AND key = ?", (source, key)
            ).fetchone()
        if row is None:
            return None
        expires = row["expires_at"]
        return {
            "payload": json.loads(row["payload"]),
            "sha256": row["sha256"],
            "url": row["url"],
            "retrieved_at": datetime.fromtimestamp(row["fetched_at"], UTC).isoformat(
                timespec="seconds"
            ),
            "stale": expires is not None and expires <= time.time(),
        }

    def items(self, source: str) -> list[Any]:
        conn, lock = self._conn()
        with lock:
            rows = conn.execute(
                "SELECT payload FROM records WHERE source = ?", (source,)
            ).fetchall()
        return [json.loads(r["payload"]) for r in rows]

    def put(
        self, source: str, key: str, payload: Any, url: str, digest: str, ttl_s: float | None
    ) -> None:
        stamp = time.time()
        conn, lock = self._conn()
        with lock:
            conn.execute(
                "INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    source,
                    key,
                    stamp,
                    None if ttl_s is None else stamp + ttl_s,
                    digest,
                    url,
                    json.dumps(payload, separators=(",", ":")),
                ),
            )
            conn.commit()


def source_ref(provider: str, url: str, retrieved_at: str, digest: str) -> dict[str, str]:
    return {"provider": provider, "url": url, "retrieved_at": retrieved_at, "sha256": digest}


def log_fetch(source: str, key: str, digest: str) -> None:
    key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    get_ledger(get_settings().ledger_path).append(
        "evidence_fetch", {"source": source, "key_hash": key_hash, "sha256": digest}
    )


def missing(field: str, reason: str) -> dict[str, str]:
    return {"field": field, "reason": reason}
