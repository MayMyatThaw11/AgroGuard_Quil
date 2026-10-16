from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

from . import knowledge
from .config import get_settings
from .data import ecocrop, fao_pack, farm_sites, regions
from .ledger import get_ledger
from .store import now_iso

MAX_RUNS = 200
ERROR_CHARS = 200


def _ecocrop_sync() -> dict[str, Any]:
    payload = ecocrop.sync(list(ecocrop.ASEAN_CROPS))
    ecocrop._STORE.clear()
    return {"crops": len(payload["crops"]), "not_found": payload["not_found"]}


def _contract_watch() -> dict[str, Any]:
    from . import live

    farms = sorted(set(live.SEEDS) | set(live.contract_farms()))
    out: dict[str, Any] = {}
    for farm_id in farms:
        try:
            result = live.watch(farm_id)
        except Exception as exc:  # one broken farm must not stop the others
            error = f"{type(exc).__name__}: {exc}"[:ERROR_CHARS]
            out[farm_id] = {"status": "FAILED", "error": error}
            continue
        out[farm_id] = {"status": result["live"]["status"], "proposals": len(result["proposals"])}
    return out


WATCH_JOB = "contract_watch"
JOBS: dict[str, tuple[str, Callable[[], dict[str, Any]]]] = {
    WATCH_JOB: (
        "Re-plan every registered contract from live weather and telemetry and raise proposals.",
        _contract_watch,
    ),
    "faostat_sync": (
        "Download the FAOSTAT QCL bulk file (crops and livestock) and pack ASEAN-11 and World.",
        fao_pack.sync_faostat,
    ),
    "crop_calendar_sync": (
        "Fetch FAO Crop Calendar entries for the ASEAN-11 (only MM and TL are covered).",
        fao_pack.sync_crop_calendar,
    ),
    "farm_sites_sync": (
        "Find mapped farmland polygons near each demo town in OpenStreetMap and cross-check them.",
        farm_sites.build,
    ),
    "regions_snapshot": (
        "Rebuild the real-data snapshot of the demo farm regions from CHIRPS, NASA POWER and FAO.",
        regions.build,
    ),
    "ecocrop_sync": ("Refresh the FAO EcoCrop requirements for the ASEAN crop set.", _ecocrop_sync),
    "knowledge_index": (
        "Rebuild the docs and vault search index when files changed.",
        knowledge.build,
    ),
}

_RUNS: dict[str, dict[str, Any]] = {}
_TASKS: dict[str, asyncio.Task[None]] = {}


def catalog() -> list[dict[str, Any]]:
    last: dict[str, dict[str, Any]] = {}
    for run in _RUNS.values():
        last[run["job"]] = run
    return [
        {"name": name, "description": desc, "last_run": last.get(name)}
        for name, (desc, _) in JOBS.items()
    ]


def status(run_id: str) -> dict[str, Any] | None:
    return _RUNS.get(run_id)


def _active(name: str) -> dict[str, Any] | None:
    return next(
        (r for r in _RUNS.values() if r["job"] == name and r["status"] in ("QUEUED", "RUNNING")),
        None,
    )


async def _execute(record: dict[str, Any], fn: Callable[[], dict[str, Any]]) -> None:
    record["status"] = "RUNNING"
    record["started_at"] = now_iso()
    try:
        record["result"] = await asyncio.to_thread(fn)
        record["status"] = "COMPLETED"
    except Exception as exc:  # a failed job is recorded, never raised into the loop
        record["status"] = "FAILED"
        record["error"] = f"{type(exc).__name__}: {exc}"[:ERROR_CHARS]
    record["finished_at"] = now_iso()
    get_ledger(get_settings().ledger_path).append(
        "job_run", {"job": record["job"], "run_id": record["run_id"], "status": record["status"]}
    )


def start(name: str) -> dict[str, Any]:
    if name not in JOBS:
        raise KeyError(name)
    running = _active(name)
    if running is not None:
        return running
    record: dict[str, Any] = {
        "run_id": f"job_{uuid.uuid4().hex[:12]}",
        "job": name,
        "status": "QUEUED",
        "queued_at": now_iso(),
    }
    _RUNS[record["run_id"]] = record
    while len(_RUNS) > MAX_RUNS:
        _RUNS.pop(next(iter(_RUNS)))
    task = asyncio.get_running_loop().create_task(_execute(record, JOBS[name][1]))
    _TASKS[record["run_id"]] = task
    task.add_done_callback(lambda _: _TASKS.pop(record["run_id"], None))
    return record


async def run_now(name: str) -> dict[str, Any]:
    record = start(name)
    task = _TASKS.get(record["run_id"])
    if task is not None:
        await task
    return record


async def scheduler(interval_s: float, names: list[str]) -> None:
    while True:
        for name in names:
            await run_now(name)
        await asyncio.sleep(interval_s)


@asynccontextmanager
async def background() -> AsyncIterator[None]:
    settings = get_settings()
    tasks = []
    if settings.job_interval_s > 0:
        data_jobs = [n for n in JOBS if n != WATCH_JOB]
        tasks.append(asyncio.create_task(scheduler(settings.job_interval_s, data_jobs)))
    if settings.watch_interval_s > 0:
        tasks.append(asyncio.create_task(scheduler(settings.watch_interval_s, [WATCH_JOB])))
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
