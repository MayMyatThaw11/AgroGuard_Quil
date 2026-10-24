# Farm map future plan

Written 25 Oct on branch `farm-simulation`, after commits 50c850f, 4057436 and 840e343. Each item says why it is next (with the evidence that exists today), what to build, which files it touches, how to know it is done, and what can go wrong. Paths are under `apps/agroguard-web/src/features/farm-simulation/` unless they start with `backend/`, `docs/` or `scripts/`.

Rules that apply to every item: no invented numbers (every number carries its provenance, unknowns are null with a reason), values marked TO VERIFY stay marked, test first, all new strings in all 7 locales, no new dependency without approval, no comments, stage explicit paths.

## Order of work

1. Prove what was built (item 1). Nothing else should start before the card, the map highlight and the selected style are seen working on a real browser and a real phone.
2. Make the advice trustworthy (items 2 and 3). The card is only as good as its rules and its data.
3. Finish the design system (item 4) so new screens cannot drift again.
4. Map and 3D realism (items 5 and 6).
5. Release hygiene (item 7) and the blocked items (item 8).

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
