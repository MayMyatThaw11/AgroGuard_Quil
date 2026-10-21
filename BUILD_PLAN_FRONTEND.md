# AgriQill Frontend Build Plan

> **For the frontend team.** This file should be all you need: the app you're working in, the design rules that keep it from looking vibe-coded, every screen to build or change, how to prove each one beats the current screen, and the facts and limits behind it. **Nothing in sections 5-12 is built yet.** Values marked TO VERIFY are not final and are logged in `docs/agriquill/OPEN_QUESTIONS.md`. Every benefit is a **design target**. The backend team has the companion `BUILD_PLAN_BACKEND.md`. IDs like B-TS-2 there match F-TS-1 here.

## 1. How we work

1. **The cooperative is the user.**
   - **Field agent:** on a low-end Android phone, often offline, reading Burmese.
   - **Cooperative officer:** on a laptop, watching many farms.

   Farmers see results through them.
2. **One screen, one decision.** "Do I irrigate today?", "Can we spray?", "Is this lot ready to sell as organic?"
3. **Uncertainty in plain words.** "Likely 3 to 6 cm by Friday" or "Not sure: ask your agronomist". Never a bare number.
4. **No diagnosis we can't back up.** Photo results say "looks like", show how sure the model is, and always offer "ask the agronomist".
5. **The current screen stays until the new one wins.** Each change is tested with cooperative staff (task time, errors). It ships only if it is at least as good as the current screen. Results go in section 15.
6. **Hard rules look hard.**
   - A blocked job is red, names its rule, and has **no override button**.
   - Wind above 5.5 m/s is always "halt".
   - Approval is a separate, deliberate step.
7. **Project rules (AGENTS.md):**
   - Work on `main` only, with Conventional Commits.
   - No new dependency without approval (**[dep]**).
   - No emoji; no comments unless asked.
   - The 3D twin is out of Beta scope.

Tiers and waves match the backend plan:
- **Common:** the industry standard.
- **Uncommon:** only when nothing else fits.
- **Rare:** research-grade.
- **Legendary (candidate):** no public product found; needs a prior-art search before anyone calls it that.
- **Waves:** W0 now · W1 before the pilot · W2 during the pilot · W3 after a season.

## 2. What you are working on

| Item | Value |
|---|---|
| App root | `AGRIQILL/source/frontend/agriquill-ide/`. Source in `src/`, tests in `tests/` (at the app root, not under `src/`) |
| Stack (`package.json`) | React 19.3, Vite 8, TypeScript 5.8, Tailwind 4, Zustand 5, MapLibre GL 6.14, three 0.180 with `@react-three/fiber` 9 and drei, lucide-react |
| Commands | `npm run typecheck`, `npm run test:ci` (skips live-network Acceptance Test 4), `npm run test:network`, `npm run build`, `npm run test:e2e` (12 farm-map checks in Chrome). **There is no `lint` script**, although AGENTS.md lists `npm run lint`: adding one is F-CW-0 |
| CI | `.github/workflows/ci.yml` frontend job: `npm ci`, typecheck, `test:ci`, build; e2e job on the preview build |
| API base | `VITE_API_BASE` + `/api/v1/agriquill/*`, typed client in `src/lib/api.ts` and `src/lib/http.ts` |
| State | Zustand stores in `src/store/` (for example `fieldMissionStore.ts`, `paddySettingsStore.ts`) plus local state; server data through `lib/api.ts` |
| Languages | `src/lib/i18n/`: `en.ts` is the source of keys; `my`, `vi`, `th`, `fil`, `id`, `km` are typed `Dictionary`, so a missing key fails typecheck. Same `{placeholders}` in every language (`tests/i18n.test.ts`). Non-English text is a machine draft with a "Draft translation, native review pending" note |
| Do not | Scaffold a second frontend (the old AgroGuard SPA in `frontend/` is separate); merge apps; rename routes or endpoints without the backend team |

### Where older docs disagree with the code (trust the code)

