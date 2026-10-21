# AgriQill Backend Build Plan

> **For the backend team.** This file should be all you need: what exists, what to build, in what order, how to prove each upgrade beats the old code, and the facts and limits behind it. **Nothing in sections 4-11 is built yet.** Values marked TO VERIFY must be checked with DAR Yezin, the DOA, a certifier or a lab before they go live, and each is logged in `docs/agriquill/OPEN_QUESTIONS.md`. Every benefit is a **design target**, never a promise. The frontend team has the companion `BUILD_PLAN_FRONTEND.md`. IDs like B-TS-2 match between the two files.

## 1. How we work

1. **Catch the field problem before the harvest does.** Every upgrade names the problem it catches earlier.
2. **Small steps.** One pull-request-sized change, one test, every time.
3. **The old code stays until the new code beats it.** Each upgrade first runs in shadow next to the current code (challenger beside champion). It replaces the old code only when it wins on its "Beats old when" metric, on held-out data from real pilot farms. If it doesn't win, the old code stays and the result goes into section 15. `forecast.py` already does this for forecasters: it keeps the lowest hold-out MAE (`forecast.py:345-346`). Use the same pattern everywhere.
4. **Real Myanmar data.** Photo models are scored on farmer photos collected through cooperatives. Water models are scored on tube readings from pilot paddies. Benchmarks are context, never the pass mark.
5. **Honest uncertainty.** Every output carries a band, a confidence word, or `null` with a reason. Never zero for unknown. Never a diagnosis we can't back up.
6. **Cooperatives first.** A cooperative officer or field agent is the first user of every feature.
7. **Hard rules (AGENTS.md):**
   - Drone ceiling 5.5 m/s and spray advisory 3.0 m/s; no contract can raise either (`AGRI-E020`).
   - A named, authenticated human approves every physical action.
   - No secrets in source.
   - No new dependency without owner approval. These are flagged **[dep]** below.
   - The 3D twin is out of Beta scope.
   - Work on `main` only; Conventional Commits; no branches or PRs.

## 2. Tiers and waves

| Tier | Meaning |
|---|---|
| **Common** | Industry standard; competitors have it. Needed to be credible. |
| **Uncommon** | Only where no Common or Rare option fits. |
| **Rare** | Research-grade; few products ship it. |
| **Legendary (candidate)** | A combination we found in no public product. Step 1 of every Legendary item is a prior-art search (English plus Burmese, Thai and Vietnamese). It is called Legendary only if that search still finds nothing, and even then it is "no public product found", never "nobody does this". |

Waves: **W0** fix now · **W1** before the pilot · **W2** during the pilot · **W3** after one season of data.

## 3. What you are working on

### Stack and commands

| Item | Value |
|---|---|
| Language and framework | Python 3, FastAPI, Pydantic settings (`AGRIQUILL_` env prefix, `backend/agriquill/config.py`) |
| Key libraries (`backend/pyproject.toml`) | numpy, pandas, httpx, torch and torchvision, scikit-learn, ortools (CP-SAT), paramiko, h5py, fastmcp, SQLAlchemy, alembic |
| Storage | SQLite files in `backend/data/` (ledger JSONL plus `telemetry.sqlite`, `contracts.sqlite`, `knowledge.sqlite`), shared by API, MCP and CLI |
| Run | `cd backend`, `python -m pytest`, `python -m ruff check .`. `mypy` is required by AGENTS.md but **missing from the dev extras**: adding it is B-W0-7 |
| CI | `.github/workflows/ci.yml`: backend job runs ruff and pytest on the AgriQill modules |
| Tests | `backend/tests/test_agriquill_*.py`: one file per module (fusion, gates, schedule, safety, ledger, onboard, contract, rehearse, telemetry, farm_access, gate_property, customer_farm and others) |

### Module map

| Module | Does today |
|---|---|
| `forecast.py` | Hybrid water forecast: ridge water balance plus dilated TCN residual; picks the lowest hold-out MAE |
| `fusion.py` | `kalman_depth`: 1D Kalman filter; on a 3σ jump it **resets** to the reading and flags it |
| `rehearse.py` | Hold, act and dry what-if branches; `score` checks them against the next reading |
| `schedule.py` | CP-SAT scheduler: gate-limited start hours, machine no-overlap, crew limit; job kinds include `harvest` |
| `gates.py` | Wind, Stull Delta-T, 6 h washout, nitrogen cap, ROI (ROI not evaluable: no curve) |
| `safety.py` | `PROHIBITED_INPUTS` (ASOA 7, EU 6, NOP 4 items); two-phase approval with a 600 s one-time token; shared PIN |
| `contract.py` | `.agri` contract parser and linter: boundary ring closure, wind ceiling, AWD trigger, nitrogen cap |
| `farmers.py` | Rule agents: water steward, crop scout, pest watcher (blast), harvest planner, drone pilot; default thresholds |
| `onboard.py` | Customer farm import and `backtest` (one-step water balance vs no-change, **not** the Kalman filter), `audit_inputs`, seepage median |
| `telemetry.py` | Readings ingest (any device ID accepted), stale and stuck sensor checks, photo evidence |
| `ledger.py` | Append-only SHA-256 hash chain |
| `data/*.py` | CHIRPS, NASA POWER, GLEAM, FAOSTAT, EcoCrop, GFW, Pink Sheet, Open-Meteo, OSM farm sites |
| `api/main.py` | All `/api/v1/agriquill/*` routes, auth (`_reader`, roles `crew` and `manager`) |
| `mcp/` | MCP server: read-only tools by default; `--allow-actuation` is stdio-only |
| `app/ml/` | RandomForest crop model (synthetic data); ResNet18 disease model (**no weights file**) |

### API conventions (keep them)

