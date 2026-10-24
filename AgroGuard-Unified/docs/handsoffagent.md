# Farm view hand-off for the next agent

Scope: the upgraded farm map (world map, then a single-farm 3D view with a real neighbourhood). Branch `farm-simulation`. Read this first, then `docs/FARM_MAP_HANDOFF.md` (older work), `AGENTS.md` and `CLAUDE.md`. The approved plan is outside the repo at `C:\Users\ASUS\.claude\plans\what-i-mean-farm-fluttering-creek.md`; its requirements are copied below so nothing depends on that file.

Update this file at every later commit that changes status.

## What the owner wants (requirements)

1. World globe or satellite map with regions and nations. The user zooms in and clicks a farm or field. A single-farm 3D view opens.
2. That view shows the real neighbourhood (roads, houses, trees, water, other fields). Nothing around the farm is left blank.
3. It adapts to mountains, forest, river, coast and volcanoes. The setting is read from data, never hand-picked.
4. Everything works against the real backend. When a route is down, the view says so and keeps working.
5. ASEAN only for now (`ASEAN_BOUNDS` in `lib/farmmap/farmMapRegions.ts`). A farm outside gets a "not covered yet" note.
6. Both backend contract farms and the 410 browser-generated example farms open the view. Example farms are labelled and carry no season numbers.
7. Detail out to about 1.5 km, then lower-resolution relief to about 5 km, fading into haze.
8. Replace old frontend code only with proven better results (test, measurement or screenshot). No decorative effect without a data or usability reason.
9. Inputs are custom visual controls, not ordinary sliders, bare number boxes or dropdowns.
10. At least 30 distinct, professional effects, each tied to a data value or a user action. Example: an input over its recommended ceiling heats up. Reduced-motion fallback for each. Flashing at most 3 per second.
11. Current-weather effects in the 3D view and on the map, plus a clearly labelled preview picker.
12. Easy for non-developers: plain language, jargon behind an "About this view" disclosure, a zone note in words beside every heat or frost effect (colour is never the only signal).
13. A minimal four-step first-use guide, skippable, reopenable from a help button, in all 7 languages (en, fil, id, km, my, th, vi).
14. Flood risk and above/below sea level shown in the view (built; see Phase status).
15. Screenshots are shown to the owner only after the gate is green and every bug is fixed: 1440 and 375 px, light and dark, several terrains, weather previews.

## Phase status

| Phase | Status | Commit |
| --- | --- | --- |
| 1 Backend: `/weather/now`, `/volcano/nearest` | done | af0478e |
| 2 Pure logic in `lib/farmview/` (target, terrain, neighbourhood, profile, weatherFx) | done | 58efaa8 |
| 5 Blender scenery kit | done | aea47d7 |
| 3 FarmView plus the click flow from the map | done | ac2511d |
| 3b Visual inputs (dial, wheels, tiles, month picker) | done | 2e4bc9a |
| 4 Neighbourhood capture and 6 environment profile | done | b40eee7 |
| Hand-off file and screenshot script | done | 702678d |
| Plain-language HUD and first-use guide (req 12, 13) | done (guide has 4 steps) | d52c037 |
| Flood and sea level in the view (req 14) | done, gate green (663 frontend tests, backend, ruff, typecheck) | see git log |
| 7 Weather in the 3D view (rain streaks, lightning, clouds, fog, night, preview picker) | done; the map-canvas weather overlay is not built | see git log |
| ASEAN-only limits (map bounds, search, photo locate, backend onboarding) | done | see git log |
| 3c Effects catalogue and its test (req 10) | done: 33 effects in `lib/inputs/effects.ts`, test checks the code behind each | see git log |
| 8 Performance budgets | done: `lib/farmview/budget.ts`, draw calls and triangles read from the renderer | see git log |
| 9 Full gate, `verify` skill, final screenshot set, update `docs/FARM_MAP_3D_BUILD_PLAN.md` | not started | |

Working tree at hand-off: clean for the farm view. Other agents' files, leave alone: `README.md` (modified), `agentsupport.md`, `Rice–Shrimp Co-Culture Adaptation Plan — Agriqill.md` (untracked).

## How to run

Use throwaway data. Never touch the real data folder.

