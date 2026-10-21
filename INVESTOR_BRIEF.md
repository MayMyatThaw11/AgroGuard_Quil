# AgriQill Investor Brief: Why It Is Not Another Crop-AI Copy

> Every benefit figure in this brief is a **design target**. AgriQill has not yet run a field pilot. Items marked TO VERIFY are listed in `OPEN_QUESTIONS.md`. Market scan: English-language web search, October 2026.

## 1. In one line

Most agri-AI tells a farmer **what might happen**. AgriQill decides **whether a specific job should run now, on this paddy, with this machine**, explains why, waits for a named person's approval, and keeps a tamper-evident record of the decision.

## 2. Where AgriQill sits

| | Typical crop-AI platforms | AgriQill |
|---|---|---|
| Main question | "What will this region or field yield?" | "Should this pump, spray or drone job run now?" |
| Unit of decision | Region, grid cell or field | One job, on one paddy, at one hour |
| Typical AI | Crop classifier, photo diagnosis, satellite indices, gen-AI chat | State estimation, hybrid forecasting, constraint optimisation, rule-checked agents |
| Output | Advice or a forecast | A go/no-go result with its reason, a schedule, an approval and a record |
| When it acts | Before the season or after the fact | Before each job, then checked against the next measured reading |

### What already exists worldwide

Every single piece of AgriQill exists somewhere. We do not hide that.

| Piece | Who already does it | What AgriQill adds |
|---|---|---|
| Spray-weather windows (Delta-T, wind, inversion) | Farmable, WSU AgWeatherNet, Agrio, John Deere weather alerts | Turns the window into a hard block on the job and on the machine command |
| When to spray, from disease risk | BASF xarvio Spray Timer | IPM thresholds plus organic and rice-fish exclusions, for paddy |
| Weather saved with each spray record | Agworld auto-weather, AgriSmart spray diary | Records the decision *before* the job (approved or blocked, and why), not only the weather after |
| AWD water-level sensors and apps | IRRI AutoMonPH pilots, Tra Vinh University app (Vietnam), NSTDA HandySense (Thailand), ICAR-IIRR (India) | A forecast with an error band, leak and inflow flags, and a what-if before each pump job |
| Tamper-proof AWD carbon records (MRV) | TraceX, Rize | Supplies the job-level activity data they need: we integrate, not compete |
| AI chat advice for farmers | Digital Green FarmerChat (1.6 m+ farmers), Bayer E.L.Y., Syngenta Cropwise AI | Not our lead. Our agents only draft proposals with sources and cannot act alone |
| Field and crop mapping from satellites | Google ALU/AMED (testers include Vietnam, Malaysia, Indonesia), Cropin Sage | A possible data input, not a rival |
| Machine-vision spraying | John Deere See & Spray | A different layer: they decide *where* on the field, we decide *whether* the job runs at all |
| Soil and irrigation digital twins | CropX | Paddy water, shared machines and buyer rules, built for ASEAN smallholders |

**What we did not find:** one product that joins these into a single loop: forecast, plan, block, named approval, machine command, check against the next reading, record. **That loop is the product.** We say "we found no public product that does the whole loop", never "nobody does this".

**Cropin, specifically.** Cropin Sage is a generative-AI query engine. It combines earth observation, climate data, a crop knowledge graph and crop models on 3 m to 5 km grid cells, initially for 13 crops, and sells to enterprises, lenders and governments. That is landscape and portfolio intelligence. AgriQill works one level down, at the field job.

## 3. Why it supports decisions better

### Technical
- **The model is chosen by a measured test, not by habit.** Each run tests four forecasters on held-back days and keeps the one with the lowest error, including a physics-plus-neural hybrid. It also reports skill against a no-change baseline.
- **Uncertainty is part of the answer.** A Kalman filter gives water depth with an error bar (σ). Forecasts come as P10/P50/P90 bands, not single numbers.
- **The plan has a solver behind it.** OR-Tools CP-SAT books machines and crews only in hours that pass the safety gates, never double-books, and names the rule behind every blocked job.
- **It is deterministic and auditable.** The same input gives the same plan. Every decision is hashed into a SHA-256 chain ledger.