| Doc says | Code does |
|---|---|
| `FRONTEND_READINESS.md`: no Zustand, MapLibre absent | `zustand` 5 and `maplibre-gl` 6.14 are installed and used |
| `FRONTEND.md`: `agriquillStore.ts` single store, Monaco and React Flow | Several small stores in `src/store/`; check before adding an editor or graph library **[dep]** |
| `FRONTEND.md`: "two-phase operator PIN verification" in field commands | `FieldComposerModal.tsx` pre-fills PIN `1234`, ticks confirm, and approves in one submit, client-side only (fixed in F-W0-2) |
| `OPEN_QUESTIONS.md` #11: `inputHash` | It is FNV-1a (`lib/hash.ts`), not SHA-256. Never call it a security hash in UI text |

## 3. Design system: the rules that stop it looking vibe-coded

Source of truth: `docs/agriquill/DESIGN_SYSTEM.md` (derived from one reference screenshot, `docs/agriquill/design/field-twin-reference.jpg`; exact values TO VERIFY against a brand file).

### 3.1 Token scopes: use the right one, never mix them in one component

| Scope | File | Prefix | Use for |
|---|---|---|---|
| IDE chrome | `src/tokens.css` | `--surface-*`, `--border-*`, `--text-*`, `--status-*`, `--space-*`, `--radius-*`, `--duration-*` | Top bar, sidebars, editor, status bar |
| AgriQuill screens | `src/paddy-tokens.css` (inside `.aq-root`) | `--aq-*` | Twin, field app, paddy settings, every new screen in this plan |
| Farm operations | `src/ops.css` | `--ops-*` | Farm Operations 3D view only |
| Farm map | `src/farmmap-tokens.css` | farm-map tokens | ASEAN farm map only |

### 3.2 `--aq-*` values

| Group | Values |
|---|---|
| Accent (leaf) | `#17aa51` 500, `#12963f` hover, `#137a38` press and ink, `#e2f4e8` tint |
| Selection (mint) | `#d8f2e9` |
| Water | `#e6f4f4` wash, `#0b9fa9` forecast and re-flood lines |
| Warning (grain) | `#d77a11`, text `#94520a`, wash `#fbf1dc` |
| Alert (clay) | `#e5322d`, text `#b3241f`, wash `#fdeceb` |
| Neutrals (stone) | `#ffffff` to `#141a16`; app `#f4f6f3`; hairline `#e6ebe7`; input border `#dbe2dd` |
| Focus | 3 px ring `rgba(23,170,81,.35)` |
| Type | 13 body · 12 meta · 11 caption and eyebrow · 15 value · 17 title; weights 400-700; tracking −0.01em; tabular numerals; Plus Jakarta Sans and JetBrains Mono (`public/assets/fonts/`) |
| Radius | 4 tags · 6 small · 8 controls and tiles · 12 panels · 16 dialogs · pill for badges |
| Spacing | 2, 4, 6, 8, 10, 12, 14, 16, 20, 24 px; controls 28 and 34 px; inputs 32 px |
| Shadow | xs on controls · md on panels · lg on dialogs (low-contrast, green-tinted) |
| Motion | 120 / 180 / 280 ms, `cubic-bezier(.2,.7,.2,1)`, no bounce, honour `prefers-reduced-motion` |
| Theme | Light only. There is no dark theme in the source system |

### 3.3 Component classes (reuse; don't invent look-alikes)

| Need | Class |
|---|---|
| Panel | `.aq-card` (+ `.aq-card-pad`) |
| Section label | `.aq-eyebrow` |
| Button | `.aq-btn` + `.aq-btn-primary` / `-secondary` / `-ghost` / `-danger`; `.is-lg` for 34 px |
| Icon button | `.aq-icon-btn` |
| Badge | `.aq-badge` + `.is-accent` / `.is-warning` / `.is-alert` / `.is-water` |
| Number input with unit | `.aq-input-wrap` > `.aq-input` + `.aq-suffix` |
| Slider | `.aq-slider` with `--aq-fill` |
| Stat tile | `.aq-stat` (+ `.is-changed`) |
| Alert row | `.aq-alert` + `.is-success` / `.is-warning` / `.is-error` |
| Dialog | `.aq-scrim` > `.aq-dialog` |
| Provenance | `.provenance-badge` from `src/lib/provenance.ts`: `measured`, `modelled`, `inferred`, `fixture`, `unavailable`, on **every** operational number |