- **Routes and fields.** Routes live under `/api/v1/agriquill/`. JSON fields are **snake_case** here, unlike the older AgroGuard standard's camelCase; keep snake_case for consistency.
- **Missing values.** An unknown value is `null` with a `missing: [{field, reason}]` entry, never zero.
- **Errors.** Today they return FastAPI `detail` strings. The target contract (`docs/api-standards.md`) is `code`, `message`, `status`, `timestamp` and request ID: that is upgrade B-TR-6.
- **Status codes.** 401 no or bad sign-in, 403 signed in but not allowed for this farm, 422 domain validation, 429 rate limit, 502/503 provider down.
- **Provenance.** Every number carries provenance: measured, modelled, inferred, fixture or unavailable.

### Current routes (from `api/main.py`)

- **Core:** `/health`, `/auth/me`, `/data/health`, `/territory-profile`, `/dsl/lint`, `/sim/run`, `/sim/status/{task_id}`, `/sim/snapshot`
- **ML and agronomy:** `/ml/crop-predict`, `/ml/plant-recommend`, `/agronomy/eto`, `/agronomy/et0`
- **Safety and evidence:** `/actuation/approve`, `/ledger`, `/evidence/validate`, `/evidence/passport`
- **Planning:** `/ops/crops`, `/ops/plan`
- **Farms and fleet:** `/fleet`, `/fleet/fields`, `/farms`, `/farms/{farm_id}`, `/farms/{farm_id}/region`, `/farms/{farm_id}/onboard`
- **Data layer:** `/ecocrop/crops`, `/ecocrop/crops/{key}`, `/ecocrop/screen`, `/faostat/qcl`, `/fao/crop-calendar`, `/chirps/rainfall`, `/nasa-power/daily`, `/regions`, `/regions/{town}`, `/regions/{town}/crop-options`, `/gleam/stress`, `/gleam/daily`, `/gfw/forest-compliance`, `/gfw/datasets`, `/gfw/coastal-vessels`, `/gfw/vessels`, `/market/benchmarks`, `/knowledge/search`
- **Tasks and jobs:** `/tasks` (GET, POST), `/agents/decisions`, `/jobs`, `/jobs/{name}/run`, `/jobs/status/{run_id}`
- **Telemetry:** `/telemetry/ttn`, `/telemetry/chirpstack`, `/telemetry/readings`, `/telemetry/latest`
- **Contracts and proposals:** `/contracts`, `/contracts/verify`, `/contracts/from-site`, `/contracts/{farm_id}` (GET, PUT), `/contracts/{farm_id}/plan`, `/contracts/{farm_id}/herds`, `/contracts/{farm_id}/monitoring`, `/contracts/{farm_id}/summary`, `/contracts/{farm_id}/check`, `/contracts/{farm_id}/watch`, `/proposals`, `/proposals/{proposal_id}/decision`

### New routes this plan adds (names to agree in API review with the frontend team)

| Route | For |
|---|---|
| `GET /contracts/{farm_id}/evidence-pack?plot=&season=` | B-AG-10 |
| `GET/POST /farms/{farm_id}/certificates` | B-AG-3 |
| `GET/POST /farms/{farm_id}/lots`, `GET /lots/{lot_id}/passport` | B-TR-3, B-TR-5 |
| `POST /lots/{lot_id}/lab-results` | B-TR-4, B-AG-11 |
| `POST /farms/{farm_id}/post-harvest`, `POST /farms/{farm_id}/mill-intake` | B-AG-15, B-AG-16 |
| `POST /farms/{farm_id}/seed-lots`, `POST /farms/{farm_id}/fumigations` | B-AG-14, B-AG-12 |
| `POST /photos`, `GET /photos/review-queue` | B-ML-2, B-ML-4 |

### `.agri` diagnostic codes in use

| Code | Meaning |
|---|---|
| `AGRI-E001` / `AGRI-W010` | Syntax error (strict) or warning |
| `AGRI-E010` | Prohibited input under the declared standard |
| `AGRI-E020` | A wind limit relaxes the 5.5 m/s ceiling |
| `AGRI-E021` / `AGRI-E022` | Range written upper-first, or wrong unit |
| `AGRI-E023` | Nitrogen rate over the canopy cap |
| `AGRI-E024` | AWD trigger not below the surface and below the flowering lock |
| `AGRI-E025` / `AGRI-W023` / `AGRI-W024` | Herd in an unknown paddy, unknown herd kind, or no `min_water` for animals |
| `AGRI-E026` | Boundary not a closed ring of [lat, lon] pairs |
| `AGRI-W001` / `AGRI-W002` | No standard declared; confirm the standard |
| `AGRI-W020` / `AGRI-W021` / `AGRI-W022` | TO VERIFY local source; ROI not evaluable; unknown key |

New codes in this plan start at `AGRI-E030` and `AGRI-W030`.

### Default thresholds (`farmers.DEFAULT_THRESHOLDS`, all TO VERIFY locally)

| Key | Default | Key | Default |
|---|---|---|---|
| `awd_safe_depth_cm` | −15 | `blast_rh_pct` | 90 |
| `awd_reflood_target_cm` | 5 | `blast_temp_min_c` / `blast_temp_max_c` | 20 / 28 |
| `flowering_min_depth_cm` / `flowering_max_depth_cm` | 3 / 5 | `blast_consecutive_days` | 2 |
| `overflow_depth_cm` | 10 | `dry_day_rain_mm` | 2 |
| `rain_hold_mm` | 20 | `harvest_dry_days` / `harvest_early_days` | 3 / 3 |
| `ndvi_drop_per_10_days` | 0.05 | `rice_salinity_threshold_ds_m` | 3.0 |
| `spray_wind_calm_floor_ms` | 1.3 | `spray_wind_advisory_ms` | 3.0 (ceiling 5.5) |