- API on 8011: from `backend/agriquill`, set `AGRIQUILL_ENVIRONMENT=development`, `AGRIQUILL_DATA_DIR=<temp>/data`, `AGRIQUILL_LEDGER_PATH=<temp>/data/ledger.jsonl`, then `.venv/Scripts/python.exe -m uvicorn agriquill.api.main:app --port 8011`.
- Web on 5175 proxied to it: from `apps/agroguard-web`, `AGRIQUILL_API_TARGET=http://127.0.0.1:8011 npx vite --port 5175 --host localhost --strictPort`. Open `http://localhost:5175/farmsim/` (not 127.0.0.1; Vite listens on IPv6 localhost).
- Sign-in for development is in `docs/FARM_MAP_HANDOFF.md` (the line under "Web"). Pass it to scripts through env vars; never hard-code it in a committed file.
- Gate: `npm run verify:farm-map` from `AgroGuard-Unified`. The pytest part takes about 12 minutes, so run it once per phase, not per edit. Quick loop: `npm run typecheck` and `npm run test:farm-sim` in `apps/agroguard-web` (651 tests pass at b40eee7).
- Screenshots: `apps/agroguard-web/scripts/farm-view-shots.mjs`. Env vars: `FARMSIM_USER`, `FARMSIM_CODE` (required), `BASE_URL` (default `http://localhost:5173/farmsim/`), `CHROME_PATH`, `SHOTS_DIR` (default the OS temp folder, outside the repo), `FARMS` (comma list), `THEMES`. It waits for `.aq-fm-replica[data-ready="true"]`. It also shoots the weather previews and the flood what-if (`EXTRAS`, default the first farm), the guide at both sizes, and fails the run when draw calls or triangles exceed the budget.
- Blender rebuild (assets are generated, never hand-edited): `blender --background --factory-startup --python assets-src/farmmap/build_models.py -- public/models/farmmap` and the same with `build_scenery.py`. Output rules are in `public/models/farmmap/SOURCE.md`.
- Test farms: Banaue AQ-PH-0921 (steep terraces), Tabanan Bali AQ-ID-0641 (volcanic), Garut AQ-ID-0621, Da Lat AQ-VN-0401, Long Xuyen AQ-VN-0301 (delta), Chiang Mai AQ-TH-0241, Maubin AQ-MM-0001 (delta, little OSM data).

## Conventions and pitfalls

- Commits: prefix feat/fix/refactor/docs/test/chore/style, `-` bullet body, no Co-Authored-By line (the repo `AGENTS.md` overrides any attribution reminder). One commit per phase. Stage explicit paths only.
- No code comments unless the owner asks. No emojis. No new dependency without approval. No `any`.
- Never read, print or commit `.env`, `.env.*`, `keys.env` or the workspace-root `doc_*.env`. The hook `.claude/hooks/block-dangerous-command.mjs` blocks force pushes, `rm -rf`, `git reset --hard`; do not work around it.
- No invented numbers. Provenance on everything; an unknown is null with a reason. Values marked TO VERIFY stay labelled.
- Repo files use CRLF. Edit with eol-aware tools (the Edit tool is fine; raw string replace scripts must normalise `\r\n`).
- Every new user-facing string goes into all 7 locale files in `src/features/farm-simulation/lib/i18n/` (`en.ts` defines the `Key` type; the typecheck enforces parity). Translations need native review before launch.
- Work test-first (`tests/farm-simulation/*.test.ts`, run with `node --test --experimental-strip-types`). Watch each test fail first.
- Coordinates: example farm rings are `[lon,lat]`, the view and `ContractParcel.boundary` use `[lat,lon]`. `fromExample` swaps them. Local frame: x east, z south, metres.
- Depth: fields vanish under the ground without the terrain sink plus `logarithmicDepthBuffer`. Do not remove either.
- `useGround`: on steep land (p90 slope at or above `SCREEN.hillyDeg`) pads are not flattened. Example farms there use `OutlineFields` (draped outlines); own farms keep terraces.
- Light: minimum sun elevation of 28 degrees and a `flat` canvas, or dusk scenes go black.
- The hover tooltip must stay hidden while the 3D view is open.
- Motion: tokens `--aq-ease`, `--aq-dur-fast|base|slow` in `paddy-tokens.css`; spacing base 2 px; colours from `--aq-*` variables. Compositor-only properties for CSS effects; one rAF loop for canvas effects; pause on `visibilitychange`.
- Theme switches through `document.documentElement.dataset.theme`, mirrored from localStorage key `agriquill.theme` by `lib/useTheme.ts`. In Playwright init scripts write the localStorage keys only; `document.documentElement` is null there and throws.
- The guide shows once per browser (key `aq-farmview-guide-seen`). Screenshot scripts set it to skip the guide.

