# Farm map future plan

Written 25 Oct on branch `farm-simulation`, after commits 50c850f, 4057436 and 840e343. Each item says why it is next (with the evidence that exists today), what to build, which files it touches, how to know it is done, and what can go wrong. Paths are under `apps/agroguard-web/src/features/farm-simulation/` unless they start with `backend/`, `docs/` or `scripts/`.

Rules that apply to every item: no invented numbers (every number carries its provenance, unknowns are null with a reason), values marked TO VERIFY stay marked, test first, all new strings in all 7 locales, no new dependency without approval, no comments, stage explicit paths.

## Order of work

1. Prove what was built (item 1). Nothing else should start before the card, the map highlight and the selected style are seen working on a real browser and a real phone.
2. Make the advice trustworthy (items 2 and 3). The card is only as good as its rules and its data.
3. Finish the design system (item 4) so new screens cannot drift again.
4. Map and 3D realism (items 5 and 6).
5. Release hygiene (item 7) and the blocked items (item 8).
6. The limitations list below says what each limit is and how to remove it, and the hybrid input section says how estimates should combine sources. Items 2 and 3 are the first place those apply. Numbers in the limitation entries such as item 3 or item 8 refer to the entries in that list, and the numbered sections after it are called sections.

## Current limitations and how to get past each

Each row: what is limited today and the evidence, the steps to remove the limit, the research that has to happen first (named sources, licences to check), and the test that shows it is gone.

1. **Example farm numbers are generated.** NDVI, soil moisture, water level and yield for the 410 example farms come from `lib/farmmap/farmMapData.ts`, so the card's advice on them is illustrative (the panel already says so).
   - Steps: keep the banner; add a backend route that returns per-field NDVI from Sentinel-2 for own farms; return null with a reason under cloud; show the date of the scene next to the number.
   - Research: Sentinel-2 L2A access through a STAC catalogue (Earth Search or Planetary Computer: check terms and rate limits), cloud masking with the scene classification layer, the revisit gap in the monsoon season, and how NDVI saturates in dense rice canopy (consider NDRE or the red-edge band).
   - Test: a fixture scene with a cloud-covered field returns null and a reason; a clear scene returns a value with its date.
2. **One weather provider, three forecast days, non-commercial licence.** `lib/farmmap/farmLive.ts` and `weather.py` read Open-Meteo only.
   - Steps: put a provider interface in `weather.py` (current, hourly, daily), add a second adapter, show both when they disagree on whether a wet day is coming, keep stale-on-error.
   - Research: the licence and price of a commercial Open-Meteo plan, national met services in the 11 countries (access, terms, latency), rainfall products such as CHIRPS or GPM IMERG for the 30-day past rain (latency and resolution), ensemble spread for rain probability.
   - Test: two stubbed providers that disagree produce a "forecasts disagree" flag; one provider down still serves.
3. **Water advice rests on one number.** `farm.water` is a single value. There is no tube reading history, so the card cannot say "falling 2 cm a day".
   - Steps: store tube readings with time, source and who entered them in the existing hash-chained ledger; compute the dry-down rate over the last readings; give "days to the re-flood line" only when at least three readings exist, otherwise null with a reason.
   - Research: typical AWD dry-down rates by soil class from IRRI guidance (cite the document before using any number), how percolation changes with soil texture.
   - Test: three readings give a rate and a day count with an interval; two readings give null.
4. **No device measurements.** Frame times were never measured on hardware (SwiftShader is not a device). See item 1.
5. **ASEAN limits are 11 coarse boxes.** `lib/farmmap/aseanLimits.ts` and `backend/agriquill/agriquill/regions.py` are hand-copied extents, not borders, and a point in the sea near a border can pass.
   - Steps: replace the boxes with simplified national polygons shipped as a small static file read by both sides; point-in-polygon with a tolerance in metres for coastlines; keep the boxes as a cheap first screen.
   - Research: geoBoundaries, Natural Earth and GADM licences and their handling of disputed areas, how to simplify without cutting islands (Riau, Palawan, Andaman coast of Myanmar), file size budget.
   - Test: a table of known border towns and offshore points; both sides give the same answer.