**Other fixed values:**
- Kalman noise: process 0.04 cm²/h; reading 0.25 cm² for LoRaWAN, 1.0 cm² for manual.
- Delta-T band: 2-8 °C.
- Washout: 10 mm in 6 h.
- Valve run: at most 180 min.
- Approval token time-to-live: 600 s.
- Backtest verdict: needs at least 10 reading pairs (`MIN_VERDICT_PAIRS`).

### Data sources and licences (from `DATA_SOURCES.md` and `OPEN_QUESTIONS.md`)

| Source | Use | Licence or limit |
|---|---|---|
| Open-Meteo hourly and daily | Weather, ET0, wind | **Free tier is non-commercial.** A paid pilot needs a subscription |
| CHIRPS v2.0 | Rain, percentile, SPI | Keyless; byte-range COG reads |
| NASA POWER | Solar, temperature, RH, wind | Keyless |
| GLEAM v4.3 | Evaporation, root-zone moisture | SFTP login in `keys.env` |
| FAOSTAT | Yields | Bulk keyless; live API needs a token |
| Global Forest Watch | Tree loss, fires | API key |
| Global Fishing Watch | Vessels | **CC BY-NC: non-commercial only** |
| World Bank Pink Sheet | Rice Thai 5 %, Viet 5 % benchmarks | Keyless; not farm-gate prices |
| OSM via Overpass | Farm sites | ODbL |
| Sentinel-1/2 (planned) | B-GIS-2, B-GIS-3 | Access route TO VERIFY (OPEN_QUESTIONS #21) |

### Where older docs disagree with the code (trust the code)

| Doc says | Code does |
|---|---|
| `SECURITY_SAFETY.md`: JWT, RBAC (viewer, operator, approver), rate limits, gitleaks | One shared write token or `AGRIQUILL_USERS` (`name:code:roles[:farms]`, roles `crew` and `manager`); no rate limit; no secret scanning, and secrets **are** committed |
| `TESTING.md`: `pytest tests/unit/...` paths | Real tests are `backend/tests/test_agriquill_*.py` |
| `TESTING.md` check C: neural surrogate under 250 ms | `sim.py` is an analytic logistic **fixture**; 250 ms and ~1.8 % are design targets only |
| `docs/code-standards.md`: named feature branches | AGENTS.md wins: `main` only |
| AGENTS.md: run `mypy` | `mypy` is not installed by the dev extras |

## 4. Wave 0: safety and security fixes (do first)

| ID | Tier | Fix | Exact change | Done when (test) |
|---|---|---|---|---|
| B-W0-1 | Common | Rotate every committed secret | The owner chose to commit keys to the private repo, and `OPEN_QUESTIONS.md` says to "rotate them before the repository is shared". Sharing this repo with the backend and frontend teams triggers that rotation. Both tracked files hold live values. `backend/keys.env`: `AGRIQUILL_GFW_API_KEY`, `AGRIQUILL_GFW_JWT`, `AGRIQUILL_GLOBAL_FISHING_WATCH_TOKEN`, `AGRIQUILL_FAOSTAT_TOKEN`, `AGRIQUILL_GLEAM_USER`, `AGRIQUILL_GLEAM_PASSWORD`. `backend/.env`: `AGRIQUILL_FAOSTAT_TOKEN`, `GFW_API_KEY`. Rotate all at the providers, `git rm --cached` both files, purge history with `git filter-repo` (owner approval), and add secret scanning to CI **[dep]** | `git log --all -- backend/keys.env backend/.env` is empty; old keys are rejected |
| B-W0-2 | Common | Auth fails closed | `config.environment` defaults to `"development"` today, so a forgotten variable leaves the API open. Change the default to `"production"`. In `_lifespan` (`api/main.py:1270`), refuse to start when the environment is not development and neither `write_token` nor `users` is set | `test_agriquill_farm_access.py`: no auth and no environment variable → startup fails |
| B-W0-3 | Common | Webhooks accept only declared devices | `telemetry.ingest` rejects device IDs not in `live.device_owners()`; one webhook token per network (TTN, ChirpStack) | A forged device ID gets 403 |
| B-W0-4 | Common | Limit PIN guessing | The PIN is shared and `check_approval` has no identity, and each guess costs only a new phase-A token. Rate-limit phase-A token issue **and** PIN failures per caller and globally (target from `SECURITY_SAFETY.md`: 5 actuations per minute per farm). Per-approver limits come with B-TR-2 | `test_agriquill_safety.py`: the 6th failure in 10 min gets 429 |
| B-W0-5 | Common | The agent can never complete an actuation | `mcp/tools.py` `lorawan_actuate` currently takes `approval_pin`, `operator_confirmed` and `challenge_token` from the agent (`mcp/tools.py:727-742`). Make it **phase A only** and remove those three fields. `drone_spray_guard` trusts a wind value the agent supplies (`mcp/tools.py:34`): read wind from on-site telemetry (≤ 30 min old) or the Open-Meteo hour instead, and use the **higher** of agent and server values | The schema has none of the three fields; agent wind 2 m/s with telemetry at 6 m/s is rejected |
| B-W0-6 | Common | Only the server path can dispatch a machine | The frontend field-command modal pre-fills PIN `1234` and approves in the same submit (`FieldComposerModal.tsx:24,68-69`). That approval runs **in the browser only** (`lib/fieldMissions.ts:143`, "Simulated dispatch queued"), fixed in F-W0-2. Backend rule: no route may send a machine command except `/actuation/approve` phase A then phase B with the one-time token | A route-level test asserts that no other route emits a downlink or dispatch |
| B-W0-7 | Common | Add type checking | Add `mypy` to dev extras **[dep]**; run it in CI | CI runs mypy on `backend/agriquill` |

## 5. Time series and forecasting

| ID | Tier | Upgrade (old → new) | Problem caught earlier | Small steps | Beats old when | Wave |
|---|---|---|---|---|---|---|
| B-TS-1 | Common | No band check → **band coverage in every backtest** | Overconfident bands hiding a drying paddy | `forecast._backtest` makes point predictions only (`samples=1`, line 292). First add bands to it, then count readings inside P10-P90, reported as "X of N" with N | Coverage is reported per farm. Hidden from users when N < 10 (prerequisite for TS-2 and TS-3) | W1 |
| B-TS-2 | Common | SmoothL1 + MC dropout → **quantile (pinball) loss heads** for P10, P50, P90 | Bands too wide to act on or too narrow to trust | Three outputs on `_ResidualNet`; keep MC dropout as fallback | Lower interval score **and** coverage closer to 80 % than the old bands, same hold-out, at least 30 pairs | W1 |
| B-TS-3 | Rare | **Split conformal prediction** around any forecaster | Bands wrong on a new farm | Calibrate on an earlier window, test on a later one; pool per cooperative when a farm has fewer than 30 pairs | Coverage within 75-85 % on the later window for each cooperative with at least 30 pairs, where the old bands fall outside | W2 |
| B-TS-4 | Rare | Reset on a 3σ jump → **robust update** (Huber gain); accept a jump only after 2 agreeing readings | One forged or faulty reading wiping the estimate | Replace the reset in `kalman_depth`; keep the flag. When the 2 readings are far apart (up to `MAX_GAP_H` = 96 h), show "unknown: conflicting readings" and raise an alert | One forged +20 cm reading moves the estimate under 2 cm; a real irrigation (2 readings) is accepted; a lone real bund breach raises an alert, not silence | W1 |
| B-TS-5 | Rare | 1D filter → **state-augmented filter** (depth + percolation + Kc offset) per paddy | Wrong seepage leading to late irrigation | New backtest that runs `kalman_depth` forward and scores the next reading (`onboard.backtest` scores a one-step water balance, `onboard.py:531`). Seed seepage priors from an **earlier** window only, to avoid leaking test data | Next-reading MAE of the augmented filter beats the 1D filter on the later window of every pilot farm with at least 30 pairs | W2 |
| B-TS-6 | Rare | 2 cm jump rule → **Bayesian online changepoint detection** for irrigation and drainage events | Missed bund leaks; false "inflow" flags | Run on filter residuals; farmer answers from F-TS-3 become labels | Higher recall than the 2 cm rule at no more than 1 false event per paddy per month | W2 |
| B-TS-7 | Common | One rain forecast → **ensemble rain forcing** (Open-Meteo ensemble, licence TO VERIFY) | Surprise rain after irrigating | Run the water balance per ensemble member; take quantiles | Lower interval score on the pilot hold-out than single-forecast bands | W2 |
| B-TS-8 | Rare | Each paddy fitted alone → **partial pooling across a cooperative** | New paddies get nothing useful in week 1 | Hierarchical prior on intercepts and seepage | MAE in a new paddy's first 14 days beats the per-paddy fit | W3 |
| B-TS-9 | Legendary (candidate) | Rehearsal scored once → **closed-loop calibration**: each scored outcome updates that paddy's seepage and Kc prior, with a ledger receipt | The same forecast error every week | Prior-art search first. Feed `rehearse.score` errors into the B-TS-5 priors, **excluding** outcomes with `closer_to="hold"` (the job didn't run, `rehearse.py:186`) and inflow events | Rolling 4-week next-reading MAE falls across the season on pilot farms, against a frozen-prior control | W3 |
| B-TS-10 | Rare | One GDD stage model → **two Paw San phenology models**: day-length driven (Paw San Gyi and Hmwe, photoperiod-sensitive) and thermal time (Paw San Yin, insensitive) | Missing the flowering heat window and harvest rain window | New `phenology.py`; variety picks the model; critical photoperiod TO VERIFY with DAR Yezin. Reference: traditional type flowers about 143 days, 144.5 cm tall | Flowering-date error beats the GDD model on cooperative-recorded flowering dates | W2 |
| B-TS-11 | Common | SPI-3 only → **SPI-1/3/6 plus harvest-rain probability** for Nov-Jan from CHIRPS climatology | Harvest rain. A 2013 survey found it on about 15 % of delta Paw San plots against under 1 % in Sagaing, so the risk is mostly a delta problem | Extend `chirps.statistics`; table per township | Matches the WMO SPI method on reference cases | W1 |