## Pending work, in order

1. (done) Plain-language HUD and first-use guide: `lib/farmview/plainHud.ts` (terrain words, height line, distance words), `guideSeen.ts`, `FarmViewGuide.tsx` (4 steps, the fourth is the water what-if), zone notes in `RollerPicker`, `Day` dial caption, how-to hint in the plan. Esc closes the guide before the view. Guide CSS classes use the `aq-fv-guide` prefix because `aq-fm-guide` already belongs to `GuideHud`.
2. (done) Flood and sea level (req 14): `lib/farmview/flood.ts` (`FLOOD_WORD`, `WHAT_IF` 0 to 3 m step 0.25, `lowLyingNotes` reusing `favors()` watch notes for river and elevation, `waterLevelY`), `components/fieldsim/FloodPanel.tsx` (disclosure "Flood and water": modelled 30-day level for own farms from `useRisk` in `useFarmFacts.ts`, DEM-error note, low-lying notes, what-if `RollerPicker`), and a translucent `WaterPlane` in `FarmView.tsx` at the pad height plus the chosen depth. Example farms get a note that flood risk is modelled for own farms only. The what-if uses 30 m relief, so edges are approximate and it is labelled not a forecast. Tests: `tests/farm-simulation/flood_view.test.ts`. Still to do: re-shoot the 375 px layout with the panel open (HUD `max-height: 55%` and scroll was added but not re-shot).
3. (mostly done) Weather in the 3D view: `lib/farmview/weatherFx.ts` (`effectsFor`, `previewWeather`, `dropCount`, `flashAllowed` capped at 3 per second, `fogScale`, `lightScale`, `weatherKey`, `cloudCount`, `cloudPlan`), `components/fieldsim/Weather.tsx` (rain streaks that follow the camera, lightning, instanced clouds from the Blender `cloud_lod0.glb`), `WeatherPanel.tsx` (current reading with source and time, stale and failed notes, preview tiles labelled "Preview, not current weather"). Live weather is not applied in season replay (historic dates). Still to do: cloud shadows on the ground, wind sway on crops and trees, and `MapWeatherOverlay.tsx` (canvas at zoom 9 and above). `weatherOf()` in `farmMapWeather.ts` is a hash and must never drive an effect.
4. (done) Effects catalogue: `lib/inputs/effects.ts` lists 33 effects `{id, group, trigger, meaning, reducedMotion, lowPower, file, marker}`; `tests/farm-simulation/effects_catalogue.test.ts` checks the count, unique ids, text fields and that each `marker` is in its `file`. Add a row there whenever a new effect ships.
5. (done) Performance: `lib/farmview/budget.ts` (`budgetFor(width, cores)`: trees 8000, rice 4000, other-field rice 400, weeds 1200, all halved under 640 px or 4 cores or fewer, dpr 1 on weak devices, 1.5M or 0.6M triangles, 120 draw calls). `FarmView` writes `data-draw-calls` and `data-triangles` on the root for scripts. Frame times are still unmeasured; record them only on named real hardware.
6. Final (phase 9): full gate, `verify` skill, screenshot set. Look at every image, fix, re-run, then show the owner with the before/after pair. Update `docs/FARM_MAP_3D_BUILD_PLAN.md`.

## Known issues and honesty notes

- ASEAN-only limits: `lib/farmmap/aseanLimits.ts` (frontend) and `agriquill/regions.py` (backend) hold the same 11 approximate national boxes, a coarse screen and not a border, TO VERIFY against Natural Earth. Keep the two in step. The map centre is clamped to `VIEW_LIMIT` on `moveend` and the zoom floor is 3. Search, photo locate and the 3D view refuse places outside the boxes; backend onboarding refuses a boundary or field point outside them. Frontend and backend lists are duplicated by hand.
- The Blender MCP connection drops if a script calls `read_factory_settings`; build assets with the Blender CLI (`blender --background --factory-startup --python ...`) and view them with a headless render.