6. **30 m terrain cannot show terraces.** The Terrarium tiles are about 30 m (SRTM through AWS), so Banaue and Jatiluwih show terraces mainly in the imagery.
   - Steps: per-field heights from a finer DEM where one exists; terrace steps drawn from field heights, never invented; a note "terraces from imagery" where no fine DEM is available.
   - Research: FABDEM (check licence, it is non-commercial), ALOS World 3D at 30 m, national LiDAR where published, Copernicus GLO-30 versus GLO-90 (the panel quotes GLO-90 elevation), vertical accuracy on slopes.
   - Test: a field on a known terrace sequence gets distinct heights; a flat delta field does not.
7. **Rural buildings are thin.** OpenMapTiles coverage is sparse in rural ASEAN, so the 3D neighbourhood leans on the draped photo.
   - Steps: an optional building layer merged by id and centroid, labelled illustrative like the others.
   - Research: Microsoft Building Footprints and Google Open Buildings coverage and licence in ASEAN, OSM completeness per country, Overpass fair use for a 3 km box.
   - Test: duplicate footprints across sources merge to one; a source outage leaves the view working.
8. **Decision rules exist only in the browser.** See item 3 (one rule set for web and API).
9. **Advice has no feedback loop.** Nobody can say "done" or "not now", so there is no way to learn which advice was useful.
   - Steps: per-card "Done", "Not now" and "Wrong for my farm" actions written to the ledger with the rule id and inputs; a weekly summary per co-op of advice given versus taken; never use the answers to change a threshold without a backtest.
   - Research: how smallholders respond to advice nudges (published extension studies), minimum sample before a rule is judged.
   - Test: an action writes one ledger entry with the rule id and a hash; the summary counts match.
10. **Smartphone-only delivery.** The card needs the app open.
   - Steps: a daily digest of the top three cards, plain text, in the farmer's language, sent through a messaging channel the co-op already uses; opt-in only; no coordinates in the message.
   - Research: which channel is used where (for example Zalo in Vietnam, LINE in Thailand, Viber in the Philippines and Myanmar, WhatsApp in Indonesia), the business-account rules and cost of each, SMS fallback for feature phones, consent rules per country.
   - Test: a digest renders in all 7 languages within the channel's length limit.
11. **Slow or no connection.** There is no offline copy of the last advice.
   - Steps: cache the last decisions and the farm panel for own farms with a visible "saved at" time; queue tube readings entered offline and replay them in order.
   - Research: service worker scope under `/farmsim/`, storage quotas on low-end Android, conflict handling when two people enter a reading for the same day.
   - Test: airplane mode shows the saved card with its age; a queued reading is sent once on reconnect and not twice.
12. **Low-power detection is split.** Heavy card effects drop at 639 px width in CSS, while the 3D view uses `hardwareConcurrency` in JavaScript. A strong phone with a narrow screen and a weak wide laptop are both misjudged.
   - Steps: one flag on the app root (`data-low-power`) set from cores, memory (`navigator.deviceMemory` where present) and a short frame-time probe; CSS and the 3D budget both read it; the user can override in settings.
   - Research: reliability of `deviceMemory` and `hardwareConcurrency` across the browsers farmers use, probe length that does not delay first paint.
   - Test: the flag is derived by a pure function with a table of device profiles.
13. **Live weather is not used in season replay.** The replay uses the run's own weather by design.
   - Steps: label the replay clearly, add a "compare with now" switch rather than mixing the two.
14. **Screenshots are manual.** No visual regression runs in CI.
   - Steps: run the UI screenshot script in CI against the throwaway API, store reference images outside the repo or as a small set, compare with a per-region pixel tolerance and fail with the diff image.
   - Research: how to keep WebGL output stable across runners (SwiftShader flags), which regions to mask (clock, map tiles).
15. **Auth is a dev sign-in.** Own-farm data is protected by a shared development code.
   - Steps: real accounts and roles (owner, co-op manager, extension officer), per-farm access lists, audit entries for reads of other people's farms.
   - Research: identity options already used by the AgroGuard API, data protection rules per country for farm location data.
16. **Bundle size is unmeasured.** The 3D view and the map engine are large.
   - Steps: measure the farm map entry and the lazy 3D chunk with the build report; set a budget in the gate; split the decision card and effects so they load with the panel only.

## Hybrid input algorithms

"Hybrid" here means no single source decides. Each estimate combines sensors, satellite, weather, a model and the farmer's own entries, shows which sources it used, and says so when they disagree. All of it follows the repo invariants: provenance on every number, null with a reason when inputs are missing, new models in shadow first, promotion only after beating the named baseline on walk-forward splits with no future data.