## 6. Agronomy and rules

| ID | Tier | Upgrade (old → new) | Problem caught earlier | Small steps | Beats old when | Wave |
|---|---|---|---|---|---|---|
| B-AG-1 | Common | Short banned lists → **full annex lists** for ASOA, EU 2018/848 and NOP, plus `GB_T_19630` (China) and storage fumigants | A banned product used because it wasn't on our list | One item per line with its clause reference; each TO VERIFY until a certifier signs it off | A certifier review finds no missing rice input | W1 |
| B-AG-2 | Common | No conversion data → **conversion record per plot**, each standard with its own anchor | Selling as organic before the plot qualifies | Field in the `.agri` parcel block. Anchors: **EU 24 months before sowing**; **NOP 36 months without prohibited substances before harvest**; ASOA 12 months for annual crops (anchor TO VERIFY); China TO VERIFY. Block an "organic" lot label before the date (`AGRI-E030`) | An EU plot sown at month 23 is blocked even if harvested at month 28 | W1 |
| B-AG-3 | Common | No document record → **one compliance calendar** | A lapsed document stopping a shipment | New `certificates` table: CNCA certificate and organic codes; international certificate; China SPS exporter registration (renewed **yearly**, application deadline **30 June**); Department of Trade registration (3 years); TradeNet 2.0 licence (validity TO VERIFY); environmental reports (China: water within 12 months, soil within 24) | An item expiring in 59 days alerts; renewal reminders fire before 30 June | W1 |
| B-AG-4 | Rare | Generic alerts → **Paw San quality windows**: heat ≥ 35 °C at flowering, rain at flowering, warm nights in grain fill, rain in the harvest window, water stress in grain fill (from Kalman depth) | Sterile spikelets, weak aroma, harvest losses | Rules in `farmers.py`, driven by B-TS-10 stages. Action text is "inspect the field and ask your agronomist", never a treatment. Cut-offs TO VERIFY | Against scouting records: catches more confirmed stress events than no alert, at no more than 2 false alerts per farm per month; agronomists rate it ≥ 7/10 | W2 |
| B-AG-5 | Common | Season nitrogen cap → **per-variety nitrogen log with a soft cap** (aroma vs lodging) | Too much nitrogen: lodging and quality loss | Extend `gates.nitrogen` with a variety table; cap TO VERIFY (no source gives a Paw San figure) | A split application over the cap warns, without blocking | W2 |
| B-AG-6 | Rare | Spray gate ignores neighbours → **drift check for organic plots** | Pesticide drift voiding an organic lot (China tests prohibited substances to 0.01 mg/kg) | Block the farm's **own** conventional-plot sprays when wind blows toward its organic plot within the buffer (`AGRI-E031`). A **neighbour's** field upwind cannot be blocked: flag the organic lot "test before sale" (feeds B-TR-4). Buffer distance TO VERIFY | Own upwind spray in the buffer is blocked; own downwind spray passes; neighbour risk flags the lot | W2 |
| B-AG-7 | Common | Consecutive humid days → **leaf-wetness-hours blast model** (published model, choice TO VERIFY) | Late blast warning | Wetness from RH and dew-point depression per hour | Earlier warning on scout-confirmed pilot blast cases, at no more false alerts than the old rule | W2 |
| B-AG-8 | Rare | No rule → **bacterial leaf blight storm rule and stem borer degree-day rule** (Paw San is more vulnerable to both than modern varieties) | Late scouting of Paw San's two worst pests | Two cited risk functions; thresholds TO VERIFY | Compared with calendar scouting: higher recall at no more than 2 false alerts per farm per month | W3 |
| B-AG-9 | Rare | No zone rules → **Rice Export Zone linter rules**: at most 3 varieties per zone (`AGRI-E032`); organic inputs and a 3-season record as **warnings only** (`AGRI-W030`) until checked against the Ministry of Commerce directive | Farms dropped from a zone contract | New diagnostics in `contract.py` | A 4th variety is an error; a conventional input is a warning | W2 |
| B-AG-10 | Rare | Separate audits → **evidence pack**: one command compiles a plot-season pack from the `.agri` contract and ledger (input audit, conversion status, certificates, gate history, hash receipt). The only new part vs existing ICS tools is compiling it from the contract, including GB/T 19630 | Weeks of paperwork before an inspection | `evidence_pack.py`; CSV and HTML first; PDF **[dep]** | A mock certifier checks one plot-season from the pack alone | W2 |
| B-AG-11 | Common | No cadmium data → **cadmium soil and lab record** per plot and lot. China limit 0.2 mg/kg (as brown rice, GB 2762-2022). No Myanmar lab is accredited for cadmium; SGS Myanmar covers As, Pb and Hg | Cadmium rejection at the Chinese port | Record soil and lab results with lab name and accreditation | A lot with no cadmium result shows "untested" | W2 |
| B-AG-12 | Common | Banned list can't see warehouses → **fumigation event record**, checked against the standard's list | A warehouse treatment voiding a lot | `POST /farms/{farm_id}/fumigations`; reuse `_banned_match` | A banned fumigant on a lot's warehouse blocks its organic label | W1 |
| B-AG-13 | Common | No certifier check → **one batch, one certifier** (China 2026 rule) | A batch certified twice and rejected | Lot links to exactly one certification body | A second certifier on a lot is an error | W2 |
| B-AG-14 | Rare | Variety as free text → **seed-lot record per parcel**, variety stored as a lab-verified genotype (BADH2 3-bp insertion found mainly in Myanmar), flagging unverified own-saved seed | Mixed seed: 60-90 % of plots use own-saved seed; only 6 of 31 genebank "Paw San Hmwe" seeds were aromatic | `seed_lots` table; parcel references it. Lab partner and cost TO VERIFY | A parcel with unverified seed shows "variety not verified" in every lot | W2 |
| B-AG-15 | Common | No post-harvest data → **post-harvest log**: harvest moisture, drying method, moisture readings down to 14 %, storage type and start | Head rice and aroma lost after harvest | Guidance: cut at 20-25 % moisture when 80-85 % of grains are straw-coloured; dry to 14 %. Aroma life by sub-type (Yin about 5-6 months; Gyi up to 2 years with good storage; Hmwe unknown) is TO VERIFY. Measured lever: flatbed dryer plus hermetic storage raised head-rice recovery 20-30 % in the delta | A lot stored above 14 % moisture raises a warning | W2 |
| B-AG-16 | Common | No mill data → **mill-intake record**: broken %, class and moisture against the buyer spec | Out-of-spec lots found by the buyer | MRF export grades are only "Pawsan 100 %" and "Pawsan 5 % broken"; 14 % maximum moisture comes from one exporter sheet (TO VERIFY); MRF plans to cut broken exports from April 2027 | A lot over the buyer's broken % is flagged before sale | W2 |