### Agricultural
- **It uses standard, cited agronomy.** FAO-56 Penman-Monteith ET0, FAO rice Kc, AWD water balance, WMO SPI drought index and growing degree days.
- **The safety rules are hard limits.** Sprays run only at wind ≤ 3 m/s, inside the Delta-T band (Stull 2011 wet-bulb) and with no washout rain in the 6 h after. The drone ceiling is 5.5 m/s and no contract can raise it.
- **It flags field events automatically.** A reading that breaks the 3σ check is labelled "unmodelled inflow" (irrigation, blocked drain) or "fast drawdown" (bund leak, sensor fault).
- **The pest logic follows established IPM practice.** Action thresholds, early-season holds, and organic or rice-fish exclusions.

### Business
- **It answers buyer and certifier rules.** A farm's `.agri` contract encodes the buyer's rules (for example, ASOA organic blocks `synthetic_urea`) and they are checked before any job.
- **It sells to people who already pay for proof.** Job-level records feed the AWD MRV, EUDR and insurance workflows that Rize, Koltiva and insurers already run.
- **A human stays in control.** Every physical action needs a named, authenticated approval. This answers the trust question raised by the eFishery case.
- **It checks its own advice.** Each approved action is later compared with the first real reading ("did the job run as approved?").

## 4. Can this be copied?

**The code, yes. The business, not quickly.**

| Part | Time to copy (our estimate) | Why |
|---|---|---|
| The algorithms (FAO-56, Kalman, CP-SAT, forecasting) | Weeks | Published methods and open libraries. This is on purpose: agronomists trust them. |
| The full loop with gates, approvals and ledger | Months | Many small decisions: edge cases, fail-closed defaults, tests |
| Calibrated data for each paddy | One season per farm; no shortcut | Seepage, Kc and forecast skill are learned from real readings |
| Buyer and certifier rule library | Ongoing | Rules change, and someone has to keep them current |
| Integrations with payers (MRV, insurers, exporters) | Contract cycles | Needs relationships and trust |
| Cooperative distribution in ASEAN | Years | People, languages, offline use, field presence |

**What this means.** Before a pilot, the moat is thin. It gets thicker every season the system runs on real paddies. The race is to sign the first paying pilot before a big platform adds a "block this job" button.

**Who could copy fastest.** John Deere, Bayer, BASF and DJI already have weather data and machines. In our view, their focus is large farms and their own equipment, not mixed-machine paddy cooperatives in Myanmar. If they enter, we integrate with them.

## 5. When people say "we've seen this" or "another useless agri AI"

### What to understand first
- **They are partly right.** Every piece exists (section 2). Don't argue that.
- **"Agri AI is useless" comes from real failures.** A study of 18 agtech shutdowns in 2025 found the technology usually worked, but the farm economics did not. AI advisory apps like BharatAgri closed because each farmer cost too much to acquire and few came back.
- **The real question behind "it's a copy" is:** why will someone pay you, and why can't a bigger company do it tomorrow? Answer that, not the feature list.

### What to say

| They say | You say |
|---|---|
| "We've seen this before." | "You've seen the parts. Spray-window apps, water sensors, farm chatbots: all real. Show me one that blocks the drone job and records who approved it. That's what we sell." |
| "My team could build this in a month." | "The code, maybe. The calibrated paddies, the buyer rules and the cooperatives that trust it, no. That's what you'd be investing in." |
| "Isn't this just another advice app?" | "No. Advice apps tell farmers what to do and hope they do it. We stop a job that breaks the rules, and keep proof when it runs." |
| "Agri AI doesn't make money." | "Advice to farmers rarely does. We charge the people who already pay for proof: carbon developers, exporters, insurers and drone cooperatives." |
| "Where is the AI?" | "It forecasts each paddy's water with an error band, plans shared machines across safe hours, and checks itself against the next real reading. It knows when not to act." |
| "Why won't John Deere or Cropin do this?" | "They might. They focus on big farms, their own machines and regional data. We're built for small paddy cooperatives, offline, with mixed machines. If they come in, we plug into them." |
| "Do you have proof it works?" | "Not in the field yet. That's the honest answer, and it's what the pilot is for. Every number we show is a design target." |