1. **Field water depth (extend the existing Kalman filter).**
   - Sources: farmer tube reading, Sentinel-1 radar water mask, rain and evapotranspiration from weather, a water balance model.
   - Method: a state estimator where each source has its own noise estimated from the backtest (not set by hand), updates are skipped when a source is missing, and the output is p10, p50 and p90 with the list of sources used. Disagreement between the tube and the radar beyond their combined uncertainty raises a "check this field" flag instead of being averaged away.
   - Baseline: last tube reading carried forward. Metric: mean absolute error of depth in cm on held-out days. Ship in shadow first.
   - Research: Sentinel-1 backscatter response to standing water in rice (growth stage effects, wind roughening), revisit interval, radar threshold calibration per region (the current threshold is TO VERIFY).
2. **Soil moisture for non-rice crops.**
   - Sources: a satellite or reanalysis product (SMAP or ERA5-Land), an antecedent precipitation index from the last 30 days of rain, a local sensor or farmer finger test when available.
   - Method: precision-weighted blend with the weights learned from sites that have sensors; with no sensor the output carries a wider interval and the card says "estimated from rain and satellite".
   - Baseline: the 30-day rain index alone. Research: product resolution against field size (SMAP is coarse), bias by soil class, whether the 20 percent screening line is meaningful for the blended value.
3. **Evapotranspiration for irrigation timing.**
   - Method: FAO-56 Penman-Monteith from the weather fields when radiation and wind are present, a Hargreaves fallback from temperature only, and the card names which one was used.
   - Research: Open-Meteo ET0 versus own calculation on a few ASEAN stations, crop coefficients by stage with their FAO table reference.
4. **Yield forecast.**
   - Sources: the existing yield engines (p50 forecast with calibration in shadow or promoted), an in-season NDVI trajectory, FAOSTAT history, the farmer's past harvests.
   - Method: quantile output (p10, p50, p90) from a stacked blend; each engine's weight comes from its walk-forward error by season, and an engine that is not promoted contributes nothing.
   - Baseline: the district mean yield. Metric: pinball loss and interval coverage on held-out seasons. State the number of season pairs in the model card.
5. **Decision risk layer.**
   - Rules stay the safety layer and can always veto. A learned risk score (logistic regression first, gradient boosting only if it beats it) ranks which farm needs a visit first, using weather, stage, past readings and past advice outcomes.
   - Gate: shadow, then promote only when it beats "rules only" on the named metric (share of true problem farms found in the top 10 percent of the list) and its calibration holds (Brier score and a reliability plot per country). The score never replaces a rule's wording.
6. **Farmer input reconciliation.**
   - Accept the same fact from several channels (typed, voice, photo of the tube, co-op officer). Combine by precision, keep every raw entry, and show the combined value with the sources. A large gap between two entries is flagged, not hidden.
   - Research: speech recognition quality for Burmese, Khmer and Filipino numbers, photo reading of a tube scale, error rates from field trials.
7. **Price view.**
   - Benchmark index (World Bank) times a learned local basis from sales the co-op enters. Until sales exist, show only the benchmark and say it is not a farm-gate price. Do not compute revenue from the benchmark alone.

## More improvements

**Frontend.**
- Field-level cards, not only farm-level: pick a field and the card shows that field's stage, area and any field-specific flag.
- Urgency view: colour farms and fields on the map by their most urgent card level, behind a layer toggle, so a co-op manager sees where to go first.
- Co-op dashboard: list farms ordered by urgency with the top reason, filterable by country and crop, exportable.
- Printable advice sheet per farm in the reader's language (print stylesheet first, PDF later), with the sources and TO VERIFY labels included.
- Read aloud: use the browser speech synthesis where the language has a voice, hide the button where it does not (research which of the 7 languages have voices on Android Chrome).
- A11y: a keyboard and screen reader path for the map list ("All fields" exists, extend it to the card), live region announcements when a card level changes, tested with a screen reader.
- Motion budget: a single place that decides which effects run (reduced motion, low power, tab hidden) and a test that no animation runs while the tab is hidden.

