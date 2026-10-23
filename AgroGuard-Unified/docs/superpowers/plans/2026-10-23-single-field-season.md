# Single-Field Season Simulator and 3D Replica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- One paddy on the farm map gets a farmer-set season plan.
- Three crop engines replay it on real past weather.
- The season plays back on the map, in charts and in a 3D replica of the field.
- Rice-mill sites show as linked processing sites.

**Architecture:**
- **Backend:** new flat modules in `backend/agriquill/agriquill/`:
  - `sites.py`
  - `season_inputs.py` (weather, soil, hydraulics)
  - `season.py` (own engine)
  - `season_aquacrop.py` and `season_wofost.py` (adapters)
  - `season_run.py` (runner, cache, comparison)
- **Routes:** they live in `api/main.py`, following the lots pattern.
- **Frontend:** a farm panel section, a timeline bar, a map tint, and an R3F replica in `components/fieldsim/`, with pure logic in `lib/farmmap/` and `lib/fieldsim/`.
- **Models:** Blender makes glTF models through the Blender MCP tools.

**Tech Stack:**
- **Backend:** FastAPI, pydantic, SQLite `RecordCache`, the SHA-256 ledger, httpx, `aquacrop==3.1.0`, `pcse==6.0.13`.
- **Frontend:** React, MapLibre 6.14, three 0.180, `@react-three/fiber` 9, `@react-three/drei` 10, node:test.
- **Models:** Blender 5.2 with the Blender Lab MCP add-on.

**Spec:** `AgroGuard-Unified/docs/superpowers/specs/2026-10-23-single-field-season-design.md`

## Global Constraints

Data rules:
- No invented numbers. Every value carries `source`/`basis`; an unknown value is `{"value": null, "reason": ...}`.
- TO VERIFY labels stay on every value the spec or source marks so.
- Every season result carries `status: "uncalibrated"`, and the comparison carries `comparison only, no measured yields to score against`.
- Bund height and trench are farmer design inputs. The FAO ranges are hints only and are never filled in for the farmer:
  - bund at least 25 cm, 60 cm recommended
  - trench 50–180 cm wide and 30–90 cm deep
  - refuge share 5–7 % to 12.1 %
  - source: https://www.fao.org/4/AC180E/AC180E07.htm
- Mill data is uploaded at run time into `RecordCache("contracts.sqlite")`. It is never committed, and test fixtures use invented names ("Test Mill A").

Dependencies:
- New Python packages are `aquacrop==3.1.0` and `pcse==6.0.13` only, both approved on 2026-10-23.
- No new frontend packages. GLTFLoader and DRACOLoader come from `three/examples/jsm`.

Frontend rules:
- Every string goes through `useT()`/`tr()` with keys in all 7 locales (`en, my, vi, th, fil, id, km`). The existing `farm_map_i18n.test.ts` must stay green.
- No raw hex in components, only CSS tokens or `MAP_COLOR`.
- Lucide icons only.
- 44 px controls under `(pointer: coarse)`.
- No horizontal scroll at 375 px.
- No autoplay under `prefers-reduced-motion: reduce`.

Commits:
- AGENTS.md prefixes (feat/fix/refactor/docs/test/chore/style) with `-` bullet bodies. No Co-Authored-By line.
- Stage explicit paths only. Never stage `doc_*.env`, any `.env*`, `README.md`, `agentsupport.md` or `Rice–Shrimp Co-Culture Adaptation Plan — Agriqill.md`.

Gate after each phase:
- In `backend/agriquill`, run:
  - `.venv/Scripts/python.exe -m pytest -o addopts="" -q`
  - `ruff check`
  - `ruff format --check agriquill tests`
  - `python -m mypy`
- In `AgroGuard-Unified`, run `npm run verify:farm-map`.
- Push to `farm-simulation` after each phase.
- Restart uvicorn on 8010 after backend edits, because it does not reload.

## Review Focus

1. **Parcel with no drawn boundary.** The season run uses the farm `location`; the replica shows "no boundary drawn" instead of a blank scene. Tests: Task 5, `test_season_run_without_boundary_uses_farm_location`; Task 12, `localFrame` returns `null` for an empty ring.
2. **Replay weather with missing days.** Days missing from the archive are not filled in. The engines get the gap, and rows from the gap onward are null with the reason "weather missing for <date>". Test: Task 4, `test_missing_weather_day_nulls_following_rows`.
3. **Bund lower than the reflood or flooding target.** The plan is refused with 422 "bund_height_cm must exceed reflood_cm". Test: Task 5, `test_plan_rejects_bund_below_reflood`.
4. **Spray too close to harvest.** This is a PHI block in `windows[]`, not a 422: the farmer must see the conflict, not lose the plan. Test: Task 4, `test_phi_block_when_harvest_inside_interval`.
5. **Same GeoJSON uploaded twice.** It upserts by feature `properties.id`, so no duplicate sites appear and the ledger records both uploads. Test: Task 1, `test_upload_twice_upserts`.

---

## Phase 1: Mill sites

### Task 1: Sites backend

**Files:**
- Create: `backend/agriquill/agriquill/sites.py`
- Modify: `backend/agriquill/agriquill/api/main.py` (add `SitesReq`, `ParcelLinkReq` and 3 routes next to the lots routes, about line 1637)
- Test: `backend/agriquill/tests/test_agriquill_sites.py`