### Never say
- **"Nobody else does this."** Say "we found no public product that does the whole loop."
- **"Our AI raises yield" or "saves X %."** There is no field proof yet.
- **"Tamper-proof means true."** It means the record was not changed, not that it was right.

## 6. How we evaluate the AI

| AI part | What we measure | Design target | Status today |
|---|---|---|---|
| Water forecast (`forecast.py`) | Hold-out MAE vs the no-change baseline | Beat the baseline on every farm with 10 or more scored pairs | Built and backtested automatically; no field farm yet |
| Kalman depth (`fusion.py`) | Share of readings inside the P10-P90 band | 70-90 % | Calibration metric not yet added to the report |
| Rehearsal score (`rehearse.py`) | Error of the "act" branch vs the measured reading | Inside the band about 80 % of the time over a pilot season | Scoring built; TO VERIFY in the field |
| Scheduler (`schedule.py`) | Same input, same plan; zero gate breaches | 100 % | Covered by tests |
| Safety gates (`gates.py`, `safety.py`) | Property tests over a wind grid | Zero exceptions | Fixed grid passes; random weather tests next |
| Proposals and chat | Every number traces to its evidence | 100 % proposals, 95 % chat | 50-question chat set not yet built |
| Crop classifier (RandomForest) | Field accuracy | 95-98 % (TO VERIFY) | Scored only on synthetic data (1.0); not a field result |

Full framework: `AI_EVALUATION.md`.

## 7. What investors should know

- **No field pilot yet.** The next milestone is one paid pilot with a named payer (an AWD developer, drone cooperative or exporter).
- **Some parts are placeholders.** The growth curve in `sim.py` and the crop simulator are scripted; the disease model has no weights file; AquaCrop is a stub; the 3D NDVI and satellite layers are generated textures.
- **A hash chain proves a record was not changed. It does not prove the record was true.** We pair it with source provenance, named approvers and cross-checks against independent weather data.
- **The free Open-Meteo tier is non-commercial.** A paid weather licence belongs in the pilot budget.
- **The 3D digital twin is outside Beta scope.** It stays a demo until the pilot is done.

## 8. All algorithms

"Common?" means how often other crop or agri-AI products use the method. **Differentiator** marks the parts that set AgriQill apart.

### Time series and forecasting

| Algorithm | Where | Common? |
|---|---|---|
| Physics water balance (ridge regression, weighted toward recent days) + dilated TCN residual network | `backend/agriquill/forecast.py` | Research only, rare in products. **Differentiator** |
| MC-dropout P10/P50/P90 bands | `backend/agriquill/forecast.py` | Research |
| Automatic model choice by hold-out MAE, with skill vs no-change | `backend/agriquill/forecast.py` | Rare. **Differentiator** |
| Masking of irrigation and drainage events | `backend/agriquill/forecast.py` | Rare |
| Damped-trend forecast | `backend/agriquill/forecast.py` | Standard |
| 1D Kalman filter with 3σ event flags | `backend/agriquill/fusion.py` | Research, rare in apps. **Differentiator** |
| Hold / act / dry what-if rehearsal, scored later against a real reading | `backend/agriquill/rehearse.py` | No public equivalent found. **Differentiator** |
| SPI-3 drought index and rain percentile | `backend/agriquill/data/chirps.py` | Standard (WMO) |
| Growing degree days, stage, Kc by GDD, seepage band | `frontend/.../livetwin/twinModels.ts` | Standard |
| Seepage from dry reading pairs; no-change backtest | `backend/agriquill/onboard.py` | Semi-standard |
| Stale and stuck sensor detection | `backend/agriquill/telemetry.py` | Standard |

### Agronomy and rules

