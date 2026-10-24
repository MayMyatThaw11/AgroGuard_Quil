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
14. Flood risk and above/below sea level shown in the view (design below, not built yet).
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
| Hand-off file and screenshot script | this commit | |
| Plain-language HUD and first-use guide (req 12, 13) | not started | |
| Flood and sea level in the view (req 14) | not started | |
| 7 Weather components and map overlay | not started | |
| 3c Effects catalogue and its test (req 10) | not started | |
| 8 Performance budgets and notes | not started | |
| 9 Full gate, `verify` skill, final screenshot set, update `docs/FARM_MAP_3D_BUILD_PLAN.md` | not started | |

Working tree at hand-off: clean for the farm view. Other agents' files, leave alone: `README.md` (modified), `agentsupport.md`, `Rice–Shrimp Co-Culture Adaptation Plan — Agriqill.md` (untracked).

## How to run

Use throwaway data. Never touch the real data folder.

- API on 8011: from `backend/agriquill`, set `AGRIQUILL_ENVIRONMENT=development`, `AGRIQUILL_DATA_DIR=<temp>/data`, `AGRIQUILL_LEDGER_PATH=<temp>/data/ledger.jsonl`, then `.venv/Scripts/python.exe -m uvicorn agriquill.api.main:app --port 8011`.
- Web on 5175 proxied to it: from `apps/agroguard-web`, `AGRIQUILL_API_TARGET=http://127.0.0.1:8011 npx vite --port 5175 --host localhost --strictPort`. Open `http://localhost:5175/farmsim/` (not 127.0.0.1; Vite listens on IPv6 localhost).
- Sign-in for development is in `docs/FARM_MAP_HANDOFF.md` (the line under "Web"). Pass it to scripts through env vars; never hard-code it in a committed file.
- Gate: `npm run verify:farm-map` from `AgroGuard-Unified`. The pytest part takes about 12 minutes, so run it once per phase, not per edit. Quick loop: `npm run typecheck` and `npm run test:farm-sim` in `apps/agroguard-web` (651 tests pass at b40eee7).
- Screenshots: `apps/agroguard-web/scripts/farm-view-shots.mjs`. Env vars: `FARMSIM_USER`, `FARMSIM_CODE` (required), `BASE_URL` (default `http://localhost:5173/farmsim/`), `CHROME_PATH`, `SHOTS_DIR` (default the OS temp folder, outside the repo), `FARMS` (comma list), `THEMES`. It waits for `.aq-fm-replica[data-ready="true"]`. It does not yet cover the guide, weather previews or the flood what-if; add those as the features land.
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
- Theme switches through `document.documentElement.dataset.theme`, mirrored from localStorage key `theme` by `lib/useTheme.ts`.

## Pending work, in order

1. Plain-language HUD and first-use guide.
   - Terrain words: Flat, Gently rolling, Hilly, Mountain. Lines like "{label} - {km} km away". Technical detail behind an "About this view" disclosure.
   - Rename `farmMap.replica.eye` to "Look from the field" and `farmMap.replica.overview` to "Look from above" in all locales.
   - Zone notes `farmMap.input.zoneBelow|zoneIn|zoneAbove` beside every heat and frost effect. Hint `farmMap.input.howTo` above the first wheel. "Day" caption in the dial centre.
   - New `FarmViewGuide.tsx`: four steps (look around, see the land around it, try the water what-if, go back anytime), Next/Back/Skip/Got it, step counter, shown once (localStorage, wrapped in try/catch), help button reopens it. Esc closes the guide before the view.
2. Flood and sea level (req 14).
   - Plain height line: "{m} m above sea level", "below sea level" (new key) or near sea level; reuse `farmMap.own.aboveSea` and `farmMap.own.nearSea`.
   - Own farms: call `getRisk(target.id)` (`/contracts/{id}/risk`) and show "Modelled flood risk, next 30 days: {level}" using `FLOOD_WORD`, plus `within_dem_error` and the nearest river. Example farms: no flood risk, only measured elevation facts.
   - Low-lying note when elevation is at most `SCREENING.lowlandM` and a coast or river is near.
   - A "what if water stood this deep on the field" wheel (0 to 3 m, step 0.25) driving a translucent plane at `mainBase + depth`. Labelled a what-if, not a forecast.