Not yet built (select, checkbox, tabs, data table, toast, tooltip): build them from the values above when a screen needs one, once, in shared CSS.

### 3.4 Never do this

1. **No raw hex** in components and no Tailwind arbitrary colours (`bg-[#...]`). A new colour means a new token in the right scope file first.
2. **No gradients, glows, neon or stacked shadows.** Glass (`--aq-glass-*`, `--aq-blur-glass`) only for existing map overlay pills, never on cards.
3. **No emoji, no exclamation marks, no hype words** ("revolutionary", "smart AI magic", "powerful").
4. **One primary button per panel.** Ghost buttons in toolbars. Hairline dividers, not coloured side borders.
5. **Icons:** Lucide only, outline, stroke 1.75-2, 14-16 px, `currentColor`. No glyph icons except `·`, `−`, `~`.
6. **Colour never alone:** every state has text and an icon.
7. **No fake data shown as live:** fixture, simulated, seeded, stale and degraded data each carry a visible badge.
8. **No placeholder text, no stock illustrations, no animation that carries meaning** when motion is reduced.
9. **No new breakpoints.** Today `responsive.css` and others use ad-hoc widths (1440, 1320, 1279, 1100, 980, 720, 639): F-DS-1 consolidates them.
10. **No precision beyond the measurement:** depth to 0.1 cm, wind to 0.1 m/s, percentages as whole numbers unless measured finer.

### 3.5 Voice and text

- **Calm, factual, impersonal.** Sentence case; section labels as uppercase eyebrows.
- **Join facts with a middle dot:** `Farm-wide thresholds · every paddy · PD-01 to PD-08`.
- **Codes and numbers:** codes first (PD-02, G-03); numbers always with units; a true minus (−15 cm); `~` for approximations.
- **Uncertainty and provenance:** "Modelled, not field-validated", "Demo fixture", "TO VERIFY".
- **Errors** say the consequence and the next step: "Live soil data is unavailable. Showing the saved profile from 12 Oct. Retry."
- **Every new string** goes into `en.ts` first, then the 6 other languages, keeping the same placeholders.

### 3.6 Every screen has these states

| State | Show |
|---|---|
| Loading | Skeleton in the affected panel only; never freeze the screen |
| Empty | What to do next ("Add a tube reading to start the forecast") |
| Error | Consequence, next action and retry where useful |
| Degraded or stale | Badge: `Fixture`, `Simulated`, `Stale`, `Provider unavailable` |
| Offline | Queued count and "will send when online" (`lib/fieldQueue.ts`) |
| Success | Short confirmation for meaningful actions only; no toast per poll |

### 3.7 Accessibility and responsiveness (acceptance, not polish)

- Test at **375, 768, 1024, 1440 and 1920 px**, keyboard-only, 200 % zoom, reduced motion, and offline, stale, conflict and API-failure states.
- Visible focus ring; an accessible name on every icon button, map control and chart control; a text summary for every chart.
- Contrast readable for healthy, warning, critical and simulated states.
- Critical alerts never live only in a hover or tooltip.

## 4. Licences the frontend must fix before a paid pilot