| Algorithm | Where | Common? |
|---|---|---|
| FAO-56 Penman-Monteith ET0 | `backend/agriquill/agronomy.py` | Universal |
| ETc = Kc x ET0; AWD water balance | `backend/agriquill/agronomy.py` | Universal |
| Stull wet-bulb, Delta-T, washout and wind gates | `backend/agriquill/gates.py` | Common as advice (Farmable, WSU, Agrio); rare as a hard block |
| Rice blast risk from consecutive humid days | `backend/agriquill/farmers.py` | Standard |
| IPM decision ladder and control ranking | `frontend/.../livetwin/twinIpm.ts` | Standard |
| EcoCrop range screen; weighted suitability | `backend/agriquill/data/ecocrop.py`, `backend/app/services/suitability.py` | Very common |
| Aridity and thermal classes; technique fit | `frontend/.../site/techniqueFit.ts` | Standard |

### Optimisation and agents

| Algorithm | Where | Common? |
|---|---|---|
| CP-SAT scheduler with gate-limited start hours, machine no-overlap and crew limit | `backend/agriquill/schedule.py` | Rare in farm apps. **Differentiator** |
| Rule-based farm agents (water, scout, pest, harvest, drone) | `backend/agriquill/farmers.py`, `frontend/.../livetwin/twinAgents.ts` | Common |
| `.agri` contract parser with safety invariants | `backend/agriquill/contract.py` | Rare. **Differentiator** |
| Machine travel time (haversine) and work hours | `frontend/.../livetwin/twinModels.ts` | Standard |

### Machine learning

| Algorithm | Where | Common? |
|---|---|---|
| RandomForest crop classifier | `backend/app/ml/training/train_model.py` | Very common |
| Nearest-neighbour suitability score | `backend/app/ml/crop_predictor.py` | Common |
| Heuristic plant scoring | `backend/app/ml/plant_recommender.py` | Common |
| ResNet18 leaf disease (weights missing) | `backend/app/ml/disease_detection.py` | Very common |
| NDVI vs rainfall correlation | `backend/app/services/agriculture_data.py` | Common |
| Full-text knowledge search (SQLite FTS) | `backend/agriquill/knowledge.py` | Standard |

### GIS and data

| Algorithm | Where | Common? |
|---|---|---|
| Shoelace area and centroid, haversine, point-in-polygon | `backend/agriquill/data/farm_sites.py`, `frontend/.../scene/parcelGeometry.ts` | Standard |
| Greedy site picking with 150 m spacing | `backend/agriquill/data/farm_sites.py` | Standard |
| Nearest feature and point-segment distance | `frontend/.../farmmap/surroundings.ts` | Standard |
| Slope from central differences | `frontend/.../livetwin/twinGis.ts` | Standard |
| Map chunk streaming with eviction | `frontend/.../farmmap/engine/chunkStream.ts` | Standard |
| OSRM road routing with fallback | `frontend/.../farmmap/engine/routing.ts` | Standard |
| CHIRPS reads by HTTP byte range, own TIFF and LZW decoder | `backend/agriquill/data/chirps.py` | Standard method, lean build |

### 3D

| Algorithm | Where | Common? |
|---|---|---|
| Terrain from noise layers (fBm) | `frontend/.../scene/terrain.ts` | Standard graphics |
| Bilinear height lookup; surface normals in a Web Worker | `frontend/.../scene/terrain.ts`, `terrainWorker.ts` | Standard |
| Level-pool (bathtub) flooding | `frontend/.../scene/terrain.ts` | Standard |
| Instanced plants; smoothed camera | `frontend/.../components/farm3d/` | Standard |

### Trust and infrastructure

| Algorithm | Where | Common? |
|---|---|---|
| SHA-256 hash-chain ledger | `backend/agriquill/ledger.py` | Rare in farm apps (TraceX claims tamper-proof MRV) |
| One-time approval tokens bound to the payload hash | `backend/agriquill/safety.py` | Rare in farm apps |
| Retry with backoff and jitter; circuit breaker | `backend/agriquill/resilience.py` | Standard |
| Seeded PRNGs (Mulberry32, Park-Miller) | `frontend/.../farmmap/farmMapRandom.ts`, `backend/agriquill/fleet.py` | Standard |

