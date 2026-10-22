# AgroGuard Unified: agent guide

The workspace rules in `../AGENTS.md` still apply (commit prefixes, `-` bullet bodies, no Co-Authored line, no new dependency without approval, no comments unless asked).

## Map
- `apps/agroguard-web`: the AgroGuard web app (React and Vite). The farm map feature lives in `src/features/farm-simulation/` and is served at `/farmsim/`.
- `backend/agroguard`: the AgroGuard API (FastAPI, PostgreSQL, MongoDB for health updates). Port 8000.
- `backend/agriquill`: the farm map API (FastAPI, SQLite stores, a hash-chained ledger). Port 8010. The code still uses the name AgriQill. In docs and UI, call it the farm map.
- `gateway`: the single entry on port 4000.
- Plans: `../BUILD_PLAN_BACKEND.md` and `../BUILD_PLAN_FRONTEND.md`. IDs such as B-TS-2 match between the two files. Handoff: `docs/FARM_MAP_HANDOFF.md`.

## Commands
- Everything: `npm run verify:farm-map` from this folder.
- Backend: from `backend/agriquill`, run `.venv/Scripts/python.exe -m pytest -q` and `ruff check agriquill tests`.
- Frontend: from `apps/agroguard-web`, run `npm run typecheck` and `npm run test:farm-sim`.
- Run the farm map API: `AGRIQUILL_ENVIRONMENT=development .venv/Scripts/python.exe -m uvicorn agriquill.api.main:app --port 8010`.

## Invariants
- No invented numbers. Every number carries its provenance (measured, modelled, inferred, fixture, unavailable). An unknown is null with a reason, never a fill.
- The hard gates in `agriquill/gates.py` and `agriquill/safety.py` are never weakened by new code, and no persona or plan can override them.
- A new model ships in shadow first. It is promoted only after it beats the current one on the plan's named backtest, with walk-forward splits and no future data.
- Values marked TO VERIFY in the build plans stay labelled TO VERIFY in code and UI until DAR Yezin, the DOA, a certifier or a lab confirms them.
- Never read, print or commit `.env`, `.env.*`, `keys.env` or the workspace-root `doc_*.env`.
- Stage explicit paths only. Leave files that other agents changed alone.