| Item | Problem (OPEN_QUESTIONS) | Fix |
|---|---|---|
| Esri World Imagery (`lib/farmmap/basemapTheme.ts`) | Called with no key; terms need Esri or an ArcGIS subscription (#30) | Licensed imagery or Sentinel-2 (F-GIS-2) |
| OSRM public demo (farm-map routing) | Non-commercial, 1 request/s (#31) | Self-host or a paid router |
| Open-Meteo in the browser (`lib/farmmap/farmLive.ts`) | Free tier is non-commercial (#24) | Go through the backend with the paid licence |

## 5. Wave 0: fix now

| ID | Tier | Fix | Where | Done when (test) |
|---|---|---|---|---|
| F-W0-1 | Common | When the server requires sign-in, the app shows sign-in, not farm data | `lib/session.ts`, `components/field/AccessCodeField.tsx` | Test with auth on: no farm data before sign-in |
| F-W0-2 | Common | Field-command modal: **empty PIN, confirm unticked**, a separate approve step, labelled "Simulated dispatch". Any real dispatch goes through the server flow in `components/ops/OpsTaskCard.tsx` (phase A token, then phase B with PIN, lines 81-88) | `components/ops/FieldComposerModal.tsx:24,68-69`, `lib/fieldMissions.ts:143` | Test: submitting the modal never approves; approval needs a second action and a typed PIN |
| F-W0-3 | Common | The agent panel never shows or sends a PIN or confirmation (matches B-W0-5) | `components/twin/TwinAgentsView.tsx` | Test: no PIN field in agent views |

## 6. Time series and forecasting

| ID | Tier | Screen change (old → new) | Backend | Where | Beats old when | Wave |
|---|---|---|---|---|---|---|
| F-TS-1 | Common | Forecast line → **band with a trust line**: "Right in 8 of 10 checks on this farm", hidden when there are fewer than 10 checks | B-TS-1, B-TS-2 | `components/ops/OpsForecastChart.tsx` | 10+ field agents answer "Will it drop below the floor by Friday?" correctly more often than with the old chart | W1 |
| F-TS-2 | Common | Rehearsal text → **three cards**: hold, act and dry, each with days below the floor | Rehearsal, B-TS-3 | `components/field/RehearsalBlock.tsx`, `lib/rehearsal.ts` | Officers pick the safer option faster | W1 |
| F-TS-3 | Rare | Hidden flags → **event timeline**: "Water rose without rain on 12 Oct: irrigation or blocked drain?" with a one-tap answer. Conflicting readings show "Unknown: readings disagree" and an alert | B-TS-4, B-TS-6 | `components/field/TubeReadingForm.tsx`, new `components/field/EventTimeline.tsx` | Answers become B-TS-6 labels; at least half of flags answered in the pilot | W2 |
| F-TS-4 | Rare | Stage text → **Paw San season strip**: sowing (Jun-Jul), flowering window, harvest window (around Dec), today marked; Gyi and Hmwe vs Yin models labelled | B-TS-10 | `components/twin/TwinPlanBoard.tsx` | Officers name a farm's flowering week from the strip alone | W2 |
| F-TS-5 | Legendary (candidate) | No learning shown → **"Forecast error on this farm"**: this week vs season start, against a frozen-model line | B-TS-9 | `components/twin/TwinFarmPanel.tsx` | Shows the measured trend only, never a target | W3 |

## 7. Agronomy and rules

| ID | Tier | Screen change (old → new) | Backend | Where | Beats old when | Wave |
|---|---|---|---|---|---|---|
| F-AG-1 | Common | Free-text inputs → **input picker with an organic check**: a banned item turns red with its clause, in Burmese | B-AG-1 | `components/ops/FieldComposerModal.tsx`, `lib/rulesEngine.ts` (UI mirror; the server is authoritative) | No banned input can be saved in the usability test | W1 |
| F-AG-2 | Common | No conversion data → **conversion line per plot**: "EU-organic sowing from 3 Mar 2027" / "NOP-organic harvest from ..." | B-AG-2 | `components/twin/TwinFieldsView.tsx` | Officers find a plot's date in under 10 s | W1 |
| F-AG-3 | Common | No documents → **compliance calendar**: every certificate and registration; amber at 60 days, red at 14; China SPS renewal reminder before 30 June | B-AG-3 | New `components/twin/TwinDocuments.tsx` | Test: a record expiring in 13 days is red | W1 |
| F-AG-4 | Rare | General alerts → **quality alert cards**: "Heat over 35 °C forecast on Tue during flowering. Inspect the field and ask your agronomist." Each card has "Why" and its TO VERIFY status | B-AG-4 | `components/twin/TwinProtectView.tsx` | Agronomists rate the cards ≥ 7/10; no card suggests a treatment | W2 |
| F-AG-5 | Rare | Weather-only spray gate → **drift view on the map**: own upwind conventional sprays shown **blocked**; neighbour fields shaded, with the organic lot marked "test before sale" | B-AG-6, B-GIS-5 | `components/twin/TwinFieldsMap.tsx` | Officers spot the at-risk plot in the test map | W2 |
| F-AG-6 | Rare | Separate audits → **evidence pack button**: plot-season pack (CSV and HTML; PDF later **[dep]**) | B-AG-10 | `components/ops/FarmCheckCard.tsx` | A mock certifier checks a plot from the pack alone | W2 |
| F-AG-7 | Rare | No zone view → **Rice Export Zone checklist**: varieties used (at most 3, error), organic inputs and 3-season record (warnings) | B-AG-9 | `components/twin/TwinFarmPanel.tsx` | A 4th variety shows as an error | W2 |
| F-AG-8 | Common | **Field record forms** (offline, Burmese): seed lot, fumigation, post-harvest log (harvest moisture, drying method, readings to 14 %, storage start), mill intake (broken %, class), cadmium and lab result | B-AG-11 to B-AG-16, B-TR-4 | New `components/field/RecordForms.tsx`, queued through `lib/fieldQueue.ts` | A field agent completes each form offline in under 2 min; missing lab result shows "untested" | W1-W2 |

## 8. Optimisation and agents

| ID | Tier | Screen change (old → new) | Backend | Where | Beats old when | Wave |
|---|---|---|---|---|---|---|
| F-OP-1 | Common | Timeline without travel → **crew timeline with travel blocks** | B-OP-1 | `components/ops/OpsCrewTimeline.tsx` | Crew leaders rate the plan doable more often | W1 |
| F-OP-2 | Common | No harvest board → **harvest and dryer board**: which paddy to cut and dry each day, with rain risk | B-OP-2, B-OP-6 | New `components/ops/OpsHarvestBoard.tsx` | Officers plan a harvest week faster than on paper | W2 |
| F-OP-3 | Rare | Proposals shown as-is → **"numbers checked" tick**; held proposals show which number didn't match | B-OP-4 | `components/twin/TwinAgentsView.tsx`, `components/field/ProposalList.tsx` | A planted mismatch shows as held | W1 |
| F-OP-4 | Rare | Per-paddy water view → **cooperative water sharing board**: pump hours per paddy per day; days below the floor before and after sharing | B-OP-5 | New `components/twin/TwinWaterShare.tsx` | Officers explain the shared plan in the test | W3 |

## 9. Machine learning

| ID | Tier | Screen change (old → new) | Backend | Where | Beats old when | Wave |
|---|---|---|---|---|---|---|
| F-ML-1 | Common | Plain upload → **guided photo capture**: consent screen first, frame guide, blur check, "leaf only, daylight" | B-ML-2, B-ML-3 | `lib/photo.ts`, new `components/field/PhotoCapture.tsx` | More photos pass the quality gate than with plain upload | W2 |
| F-ML-2 | Rare | Single label → **honest result card**: "Looks like blast · fairly sure" or "Not sure · sent to your agronomist", with the weather risk beside it | B-ML-3, B-ML-5 | New `components/field/PhotoResult.tsx` | Every result has a confidence word; abstentions route to the agronomist | W2 |
| F-ML-3 | Rare | No review → **agronomist review queue**, least sure first | B-ML-4 | New `components/twin/TwinPhotoQueue.tsx` | More photos labelled per hour | W3 |
| F-ML-4 | Rare | Manual broken count → **grain check on a calibration card**; never shows origin | B-ML-6 | New `components/field/GrainCheck.tsx` | Within tolerance of manual counts on mill samples | W3 |
| F-ML-5 | Common | Crop model shows 100 % → **honest crop suggestion** with real accuracy and data source | B-ML-1 | Crop suggestion screens | The synthetic 1.0 and "95-98 %" never appear | W1 |

## 10. GIS and data

| ID | Tier | Screen change (old → new) | Backend | Where | Beats old when | Wave |
|---|---|---|---|---|---|---|
| F-GIS-1 | Common | Silent bad shapes → **shape check on import** with a fix hint | B-GIS-1 | `components/onboard/OnboardFarmDialog.tsx`, `lib/onboardFiles.ts` | A figure-eight ring shows the hint | W1 |
| F-GIS-2 | Common | Generated NDVI texture → **Sentinel-2 NDVI per paddy**, cloudy dates greyed, never filled | B-GIS-2 | `components/twin/TwinFieldsMap.tsx`, `lib/farmmap/dataLayersTheme.ts` | Every pixel traces to a scene ID | W2 |
| F-GIS-3 | Rare | Tube reading only → **radar witness badge**: "Radar agrees: wet on 14 Oct" or "Radar disagrees: check", never auto-fixed | B-GIS-3 | `components/twin/TwinFieldsView.tsx` | Disagreements are always visible | W3 |
| F-GIS-4 | Common | No origin → **origin badge** (township, region) on every lot | B-GIS-4 | Lot views (F-TR-2) | A lot shows its fields' townships | W2 |

## 11. 3D (post-Beta, out of Beta scope)

Current state: made-up fBm terrain, bathtub flooding and generated textures (`lib/scene/terrain.ts`, `components/scene/FloodPlane.tsx`, `lib/scene/imagery.ts`). Budget: `tests/farm3d_performance_contract.test.ts`.

| ID | Tier | Upgrade (old → new) | Backend | Where | Beats old when | Wave |
|---|---|---|---|---|---|---|
| F-3D-1 | Common | Noise terrain → **real DEM** with a stated vertical exaggeration | B-GIS-6 | `lib/scene/terrain.ts`, `lib/scene/terrainWorker.ts` | Heights match surveyed points within the performance budget | W3 |
| F-3D-2 | Rare | Bathtub → **paddy-by-paddy fill and spill** over bund heights | B-TS-5 | `components/scene/FloodPlane.tsx` | Unit test: water stays inside bunds below bund height | W3 |
| F-3D-3 | Legendary (candidate) | One water plane → **live Kalman level with a see-through P10-P90 shell** per paddy | B-TS-1..3 | `components/farm3d/Paddies.tsx` | Officers read drying risk from 3D as well as from the chart | W3 |
| F-3D-4 | Rare | Static scene → **rehearsal in 3D**: hold, act and dry as ghost water planes on a draggable timeline | Rehearsal | `components/scene/FieldScene.tsx` | Same choice as from F-TS-2 cards, in less time | W3 |
| F-3D-5 | Rare | Fixed plants → **plants that grow by stage and sway with live wind** (instanced mesh) | B-TS-10 | `components/farm3d/Paddies.tsx` | No frame-rate loss beyond the budget | W3 |
| F-3D-6 | Rare | No drift view → **spray drift plume** from wind and Delta-T | B-AG-6 | `components/scene/CyberPhysicalObjects.tsx` | Plume direction matches the gate's decision | W3 |

## 12. Trust and infrastructure

| ID | Tier | Screen change (old → new) | Backend | Where | Beats old when | Wave |
|---|---|---|---|---|---|---|
| F-TR-1 | Rare | PIN → **named approval with a personal key**. Offline it records **intent only**: "Approved offline · will be checked again when sent". Approvals older than 10 min must be redone | B-TR-2 | `components/ops/OpsTaskCard.tsx`, `lib/fieldQueue.ts` | With the network off then on, the server re-gates the job; wind over 5.5 m/s at send time still halts | W2 |
| F-TR-2 | Common | No lots → **lot screen**: kg, fields, origin, seed verification, lab result ("untested" until entered), one certifier | B-TR-4, B-TR-5, B-AG-13 | New `components/twin/TwinLots.tsx` | A lot without a lab result shows "untested", never "clean" | W2 |
| F-TR-3 | Rare | No buyer view → **lot passport page and QR**, verifiable offline (QR **[dep]**) | B-TR-3 | New `components/twin/TwinPassport.tsx` | A buyer verifies a passport with no account | W3 |
| F-TR-4 | Common | Ledger hidden → **"record verified" check** with the anchor date | B-TR-1 | `components/twin/TwinDataDialog.tsx` | A tampered ledger shows "not verified" | W2 |
| F-TR-5 | Common | `detail` strings → **error messages from codes** (consequence plus next step, translated) | B-TR-6 | `lib/apiError.ts` | Every known code has a translated message | W1 |

## 13. Cooperative workflow and design upkeep (applies to all screens)

| ID | Tier | Change | Where | Done when |
|---|---|---|---|---|
| F-CW-0 | Common | Add a `lint` script (ESLint with the TypeScript and React hooks rules) **[dep]** | `package.json` | `npm run lint` passes in CI |
| F-CW-1 | Common | Every new string in Burmese and the other 6 languages | `lib/i18n/*.ts` | `tests/i18n.test.ts` passes |
| F-CW-2 | Common | Offline first: every field-agent action queues and syncs | `lib/fieldQueue.ts`, `lib/useFieldQueue.ts` | `tests/field_queue.test.ts` covers each new action |
| F-CW-3 | Common | Low-end phone budget: under 3 s to first screen on a mid-range Android over 3G (device TO VERIFY) | Build config, code splitting | Measured on a pilot phone |
| F-CW-4 | Common | Officer list "farms needing attention today", sorted by risk | `components/fleet/FleetMonitorView.tsx` | Officers find the 3 riskiest farms faster |
| F-DS-1 | Common | One breakpoint scale (375 / 768 / 1024 / 1440 / 1920) replacing the ad-hoc widths | `responsive.css` and screen CSS | No other `@media (max-width)` value remains |
| F-DS-2 | Common | A token check in CI: no raw hex or arbitrary Tailwind colours in `components/` | New `scripts/check-tokens.mjs` | The script fails on a planted `#123456` |

## 14. Facts the screens show (from the research reports)

| Topic | Fact (use exactly; mark TO VERIFY where shown) |
|---|---|
| Paw San season | Sown June-July, harvested around December; one wet-season crop |
| Paw San types | Hmwe (Pearl Paw San), Gyi/Shwebo (day-length sensitive), Yin (insensitive) |
| Quality stresses | Spikelet sterility above ~35 °C at flowering (rice in general); aroma better in cool grain fill; harvest rain on ~15 % of delta plots (2013 survey; under 1 % in Sagaing) |
| Post-harvest | Cut at 20-25 % moisture when 80-85 % of grains are straw-coloured; dry to 14 %; aroma life by sub-type TO VERIFY |
| Grades | MRF: "Pawsan 100 %" and "Pawsan 5 % broken"; 14 % maximum moisture TO VERIFY |
| China organic | Only a GB/T 19630 certificate from a CNCA-approved body; one certifier per batch; cadmium limit 0.2 mg/kg |
| Conversion | EU 24 months before sowing; NOP 36 months before harvest; ASOA 12 months (annuals); China TO VERIFY |
| Myanmar labs | PPD Insein: pesticide residues in rice; SGS Myanmar: As, Pb, Hg; none for cadmium |
| Never show | An award-driven price premium, yield or income gain, fraud reduction, or image accuracy without a measured result |

Sources: `reports/Paw San best rice award 2026.md`, `reports/Organic rice export China ASEAN.md`.

## 15. Definition of done (per screen)

- [ ] Uses the `--aq-*` scope and existing classes; passes F-DS-2 (no raw colours).
- [ ] Has loading, empty, error, degraded, offline and success states.
- [ ] Every operational number has a unit and a provenance badge; uncertainty in words.
- [ ] Strings in all 7 languages; keyboard, 200 % zoom and reduced motion pass; tested at 375 and 1440 px at least.
- [ ] Its "Beats old when" test passed with cooperative staff (or the unit test for code-only items).
- [ ] `npm run typecheck`, `npm run test:ci` and `npm run build` pass; committed to `main` as `feat:`, `fix:` or `style:` with `-` bullets.
- [ ] The backend route it needs exists with the agreed fields (section 16).

## 16. Routes the new screens need (agree names with the backend team)

| Screen | Route |
|---|---|
| F-AG-6 | `GET /contracts/{farm_id}/evidence-pack?plot=&season=` |
| F-AG-3 | `GET/POST /farms/{farm_id}/certificates` |
| F-TR-2, F-TR-3 | `GET/POST /farms/{farm_id}/lots`, `GET /lots/{lot_id}/passport` |
| F-AG-8 | `POST /farms/{farm_id}/seed-lots`, `/fumigations`, `/post-harvest`, `/mill-intake`; `POST /lots/{lot_id}/lab-results` |
| F-ML-1..3 | `POST /photos`, `GET /photos/review-queue` |

Existing routes used: `/contracts/{farm_id}/check`, `/contracts/{farm_id}/monitoring`, `/proposals`, `/proposals/{proposal_id}/decision`, `/actuation/approve`, `/telemetry/readings`, `/ledger`, `/evidence/passport`, `/regions/{town}/crop-options`, `/market/benchmarks`, `/fleet/fields`.

## 17. REA ledger and review log

Method from the REA skill: questions first, evidence for every conclusion, observed vs inferred vs unknown. For a source repository, REA's guide says to use normal repository tools, so the passes used code reads, the research reports and an independent review.

| Pass | Question | Evidence | Result |
|---|---|---|---|
| 1. Inventory | Which screen shows each feature today? | Component, store, CSS and test listing; `package.json`; `DESIGN_SYSTEM.md`; `ui-rules.md`; `FRONTEND.md`; `FRONTEND_READINESS.md` | **Observed:** sections 2-3; doc conflicts listed |
| 2. Evidence | Does each change show a real backend output with its uncertainty? Are the cited paths real? | Backend IDs; research reports; a path and ID check script | **Observed:** every "Where" exists or is marked new; every backend ID exists |
| 3. Break it | Could a screen hide a hard rule, overclaim, or be worse for a field agent? | Independent review against AGENTS.md and the code | **Fixed:** below |

| # | Finding (verified in code) | Change made |
|---|---|---|
| 1 | Field-command modal pre-fills PIN `1234`, ticks confirm, approves in one submit, client-side (`FieldComposerModal.tsx:24,68-69`) | F-W0-2 |
| 2 | Offline approval conflicted with the 600 s token and the send-time wind check | F-TR-1: intent only, re-gated at send |
| 3 | "Right 8 of 10" is meaningless with few checks | F-TS-1: hidden under 10; backend needs ≥ 30 for coverage targets |
| 4 | EU conversion is counted to sowing, not harvest | F-AG-2 wording |
| 5 | A neighbour's spray can't be blocked | F-AG-5: own sprays blocked, neighbour risk flags the lot |
| 6 | "Check water" was an unverified fix | F-AG-4 says "inspect and ask your agronomist" |
| 7 | Plain layouts were tiered Rare | F-TS-2 and F-CW-4 are now Common |
| 8 | Test paths are `tests/` at the app root, and there is no `lint` script | Section 2; F-CW-0 |
| 9 | Missing record screens for cadmium, fumigation, seed lot, post-harvest and mill intake | F-AG-8 |