`frontend/...` means `AGRIQILL/source/frontend/agriquill-ide/src/lib/` (or `src/` for components).

## 9. Next steps (post-pilot)

1. Ensemble Kalman filter that learns each paddy's percolation and Kc online.
2. Conformal prediction for P10-P90 bands with a coverage guarantee.
3. Bund-aware fill-and-spill water flow, with live Kalman depth and its uncertainty shown in 3D.
4. Real elevation (Copernicus GLO-30) and Sentinel-2 NDVI in place of generated textures (TO VERIFY).

## Sources

- Cropin Sage: [cropin.com/cropin-sage](https://cropin.com/cropin-sage/), [AgroSpectrum](https://agrospectrumindia.com/news/14/30614/cropin-launches-first-real-time-gen-ai-powered-agri-intelligence-platform-sage.html)
- Spray windows: [Farmable Delta-T](https://farmable.tech/delta-t-weather-data/), [WSU AgWeatherNet spray tool](https://smallgrains.wsu.edu/spraytool/), [Agrio](https://agrio.app/?p=4844), [John Deere Mobile Weather via Emmetts](https://emmetts.com.au/?p=112109)
- Spray timing: [BASF xarvio Spray Timer](https://basf.com/us/en/media/news-releases/2024/08/xarvio-FIELD-MANAGER-from-BASF-introduces-unique-spray-timer-tool-for-optimal-fungicide-use)
- Spray records: [Agworld auto-weather (Sep 2026)](https://www.agworld.com/resources/blog/auto-weather/), [AgriSmart spray diary](https://help.agrismart.co.nz/article/spray-diary-register/)
- AWD monitoring: [IRRI Water-Ice](https://waterice.irri.org/how-we-work), [Tra Vinh AWD app](https://ricetoday.irri.org/vietnamese-rice-farmers-use-mobile-app-for-alternate-wetting-and-drying-technology/), [NSTDA HandySense](https://www.nstda.or.th/en/news/news-years-2026/handysense.html), [ICAR-IIRR](https://icar-iirr.org/Technologies/3%20Agro%20Tech%203%20IoT%20based%20water%20management.pdf), [TraceX](https://tracextech.com/awd-rice-cultivation/)
- AI advice: [Digital Green FarmerChat](https://digitalgreen.org/about), [Bayer E.L.Y.](https://www.futurefarming.com/smart-farming/bayer-pilots-generative-ai-tool-for-agriculture/), [Syngenta Cropwise AI (AWS)](https://aws.amazon.com/blogs/machine-learning/syngenta-develops-a-generative-ai-assistant-to-support-sales-representatives-using-amazon-bedrock-agents)
- Mapping and machines: [Google Agricultural Understanding API](https://developers.google.com/agricultural-understanding), [Google AI models expand to Vietnam](https://vov5.vov.gov.vn/digital-life/google-expands-india-tested-ai-agriculture-models-to-vietnam-to-strengthen-food-resilience-2260463.vov5), [John Deere See & Scout](https://www.croplife.com/management/croplife-retail-week-john-deeres-2027-tech-reveal-with-see-scout-ai-cameras-and-the-road-to-autonomy/), [CropX digital twins](https://venturebeat.com/business/cropx-acquires-dacom-to-boost-digital-twins-for-agriculture)
- Why agtech fails: [AgTechNavigator on the UNL study](https://www.agtechnavigator.com/Article/2026/01/28/why-agtech-start-ups-failed-last-year-and-a-playbook-for-2026), [UNL white paper](https://digitalcommons.unl.edu/biosysengpres/83), [BharatAgri shutdown](https://entrackr.com/exclusive/exclusive-bharatagri-shuts-down-operations-amid-funding-crunch-10646984), [60 Decibels / Gates study](https://agfundernews.com/smallholder-farmer-adoption-of-agtech-high-but-inconsistent-says-new-study-from-60-decibels-w-gates-foundation)
- Regional competitors: `reports/AI Youth Festa agri AI rivals.md`
- Evaluation framework: `docs/agriquill/AI_EVALUATION.md`
