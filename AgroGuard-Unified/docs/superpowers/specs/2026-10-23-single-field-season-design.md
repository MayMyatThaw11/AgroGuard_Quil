# Single-field season simulator and 3D field replica

Date: 2026-10-23. Branch: `farm-simulation`. Scope: the farm map only.

## Goal

A farmer or co-op opens one paddy on the farm map, sets a season plan, and watches the season play out day by day:
- in a 3D replica of that field
- on the map
- in charts

Three crop engines run the same plan on the same weather and soil, and their spread stays visible.

Rice-mill sites appear on the map as processing sites linked to the fields that supply them.

Rules, unchanged from the farm map:
- No invented numbers; provenance on every value; null with a reason when a value is unknown.
- TO VERIFY labels are kept.
- Every result is labelled uncalibrated until measured yields exist to score it against.

## What the owner said and what is assumed

Said:
- one field, customised workflow
- time, season and weather passing
- water, fertiliser, pesticide, weeds, crop uptake and critical windows
- all three engines (own, AquaCrop-OSPy, PCSE/WOFOST)
- mills added as sites
- a 3D replica of the real field with farm map features

Assumed:
- rice paddies first
- mill data stays in the local record store, never in git
- weather is a replay of real past seasons

## 1. Mill sites

- **Upload.** `POST /sites` takes a GeoJSON FeatureCollection. Each feature becomes a `processing_site` record in `RecordCache`. It keeps its properties, and `precision_level` is required. The upload is ledger-chained, like the other records.
  - `GET /sites` lists the sites.
  - `PATCH /farms/{id}/parcels/{pid}` accepts `delivers_to: <site id>`.
- **Map.** A site layer shows the outline and a point.
  - **Panel:** name, township, capacity as given (text, for example "60-100 t"), area, tenure, and the precision label shown as "simulated parcel, not surveyed".
  - **Supplying fields:** the panel lists the fields that deliver to this site.
- **Not done:** no crop simulation on a site. The capacity text is not parsed into a number.

## 2. Season plan (input)

A `SeasonPlan` per parcel. Every field is either entered by the farmer or marked unknown.

| Field | Unit | Note |
|---|---|---|
| `transplant_date` | date | required |
| `duration_days` | days | variety duration, farmer-entered |
| `water.regime` | `continuous` / `awd` | |
| `water.awd_threshold_cm`, `water.reflood_cm` | cm | AWD only; the default is the contract value if declared |
| `bund_height_cm` | cm | design input; hint shows FAO range (25 minimum, 60 recommended) |
| `trench` | `{depth_cm, width_cm, share_pct}` or null | rice-fish only; hint shows FAO ranges |
| `percolation_mm_day` | mm/day | from contract, else unknown |
| `events[]` | | `irrigate {date, mm}`, `fertiliser {date, product, rate_kg_ha, n_pct}`, `spray {date, product, rate_g_ai_ha, dt50_days, phi_days, fish_toxic}`, `weed {date, method, removed_pct}`, `weed_emergence {date, density_m2}` |
| `weather_years` | list of years | default: the last complete season; "last 5" option |