## 7. Optimisation and agents

| ID | Tier | Upgrade (old → new) | Problem caught earlier | Small steps | Beats old when | Wave |
|---|---|---|---|---|---|---|
| B-OP-1 | Common | No travel time → **travel time between paddies** in CP-SAT (transition times or a circuit per machine) | Plans a crew can't follow | Distances from field centroids | Same gates pass; lower total lateness on fixture farms | W1 |
| B-OP-2 | Common | `harvest` kind exists (`schedule.py:11,25`) but has no dryer → **add a `dry` kind with dryer capacity**, ordered against harvest-window rain | Cut paddy rained on before drying | New job kind and capacity constraint | **Replayed on observed rain**, not the forecast it optimised: fewer paddy-hours wet than day-level ordering | W2 |
| B-OP-3 | Rare | One forecast → **robust slots**: a slot needs ≥ 90 % of ensemble members to pass. The vote can **only remove** slots: the per-hour 5.5/3.0 checks (`gates.py:60-68`) and the send-time wind recheck (`safety.py:252-255`) stay | A spray booked in a window that closes | Uses B-TS-7 members | A slot at 5.6 m/s on the main forecast is rejected even if 95 % of members pass; replayed weather shows fewer gate breaches | W2 |
| B-OP-4 | Rare | Faithfulness checked in tests only → **runtime number tracing**: a proposal whose numbers don't match its evidence is held | An agent quoting a wrong depth | Parse numbers in `farmers.py` output; match the evidence list | Every mismatch planted in a test is held, with no false holds on the pilot set | W1 |
| B-OP-5 | Rare | Each paddy planned alone → **cooperative water sharing**: canal and pump hours across paddies, minimising days below the AWD floor using Kalman bands | One paddy dries while the pump serves another | CP-SAT over pump hours × paddies × days | **Replayed on observed depths:** fewer days below the floor than first-come order with the same pump hours | W3 |
| B-OP-6 | Common | No lot priority → **drying priority** by moisture (B-AG-15) and rain risk | Wet lots waiting | Greedy order | The wettest lot facing the most rain goes first | W2 |