**Backend.**
- Idempotent onboarding and season-run writes with request ids, so a retried mobile request cannot double-write.
- Rate limits per user and per farm on the weather and decisions routes, with a clear 429 body that the UI turns into a plain message.
- Backups and restore drill for the SQLite stores and the ledger, with a hash-chain verification job that runs daily and logs the result.
- Request correlation id on every route, passed to logs and returned in error bodies.
- A model card for every estimator above: data, split scheme, baseline, metric, number of pairs, status (shadow or promoted), date.
- Load test of `/weather/now`, `/farms/{id}/decisions` and onboarding at a stated request rate; record p50 and p95 and the machine used.

**Process.**
- Each item above gets its own branch or commit group, test first, one commit per step with the repo's prefixes.
- Review each hybrid algorithm with a domain reviewer (IRRI-trained agronomist or DAR Yezin) before promotion, and keep the review note in the model card.

## 1. Prove the last three commits

**Why.** The animations were checked only as CSS by tests and as still screenshots. The 15 card effects, hover, reduced-motion and the phone layout have not been watched. Frame times are unmeasured anywhere (SwiftShader is not a device).

**Build.**
- Commit the map UI screenshot script that currently lives only in the session scratch folder as `scripts/farm-map-ui-shots.mjs`, next to `scripts/farm-view-shots.mjs`. Same rules: credentials from `FARMSIM_USER` and `FARMSIM_CODE`, output to `SHOTS_DIR`, no env files read. Cases: overview, farm focus, satellite, decision card, regional zoom, at 1440 and 375 px, light and dark.
- Add a recording mode that uses Playwright video for 8 seconds per card state so the animations are actually watched. Review at least: act ring and glow, watch blink, ok pop, rain streaks, sun ring, water wave, refill sweep, sheen on the TO VERIFY tag, hover tilt.
- Add a reduced-motion pass: `page.emulateMedia({ reducedMotion: 'reduce' })`, then confirm no card element has a running animation (`document.getAnimations()` is empty inside `.aq-fm-decisions`).
- Measure on one named mid-range Android phone and one laptop: frame time p50 and p95 with the card open and 6 cards visible, and with the map at zoom 11 showing 200 fields. Record the device names and the numbers in `docs/handsoffagent.md`, whatever they are.

**Files.** `scripts/farm-map-ui-shots.mjs` (new), `docs/handsoffagent.md`.

**Done when.** The script runs from a clean checkout with the documented env vars, the recordings were watched, `getAnimations()` is empty under reduced motion, and the device numbers are written down.

**Risks.** Headless recordings can drop frames, so judge motion by eye on a real browser and not by the recording alone.

## 2. Decision rules with evidence behind every line

**Why.** `lib/farmmap/farmDecisions.ts` holds five thresholds: re-flood line (from paddy settings), wet day 1 mm, dry soil 20 % vol, weak NDVI 0.5, and the stage tips. Two are screening values marked TO VERIFY. The stage tips are general guidance with no per-variety source. The card reads the same farm values the panel shows, and for example farms those values are generated.

**Build.**
- Give each rule a source record: `{ id, basis, source, status: 'cited' | 'convention' | 'to-verify' }` in a small table next to the rules, and show the basis behind an "About this advice" disclosure in the card (the same pattern as "About this view" in the 3D view). A test fails when a rule has no record.
- Calibrate the two TO VERIFY lines. Ask DAR Yezin or the DOA for the soil-moisture line per soil class and the NDVI line per crop and stage. Until they answer, keep the label and keep the lines out of any score.
- Stage-aware water rules for rice: the re-flood line should depend on stage (the stage tip already says booting and flowering are the most water-sensitive). Source the stage rules from the IRRI AWD guidance and name the document in the record. Do not ship a number that is not in the source.
- Add rules only where the data exists: heat at flowering from the daily maximum already fetched (`FarmWeather.days[].hi`, reuse the existing TO VERIFY heat line), fertiliser timing from the stage plus the forecast, disease-pressure watch from humidity and rain (label as screening). Each rule needs a test for the positive case, the negative case, the missing-input case (rule absent, never a default) and the ordering.
- Separate "what we know about this farm" from "what the screening says". For own farms with a season run, use the run's modelled values; for example farms keep the banner that values are illustrative.

**Files.** `lib/farmmap/farmDecisions.ts`, new `lib/farmmap/farmDecisionSources.ts`, `components/farmmap/FarmDecisions.tsx`, `tests/farm-simulation/farm_decisions.test.ts`, 7 locale files.

