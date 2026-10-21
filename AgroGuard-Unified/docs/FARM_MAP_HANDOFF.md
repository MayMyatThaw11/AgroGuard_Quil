# Farm map (AgriQill) handoff

Branch: `farm-simulation`. Full plan: BUILD_PLAN_BACKEND.md and BUILD_PLAN_FRONTEND.md at the workspace root.

## Done
- Phase A (commit 435b056): your onboarded farm on the farm map, minimal panel, honest status, Kalman band, AgroGuard links.
- Phase A+ item 1, B-GIS-2: Sentinel-2 Collection 1 NDVI/NDWI per paddy (`agriquill/data/sentinel2.py`, `GET /contracts/{id}/satellite`). Cloudy scenes stay null with a reason. Collection 1 is used because the legacy collection's `boa_offset_applied` flag contradicts its `raster:bands` offset.

## Next, in order
1. Phase A+ rest:
   - trace a boundary on satellite (B-GIS-1 check, save via onboard)
   - B-GIS-3 radar witness: shadow only, hidden in the demo
   - OSM outline suggestion: hidden in the demo
2. Phase E: plans for two kinds of user (manual and tech), from the user's own budget, crew and machines; CP-SAT and gates; measured outcomes only.
3. Phase F: agent tooling:
   - `AGENTS.md` and a `CLAUDE.md` that imports it
   - `.claude/settings.json` deny rules for `.env*`
   - `verify` skill and `PreToolUse` hook
4. Phase B: farm map colours from the ui-color-palette MCP; theme sync. Note that BUILD_PLAN_FRONTEND §3.2 says light only, so ask the owner first.
5. Phase C (W1, not built yet): B-TS-1, B-TS-2, B-TS-4, B-TS-11, B-AG-2, B-AG-3, B-AG-12, B-TR-6, B-AG-1. Fetch the B-AG-1 texts from eCFR and EUR-Lex.
6. Phase D: all W2 items in shadow, starting with B-TS-5. Phase W3: prepare harnesses only.

Every phase ends with tests, screenshots at 1440 and 375 px, a differentiation check with cited sources, and a SMART report.

## Local run (tested)
- Farm Simulation API: from `backend/agriquill`, run `AGRIQUILL_ENVIRONMENT=development .venv/Scripts/python.exe -m uvicorn agriquill.api.main:app --port 8010`
- AgroGuard API on temporary port 8100 (8000 is taken by the council API): from `backend/agroguard`, run `.venv/Scripts/python.exe -m uvicorn app.main:app --port 8100`. Its `.env` (gitignored) points at a portable PostgreSQL 17 on 127.0.0.1:55432 in the session scratchpad. Recreate it if the scratchpad is gone. Telegram and LLM keys are deliberately blank.
- Web: from `apps/agroguard-web`, run `AGROGUARD_API_TARGET=http://127.0.0.1:8100 npm run dev -- --port 5180`. Port 5173 is used by other agents. Switch back to 8000 and 5173 once they are free.
- Test farm: `gate-check` (onboarded at 19.75, 96.13). Sign-in: Farm Manager / FARMSIM-2026.

## Known issues
- `test_gleam_outage_gives_null_with_reasons_and_the_breaker_stops_hammering` is flaky. Concurrent `guarded()` calls race the breaker; the fix is a design decision about the shared Breaker.
- Mongo is not running locally, so Health Updates shows as unavailable.
- Never stage `doc_*.env` at the workspace root. It holds live secrets and is not gitignored.
