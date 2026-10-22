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

## Done on 22 Oct, fourth block
- **Rolling origins** (d8fb9c8): `backtest.rolling_origin` pools MAE and band coverage over up to 4 cuts, each fit only on earlier days. The neural candidate is still scored on the newest cut only.
- **B-OP-1 lateness** (23eac20): `lateness_h` is in the schedule summary. On six fields 9.6 km apart with one crew, replayed with real drives and the daylight gate, the travel-aware plan is 96 h late as planned and as executed. The blind plan promises 30 h and delivers 168 h. On the demo coop every drive rounds to 0 h at 5 km/h, so both plans match there.
- **GLEAM flake** (7dc9e13): with 3 workers, up to threshold + workers - 1 = 5 calls start before the breaker opens, which is 15 file opens. The old bound of 12 was wrong. The worst case measured over 300 threaded trials was 5.
- **CO2e** (8074508): urea CO2 (IPCC 2006 Eq. 11.13; the 2019 Refinement says no refinement) and CO2e with AR6 GWP-100 (CH4 27.0, N2O 273). N2O and urea are left out, not counted as zero, when no fertiliser is logged. Fuel stays null until litres are logged. Demo farm: 10.7 t CO2e (2.8–32.7), methane only.
- **Issued rain for /ops/plan** (8503647): fetched when a location is sent. Correction to the last block: the live view never sends a backtest (`liveOps.ts`, `backtest: null`). Only the fixture page calls `/ops/plan`, and its weather is synthetic, so real issued rain would not match it. The real-weather backtest belongs in the model card.
- **Seasons** (56ccecf): `GET /contracts/{id}/seasons` from NASA POWER monthly normals (2001–2025).
  - Rule: a month under 60 mm is dry (Peel et al. 2007 Table 1). Dry months above the place's mean temperature are hot dry, the rest cool dry. The temperature split is our rule.
  - Live: delta hot dry Mar–Apr, rainy May–Oct, cool dry Nov–Feb; Hanoi rainy Apr–Oct, cool dry Nov–Mar; Singapore and Davao wet all year; Bali dry Jun–Oct.
  - MERRA-2 totals run low (the delta comes out at 927 mm a year), so only the month pattern is used, and no Köppen class is shown.
- **Yield backtest** (0bb1498, 9c933e2): FAOSTAT rice, 10 ASEAN countries, 2010–2024, 150 held-out pairs, seed 7, replicates exactly.

  | Candidate | MAPE | Within 10 % |
  |---|---|---|
  | Persistence | 4.83 % | 89.3 % |
  | Numpy MLP | 5.18 % | 88.0 % |
  | 5-year mean | 6.49 % | 84.0 % |
  | Trend + MLP hybrid | 6.72 % | 83.3 % |
  | 10-year trend | 6.87 % | 81.3 % |

  - The seven main producers are within 10 % in 105 of 105 years; Brunei and Timor-Leste in 53 %.
  - The neural models do not beat persistence. The panel shows the persistence check per country (Myanmar 15 of 15, 1.29 %).
- **Owner requests this block:**
  - 95 % accuracy everywhere: reported honestly instead. Accuracy is only measured where a category output and real labels exist; regressions get error and coverage.
  - Root and stem uptake: not built yet. FAO-56 Ch. 8 Ks is next; no sap-flow model without a sensor.

## Next block, in this order
1. **Owner decision:** `disease_advice_unreviewed_sprays` defaults to true while no review is on file.
2. **FAO-56 Ch. 8 water stress (Ks):** find and fetch the chapter page (x0490e0d to 0h return 404; 0b and 0c worked) and reduce crop uptake when the root zone dries.
3. **Model card** (`GET /contracts/{id}/model-card`): forecast backtest with issued rain on real contract weather, yield backtest, decisions, shadow promotion status, B-ML-1 null.
4. **Heavy use (plan Part 5):** prefix reads for records, atomic lot updates, correct and void records, the in-process load harness (20 farms in the gate), large-farm and seeded invariant tests.
5. **Records panels:** lots, certificates, fumigations, evidence pack download, roadmap list.
6. **Polish:** the Today card, translation of the farm map into all 7 locales, 44 px on touch screens, a real "Your farms" roll-up with the sample overview badged.
7. **Site context endpoint** (ring facts, 50 km coast search, GVP volcanoes, heat days) and SDG indicator mapping.
8. **Network jobs:** regions snapshot rebuild, live OSM retry.

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
- Map tiles from openfreemap can fail to load when the network drops. Screenshot scripts wait for `domcontentloaded`, not `load`.
- Test modules that touch a `RecordCache` must point `data_dir` at a temp folder. The global conftest does not, so a test without the fixture writes into the real dev cache.
- Mongo is not running locally, so Health Updates shows as unavailable.
- The Open-Meteo free tier limits requests per minute. A cold flood read for two farms in one minute can return 429. After that the 30-day history cache absorbs it.
- The high-risk flood alert is unit-tested, but has not yet been seen live, because the current forecast is low.
- Never stage the workspace-root `doc_*.env`. It holds live secrets.
