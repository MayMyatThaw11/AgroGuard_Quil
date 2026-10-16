from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

from .config import get_settings
from .store import connect, now_iso

DB_NAME = "knowledge.sqlite"
ROOTS = ("docs", "BrainAgroguard")
FILES = (
    "37 Farming Technique Families for ASEAN and Global Markets.md",
    "Dataset/Suitabiltyclass.md",
)
SKIP_PARTS = {".obsidian", "node_modules", "_incoming", ".git"}
HEADING = re.compile(r"^(#{1,3})\s+(.*\S)\s*$")
WORD = re.compile(r"[\w\-.]+", re.UNICODE)

SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
    path UNINDEXED, line UNINDEXED, heading, body, marker UNINDEXED,
    tokenize = 'porter unicode61'
);
CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, mtime REAL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


def _root() -> Path:
    return Path(get_settings().knowledge_root)


def corpus() -> list[Path]:
    root = _root()
    found: list[Path] = []
    for name in ROOTS:
        for path in sorted((root / name).rglob("*.md")):
            rel = path.relative_to(root)
            if SKIP_PARTS.isdisjoint(rel.parts) and not rel.name.startswith(".env"):
                found.append(path)
    found.extend(root / f for f in FILES if (root / f).is_file())
    return found


def marker_of(text: str) -> str | None:
    if "TO VERIFY" in text:
        return "TO VERIFY"
    if "[VERIFIED]" in text:
        return "VERIFIED"
    return None


def chunk(text: str) -> list[dict[str, Any]]:
    lines = text.splitlines()
    start = 0
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                start = i + 1
                break
    trail: list[str] = []
    out: list[dict[str, Any]] = []
    body: list[str] = []
    first = start + 1

    def emit() -> None:
        content = "\n".join(body).strip()
        if content:
            out.append({"line": first, "heading": " > ".join(trail), "body": content})

    for number, line in enumerate(lines[start:], start=start + 1):
        match = HEADING.match(line)
        if match:
            emit()
            level = len(match.group(1))
            trail[:] = trail[: level - 1] + [match.group(2)]
            body = []
            first = number
        else:
            body.append(line)
    emit()
    return out


_CHECKED: list[float] = []
CHECK_EVERY_S = 30.0


def stale() -> bool:
    conn, lock = connect(DB_NAME)
    with lock:
        conn.executescript(SCHEMA)
        known = {r["path"]: r["mtime"] for r in conn.execute("SELECT * FROM files")}
    root = _root()
    current = {str(p.relative_to(root)).replace("\\", "/"): p.stat().st_mtime for p in corpus()}
    return current != known


def build(force: bool = False) -> dict[str, Any]:
    if not force and not stale():
        return {"rebuilt": False}
    root = _root()
    rows: list[tuple[Any, ...]] = []
    files: list[tuple[str, float]] = []
    for path in corpus():
        rel = str(path.relative_to(root)).replace("\\", "/")
        text = path.read_text(encoding="utf-8", errors="replace")
        files.append((rel, path.stat().st_mtime))
        for part in chunk(text):
            rows.append((rel, part["line"], part["heading"], part["body"], marker_of(part["body"])))
    conn, lock = connect(DB_NAME)
    with lock:
        conn.executescript(SCHEMA)
        conn.execute("DELETE FROM chunks")
        conn.execute("DELETE FROM files")
        conn.executemany("INSERT INTO chunks VALUES (?, ?, ?, ?, ?)", rows)
        conn.executemany("INSERT INTO files VALUES (?, ?)", files)
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('built_at', ?)", (now_iso(),))
        conn.commit()
    return {"rebuilt": True, "files": len(files), "chunks": len(rows)}


def to_match(query: str) -> str:
    terms = [t for t in WORD.findall(query) if t.strip("-.")]
    return " ".join('"' + t.replace('"', "") + '"' for t in terms[:12])


def search(query: str, limit: int = 8) -> dict[str, Any]:
    match = to_match(query)
    if not match:
        return {
            "query": query,
            "hits": [],
            "missing": [{"field": "query", "reason": "no searchable words"}],
        }
    if not _CHECKED or time.monotonic() - _CHECKED[0] > CHECK_EVERY_S:
        build()
        _CHECKED[:] = [time.monotonic()]
    conn, lock = connect(DB_NAME)
    with lock:
        built = conn.execute("SELECT value FROM meta WHERE key = 'built_at'").fetchone()
        rows = conn.execute(
            "SELECT path, line, heading, marker, bm25(chunks, 0, 0, 4.0, 1.0) AS rank, "
            "snippet(chunks, 3, '[', ']', ' ... ', 24) AS snip "
            "FROM chunks WHERE chunks MATCH ? ORDER BY rank LIMIT ?",
            (match, max(1, min(limit, 25))),
        ).fetchall()
    return {
        "query": query,
        "provenance": "DOCUMENT",
        "index_built_at": built["value"] if built else None,
        "hits": [
            {
                "cite": f"{r['path']}#L{r['line']}",
                "heading": r["heading"],
                "snippet": r["snip"],
                "marker": r["marker"],
                "rank": round(r["rank"], 3),
            }
            for r in rows
        ],
        "missing": [] if rows else [{"field": "hits", "reason": "no passage matches every word"}],
        "note": "Project documents, not field evidence. Passages marked TO VERIFY are unconfirmed.",
    }