**Done when.** Every rule has a source record, the disclosure shows it, a missing input removes the rule instead of filling it, and the two TO VERIFY lines are still labelled until a named body confirms them.

**Risks.** Advice can read as a prescription. Keep the line "general guidance, not a prescription for your soil or variety" and never phrase a rule as a dose.

## 3. One rule set for web and API, with a regression gate

**Why.** The rules live only in the browser. The owner wants calculations and suggestions that agribusiness and co-ops can trust, which means the API and any report must give the same advice as the screen. There is no golden set for own-farm decisions yet.

**Build.**
- Backend route `GET /farms/{id}/decisions` in `backend/agriquill/agriquill/api/main.py`, with the rules in a new module beside `gates.py`. It returns the same shape as the frontend (`id`, `level`, `params`, `verify`, plus `provenance` per number). It must never weaken the gates in `gates.py` and `safety.py`.
- Parity test: one JSON fixture of inputs and expected decisions, read by both the pytest suite and `farm_decisions.test.ts`. Changing a rule in one place without the other fails both.
- Golden set: start with 30 own-farm cases (common 60 percent, edge 25 percent, adversarial 15 percent, for example a missing forecast, a stale reading, a negative water level at ripening) stored under `backend/agriquill/tests/golden/`. Score by exact match on `id` and `level`. The gate fails on any drop against the committed baseline.
- Resilience for the data the rules read: `weather.py` already serves stale on error. Add explicit timeouts on every outgoing call, a circuit breaker on Open-Meteo after repeated failures (error rate over a window, not a count), and a rule that the card says "forecast unavailable" instead of showing old advice as new.
- Observability: one structured log line per decisions request with `farm_id`, rule ids returned, inputs missing, latency and whether the forecast was stale. No coordinates, names or tokens in logs. Count requests, errors and duration per route.
- Errors follow the existing hierarchy in the API (one base exception, one global handler, a stable JSON shape). No `HTTPException` in rule code.

**Files.** `backend/agriquill/agriquill/api/main.py`, new `backend/agriquill/agriquill/decisions.py`, `backend/agriquill/tests/test_agriquill_decisions.py`, `backend/agriquill/tests/golden/`, `tests/farm-simulation/fixtures/decisions.json`, `lib/api.ts`.

**Done when.** The parity fixture passes on both sides, the golden gate runs inside `npm run verify:farm-map`, the log line exists and carries no personal data, and a forced Open-Meteo failure shows "forecast unavailable" in the card.

**Risks.** Two copies of the rules drift. The parity fixture is the only protection, so it must run in the gate and not as an optional script.

## 4. Finish the design system

**Why.** The selected style is now one file (`aq-selected.css`), but older areas still use their own: `.action-rail-btn`, `.scene-tab`, `.season-calendar-tasks .btn`, `.ops-btn-view`, `.ops-mission-chip`, `.ops-day` in `index.css`, `scene.css` and `ops.css` use a different token family (`--accent`, `--ops-*`). Raw colour values remain in some components. The new icon badges put white on amber (about 3.3 to 1), which is below the 4.5 to 1 text bar and needs a deliberate decision.

**Build.**
- Contrast pass with `agentic-council:advocate-a11y-audit` criteria: measure every text and badge pair in light and dark; for badge icons choose dark ink on amber and light tones if white fails 3 to 1 for graphics; make focus rings visible on every selected style (outline 2 px selected plus the focus ring must both show).
- Migrate the legacy selected rules to the shared tokens one area at a time, deleting the old rules in the same commit. Screenshot before and after for each.
- Test that fails on raw hex colours and raw `px` font sizes below 11 in `components/farmmap/*.tsx` and `aq-*.css`, so the guarantee does not rely on memory.
- Decide the font question with evidence: compare Segoe UI stack against a self-hosted variable font in Myanmar, Khmer and Thai at 12, 14 and 16 px on a real phone. Check the font licence before bundling anything. Keep JetBrains Mono for numbers.
- Replace the hand-copied ASEAN boxes problem class: a test that reads both `aseanLimits.ts` and `backend/agriquill/agriquill/regions.py` and fails if the 11 boxes differ.

**Files.** `aq-selected.css`, `scene.css`, `ops.css`, `index.css`, `paddy-tokens.css`, new `tests/farm-simulation/design_tokens.test.ts`.

