from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from . import ledger as _ledger
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
PREFIX_QUERY = "SELECT payload FROM records WHERE source = ? AND key >= ? AND key < ?"


class RecordConflict(ValueError):
    pass


def _after(prefix: str) -> str:
    return prefix[:-1] + chr(ord(prefix[-1]) + 1)


def record_id(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]


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
    _ledger.close_all()


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

    def items(self, source: str, prefix: str | None = None) -> list[Any]:
        conn, lock = self._conn()
        with lock:
            if prefix:
                rows = conn.execute(PREFIX_QUERY, (source, prefix, _after(prefix))).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload FROM records WHERE source = ?", (source,)
                ).fetchall()
        return [json.loads(r["payload"]) for r in rows]

    def update(
        self, source: str, key: str, fn: Callable[[Any], Any], url: str, ttl_s: float | None = None
    ) -> tuple[Any, str]:
        """Read, change and write one row as one transaction; `fn` must not touch the store."""
        conn, lock = self._conn()
        with lock:
            # IMMEDIATE takes SQLite's write lock before the read, so other processes wait too.
            conn.execute("BEGIN IMMEDIATE")
            try:
                row = conn.execute(
                    "SELECT payload FROM records WHERE source = ? AND key = ?", (source, key)
                ).fetchone()
                payload = fn(json.loads(row["payload"]) if row else None)
                digest = sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8"))
                stamp = time.time()
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
            except BaseException:
                conn.rollback()
                raise
        return payload, digest

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


CORRECTION_STAMPS = ("corrected_at", "corrected_by", "correction_reason")


def live_row(old: Any, rid: str) -> dict[str, Any]:
    if old is None:
        raise KeyError(rid)
    if old.get("voided_at"):
        raise RecordConflict(f"record {rid} was voided at {old['voided_at']}; record a new one")
    return dict(old)


def editable(changes: Mapping[str, Any], allowed: tuple[str, ...]) -> None:
    if not changes:
        raise ValueError("nothing to correct")
    fixed = sorted(set(changes) - set(allowed))
    if fixed:
        raise ValueError(f"{fixed[0]} cannot be corrected; void the record and add it again")


def void_record(
    cache: RecordCache, source: str, key: str, farm_id: str, rid: str, reason: str, by: str
) -> dict[str, Any]:
    def mark(old: Any) -> dict[str, Any]:
        return {
            **live_row(old, rid),
            "voided_at": now_iso(),
            "void_reason": reason,
            "voided_by": by,
        }

    row, digest = cache.update(source, key, mark, f"agriquill:{source}/{farm_id}")
    get_ledger(get_settings().ledger_path).append(
        "record_voided",
        {
            "farm_id": farm_id,
            "record": source,
            "id": rid,
            "reason": reason,
            "by": by,
            "sha256": digest,
        },
    )
    return dict(row)


def correct_record(
    cache: RecordCache,
    source: str,
    key: str,
    farm_id: str,
    rid: str,
    fix: Callable[[dict[str, Any]], dict[str, Any]],
    reason: str,
    by: str,
) -> dict[str, Any]:
    seen: list[dict[str, Any]] = []

    def apply(old: Any) -> dict[str, Any]:
        seen.append(live_row(old, rid))
        stamps = {"corrected_at": now_iso(), "corrected_by": by, "correction_reason": reason}
        return {**fix(seen[-1]), **stamps}

    row, digest = cache.update(source, key, apply, f"agriquill:{source}/{farm_id}")
    before = seen[-1]
    changed = sorted(
        k
        for k in before.keys() | row.keys()
        if k not in CORRECTION_STAMPS and before.get(k) != row.get(k)
    )
    get_ledger(get_settings().ledger_path).append(
        "record_corrected",
        {
            "farm_id": farm_id,
            "record": source,
            "id": rid,
            "reason": reason,
            "by": by,
            "old": {k: before.get(k) for k in changed},
            "new": {k: row.get(k) for k in changed},
            "sha256": digest,
        },
    )
    return dict(row)


def source_ref(provider: str, url: str, retrieved_at: str, digest: str) -> dict[str, str]:
    return {"provider": provider, "url": url, "retrieved_at": retrieved_at, "sha256": digest}


def log_fetch(source: str, key: str, digest: str) -> None:
    key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    get_ledger(get_settings().ledger_path).append(
        "evidence_fetch", {"source": source, "key_hash": key_hash, "sha256": digest}
    )


def missing(field: str, reason: str) -> dict[str, str]:
    return {"field": field, "reason": reason}