3. Weather (phase 7): `Weather.tsx` (rain and drizzle by AMS class, lightning capped at 3 per second, cloud shadows, clouds, fog, wind sway, night), preview picker labelled "Preview, not current weather", `MapWeatherOverlay.tsx` at zoom 9 and above. Data: `useWeatherNow`, `toWeatherNow`, `effectsFor`. Weather labels need i18n (`weatherLabel` is English only). `weatherOf()` in `farmMapWeather.ts` is a hash and must never drive an effect.
4. Effects catalogue (phase 3c): `lib/inputs/effects.ts` with at least 30 entries `{id, group, trigger, meaning, reducedMotion, lowPower, file}` and a test (count, unique ids, trigger and meaning present, referenced file contains `fx-<id>`). About 20 exist in CSS (wheel: heat-glow, limit-pulse, frost-edge, band-glow, band-bloom, magnetic-snap, elastic-stop, detent-tick, odometer-roll, tile-press; dial: arc-sweep-in, window-breathe, rain-tick-fall, event-pop, comet-trail, heat-haze, water-fill, canopy-fill, day-flip, sun-marker; plus staged-reveal and water-flow in `Neighbourhood.tsx`). To build: click-ripple, field-pulse, hover-lift, map-rain, cloud-shadows, daylight-tint, lightning-flash, haze-depth, wind-sway, rain-ripples, light-shafts, heat-shimmer, check-draw, count-up.
5. Performance (phase 8): at most 120 draw calls; instance caps (trees 6000 + 8000, rice 4000 per field, weeds 1200), halved under 640 px or `hardwareConcurrency` of 4 or less; dpr 1 on phones. Record frame times only on named real hardware.
6. Final (phase 9): full gate, `verify` skill, screenshot set. Look at every image, fix, re-run, then show the owner with the before/after pair. Update `docs/FARM_MAP_3D_BUILD_PLAN.md`.

## Known issues and honesty notes

- `SCREEN` thresholds in `lib/farmview/profile.ts` (rolling 3, hilly 8, mountainous 20 degrees; upland 300 m, montane 1000 m; volcanic 10 km) are TO VERIFY.
- Example farms are synthetic quads. Terrace walls cannot be resolved by the 30 m DEM; steps come from per-field heights.
- OSM coverage is thin in rural Myanmar; imagery and relief carry the realism there. Building heights and road widths are illustrative.
- SwiftShader screenshots are not device frame times.
- Open-Meteo free tier can return 429 (cache and stale copies cover it) and its licence is non-commercial; decide before commercial use.
- Two WebGL contexts on phones (MapLibre plus the view). Hide the map canvas while the view is open if memory is short.
- Apify is not connected in the build environment, so no Apify data is used. It needs authorisation first; do not claim it.
- Native-speaker review is still needed for all new strings in my, vi, th, fil, id, km.

## File map

Under `apps/agroguard-web/src/features/farm-simulation/`:

- `lib/farmview/`: `farmTarget.ts`, `terrain.ts`, `neighbourhood.ts`, `profile.ts`, `weatherFx.ts`, `fieldLayout.ts`, `seasonField.ts`, `captureOmt.ts`.
- `components/fieldsim/`: `FarmView.tsx` (entry, camera, HUD), `FieldLayer.tsx`, `fieldKit.ts`, `groundData.ts`, `useGround.ts`, `Neighbourhood.tsx`, `neighbourhoodGeometry.ts`, `OutlineFields.tsx`, `useNeighbourhood.ts`, `useFarmFacts.ts`.
- `components/inputs/`: `RollerPicker.tsx`, `Odometer.tsx`, `ChoiceTiles.tsx`, `SeasonDial.tsx`, `SeasonDayPicker.tsx`. Math in `lib/inputs/` (`dialMath.ts`, `calendar.ts`, `motion.ts`).
- `components/farmmap/`: `FarmMapView.tsx` (opens and closes the view, restores the camera), `SeasonTimeline.tsx`, `SeasonSection.tsx`, `FarmDetail.tsx`, `OwnFarmDetail.tsx` ("Open 3D view" button).
- `lib/api.ts`: `getNearestVolcano`, `getWeatherNow`, `getRisk`. `lib/fieldsim/`: `localFrame.ts`, `models.ts` (`TRI_BUDGET`), `replicaTheme.ts`.
- CSS: `aq-farmmap-sim.css`, `aq-farmmap-inputs.css`, `aq-farmmap-fx.css` (registered in `index.css`).
- Assets: `public/models/farmmap/` (generated), sources in `assets-src/farmmap/`.
- Tests: `tests/farm-simulation/farm_view.test.ts`, `inputs.test.ts`, `models.test.ts`.
- Backend: `backend/agriquill/agriquill/data/weather.py` (`fetch_current`), `sitecontext.py`, `config.py` (`weather_now_ttl_s`), `api/main.py` (`/weather/now`, `/volcano/nearest`), test `tests/test_agriquill_weather_now.py`.