## 8. Machine learning

| ID | Tier | Upgrade (old → new) | Problem caught earlier | Small steps | Beats old when | Wave |
|---|---|---|---|---|---|---|
| B-ML-1 | Common | Synthetic crop model → **retrain on real data** with `app/ml/training/build_real_shan_dataset.py` (already exists), group k-fold by township, or retire it | A misleading 1.0 accuracy | Remove the synthetic 1.0 **and** the "95-98 %" target (`ml.py:23-24`, not an AGENTS.md target); update `test_agriquill.py:148` | Real held-out accuracy is reported by township; no synthetic figure in the API | W1 |
| B-ML-2 | Common | No weights → **Myanmar field-photo model**: consented photos through cooperatives, labelled by an extension agronomist, held out by township and phone model | Disease seen only when obvious | Collect → label → fine-tune a small offline model (ResNet18 or MobileNetV3) → score. Minimum photos per class TO VERIFY | Accuracy on held-out Myanmar farmer photos is reported with its interval. Context, not a target: lab-trained models fell from ~99 % to ~31 % on outside photos; the best independent rice result is 91 % | W2 |
| B-ML-3 | Rare | Always answers → **abstain when unsure**: photo quality gate (blur, framing, not-a-leaf), out-of-distribution score, confidence cut-off | A confident wrong diagnosis | Gate runs before the model; abstain → "ask your agronomist" | At the chosen coverage, answered-photo error beats always-answer | W2 |
| B-ML-4 | Rare | Random labelling → **active learning**: least certain photos first | Slow label growth | Queue sorted by uncertainty (`GET /photos/review-queue`) | The same accuracy reached with fewer labels than random order | W3 |
| B-ML-5 | Rare | Image only → **weather- and stage-aware diagnosis**: combine the image likelihood with the weather risk (B-AG-7, B-AG-8) and crop stage | False alarms in weather that doesn't suit the disease | Bayesian combination; return both parts | Higher precision at the same recall than image-only, on held-out Myanmar photos | W3 |
| B-ML-6 | Rare | Manual broken count → **phone-photo grain check** on a printed calibration card: length, broken %, chalkiness. Origin is never inferred from a photo (that needs DNA or FT-NIR) | Out-of-spec lots | Card detection and kernel segmentation **[dep]** | Within the agreed tolerance of manual counts on pilot mill samples | W3 |
| B-ML-7 | Uncommon | Keyword search → **hybrid keyword plus embedding search** **[dep]** | Agronomist can't find the right note | Build a 50-query retrieval test set first (the chat set in `AI_EVALUATION.md:48` doesn't exist yet) | Higher recall@5 than keyword search on that set | W3 |

## 9. GIS and data