**Done when.** No `[aria-pressed]` or `.is-active` selected rule exists outside `aq-selected.css` in the farm map surface, the token test passes, and a written contrast table is committed.

**Risks.** Large CSS moves break layouts silently. Do it per area with screenshots at both widths.

## 5. Map layer polish and scale

**Why.** The highlight adds four layers and one circle layer per farm. It was shown at 410 example farms and about 350 fields in view. The overview at zoom 3.3 shows country bubbles only, so a farmer sees halos only after zooming. One region always fails to load in the demo ("A region failed to load"), which hid the highlight for one farm.

**Build.**
- Performance: count layers and measure render time at 5,000 synthetic farms (synthetic, labelled in the test). If halos cost too much, cap halo radius by density or switch to a heatmap below zoom 8.
- Selected field and hover: a pulse on the picked field outline, using the same status colour, and a cursor change. Respect reduced motion.
- Failed region: show the failed region on the map as a hatched cell with a Retry control on the cell, not only in the toast.
- Weather overlay on the map canvas (`components/farmmap/MapWeatherOverlay.tsx`, from the 3D plan): canvas like `engine/fogOverlay.ts`, zoom 9 or more, fetched on `moveend` for the centre rounded to 0.1 degree, text chip naming the conditions and source, `aria-hidden`, pointer events none.
- Label collision: farm labels and halos overlap in dense districts (seen near Long Xuyen at zoom 11). Test with the densest example district and thin labels first.

**Files.** `lib/farmmap/dataLayersTheme.ts`, `lib/farmmap/engine/*`, new overlay component, `tests/farm-simulation/farm_map_style.test.ts`.

**Done when.** A 5,000-farm synthetic run holds the frame budget recorded in item 1, and a failed region can be retried from the map.

## 6. Farm view realism still open

**Why.** From `docs/FARM_MAP_3D_BUILD_PLAN.md`, not built: cloud shadows on the ground, wind sway on crops and trees, terrace steps from per-field heights, own-farm decisions in the 3D HUD.

**Build.**
- Cloud shadows as a drifting noise mask in the terrain material (`onBeforeCompile`), driven by the same cloud plan that places the clouds, so shadow and cloud agree.
- Wind sway by vertex shader on the instanced crops and trees, speed from the Beaufort band of the live wind reading, amplitude capped, off under reduced motion.
- Show the three most urgent decision cards in the 3D HUD for own farms, reusing `FarmDecisions` in a compact form.
- Keep the budgets: 120 draw calls, 1.5M triangles desktop, 0.6M phone. The screenshot script already fails over budget.

**Done when.** Shadows follow the clouds, sway stops under reduced motion, budgets hold on all five test farms.

## 7. Release hygiene

- Make each commit build on its own. `50c850f` imports a stylesheet added in `4057436`. Check each commit with `npm run typecheck` before pushing, or squash related work.
- Add `.gitattributes` with `* text=auto eol=lf` for the web app so every edit stops warning "LF will be replaced by CRLF". Check no binary asset is touched (`*.glb`, `*.woff2` as `binary`).
- Full gate on the pushed head: `npm run verify:farm-map` (hook self-test, backend pytest about 12 minutes, ruff, typecheck, frontend tests). It was last run in full on `dc46a93`.
- Fix the shell header at 375 px: "Search or run a command..." is clipped and the other header items are hidden. Decide which controls move into the overflow menu.

## 8. Blocked or waiting on a decision

- Apify is not authorised. Do not call it. Ask first, then list the exact Actor and the data it would add.
- Open-Meteo's free tier is non-commercial. A commercial use needs a paid plan or another provider before launch.
- Native review of translations: the `farmMap.decide.*` keys (38 per language) and the earlier `wx.*` keys need a speaker of Filipino, Indonesian, Khmer, Burmese, Thai and Vietnamese. Send the English and target text side by side with the placeholders listed.
- Thresholds TO VERIFY: soil moisture line, NDVI line, heat line at flowering, the `SCREEN` thresholds in `lib/farmview/profile.ts`, and the 11 ASEAN boxes (coarse extents, not borders).
- Blender and Spline: the Blender add-on connection drops if a script calls `read_factory_settings`; use the CLI. Spline is available but not used by the farm view.
