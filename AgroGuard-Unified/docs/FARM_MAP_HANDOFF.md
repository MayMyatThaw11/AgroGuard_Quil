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

## Done on 22 Oct, second block (W1 in the owner's order)
- **B-TS-1** (97cfd82): every backtest candidate has a P10–P90 band and coverage "X of N", hidden under 10. The ops table has an "In band" column, and the paddy chart has the F-TS-1 trust line. First result: the chosen band holds 36 of 70, below the nominal 80 %.
- **B-TS-2** (1929e8f): pinball quantile heads in shadow. The interval score (α 0.2) is reported for every candidate. Heads replace MC dropout only with a lower interval score and coverage closer to 80 % on 30 or more pairs.
- **B-TS-4** (9e12c65): Huber-robust Kalman update.
  - A forged +20 cm reading moves the estimate 0.9 cm.
  - Two agreeing readings within 96 h accept a jump.
  - A contradicting reading makes the depth "unknown: conflicting readings" and still raises an inspection proposal.
- **B-TS-11** (2fbdf56): SPI-1/3/6 by the WMO gamma-mixed method, plus Nov–Jan harvest-rain odds (25 mm threshold TO VERIFY). Township fields stay null until the next `regions` snapshot build, which needs the network for CHIRPS.
- **B-AG-1** (8479fb7): `prohibited_inputs.csv` from fetched eCFR (205.105/.601/.602/.604/.271) and EU 2021/1165 Annexes I and II. Each row has a clause, URL and date, and is TO VERIFY. NOP now blocks carbamates, per 205.105(a). ASOA and GB/T 19630 texts are not fetched.
- **Plan-order correction:** W1 was deferred earlier because I resumed from a plan the owner had rejected (transcript lines 3239–3241). W1 now runs first, in the owner's order.

## Done on 22 Oct, third block (rest of W1, the 22 Oct plan, Phase D)
Scope set by the owner during this block: ASEAN-wide, small to large farms.
- **W1 finished:**
  - B-AG-2 (cf7aa3c): conversion per plot, anchors read from EU 2018/848 Annex II 1.7.1 and 7 CFR 205.202(b); ASOA 12 months TO VERIFY. Codes E030/E031/E033 were taken, so it uses `AGRI-E034` and `AGRI-W034`.
  - B-AG-3 (e34c362): certificate calendar, country-agnostic kinds, alerts at 60 and 14 days, China GACC 30 June reminder TO VERIFY.
  - B-AG-12 (d0fbd5a, 8a3c19c): fumigation records, `AGRI-E035`, EU fumigant rows absent from 2021/1165 Annex I, up to 500 plots per co-op store.
  - B-TR-6 (2d3efec): error contract with stable codes and request id; `ApiError.code` and `requestId`.
  - Re-verified by tests: B-OP-1, B-OP-4, B-ML-1, B-GIS-1 (22 passed). Gap: B-OP-1's "lower lateness on fixture farms" has no comparison test yet.
- **ASEAN scope** (2b68143): harvest reference for any ASEAN farm and size = area x FAOSTAT national 5-year yield range. FAOSTAT is packed locally by `faostat_sync` (76 s).
- **Trace fixes 1-4** (c96c5f0): Enter adds the corner under a crosshair that follows the padded map centre, Esc cancels, live region, focus moves.
- **OSM suggestion, hidden** (929ea77): `?experimental` only. Both public Overpass mirrors timed out during the live check; the failure path is verified, a live suggestion is not.
- **Phase E** (90f655c, 2dedb8d): `POST /contracts/{id}/persona-plan`, up to 5 variations on one forecast; by hand vs with your machines, budget drops whole jobs, long hand jobs split into 8 h days, user-entered hand hours.
- **Flow view** (2bebc1d, c81ea83, ba6c259): water (FAO-56 dual Kc, fetched), canopy VPD and wet hours, CH4 (IPCC 2019 Eq. 5.2, SE Asia EFc 1.22), nitrogen fate (IPCC 2019 Tables 11.1 and 11.3). All coefficients were read from the source texts.
- **Phase B** (dbe0e96): water and stone ramps from the palette MCP; the old blue and the unknown grey (2.85:1) are replaced.
- **Phase D, W2 in shadow:** B-TS-5 (185d086), B-TS-3 (1854226), B-TS-6 (1062872), B-AG-9 (a2d9e03), lots for B-TR-5, B-AG-13, B-AG-15, B-AG-16 and B-OP-6 (0b03bc2), B-AG-10 evidence pack (0cc90ee), B-OP-2 (9dae9b0).
- **Blocked W2 and W3 harnesses** (4af7356): `GET /roadmap`; each blocked item names its missing licence, value, photos or dependency.
- **Backtest honesty** (79867c9): the forecast backtest can use the rain forecast issued at the cut (Previous Runs API, field names now verified) and always says which rain it used.
- **Team review:** Thant Zin Moe's disease-advice commits (b6cddd5, f038cab) are merged clean. One bug fixed in 80f6489: banned names of 3 letters or fewer (DDT, EPN, EDB, HCB, PCP) and the BHC alias were never matched.

## Next block, in this order
1. **Owner decisions:**
   - `disease_advice_unreviewed_sprays` defaults to true while no review is on file, so every spray shown is unreviewed
   - the GLEAM breaker flake
   - the 44 px touch targets
2. **Wire the issued rain:** call `weather.issued_rain` from the plan caller so live backtests stop being optimistic; then rolling-origin cuts.
3. **B-OP-1 lateness test:** compare a travel-aware plan against a travel-blind plan executed with real travel times on the fixture farms.
4. **Panels for the new records:** lots, certificates, fumigations and the evidence pack download.
5. **GIS deepening** (older list, item 2).
6. **Rebuild the regions snapshot** (network) so SPI-1/6 and harvest rain fill.
7. **Retry the live OSM suggestion** when Overpass is not at capacity.

## Older ordered list (before this block)
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