| ID | Tier | Upgrade (old → new) | Problem caught earlier | Small steps | Beats old when | Wave |
|---|---|---|---|---|---|---|
| B-GIS-1 | Common | Closure check only (`contract._boundary`, `contract.py:471-488`) → **self-crossing and area checks**, also in `onboard.read_boundaries` | Wrong area leading to wrong water volumes | Area tolerance against the declared area (10 %, TO VERIFY) | A figure-eight ring is rejected with a fix hint | W1 |
| B-GIS-2 | Common | Generated NDVI → **Sentinel-2 NDVI and NDWI per paddy**, cloud-masked | A weak patch seen too late | Reuse the CHIRPS byte-range COG reader if possible, otherwise a STAC client **[dep]**; access TO VERIFY | Reproducible from scene IDs; cloudy scenes flagged, never filled | W2 |
| B-GIS-3 | Rare | Tube readings only → **radar wet/dry check** compared with the Kalman depth, as an independent witness | A record saying "drained" when the field was wet | Sentinel-1 is C-band and free. The 2026 paper ([Remote Sensing 18, 1183](https://mdpi-res.com/d_attachment/remotesensing/remotesensing-18-01183/article_deploy/remotesensing-18-01183.pdf)) used ALOS-2 L-band. AWD may be hard to detect at current revisit rates | Agreement rate reported; disagreements reviewed, never auto-overwritten. Shipped only if agreement beats chance on pilot paddies | W3 |
| B-GIS-4 | Common | Free-text origin → **origin from the polygon**: township and region (Shwebo/Sagaing or delta) on every lot | Mislabelled origin; Shwebo and delta Paw San are separable in the lab (FT-NIR 96.67 %, GC-IMS 100 %) | Township lookup from field centroids | A lot carries every field's township | W2 |
| B-GIS-5 | Common | No neighbours → **neighbour field polygons** (OSM; Google ALU/AMED where access exists, TO VERIFY) | Drift risk for B-AG-6 | Fetch, cache and store with the source | Matches a field check on pilot farms | W2 |
| B-GIS-6 | Common | Copernicus GLO-90 via Open-Meteo → **GLO-30 tiles** for slope and 3D (access TO VERIFY) | Wrong drainage picture | Tile fetch and cache | Slope closer to surveyed points | W3 |

## 10. Trust and infrastructure

| ID | Tier | Upgrade (old → new) | Problem caught earlier | Small steps | Beats old when | Wave |
|---|---|---|---|---|---|---|
| B-TR-1 | Rare | Rewritable chain → **daily anchor of the head hash outside the machine** (method TO VERIFY) **[dep]** | Silent rewrite of the whole ledger | Anchor job; store the receipt in the ledger | A rewritten ledger no longer matches its anchor | W2 |
| B-TR-2 | Rare | Shared PIN → **per-person Ed25519 keys**; phone signs approvals | "Who approved this?" disputes | `cryptography` **[dep]** (only installed indirectly today); browser support on older Android TO VERIFY. An **offline signature records intent only**: the server still runs phase A/B and every gate when the command is sent, and drops approvals older than the 600 s token TTL | An approval signed with another key is rejected; an offline approval is re-gated at send | W2 |
| B-TR-3 | Rare | Separate records → **lot passport** with a QR code. QR traceability already ships (for example TraceX), so the only new part is **offline Merkle verification** covering field records, gate history, conversion, radar witness and lab hash | A buyer can't check a lot without calling us | Merkle tree per lot; verify CLI; QR **[dep]** | A third party verifies a passport with only the CLI and the QR | W3 |
| B-TR-4 | Common | No lab data → **lab result record** per lot and plot, with lab accreditation (China needs ISO/IEC 17025 for overseas labs) | Testing after the deal | Manual entry first. Myanmar labs: PPD Insein (pesticide residues in rice), SGS Myanmar (As, Pb, Hg), none for cadmium. Pass/fail only after residue limits are verified from primary text | A lot without a result shows "untested", never "clean" | W2 |
| B-TR-5 | Common | No harvest record → **harvest event and lot link** in the ledger; lot IDs and mass balance integrated from TraceX, Farmforce or KoltiTrace, not rebuilt | Mass balance that fails at the buyer | `harvest` ledger kind; yield estimate = area × expected yield, overridable by the ICS; expected yield and tolerance TO VERIFY (Paw San farm yields 2.6-3.37 t/ha) | A lot heavier than its plots' estimate plus tolerance is flagged | W2 |
| B-TR-6 | Common | `detail` strings → **error contract** `code`, `message`, `status`, `timestamp`, `request_id` | Frontend can't tell errors apart | Exception handler in `api/main.py` | Every 4xx/5xx in tests carries a stable code | W1 |

## 11. Reference facts (from the research reports)

### Organic rice export (source: `reports/Organic rice export China ASEAN.md`)

| Topic | Fact |
|---|---|
| China organic | Only GB/T 19630 certification from a CNCA-approved body counts. No mutual recognition except New Zealand. New CNCA rules took effect 1 Jan 2026 |
| China 2026 rules | Environmental reports (water ≤ 12 months, soil ≤ 24); one certifier per batch; ≥ 5 % unannounced inspections; codes uploaded to CNCA; overseas labs ISO/IEC 17025; prohibited substances below 0.01 mg/kg |
| China market access | GACC Announcement 22/2020 allows Myanmar rice under the SPS protocol; exporters register yearly through the Myanmar DOA (30 June deadline). Decree 280 replaced Decree 248 on 1 June 2026. 2026 import quota 5.32 Mt, half for state trading |
| China limits | Pesticides GB 2763-2026 (from 1 March 2026); cadmium 0.2 mg/kg in rice (GB 2762-2022) |
| ASEAN | ASOA (2014) has no working mutual recognition. Singapore open (SFA licence, permit per consignment); Malaysia only through BERNAS (concession to 2031); Philippines tariff 15-35 % with a permit per shipment; Indonesia closed for 2026 |
| Conversion | EU 24 months before sowing; NOP 36 months before harvest; ASOA 12 months (annuals); China TO VERIFY. First EU export about 30 months from start (estimate) |
| EU groups | Farmer-owned legal entity, at most 2,000 members, each under 5 ha or EUR 25,000; the ICS inspects every member yearly |
| Myanmar export | TradeNet 2.0 only from Jan 2026; phytosanitary certificate MMK 30,000 in 3 working days; Form D (ASEAN) and Form E (China); 15 % of earnings converted at MMK 2,100/US$ |
| Cost proxy | About US$200 per farmer per year for group certification under the new EU rules (cacao example); no Myanmar figure |
| Market | Thailand exported about 22,300 t of organic rice in 2024 (indicative ~1.4× jasmine price). No public China organic rice import figure |

### Paw San quality (source: `reports/Paw San best rice award 2026.md`)

| Topic | Fact |
|---|---|
| Award | World's Best Rice, Manila, 9 Oct 2026 (also 2011). 2nd ST25 (Vietnam), 3rd NSIC Rc218 (Philippines). Blind chef panel, raw and cooked: aroma, texture, length, consistency, stickiness, taste. Winning sub-variety, region and exporter TO VERIFY |
| Types | Paw San Hmwe (Pearl Paw San), Paw San Gyi/Shwebo (photoperiod-sensitive), Paw San Yin (insensitive) |
| Aroma and grain | BADH2 3-bp insertion (mainly Myanmar). Amylose about 23.6 %; elongation ratio about 2.0 (not the 3-4× in press); cooked L/B 3.57 |
| Season | One wet-season crop: sown June-July, harvested around December. Regions: Sagaing (Shwebo, Monywa) and the delta (Pathein, Phyapon, Maubin, Myaungmya) |
| Weak points | Own-saved seed 60-90 %; stem borer and BLB; harvest rain on ~15 % of delta plots |
| Stress | Spikelet sterility above ~35 °C at flowering (rice in general); 2-AP aroma higher at 25/20 °C than 35/30 °C day/night; aroma made only in the field |
| Market | ~7 % of Myanmar rice output; yields 2.6-3.37 t/ha against a 5 t/ha target; Jan 2026 Shwebo paddy up 50-60 % from scarcity, not the award. No measured fraud rate |
| Never claim | An award-driven price premium, yield or income gain, fraud reduction, or image accuracy |

## 12. Order of work

1. **W0:** all of section 4.
2. **W1:** B-TS-1, B-TS-2, B-TS-4, B-TS-11, B-AG-1, B-AG-2, B-AG-3, B-AG-12, B-OP-1, B-OP-4, B-ML-1, B-GIS-1, B-TR-6.
3. **W2:** all W2 items, each in shadow first.
4. **W3:** after one season of pilot data.

Per step: write the test first; run `python -m pytest` and `python -m ruff check .` (plus `mypy` after B-W0-7); commit to `main` as `feat:` or `fix:` with `-` bullets; update `OPEN_QUESTIONS.md` for every new TO VERIFY and `BrainAgroguard/` for architecture changes.

## 13. Definition of done (per upgrade)

- [ ] The test for its "Beats old when" metric exists and passed in shadow on real pilot data (or on fixtures for W0/W1 code-only items).
- [ ] The old code is still callable as a fallback until promotion.
- [ ] Hard rules unchanged: the gate property tests (`test_agriquill_gate_property.py`) pass.
- [ ] Every new threshold is TO VERIFY and logged; every new dependency was approved.
- [ ] Every output carries provenance and uncertainty; unknown is `null` with a reason.
- [ ] The frontend counterpart (same ID) is told the route and fields.

## 14. REA ledger

Method from the REA skill: questions first; every conclusion tied to evidence; observed, inferred and unknown kept apart. REA's own guide says to use normal repository tools for a source repository (its tools target shipped binaries and runtime capture), so the passes below used code reads, the research reports and an independent review.

| Pass | Question | Evidence | Result |
|---|---|---|---|
| 1. Inventory | What does each algorithm do today, from input to output? | Code read: `forecast.py`, `fusion.py`, `rehearse.py`, `schedule.py`, `gates.py`, `safety.py`, `ledger.py`, `contract.py`, `farmers.py`, `api/main.py`, `mcp/tools.py`, `config.py` | **Observed:** section 3 |
| 2. Evidence | Is each upgrade tied to a source, and is each cited path real? | Both research reports, `AI_EVALUATION.md`, `OPEN_QUESTIONS.md`, the standards docs; a script checked every cited path | **Observed:** all cited paths exist except files marked new |
| 3. Break it | Can an upgrade break a hard rule, overclaim, or pass without beating the old code? | Independent review against code and AGENTS.md; 16 findings, each re-checked in the code | **Fixed:** section 15 |
| 3b. Re-check | Do the fixes hold? | Path and ID cross-check script; re-read of changed rows | See section 15 |

## 15. Review log (pass 3)

| # | Finding (verified in code) | Change made |
|---|---|---|
| 1 | The MCP agent could set `operator_confirmed` and `challenge_token`, and `drone_spray_guard` trusted the agent's wind (`mcp/tools.py:34, 727-742`) | B-W0-5 rewritten |
| 2 | Ensemble voting could loosen the hard gate | B-OP-3: the vote only removes slots, with a 5.6 m/s test |
| 3 | Offline approval conflicted with the token TTL and the send-time wind recheck | B-TR-2: offline means intent only |
| 4 | Modal pre-fills PIN `1234` with confirm ticked (`FieldComposerModal.tsx:24`) | B-W0-6 here, F-W0-2 in the frontend plan |
| 5 | `_reader` can't refuse to start; `environment` defaults to development | B-W0-2 now uses `_lifespan` and a production default |
| 6 | Per-approver PIN limits are impossible with a shared PIN | B-W0-4 limits per caller and globally |
| 7 | `backend/.env` is also tracked | B-W0-1 covers both files |
| 8 | Wrong EU conversion anchor | B-AG-2 anchors per standard |
| 9 | A neighbour's spray can't be blocked | B-AG-6: own plots blocked, neighbour risk flagged |
| 10 | Metrics that couldn't fail | False-alarm budgets, replay on observed data, B-OP-4 reworded |
| 11 | 10 pairs too few for a coverage target | B-TS-3: ≥ 30 pairs, later window, pooling |
| 12 | Code inaccuracies (`onboard.backtest`, `harvest` kind, closure check, `build_real_shan_dataset.py`, `_backtest` has no bands) | Rows B-TS-1, B-TS-5, B-TS-9, B-OP-2, B-GIS-1 and B-ML-1 corrected |
| 13 | Tier inflation | B-AG-10, B-TR-3, B-GIS-3, B-TS-8, B-OP-5 and B-ML-5 changed to Rare; Legendary is now "candidate, search first" |
| 14 | Unflagged new dependencies | Marked **[dep]** |
| 15 | Over-reaching facts (aroma life, zone organic rule, SPS date, harvest-rain scope) | B-AG-15, B-AG-9, B-AG-3 and B-TS-11 corrected |
| 16 | Missing items (cadmium, fumigation, one certifier, seed lot, post-harvest log, mill intake, retrieval set) | B-AG-11 to B-AG-16 added; B-ML-7 retrieval set |