- `SCREEN` thresholds in `lib/farmview/profile.ts` (rolling 3, hilly 8, mountainous 20 degrees; upland 300 m, montane 1000 m; volcanic 10 km) are TO VERIFY.
- Example farms are synthetic quads. Terrace walls cannot be resolved by the 30 m DEM; steps come from per-field heights.
- OSM coverage is thin in rural Myanmar; imagery and relief carry the realism there. Building heights and road widths are illustrative.
- SwiftShader screenshots are not device frame times.
- Open-Meteo free tier can return 429 (cache and stale copies cover it) and its licence is non-commercial; decide before commercial use.
- Two WebGL contexts on phones (MapLibre plus the view). Hide the map canvas while the view is open if memory is short.
- Apify is not connected in the build environment, so no Apify data is used. It needs authorisation first; do not claim it.
- Decision support: the farm map is a decision-support layer, not an autopilot. Own-farm decisions (flood level, ground-the-day, water to add) surface in the Open field monitor and Route to market; example farms get facts only. A golden set and regression gate for those own-farm decisions in `verify:farm-map` was proposed and is not built.
- Native-speaker review is still needed for all new strings in my, vi, th, fil, id, km.

## File map

Under `apps/agroguard-web/src/features/farm-simulation/`:

- `lib/farmview/`: `flood.ts`, `plainHud.ts`, `guideSeen.ts`, `farmTarget.ts`, `terrain.ts`, `neighbourhood.ts`, `profile.ts`, `weatherFx.ts`, `fieldLayout.ts`, `seasonField.ts`, `captureOmt.ts`.
- `components/fieldsim/`: `FarmView.tsx` (entry, camera, HUD), `FloodPanel.tsx`, `FarmViewGuide.tsx`, `FieldLayer.tsx`, `fieldKit.ts`, `groundData.ts`, `useGround.ts`, `Neighbourhood.tsx`, `neighbourhoodGeometry.ts`, `OutlineFields.tsx`, `useNeighbourhood.ts`, `useFarmFacts.ts`.
- `components/inputs/`: `RollerPicker.tsx`, `Odometer.tsx`, `ChoiceTiles.tsx`, `SeasonDial.tsx`, `SeasonDayPicker.tsx`. Math in `lib/inputs/` (`dialMath.ts`, `calendar.ts`, `motion.ts`).
- `components/farmmap/`: `FarmMapView.tsx` (opens and closes the view, restores the camera), `SeasonTimeline.tsx`, `SeasonSection.tsx`, `FarmDetail.tsx`, `OwnFarmDetail.tsx` ("Open 3D view" button).
- `lib/api.ts`: `getNearestVolcano`, `getWeatherNow`, `getRisk`. `lib/fieldsim/`: `localFrame.ts`, `models.ts` (`TRI_BUDGET`), `replicaTheme.ts`.
- CSS: `aq-farmmap-sim.css`, `aq-farmmap-inputs.css`, `aq-farmmap-fx.css` (registered in `index.css`).
- Assets: `public/models/farmmap/` (generated), sources in `assets-src/farmmap/`.
- Tests: `tests/farm-simulation/farm_view.test.ts`, `inputs.test.ts`, `models.test.ts`.
- Backend: `backend/agriquill/agriquill/data/weather.py` (`fetch_current`), `sitecontext.py`, `config.py` (`weather_now_ttl_s`), `api/main.py` (`/weather/now`, `/volcano/nearest`), test `tests/test_agriquill_weather_now.py`.

## 25 Oct: map highlight, shared selected style, decision card
- Selected state: one rule set in `aq-selected.css` (tokens `--aq-sel-bg`, `--aq-sel-edge`, `--aq-sel-ink`). Choices get a tint, a 2 px outline and bold text; list rows get a tint and a 3 px left bar. The old per-component selected rules were removed.
- Fonts: Segoe UI and system stack for text, JetBrains Mono for numbers, set in `paddy-tokens.css` and `tokens.css`. Plus Jakarta Sans is no longer loaded by the farm map. Smallest text is 11 px.
- Map: every farm has a status-coloured halo from zoom 5.4, a boundary glow, casing and fill from zoom 7.5, and field outlines from zoom 10 (`dataLayersTheme.ts`). Satellite no longer dims the fields.
- Decision card: `lib/farmmap/farmDecisions.ts` (pure rules, tested in `farm_decisions.test.ts`), `components/farmmap/FarmDecisions.tsx`, strings `farmMap.decide.*` in 7 locales. Screening lines (soil moisture 20 %, NDVI 0.5) are labelled TO VERIFY. No revenue is computed: the benchmark price is for a traded grade, not the farm-gate price.
- Card animations: 15 effects in `aq-farmmap-card-fx.css`, listed in the catalogue group `card`, covered by tests for reduced motion and the flash cap.
- Phone: the floating farm bar is hidden while the panel sheet is open, and toasts sit under the top bar.
- Not checked: frame times on real devices, native review of the new translations, the shell header clipping at 375 px.