FAO hint source: FAO, *Fish culture in rice fields*, section 7 (https://www.fao.org/4/AC180E/AC180E07.htm):
- dry bund at least 25 cm, 60 cm recommended
- trench 50–180 cm wide and 30–90 cm deep
- refuge share 5–7 % (Taiwan) to 12.1 % (Kipopo case); no gain in fish production from 10 % to 23 %

These are hints only, never filled in for the farmer.

## 3. Engines

Same inputs for all three engines:
- daily weather from the ERA5 archive (`weather.fetch_archive_hourly` then `daily_from_hourly`)
- soil from SoilGrids (`soil.fetch_soil`)
- the plan

The result is a daily table per engine. A variable that an engine does not model is `{"value": null, "reason": "not modelled by <engine>"}`.

### 3a. Own model (`agriquill/season.py`)

Each equation comes from a source fetched before coding, cited in the code's `source` strings and in the method note.

| Process | Method | Source (fetch and cite) | Status |
|---|---|---|---|
| Phenology | heat units, cardinal temperatures and development rates per phase | ORYZA2000 manual, Bouman et al. 2001 | rates for local varieties TO VERIFY |
| Biomass | intercepted radiation (Beer's law, LAI) × RUE, scaled by water and N factors | ORYZA2000 / rice RUE literature | uncalibrated |
| Ponded water | daily bucket: depth + rain + irrigation − ETc − percolation; overflow above `bund_height_cm` is runoff | FAO-56 ETc (existing `flows.dual_kc`); bucket form after AquaCrop bund water | |
| Soil water stress | Ks Eq. 84 once the ponded water is gone | FAO-56 Ch. 8 (existing `flows.ks`) | |
| Nitrogen | soil mineral N pool: + fertiliser − IPCC losses − crop uptake; demand = critical N dilution curve × biomass | IPCC 2019 Tier 1 (existing); Sheehy et al. 1998 rice dilution curve | |
| Weeds | Cousens (1985) hyperbolic yield loss from density, with relative emergence time (Cousens et al. 1987); weeding removes `removed_pct` | Cousens 1985; I and A per species entered or cited | I, A TO VERIFY |
| Spray residue | first-order decay C = C0 · exp(−ln 2 · t / DT50), DT50 from the label | standard first-order kinetics | |
| Spray flags | PHI ends after harvest gives a block; fish-toxic spray with a trench and fish declared gives a warning | label values | |
| Heat at flowering | days with Tmax ≥ 35 °C in the flowering window | existing site-context threshold (TO VERIFY) | |
| Blast | existing `pest.shadow_blast` on the replay's hourly weather | existing | shadow |

### 3b. AquaCrop-OSPy adapter (`agriquill/season_aquacrop.py`)

- **Package:** `aquacrop==3.1.0`, approved by the owner on 2026-10-23. It installs from wheels and adds matplotlib, seaborn and tqdm.
- **Setup:**
  - crop `PaddyRice` with the planting date
  - soil from SoilGrids texture
  - `FieldMngt` with bunds and `z_bund` = bund height. Confirm the parameter name in the package source before coding.
  - irrigation schedule from the plan events
- **Outputs:** canopy cover, biomass, yield, soil water and the water held behind the bund.
- **Not modelled:** nitrogen, weeds and pesticides. The project page says fertility stress and weed management are not yet in the Python port.

### 3c. PCSE / WOFOST adapter (`agriquill/season_wofost.py`)

- **Package:** `pcse==6.0.13`, approved by the owner on 2026-10-23. It needs a source build of `traitlets-pcse`.
- **Crop parameters:** rice from WOFOST_crop_parameters, packed into `agriquill/data/` with its licence, never fetched at run time.
- **Model:** the WOFOST 8.x nitrogen-limited model if the rice file has N parameters; otherwise water-limited WOFOST, labelled as such.
- **Inputs:** weather from the same ERA5 days, converted to PCSE's weather provider; fertiliser events become agromanagement N events.
- **Outputs:** development stage, LAI, total and storage-organ biomass, N uptake and soil moisture.
- **Not modelled:** ponded water, weeds and pesticides.

### 3d. Comparison

- **Per day and per variable:** each engine's value, plus min and max over the engines that model it.
- **Season summary:** yield per engine, the range, and the engines in agreement.
- **No ranking:** no engine is ranked or promoted. Status is `comparison only, no measured yields to score against`.
- **Several weather years:** the result also gives the spread across years for each engine.

## 4. API and data flow

`POST /farms/{farm_id}/parcels/{parcel_id}/season-run`, body `SeasonPlan`:
1. Validate the plan (pydantic), with dates inside the replay year and rates non-negative.
2. Fetch weather and soil through the existing transports, cache and breakers.
3. Run the three engines in a thread pool, each under its own timeout. A failed engine returns `{"status": "failed", "reason": ...}` and the others still return.
4. Cache the result by sha256 of the plan, weather and soil, in `RecordCache` under `season_run`.
5. Response:
   - `days[]`, with `date`, `weather` and `engines.{own,aquacrop,wofost}.{var: {value, unit, source} | {value: null, reason}}`
   - `events[]`
   - `windows[]`: PI N demand, flowering heat, PHI and harvest
   - `summary`
   - `method`
   - `status: "uncalibrated"`

`GET /sites`, `POST /sites` and the parcel PATCH are described in section 1. Writes need the write token.

## 5. Frontend

### 5a. Farm panel

A `SeasonSection` in `OwnFarmDetail`:
- **Shown first:** the yield range across engines, the next critical window, and a "Play season" button.
- **Plan editor behind `More`:**
  - water regime
  - bund height and trench, with the FAO hints shown
  - an event list (add, edit and remove rows)
  - the weather year
- Uses the existing `DetailSection`, `KV`, `More`, `AqButton` and `api.ts` request pattern.

### 5b. Timeline bar

Over the map while a run is open:
- **Controls:** play and pause, speed 1, 4 or 16 days per second, and a day scrubber.
- **Bands:** growth-stage bands, a weather strip (rain bars, Tmax line), event markers (fertiliser, spray, weed, irrigate) and critical windows.
- **Keyboard:** Space plays and pauses; arrow keys step a day. There is no autoplay when the device asks for reduced motion.

### 5c. Map

The parcel is tinted by the chosen variable for the current day:
- water depth
- canopy
- soil N against demand
- weed loss
- spray residue

In 3D:
- the existing `own-water` slab height follows the ponded depth
- the field extrusion follows canopy height

### 5d. 3D field replica

`components/fieldsim/FieldReplica.tsx`, R3F, opened from the panel or the map:
- **Ground:**
  - World Imagery tiles stitched for the parcel bounding box at the highest zoom available, draped on a plane in local metres, with attribution shown
  - DEM relief from the same terrarium source as the map, labelled as about 30 m resolution, coarser than a bund
- **Bunds:** extruded along the real parcel ring at `bund_height_cm`, labelled as a design input.
- **Trench:** a recessed band along the inside edge at `trench.depth_cm` and `width_cm`, labelled as a design input.
- **Water surface:** at the day's ponded depth from the own model, which is the only engine that tracks ponded water. The level relative to the bund is shown.
- **Rice canopy:** instanced Blender-made rice clumps.
  - **Height:** from development stage and canopy cover.
  - **Colour:** from the N factor. Colour is never the only signal; the value is in the HUD.
- **Weeds:** instanced Blender-made weed clumps whose density follows the weed model.
- **Weather:** rain particles on rain days, sun position from `lib/farmmap/sun.ts`, and a spray mist on spray days.
- **HUD:** the day, the stage, and the engines' values at the cursor.
- **Models made in Blender** through the Blender MCP tools (phase 5), exported as glTF binary (`.glb`) to `apps/agroguard-web/public/models/farmmap/`. The Draco decoder is copied from `three/examples/jsm/libs/draco` to `public/draco/`:
  - **Rice clumps:** one model per stage (seedling, tillering, booting, heading, ripening), two levels of detail each, and a low triangle budget so thousands can be instanced. Leaf count and shape are visual only; plant height and canopy come from the engines, not the model.
  - **Weed clumps:** a grass-type and a broadleaf clump.
  - **Structures:** rice mill building, pump and sluice gate.
  - **Ground materials:** wet mud, dry cracked soil and bund clay, as tileable textures baked in Blender. They show the day's state; the satellite image stays underneath for the real layout.
  - **Size cap:** each model is checked into the repo with its Blender source (`.blend`) under 2 MB, compressed with the glTF exporter's own Draco option. No new frontend package: three's `GLTFLoader` and `DRACOLoader` are already in `three/examples`.
  - **Fallbacks:** if a model fails to load, the replica falls back to simple geometry with a note.
- **Fallbacks:** if WebGL fails, the existing `CanvasErrorBoundary` and context-loss recovery apply. If the imagery fails, the ground is a flat neutral plane with a note.

### 5e. General

- All strings go through `lib/i18n` in all 7 languages.
- No raw hex in components, only tokens.
- Lucide icons only.
- 44 px touch targets.
- Works at 375 px.

## 6. Testing

Backend:
- **Own model:**
  - Water balance closes every day, within 0.1 mm: in − out − runoff = Δ storage.
  - Ponded depth never exceeds the bund height.
  - An N pool never goes negative, and uptake never exceeds the available N.
  - Residue follows the half-life: after one DT50, half is left.
  - PHI is violated exactly when harvest − last spray < `phi_days`.
- **Phenology:** stage dates are reproduced on a fixed temperature series against hand-computed heat units.
- **Adapters:** they run on a fixture season (fixed weather and soil, no network) and return the shared schema.
  - **Failures:** a missing package or a parameter error gives `failed` with a reason, never a 500.
- **Route:** the cache is hit on the same plan; one engine failing still returns the other two.
- **Sites:** upload, list and link. A feature without `precision_level` is refused.

Frontend:
- Node tests for the plan editor's validation, the timeline's day stepping, and the tint expression.
- i18n coverage in all 7 locales (existing test).

UI checks:
- screenshots at 1440 and 375 px of the panel, the timeline and the replica
- WCAG 2.2 AA contrast on the new text
- keyboard reach of the timeline

The gate after each phase is `npm run verify:farm-map`, plus the backend pytest, ruff, format and mypy.

## 7. Phases

1. Mill sites: backend, map layer and panel.
2. Own engine and the `season-run` route, with the cache and its tests.
3. AquaCrop-OSPy and PCSE/WOFOST adapters, plus the comparison.
4. Farm panel section, plan editor, timeline bar and map tint.
5. 3D field replica with its Blender models: rice and weed clumps, mill, pump, sluice and ground materials. The Blender tools need a VS Code window reload first; until then, phases 1–4 proceed.

Each phase: the gate, then commit (AGENTS.md prefixes, no co-author line), then push to `farm-simulation`.

## Out of scope

- Calibration claims.
- Forecast seasons beyond the 16-day forecast.
- Non-rice crops.
- Parsing mill capacity into numbers.
- Survey-grade elevation: the DEM is coarser than a bund.