**Interfaces:**
- Produces:
  - `sites.upload(collection: dict[str, Any], uploaded_by: str) -> dict[str, Any]` returns `{"sites": [site], "sha256": str}`
  - `sites.listing() -> list[dict[str, Any]]`. Each site is `{"id", "name", "properties": {...}, "geometry": GeoJSON Polygon, "centroid": [lat, lon], "area_ha": float, "precision_level": str, "suppliers": [{"farm_id", "parcel_id"}]}`.
  - `sites.link(farm_id: str, parcel_id: str, site_id: str | None, linked_by: str) -> dict[str, Any]`
  - Routes:
    - `GET /sites` returns `{"sites": [...]}`
    - `POST /sites` (manager) takes body `{"collection": FeatureCollection, "uploaded_by": str}`
    - `PATCH /farms/{farm_id}/parcels/{parcel_id}/delivers-to` (manager) takes body `{"site_id": str | None, "linked_by": str}`
- Store: `RecordCache("contracts.sqlite")` with source `"processing_site"` and key `site_id`, and source `"site_link"` with key `f"{farm_id}|{parcel_id}"`. Every write goes through `_STORE.update` plus a ledger `append("site_upload" | "site_link", {..., "sha256": digest})`, as `lots._save` does.

- [ ] **Step 1: Write the failing tests**

```python
def test_upload_keeps_precision_label_and_area(tmp_store):
    out = sites.upload(fc([square("test_a", 0.42)]), "tester")
    s = out["sites"][0]
    assert s["precision_level"] == "ward_corridor_simulated_parcel"
    assert abs(s["area_ha"] - 0.17) < 0.01   # 0.42 ac square
    assert s["properties"]["capacity_tons"] == "60-100"  # kept as text, never parsed

def test_feature_without_precision_level_is_refused(tmp_store):
    with pytest.raises(ValueError, match="precision_level"):
        sites.upload(fc([square("x", 1, precision=None)]), "tester")

def test_upload_twice_upserts(tmp_store):
    sites.upload(fc([square("test_a", 1)]), "t"); sites.upload(fc([square("test_a", 1)]), "t")
    assert [s["id"] for s in sites.listing()] == ["test_a"]
    assert sum(e["kind"] == "site_upload" for e in ledger_entries()) == 2

def test_link_lists_supplier_and_unlink_removes(tmp_store, registered_farm):
    sites.upload(fc([square("test_a", 1)]), "t")
    sites.link("farm1", "P1", "test_a", "t")
    assert sites.listing()[0]["suppliers"] == [{"farm_id": "farm1", "parcel_id": "P1"}]
    sites.link("farm1", "P1", None, "t")
    assert sites.listing()[0]["suppliers"] == []

def test_link_unknown_parcel_is_keyerror(tmp_store, registered_farm):
    with pytest.raises(KeyError): sites.link("farm1", "NOPE", "test_a", "t")

def test_routes_need_manager_to_write(client):
    assert client.post("/api/v1/agriquill/sites", json={...}).status_code in (401, 403)
```

Fixtures follow `tests/test_agriquill_lots.py` (`tmp_store` and `registered_farm` patterns). `square(id, acres, precision="ward_corridor_simulated_parcel")` builds a lon/lat square polygon with properties `{"id", "name": "Test Mill A", "capacity_tons": "60-100", "precision_level"}`.

- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest -o addopts="" -q tests/test_agriquill_sites.py`. Expected: FAIL, because `sites` has no attribute `upload`.
- [ ] **Step 3: Implement `sites.py` and the routes.**
  - Validate: the type is a FeatureCollection, each geometry is a Polygon, each ring is closed, and `properties.id` and `precision_level` are non-empty strings. Raise `ValueError` otherwise; the route maps it to 422 and `KeyError` to 404.
  - Area: use `geometry.ring_area_ha` on the ring converted to `[lat, lon]`.
  - Centroid: the mean of the distinct corners.
  - Suppliers: built from the `site_link` rows.
  - Route gates: `_AS_MANAGER` for writes with `_named(caller, ...)`; `_READER` for GET.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then run the backend gate.
- [ ] **Step 5: Commit** `feat: store rice-mill processing sites and link supplying fields`, staging the 3 files.

### Task 2: Sites on the map

**Files:**
- Modify: `apps/agroguard-web/src/features/farm-simulation/lib/api.ts`. Add `ProcessingSite`, `getSites`, `uploadSites` and `linkParcelSite`, following the `getLots`/`post` pattern.
- Modify: `lib/farmmap/dataLayersTheme.ts`. Add `'aq-sites'` to `PLAIN_SOURCES`, add the layers `site-fill`, `site-line` and `site-point` (the point uses the existing `poi-mill` icon), and add `site-fill` and `site-point` to `HOVER_LAYERS`.
- Create: `lib/farmmap/sites.ts`, with `siteFeatures(sites: ProcessingSite[]): GeoJSON.Feature[]` (a polygon and a centroid point per site, properties `{id, name, kind: 'site'}`).
- Create: `components/farmmap/SiteDetail.tsx`, a right panel with the name, township or village, capacity text, `area_ha`, tenure, the precision badge "simulated parcel, not surveyed" and the supplier list.
- Create: `components/farmmap/useSites.ts`. It loads `getSites`, calls `setSource(ctx, 'aq-sites', siteFeatures(...))` the way `useOwnFarms` pushes `aq-own`, and refreshes after an upload.
- Modify: `components/farmmap/OverviewPanel.tsx`. In the "Your farms" block, add "Add processing sites (GeoJSON)", a file input in the `FilePick` pattern from `components/onboard`.
- Modify: `components/farmmap/OwnFarmDetail.tsx`. Each parcel row gets a "Delivers to" select (sites plus "none") that calls `linkParcelSite`.
- Modify: `useFarmMapPick.ts`. Picking `site-fill` or `site-point` opens `SiteDetail`.
- Modify: `lib/i18n/{en,my,vi,th,fil,id,km}.ts`. Add `farmMap.site.*` keys.
- Test: `tests/farm-simulation/sites.test.ts`

**Interfaces:**
- Consumes: Task 1 routes.
- Produces: `ProcessingSite` (the TypeScript mirror of the Task 1 site shape), `siteFeatures`, `useSites(engine): { sites: ProcessingSite[]; reload(): void; error: string | null }`.

- [ ] **Step 1: Write the failing test.**
  - `siteFeatures` gives 2 features per site, a Polygon and a Point.
  - The Point coordinates are `[centroid[1], centroid[0]]`.
  - `kind === 'site'`.
  - The precision text maps to the `farmMap.site.simulated` key whenever `precision_level` contains `simulated`.
- [ ] **Step 2: Run** `npm run test:farm-sim` in `apps/agroguard-web`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Check.** Run `npm run typecheck`, then `npm run test:farm-sim`; both must pass, including `farm_map_i18n.test.ts`.
- [ ] **Step 5: Screenshot.**
  - Upload a fixture FeatureCollection with "Test Mill A".
  - Use the scratchpad `final.mjs` pattern at 1440 and 375 px: the outline and pin show, the panel shows the precision badge, and nothing overflows at 375 px.
  - Look at both images.
- [ ] **Step 6: Commit** `feat: show processing sites and the fields that supply them`. Then run the phase gate and push.

---

## Phase 2: Own engine and the route

### Task 3: Season inputs (weather, soil hydraulics)

**Files:**
- Modify: `backend/agriquill/agriquill/data/weather.py`. Add `fetch_archive_daily(lat, lon, start, end, client=None) -> dict[str, Any]`:
  - It uses the Open-Meteo archive `daily=` request with `temperature_2m_max, temperature_2m_min, precipitation_sum, shortwave_radiation_sum, et0_fao_evapotranspiration, wind_speed_10m_max, relative_humidity_2m_min, relative_humidity_2m_max, vapour_pressure_deficit_max`, `timezone=auto` and `wind_speed_unit=ms`.
  - It caches under the `openmeteo_archive_daily` source with the same envelope as `fetch_archive_hourly`.
  - It returns `{"days": [{"date", "tmax_c", "tmin_c", "rain_mm", "srad_mj_m2", "et0_mm", "wind_ms", "rh_min_pct", "rh_max_pct"}], "source", "missing"}`.
  - A day with any null is left out of `days` and listed in `missing` as `missing("weather_day", "<date>: <field> null")`.
- Create: `backend/agriquill/agriquill/season_inputs.py`:
  - `hydraulics(layer: Mapping[str, float]) -> dict[str, Any]`: Saxton & Rawls (2006) Eq. 1–3 for θ1500, θ33 and θS−33, from sand, clay and organic matter. OM = SOC g/kg × 1.724 / 10 %; the 1.724 factor is TO VERIFY with its source. It returns `{"theta_fc", "theta_wp", "theta_sat", "source"}`.
  - `site_inputs(spec, parcel_id, year) -> dict[str, Any]` returns `{"lat", "lon", "location_basis", "weather": fetch_archive_daily(...), "hourly": fetch_archive_hourly(...)["hourly"], "soil": fetch_soil(...), "hydraulics": hydraulics(top layer) | None, "missing": [...]}`.
  - The season window is `transplant_date` to `transplant_date + duration_days`, moved into `year`.
  - `hourly` feeds `pest.shadow_blast` in the own engine.
  - `fetch_soil` is async; call it with `asyncio.run` in the worker thread, as other sync callers of async fetchers in this package do. Check them first with a grep for `asyncio.run(`.
- Test: `backend/agriquill/tests/test_agriquill_season_inputs.py`

**Interfaces:**
- Produces: `weather.fetch_archive_daily` and `season_inputs.site_inputs` as above. `hydraulics` is also used by the adapters.

- [ ] **Step 1: Fetch the source.**
  - Fetch Saxton & Rawls 2006 (SSSAJ 70:1569) Eq. 1–3. If the paper is paywalled, use its open appendix or a USDA copy.
  - Copy the coefficients into `season_inputs.py` with a `SAXTON_RAWLS_2006` source string.
  - Record the URL used in the test docstring.
- [ ] **Step 2: Write the failing tests.**
  - `test_hydraulics_matches_paper_example`: use the worked example the paper gives (its sand, clay, OM → θ33, θ1500), with tolerance 0.005.
  - `test_fetch_archive_daily_parses_and_drops_null_days`: an httpx `MockTransport` returns 3 days, one with a null `shortwave_radiation_sum`. The result is 2 `days` and 1 `missing`.
  - `test_site_inputs_without_boundary_uses_farm_location`: `location_basis` is "farm location".
- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run them.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: fetch daily replay weather and soil water limits for a season run`.

### Task 4: Own engine

**Files:**
- Create: `backend/agriquill/agriquill/season.py`
- Test: `backend/agriquill/tests/test_agriquill_season.py`

**Interfaces:**
- Consumes:
  - `season_inputs.site_inputs` output
  - `flows.dual_kc`, `flows.ks`, `flows.taw_mm`, `flows.FRAC_GAS`, `flows.FRAC_LEACH_WET`, `flows.EF1_FLOODED_RICE`, `flows.n_source`
  - `pest.shadow_blast` on `inputs["hourly"]`, giving a `blast` variable that keeps its shadow label. If `hourly` is None, the result is `{"value": null, "reason": "hourly replay weather unavailable"}`.
- Produces: `season.run(plan: Mapping[str, Any], inputs: Mapping[str, Any]) -> dict[str, Any]`, which returns:
  - `{"engine": "own", "status": "ok", "days": [row], "summary": {...}, "windows": [...], "method": {...}, "sources": {...}}`
  - Each row is `{"date", "das", "stage", "vars": {name: {"value", "unit"} | {"value": None, "reason"}}}`.
  - Variable names, shared by all engines:
    - `dvs`, `lai`, `canopy_cover`, `biomass_kg_ha`, `yield_kg_ha`
    - `ponded_mm`, `runoff_mm`, `soil_water_ks`
    - `soil_n_kg_ha`, `n_uptake_kg_ha`, `n_demand_kg_ha`, `n_factor`
    - `weed_loss_pct`
    - `residue_g_ha` (a dict per product under `residue`)
    - `heat_day`
- Windows are `{"kind": "n_demand_pi" | "flowering_heat" | "phi_block" | "harvest", "start", "end", "detail"}`.

- [ ] **Step 1: Fetch the sources and record them as constants with source strings.**
  - **Phenology:** the ORYZA2000 manual (Bouman et al. 2001, IRRI): the cardinal temperatures TBD, TOD and TMD, the heat-unit formula, and the development rates DVRJ, DVRI, DVRP and DVRR with the default variety they belong to. Mark the rates TO VERIFY for local varieties.
  - **Biomass:**
    - RUE for rice and the canopy light extinction coefficient k, from ORYZA2000 or a cited rice RUE review
    - the LAI rule that the own model uses: ORYZA's specific leaf area approach, or a cited simple partitioning
  - **Nitrogen:** Sheehy et al. 1998 (Field Crops Research 59:31), the critical N concentration for rice, %N = a·W^−b with W in t/ha.
  - **Weeds:** Cousens 1985 (J. Agric. Sci. 105:513) yield loss YL = I·d / (1 + I·d/A), and Cousens et al. 1987 for emergence time. Values of I and A for *Echinochloa crus-galli* in transplanted rice come from a cited study; mark them TO VERIFY.
- [ ] **Step 2: Write the failing tests.** Use a fixture `inputs` with 120 synthetic days: constant Tmax 32, Tmin 24, rain 0 except where a test sets it, srad 18, et0 4.5. Use `hydraulics` with fc 0.40, wp 0.20.

```python
def test_water_balance_closes_every_day():
    out = season.run(plan(bund=20, events=[irrigate(d0, 80)]), inputs())
    for prev, row in pairwise(out["days"]):
        dS = v(row,"ponded_mm") - v(prev,"ponded_mm")
        assert abs(row["balance"]["in_mm"] - row["balance"]["out_mm"] - v(row,"runoff_mm") - dS) <= 0.1

def test_ponded_never_exceeds_bund():
    out = season.run(plan(bund=10), inputs(rain={5: 300}))
    assert max(v(r, "ponded_mm") for r in out["days"]) <= 100.0
    assert v(out["days"][5], "runoff_mm") > 0

def test_n_pool_never_negative_and_uptake_bounded():
    out = season.run(plan(events=[fert(d10, "urea", 100, 46)]), inputs())
    assert all(v(r,"soil_n_kg_ha") >= 0 for r in out["days"])
    assert v(out["days"][-1],"n_uptake_kg_ha") <= 46.0 + initial_soil_n(out)

def test_residue_halves_after_one_dt50():
    out = season.run(plan(events=[spray(d20, "X", 200, dt50=7, phi=14)]), inputs())
    assert abs(residue(out, d20 + 7, "X") - 100.0) < 0.5

def test_phi_block_when_harvest_inside_interval():
    out = season.run(plan(duration=120, events=[spray(day(115), "X", 200, dt50=7, phi=14)]), inputs())
    assert any(w["kind"] == "phi_block" for w in out["windows"])

def test_phenology_reaches_flowering_on_hand_computed_day():
    # expected day from Step 1 heat-unit formula on constant 24/32 C, computed in the test from the constants
    assert first_day(out, lambda r: v(r,"dvs") >= 1.0) == expected_flowering_day()

def test_weeding_lowers_weed_loss():
    a = season.run(plan(events=[emerge(d0, 50)]), inputs())
    b = season.run(plan(events=[emerge(d0, 50), weed(day(20), "hand", 90)]), inputs())
    assert v(b["days"][-1],"weed_loss_pct") < v(a["days"][-1],"weed_loss_pct")

def test_missing_weather_day_nulls_following_rows():
    out = season.run(plan(), inputs(drop={30}))
    assert v(out["days"][29], "biomass_kg_ha") is not None
    assert out["days"][30]["vars"]["biomass_kg_ha"] == {"value": None, "reason": "weather missing for " + date_of(30)}

def test_fish_toxic_spray_warns_with_trench():
    out = season.run(plan(trench={"depth_cm": 60, "width_cm": 100, "share_pct": 8}, fish=True,
                          events=[spray(d20, "X", 200, dt50=7, phi=14, fish_toxic=True)]), inputs())
    assert any(w["kind"] == "fish_toxic_spray" for w in out["windows"])
```

- [ ] **Step 3: Run the tests.** Expected: FAIL.
- [ ] **Step 4: Implement `season.run`.** Order of operations each day:
  1. Weather. On a gap, stop: this day and every later row get nulls with the reason.
  2. Heat units, then DVS and stage.
  3. LAI and biomass, with RUE × (1 − e^(−k·LAI)) × 0.5·srad × Ks × N factor.
  4. Water. ETc comes from `dual_kc`, using DVS to choose the Kcb stage. In = rain + irrigation. Out = ETc + percolation (null percolation means `runoff`/`ponded` stay null with the reason "contract declares no percolation rate"). The ponded excess above the bund is runoff. Below zero ponded water, switch to root-zone depletion with `ks()`.
  5. N pool. Add fertiliser N, minus IPCC volatilisation and leaching on the application day, minus uptake = min(demand increment, pool). N factor = uptake / demand, capped at 1.
  6. Weeds. Cousens loss from the surviving density; a `weed` event multiplies density by (1 − removed_pct/100).
  7. Residue decay per product.
  8. Heat day: Tmax ≥ 35 °C, counted when 0.9 ≤ DVS ≤ 1.1.
  9. Windows: N demand at panicle initiation (DVS 0.65–1.0), flowering heat, PHI block, fish-toxic spray, harvest.

  `row["balance"] = {"in_mm", "out_mm"}` is exposed so the closure test can check it.
- [ ] **Step 5: Run the tests.** Expected: PASS. Then ruff and mypy.
- [ ] **Step 6: Commit** `feat: add the own cited season engine for one paddy`.

### Task 5: Season plan, runner and route

**Files:**
- Create: `backend/agriquill/agriquill/season_run.py`
- Modify: `backend/agriquill/agriquill/api/main.py`. Add the `SeasonPlanReq` models and `POST /farms/{farm_id}/parcels/{parcel_id}/season-run` with `_READER` and `_see` (running reads, it does not write records; the cache write is internal).
- Test: `backend/agriquill/tests/test_agriquill_season_run.py`

**Interfaces:**
- Consumes: `season.run`, `season_inputs.site_inputs`, and later `season_aquacrop.run` and `season_wofost.run`, with the same signature `run(plan, inputs) -> dict`.
- Produces:
  - `season_run.ENGINES: dict[str, Callable[[Mapping, Mapping], dict]]`, starting with `{"own": season.run}`; Tasks 6 and 7 register theirs.
  - `season_run.run(farm_id: str, parcel_id: str, plan: dict[str, Any]) -> dict[str, Any]`, returning `{"farm_id", "parcel_id", "plan_sha256", "years": [{"year", "inputs_source", "engines": {name: result | {"status": "failed", "reason"}}, "compare": compare(...)}], "spread": {...}, "status": "uncalibrated", "comparison": "comparison only, no measured yields to score against"}`.
  - `spread` is `{engine: {"yield_kg_ha": {"min", "max", "years": {year: value}}}}` across `weather_years`. It is shown as "weather alone moves the yield by X" only when there are at least 2 years.
  - `season_run.compare(results: Mapping[str, dict]) -> dict` returns `{"days": [{"date", "vars": {name: {"min", "max", "engines": {name: value}}}}], "summary": {"yield_kg_ha": {"min", "max", "by_engine"}}}`. Engines with a null value are left out of min and max for that variable.
- Plan model (pydantic, `extra="forbid"`):
  - `transplant_date: date`
  - `duration_days: int` (60–200)
  - `water: {regime: Literal["continuous", "awd"], awd_threshold_cm: float | None (-40–0), reflood_cm: float | None (0–30)}`
  - `bund_height_cm: float` (5–150)
  - `trench: {depth_cm (10–200), width_cm (20–500), share_pct (1–30)} | None`
  - `fish: bool = False`
  - `percolation_mm_day: float | None` (0–50)
  - `events: list[Event]` (at most 200), a discriminated union on `kind` matching the spec table
  - `weather_years: list[int]` (1–5 items, each from 1990 to last year)
  - Validators:
    - `bund_height_cm > reflood_cm` when both are set; otherwise "bund_height_cm must exceed reflood_cm"
    - event dates fall within transplant_date ± duration_days
- Each engine runs in a `ThreadPoolExecutor` with `ENGINE_TIMEOUT_S = 60`, a constant with the comment `shortcut: fixed timeout, tune after first timings`.
- The cache is `RecordCache("contracts.sqlite")` source `"season_run"`, keyed by sha256 of canonical JSON of the plan, the inputs `source` digests and the engine names.

- [ ] **Step 1: Write the failing tests.**
  - `test_same_plan_hits_cache`: monkeypatch `site_inputs` to count calls; two runs give 1 call.
  - `test_one_engine_failing_keeps_others`: register a fake engine that raises. Its slot is `{"status": "failed", "reason": "RuntimeError: boom"}` and `own` is ok.
  - `test_compare_skips_null_engines`.
  - `test_plan_rejects_bund_below_reflood`: the route returns 422.
  - `test_season_run_without_boundary_uses_farm_location`.
  - `test_route_returns_uncalibrated_status`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS. Then run the phase gate, restart uvicorn, and run `curl` against the route for a registered demo farm: it returns 200 and `status: "uncalibrated"`.
- [ ] **Step 5: Commit** `feat: run a season plan on replay weather with cached results`, then push.

---

## Phase 3: AquaCrop-OSPy and WOFOST

### Task 6: AquaCrop-OSPy adapter

**Files:**
- Modify: `backend/agriquill/pyproject.toml`. Add `aquacrop==3.1.0` to dependencies and a mypy `ignore_missing_imports` override for `aquacrop.*`, following the existing yaml override.
- Create: `backend/agriquill/agriquill/season_aquacrop.py`
- Modify: `season_run.py`, to register `"aquacrop"` only if `importlib.util.find_spec("aquacrop")` finds it; otherwise the slot gives `failed` with "aquacrop not installed".
- Test: `backend/agriquill/tests/test_agriquill_season_aquacrop.py`

**Interfaces:**
- Produces: `season_aquacrop.run(plan, inputs) -> dict` in the Task 4 result shape, with the same variable names.
  - Modelled: `canopy_cover`, `biomass_kg_ha`, `yield_kg_ha`, `ponded_mm` (bund water).
  - Everything else: `{"value": None, "reason": "not modelled by AquaCrop-OSPy"}`.

- [ ] **Step 1: Install and confirm the API.**
  - Run `.venv/Scripts/python.exe -m pip install aquacrop==3.1.0`.
  - In the installed source, read `aquacrop/entities/fieldManagement.py` (or the equivalent) for the bund parameters, and the classes `Crop("PaddyRice", planting_date=...)`, `Soil(...)` (custom layers from θfc/θwp/θsat), `IrrigationManagement(irrigation_method=3, Schedule=...)`, `InitialWaterContent` and `AquaCropModel(...).run_model(till_termination=True)`.
  - Write the confirmed names as the import lines in the adapter.
- [ ] **Step 2: Write the failing tests** on the Task 4 fixture inputs, with no network:
  - `test_aquacrop_returns_shared_schema`: same dates and every variable key present.
  - `test_aquacrop_bund_holds_water`: on a heavy rain day, `ponded_mm` > 0 and ≤ the bund height in mm.
  - `test_aquacrop_marks_nitrogen_not_modelled`.
- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.** Weather becomes a DataFrame with the columns `MinTemp, MaxTemp, Precipitation, ReferenceET, Date`, as aquacrop expects. Read the daily outputs from `get_water_flux()`, `get_crop_growth()` and `get_simulation_results()`.
- [ ] **Step 5: Run them.** Expected: PASS. Then run the backend gate.
- [ ] **Step 6: Commit** `feat: run AquaCrop-OSPy on the same season plan`, staging `pyproject.toml`.

### Task 7: PCSE/WOFOST adapter

**Files:**
- Modify: `backend/agriquill/pyproject.toml`. Add `pcse==6.0.13`, and a mypy override for `pcse.*`.
- Create: `backend/agriquill/agriquill/data/wofost/rice.yaml` and `backend/agriquill/agriquill/data/wofost/LICENSE`, copied from the WOFOST_crop_parameters repository at a pinned commit recorded in `season_wofost.SOURCE`. Add `data/wofost/*` to package data.
- Create: `backend/agriquill/agriquill/season_wofost.py`
- Modify: `season_run.py`, to register `"wofost"` the same way as Task 6.
- Test: `backend/agriquill/tests/test_agriquill_season_wofost.py`

**Interfaces:**
- Produces: `season_wofost.run(plan, inputs) -> dict` in the shared shape.
  - Modelled: `dvs`, `lai`, `biomass_kg_ha` (TAGP), `yield_kg_ha` (TWSO), `n_uptake_kg_ha` (N-limited model only).
  - `method.model` is the PCSE model class name.
  - `method.nitrogen` is `"modelled"` or `"not modelled: rice parameters lack N terms"`.

- [ ] **Step 1: Install and inspect.**
  - Run `.venv/Scripts/python.exe -m pip install pcse==6.0.13`.
  - Fetch `rice.yaml` from WOFOST_crop_parameters and check whether it has N parameters such as `NMAXLV_TB`.
  - Choose the model accordingly: `pcse.models.Wofost81_NWLP_MLWB_SNOMIN` (or the 6.0.13 equivalent) if it has them, else `Wofost72_WLP_CWB`.
  - Use `YAMLCropDataProvider(fpath=<packed dir>)` so nothing is fetched at run time.
- [ ] **Step 2: Write the failing tests:**
  - `test_wofost_returns_shared_schema`
  - `test_wofost_dvs_increases_monotonically`
  - `test_wofost_runs_offline` (an httpx and urllib guard monkeypatched to raise on any network call)
  - `test_wofost_states_nitrogen_basis`
- [ ] **Step 3: Run them.** Expected: FAIL.
- [ ] **Step 4: Implement.**
  - Build a PCSE `WeatherDataContainer` per day from the ERA5 days: `IRRAD` = srad × 1e6 J/m²; `TMIN`; `TMAX`; `VAP` from RH and T (FAO-56 Eq. 17/19, cited); `WIND`; `RAIN` in cm; `E0`, `ES0` and `ET0` from Penman via PCSE's own helper.
  - Build the agromanagement YAML in memory from `transplant_date` and the fertiliser events.
- [ ] **Step 5: Run them.** Expected: PASS. Then run the phase gate, check a real `curl` run reports three engine slots, and push.
- [ ] **Step 6: Commit** `feat: run PCSE WOFOST on the same season plan`.

---

## Phase 4: Panel, timeline and map

### Task 8: Season plan client logic

**Files:**
- Modify: `lib/api.ts`. Add the types `SeasonPlan`, `SeasonEvent`, `SeasonRun`, `EngineResult`, `SeasonVar`, plus `runSeason(farmId, parcelId, plan, signal?)` (POST, following the existing pattern).
- Create: `lib/farmmap/seasonPlan.ts`:
  - `defaultPlan(parcel: ContractParcel, hydro: Record<string, unknown>): SeasonPlan`, filled only from contract values. Everything else is empty or undefined; the bund height has no default.
  - `planErrors(plan: SeasonPlan): string[]`, giving i18n keys and mirroring the backend validators.
  - `FAO_HINTS`: the spec's numbers with their URL.
- Create: `lib/farmmap/seasonPlayback.ts`:
  - `step(state: Playback, dtMs: number): Playback`, with `Playback = {day: number; playing: boolean; speed: 1 | 4 | 16; last: number}`, advancing `speed` days per second and stopping at the end.
  - `varAt(run: SeasonRun, engine: string, day: number, name: string): SeasonVar`
  - `tintExpression(name: TintVar): ExpressionSpecification`, a feature-state driven `interpolate` over `MAP_COLOR` stops, with `TintVar = 'ponded_mm' | 'canopy_cover' | 'n_factor' | 'weed_loss_pct' | 'residue'`.
- Test: `tests/farm-simulation/season_plan.test.ts`, `tests/farm-simulation/season_playback.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - `defaultPlan` never sets `bund_height_cm`.
  - `planErrors` flags a bund lower than the reflood target.
  - `step` at speed 4 over 500 ms advances 2 days.
  - `step` stops at the last day with `playing: false`.
  - `varAt` returns `{value: null, reason}` unchanged.
  - `tintExpression('ponded_mm')` reads `['feature-state', 'ponded_mm']`.
- [ ] **Step 2: Run** `npm run test:farm-sim`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:farm-sim` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add season plan defaults, validation and playback logic`.

### Task 9: Season section and timeline bar

**Files:**
- Create: `components/farmmap/SeasonSection.tsx`, mounted in `OwnFarmDetail.tsx` before `RecordsSection`.
  - **Shown first:** the yield range across engines (`compare.summary.yield_kg_ha`, with "per engine" behind `More`), the next window, a "Play season" `AqButton`, and the uncalibrated badge.
  - **Editor behind `More`:** regime, AWD values, bund height with the FAO hint line and its link, trench (shown only for rice-fish crops or when `fish` is on), percolation, the weather-year select (last 5 years), and an event list with add and remove.
- Create: `components/farmmap/SeasonTimeline.tsx`, a bottom bar over the map while a run is open:
  - **Controls:** play and pause (`Play`/`Pause` icons), speed buttons, a range input scrubber, and a variable select for the tint.
  - **Bands:** an SVG stage band, rain bars and a Tmax line, event markers, and window bands.
  - **Behaviour:** Space plays and pauses; arrow keys step a day. `aria-label` on every control. No autoplay under reduced motion.
- Modify: `components/farmmap/FarmMapView.tsx`, to hold `seasonRun` state and render `SeasonTimeline`.
- Modify: `lib/farmmap/dataLayersTheme.ts` and `engine/viewModes.ts`:
  - When a run is open, `own-fill` uses `tintExpression(var)`.
  - `setFeatureState` on the parcel feature gets the day's values.
  - The `own-water` slab height becomes `ponded_mm` / 1000 × the existing relief scale.
  - The `own-3d` extrusion height follows `canopy_cover` × `RELIEF_HEIGHT_M.own`. This is a display scale, and the HUD says so.
- Create: `components/farmmap/SeasonCharts.tsx`, behind `More` in `SeasonSection`. It uses the existing `AqLineChart`, with a cursor line at the playback day:
  - ponded water against a bund-height reference line
  - soil N against N demand
  - biomass per engine, one series per engine, with a legend that carries engine names and is never colour alone
  - weed loss %
  - residue per product against a PHI marker
- Modify: `aq-farmmap-detail.css` (and the timeline CSS beside the existing farm map CSS files), using tokens only.
- Modify: `lib/i18n/*.ts` (`farmMap.season.*`).
- Test: extend `season_playback.test.ts` with `test('keyboard step clamps to the season')` through an exported `keyStep(day, key, last)`.

- [ ] **Step 1: Write the failing test** for `keyStep`: `ArrowRight` at the last day stays; `ArrowLeft` at 0 stays.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement the components.**
- [ ] **Step 4: Run** `npm run typecheck` and `npm run test:farm-sim`. Expected: PASS, including i18n coverage.
- [ ] **Step 5: Check the UI.**
  - Restart the API and Vite.
  - Run a season on the demo farm.
  - Take screenshots at 1440 and 375 px of the panel, the editor and the timeline at day 0, day 60 and the last day, plus 375 px in Burmese.
  - Look at each one: tint changes, the slab moves, nothing overflows.
  - Compute the WCAG contrast of the new text pairs from the token values: at least 4.5:1, or 3:1 for icons.
  - Tab through the timeline.
- [ ] **Step 6: Commit** `feat: play a season on the farm map with a timeline and field tint`. Then run the phase gate and push.

---

## Phase 5: 3D replica and Blender models

Blender MCP tools must be listed in the session (`mcp__blender__*`), which needs a VS Code window reload. If they are missing, stop Task 10 and report; Task 11 can run with the geometry fallback.

### Task 10: Blender models

**Files:**
- Create: `apps/agroguard-web/public/models/farmmap/`:
  - `rice_seedling.glb`, `rice_tillering.glb`, `rice_booting.glb`, `rice_heading.glb`, `rice_ripening.glb` (each `_lod0`/`_lod1`)
  - `weed_grass.glb`, `weed_broadleaf.glb`
  - `mill.glb`, `pump.glb`, `sluice.glb`
  - `mud_wet.jpg`, `soil_dry.jpg`, `bund_clay.jpg` (1024², tileable)
- Create: `apps/agroguard-web/assets-src/farmmap/*.blend` (the sources)
- Create: `apps/agroguard-web/public/draco/`, copied from `node_modules/three/examples/jsm/libs/draco/gltf/` (decoder js and wasm)
- Test: `tests/farm-simulation/models.test.ts`

Budgets (pinned here, visual only):
- rice lod0 ≤ 600 triangles, lod1 ≤ 120
- weeds ≤ 400
- structures ≤ 8,000
- every `.glb` ≤ 2 MB

Scale: 1 unit = 1 m, with Y up and the origin at the base centre.

- [ ] **Step 1: Write the failing test.** For each listed file: it exists; its size is ≤ 2 MB; it is glTF binary (magic `glTF` at bytes 0–3, version 2); and its JSON chunk lists `KHR_draco_mesh_compression` in `extensionsUsed`.
- [ ] **Step 2: Run** `npm run test:farm-sim`. Expected: FAIL.
- [ ] **Step 3: Build each model through the Blender MCP tools.**
  - Load each tool's schema with ToolSearch first.
  - **Rice:** clumps of leaf blades bent with a curve modifier; heading and ripening get panicles.
  - **Weeds:** a grass tuft and broadleaf rosettes.
  - **Structures:** a mill (shed with hopper and chimney), an electric pump on a plinth, and a sluice gate in a concrete frame.
  - **Ground materials:** bake the three textures.
  - **Export:** glTF binary with Draco compression level 6, Y up and applied modifiers.
  - Save the `.blend` files.
  - Take a viewport screenshot of each model and look at it.
- [ ] **Step 4: Copy the Draco decoder files.**
- [ ] **Step 5: Run the test.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: add Blender-made rice, weed, mill, pump and sluice models`, staging the listed files.

### Task 11: 3D field replica

**Files:**
- Create: `lib/fieldsim/localFrame.ts`:
  - `localFrame(ring: [number, number][]): { origin: {lat, lon}; toLocal(lat, lon): [x, z]; ring: [x, z][] } | null`, an equirectangular projection about the ring centroid in metres; it returns null for fewer than 3 points.
  - `bundStrip(ring: [x, z][], widthM: number): [x, z][][]`, giving quads along each edge.
  - `insetBand(ring, insetM, widthM)` for the trench.
- Create: `lib/fieldsim/imagery.ts`:
  - `tilesFor(bbox, maxTiles = 16): {z, tiles: {x, y}[], pixelBox}`, the highest zoom (at most 19) whose tile count is at most `maxTiles`.
  - `tileUrl(z, x, y)` uses the same World Imagery URL as `basemapImagesTheme.ts`, imported from there and not duplicated.
- Create: `lib/fieldsim/instances.ts`:
  - `plantGrid(ring: [x, z][], spacingM: number, excluded: [x, z][][]): [x, z][]`, points inside the ring and outside the trench.
  - `rice_spacing_m` comes from the plan if entered, else 0.2 labelled as "display spacing, not agronomic". This is a visual density only, and the HUD says so.
- Create: `components/fieldsim/FieldReplica.tsx`, an R3F `Canvas` inside the existing `CanvasErrorBoundary` with `attachContextLossRecovery`:
  - **Ground:** the stitched imagery `CanvasTexture` on a plane, with attribution text in the HUD.
  - **Bunds:** extruded strips at `bund_height_cm` with the `bund_clay` texture.
  - **Trench:** an inset band recessed to `-trench.depth_cm`.
  - **Water:** a plane at the day's own-engine `ponded_mm`, with transparent water material.
  - **Rice and weeds:** `InstancedMesh` rice using the stage model for the day's DVS (lod1 beyond 60 m camera distance), scaled to canopy height; weeds scattered by `weed_loss_pct`.
  - **Weather:** rain `Points` on rain days; a spray mist sprite on spray days.
  - **Light:** the sun from `lightFor`, mapped to a `directionalLight`.
  - **HUD:** day, stage, each engine's value for the selected variable, and the design-input labels.
  - **Fallbacks:** if a model fails, simple cones; if the imagery fails, a flat neutral plane with a note.
- Create: `components/fieldsim/FieldReplicaDialog.tsx`, opened from `SeasonSection` ("Open 3D field") and sharing `Playback` with `SeasonTimeline`.
- Modify: `lib/i18n/*.ts` (`farmMap.replica.*`).
- Test: `tests/farm-simulation/field_replica.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - A 41.2 m square ring at latitude 17.098 projects to sides of 41.2 ± 0.3 m.
  - `localFrame([])` is null.
  - `bundStrip` gives one quad per edge.
  - `insetBand` stays inside the ring.
  - `tilesFor` on the 0.42 ac box gives z ≥ 18 and at most 16 tiles.
  - `plantGrid` excludes points in the trench band.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck` and `npm run test:farm-sim`. Expected: PASS.
- [ ] **Step 5: Check the UI.**
  - Open the replica for the demo farm.
  - Take screenshots at 1440 and 375 px at day 10, 60 and 110, and in a rice-fish plan with a trench.
  - Look at each one: the imagery is aligned with the bund ring, the water sits below the bund top, the plants change by stage, and the HUD is readable.
  - Measure frame time with Chrome tracing in headed mode and record it in the handoff, labelled "this laptop only".
- [ ] **Step 6: Commit** `feat: add a 3D replica of one field that plays the season`. Then run the phase gate and push.

### Task 12: Handoff and finish

**Files:**
- Modify: `docs/FARM_MAP_HANDOFF.md`
  - what was built
  - the sources fetched, with their URLs
  - the TO VERIFY list
  - measured frame times
  - known limits: the DEM is coarser than a bund, there is no calibration, ponded water comes from the own model only, and AquaCrop-OSPy has no N or weeds
- Modify: `docs/superpowers/specs/2026-10-23-single-field-season-design.md`, adding a status line.

- [ ] **Step 1: Write the handoff section.**
- [ ] **Step 2: Run the full gate.** Expected: all passed.
- [ ] **Step 3: Commit** `docs: update farm map handoff for the season simulator`, then push.
