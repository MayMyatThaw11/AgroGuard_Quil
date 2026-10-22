# Farm map handoff

The farm map feature (code name AgriQill) runs on branch `farm-simulation`. The full plan is in BUILD_PLAN_BACKEND.md and BUILD_PLAN_FRONTEND.md at the workspace root. Agent rules are in `AGENTS.md` and `CLAUDE.md`. The phase gate is `npm run verify:farm-map`, together with the `verify` skill.

## Done
- **Phase A** (435b056): your onboarded farm on the farm map.
  - minimal panel with an honest status
  - Kalman band and links to AgroGuard
- **B-GIS-2** (42fa1c2, 2444e84): Sentinel-2 Collection 1 NDVI and NDWI per paddy.
  - Cloudy dates stay null with a reason.
  - A pass over a tile edge counts once, with the other scene ids listed under `also`.
- **Phase F** (4c02667, b671322): agent tooling.
  - `AGENTS.md`, `CLAUDE.md`, and `.claude/settings.json` with deny rules
  - command guard hook with a self-test
  - `verify` skill and `npm run verify:farm-map`
- **Trace on satellite** (14cbd2b):
  - click corners, which are ignored below zoom 14
  - the server's B-GIS-1 checks give the verdict, and nothing is saved on a refusal
  - bottom sheet on phones
- **Area-driven numbers** (878d2ca):
  - water to add = advisory deficit mm × boundary area, only when the advice was made for the linked field
  - Paw San harvest range, 2.6–3.37 t/ha, TO VERIFY
- **B-GIS-3 radar witness, shadow** (b4fa605):
  - Sentinel-1 RTC VV in dB from Planetary Computer, with float predictor-3 decoding checked against real backscatter
  - open-water threshold of −18 dB, TO VERIFY
  - wet-dry cycles under twice the same-orbit revisit (12 days) are reported as undetectable
  - agreement against chance, withheld under 10 pairs
  - shown only with `?experimental`
- **Flood and elevation risk** (5375166):
  - height from Copernicus DEM GLO-90 (under 4 m LE90)
  - GloFAS v4 flow for the nearest and the largest of five nearby cells
  - Gumbel L-moment 2-, 5- and 10-year flows
  - 51-member ensemble chance over 30 days
  - per-parcel harvest-early or protect advice, plus a planting month that clears the usual peak
  - 30-day history cache, and a stale copy served on HTTP 429

## Next, in order
1. Phase A+ last item: OSM outline suggestion, hidden in the demo.
   - Ask the owner before any segmentation model.
2. Site context deepening (the /deepen findings):
   - facts over the boundary ring, not one point
   - longer coast search, because salinity and surge reach tens of km
   - volcano proximity from the Smithsonian GVP Holocene list
   - heat-stress days from ERA5 daily max
   - move the browser `siteFacts` reads behind one backend site-context endpoint
3. Phase E: decision plans for a manual farmer and a tech/drone farmer.
   - inputs: the user's own budget, crew and machines
   - CP-SAT and the hard gates
   - measured outcomes only
   - about 5 variations of one farm across inputs, season, inflation (from a cited CPI source, or user-entered) and hazard alerts
   - rice-fish and rice-shrimp suitability from the existing technique catalogue (families 19 and 30) and site facts
4. Flow view, the owner's brief of 22 Oct. Every flow is one term in a mass balance, with its own provenance and uncertainty, so flows combine and the sum can be audited.
   - water: ΔW = P + I + S_in + C_r − ET − S_out − P_c − R_out
     - ET split into T and E with FAO-56 dual Kc
     - percolation and seepage from the tube drop-down fit
   - nitrogen: uptake, NH₃, denitrification and leaching, from the farm's inputs log; literature ranges only as cited TO VERIFY references
   - canopy: VPD from Open-Meteo humidity and temperature, and leaf-wetness hours, as a blast and sheath-blight trigger
   - CH₄ under continuous flooding versus AWD, IPCC 2019 Tier 1 scaling factors, cited
   - pest versus predator corridor and spray-timing gate
   - input-to-margin Sankey from the user's prices
   - views: a 2-D cross-section with vector arrows, plus a Sankey
5. Phase B: light palette from the ui-color-palette MCP; replace the off-brand #2563eb.
6. Phase C (W1): B-TS-1, B-TS-2, B-TS-4, B-TS-11, B-AG-2, B-AG-3, B-AG-12, B-TR-6, B-AG-1 (fetch eCFR and EUR-Lex texts).
7. Phase D: every W2 item in shadow, starting with B-TS-5. Prepare harnesses only for W3.

Every phase ends with:
- tests
- screenshots at 1440 and 375 px
- a differentiation check with cited sources
- a SMART report

## Local run (tested 22 Oct)
- Portable PostgreSQL 17.6 in the session scratchpad. Run `pg_ctl -D <scratchpad>/pgdata -o "-p 55432" start`. `backend/agroguard/.env` (gitignored) points at it.
- Farm map API: from `backend/agriquill`, run `AGRIQUILL_ENVIRONMENT=development .venv/Scripts/python.exe -m uvicorn agriquill.api.main:app --port 8010`. It runs without `--reload`, so restart after backend edits.
- AgroGuard API: from `backend/agroguard`, run `.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`.
- Web: from `apps/agroguard-web`, run `npm run dev -- --port 5173 --strictPort`. It listens on IPv6 localhost, so use `http://localhost:5173/farmsim/`, not 127.0.0.1.
- Sign in as Farm Manager / FARMSIM-2026.
- Test farms:
  - `gate-check` at 19.75, 96.13
  - `trace-demo` (traced, 12.53 ha)
  - `farm_ayeyarwady_demo`, the delta demo at about 2 m
- Screenshot scripts in the scratchpad: `trace.mjs`, `own.mjs` and `own_exp.mjs` (`?experimental`).

## Known issues
- `test_gleam_outage_gives_null_with_reasons_and_the_breaker_stops_hammering` is flaky in the full suite. The shared Breaker races; fixing it needs a design decision.
- Mongo is not running locally, so Health Updates shows as unavailable.
- The Open-Meteo free tier limits requests per minute. A cold flood read for two farms in one minute can return 429. After that the 30-day history cache absorbs it.
- The high-risk flood alert is unit-tested, but has not yet been seen live, because the current forecast is low.
- Never stage the workspace-root `doc_*.env`. It holds live secrets.
