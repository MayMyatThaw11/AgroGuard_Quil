# Rice–Shrimp Co-Culture Adaptation Plan
### AgroGuard / AgriQill — Farm Map Simulation → IRL Farm Decision Support

**Source:** the linked clip, "How to Grow Rice and Shrimp (On the Same Field)" by SPECTRA 2.0 ([TikTok](https://www.tiktok.com/t/ZTfPdYsNa/), 1:18). Its full English caption track was recovered from TikTok's own subtitle endpoint; the footage itself was not visually verified, so the transcript — not the visuals — is the source of record for this plan.

**Repo baseline:** Agriqill, branch `main`, commit [`7e27b1e`](https://github.com/loucasty-cell/Agriqill/tree/7e27b1e4395e2b02541e10780785b347b1d44dc7). Selected source excerpts and repository structure were reviewed at this commit; runtime integration was not validated. Anything not established by that review is labeled as such.

---

## 1. What the clip says (recovered captions)

| # | Observed idea | Nature of the claim |
|---|---|---|
| A | Stock shrimp/crayfish in the rice paddy; they eat young weeds, floating plants and pest bugs | Described mechanism |
| B | Shrimp waste is "packed with nitrogen, phosphorus and potassium"; cuts pesticide and fertilizer use | Clip outcome claim |
| C | Rice canopy shades water, "drop[ping] water temperature by 3, 4 degrees," keeping shrimp alive in scorching heat | Clip outcome claim — a number to test locally, not a constant |
| D | Dig a grid of trenches so shrimp can retreat from heat | Design idea (dimensionless in the clip) |
| E | "20 inch escape walls on the edges," otherwise shrimp escape during rainstorms | Clip engineering figure — not a verified specification |
| F | Cycle ladder: 1 rice + 1 shrimp ("rookie"); spring crayfish batch harvested by May, then rice, then giant freshwater prawns when heat is on (1R+2S); early-spring adult crayfish sold before planting, second batch after rice gives shade, harvest late summer, keep breeding stock ("year-round production," 1R+3S) | Scheduling idea in the clip's own wording — a "third shrimp harvest" is not a verified calendar |
| G | "More food, less waste, bigger profits" | Clip outcome claim |

**Species note (important):** the clip's captions mix three distinct animals — crayfish, "shrimp" generally, and giant freshwater prawns. These have different salinity needs, heat tolerance, containment requirements and market channels. The platform must treat them as separate species templates, and when local suitability is unknown the system must not return "fits" — it returns a review requirement in the existing `FitStatus` terms (e.g., `needs_data` with an explicit "local expert review required" reason).

**Real-world grounding (per source, not combined):**

- Rice–shrimp is an established Mekong Delta system, farmed there for decades; the FAO reports roughly 160,000 ha under rice–shrimp/prawn in the delta in 2015 with a cited potential near 250,000 ha ([FAO presentation](https://www.fao.org/fi/static-media/MeetingDocuments/Workshop2AMR/presentations/28.pdf)).
- Vietnam's Directorate of Fisheries describes typical yields of 300–500 kg shrimp and 4–5 t paddy per hectare per year with profits of 35–50 million VND/ha, 15–30% above monoculture in saline-intrusion areas ([VietnamPlus](https://en.vietnamplus.vn/rice-shrimp-farming-model-needs-zoning-post97635.vnp)).
- IRRI (October 2026) is actively building rice-shrimp decision-support infrastructure: "rice-shrimp suitability maps, remote sensing data, water forecasts, CS-MAP, saltwater intrusion alerts, and WebGIS," and Dr. Madonna Casimero states rice–shrimp systems "offer coastal Mekong Delta farmers an opportunity to diversify income and adapt to changing water conditions amid growing climate risks and rising production costs" ([IRRI](https://www.irri.org/news-and-events/news/mechanization-and-digital-tools-support-sustainable-rice-shrimp-farming)). This validates the product direction — and shows the reference bar to aim at.
- The mutualism mechanism in general rice–fish systems (shade cooling, waste nutrients, refuge channels in flat fields) is documented background: [Wikipedia rice–fish system](https://en.wikipedia.org/wiki/Rice-fish_system), [rice polyculture](https://en.wikipedia.org/wiki/Rice_polyculture). These are general references, not species-specific validation for crayfish or prawns.

**Evidence rule for the platform:** every numeric claim in the clip (3–4 °C, 20 inches, profit gains, the 1R+3S ladder) stays an attributed claim to be tested per farm. Nothing from the clip becomes a default model parameter.

---

## 2. What already exists in Agriqill (code-verified at the commit above)

| Capability | Source (pinned) | Notes |
|---|---|---|
| 37 technique families incl. Family 30 (rice–fish), 19 (shrimp/prawn), 32 (integrated crop–livestock–fish); closed `FamilyId` union 1–37; `AGRIQILL_SCOPE` set | [`techniqueCatalog.ts`](https://github.com/loucasty-cell/Agriqill/blob/7e27b1e4395e2b02541e10780785b347b1d44dc7/AGRIQILL/source/frontend/agriquill-ide/src/lib/site/techniqueCatalog.ts) | No rice–shrimp composite family exists in the inspected excerpt; a proposed template must reference existing families rather than casually adding Family 38 |
| Site-fact fit scoring with explicit bases (UNEP aridity, Köppen–Geiger, FAO pond soil guide, "Screening assumption, TO VERIFY") and a coverage ladder CATALOGUED → FIELD_VALIDATED | [`techniqueFit.ts`](https://github.com/loucasty-cell/Agriqill/blob/7e27b1e4395e2b02541e10780785b347b1d44dc7/AGRIQILL/source/frontend/agriquill-ide/src/lib/site/techniqueFit.ts) | The honesty machinery this plan needs already exists. Note: existing `FitStatus` values are `fits`, `conditional`, `not_here`, `needs_data` — "needs expert review" must be represented as a reason/flag alongside these, or as an explicit schema proposal |
| Field-level rice–fish/rice–shrimp awareness: shrimp herds trigger dissolved-oxygen and salinity checks before re-flood; rice–shrimp contracts are watched; fish options mention "a refuge trench and a no-spray plan" | [`fieldOptions.ts`](https://github.com/loucasty-cell/Agriqill/blob/7e27b1e4395e2b02541e10780785b347b1d44dc7/AGRIQILL/source/frontend/agriquill-ide/src/lib/fieldOptions.ts) | Some of the clip's ideas already exist here as text-level advice, not map geometry or calendars |
| Declared actuation safety gates: wind ceiling, prohibited inputs per organic standard, explicit human approval token, run-duration clamp | [`safety.ts`](https://github.com/loucasty-cell/Agriqill/blob/7e27b1e4395e2b02541e10780785b347b1d44dc7/AGRIQILL/source/frontend/agriquill-ide/src/lib/safety.ts) | These are declared guards in the inspected excerpt — the plan must route through them, but end-to-end enforcement for a new workflow still needs verification during build |
| Plan lifecycle representation with `approvedAt`/`by`/history and check issues at `block`/`warn`/`adjust`/`info` levels; growing-degree-day function (`gddDay`) in the models layer | [`twinPlans.ts`](https://github.com/loucasty-cell/Agriqill/blob/7e27b1e4395e2b02541e10780785b347b1d44dc7/AGRIQILL/source/frontend/agriquill-ide/src/lib/livetwin/twinPlans.ts), [`twinModels.ts`](https://github.com/loucasty-cell/Agriqill/blob/7e27b1e4395e2b02541e10780785b347b1d44dc7/AGRIQILL/source/frontend/agriquill-ide/src/lib/livetwin/twinModels.ts) | Approval fields and degree-day math exist; a multi-species calendar template was not established by this review |
| Farm data model with `Bund`, `Canal`, `Zone` (incl. `aquapond`), `AquaPond`, `Scenario`, all sourced `demo-fixture` | [`types.ts`](https://github.com/loucasty-cell/Agriqill/blob/7e27b1e4395e2b02541e10780785b347b1d44dc7/AGRIQILL/source/frontend/agriquill-ide/src/data/farm/types.ts) | Trench/refuge or barrier entities and an area-budget concept were not established by this review |

**Not established by this review:** `farmmap` weather alert behavior end-to-end, the field app's proposal UI, and any Open-Meteo runtime integration — these are integration points to confirm during build, not established behavior.

---

## 3. Crosswalk: clip idea → farmer decision → adaptation

| Clip idea | Farmer decision | Adaptation (proposed) | Required data | Validation path |
|---|---|---|---|---|
| A, B (co-culture) | "Is my paddy a candidate, and for which species?" | A composite rice–aquaculture technique template referencing existing families 3 + 19 + 30 + 32 in the catalog, with species-specific variants: crayfish (freshwater), giant freshwater prawn (freshwater), brackish shrimp (needs saline regime). Eligibility distinguishes simultaneous co-culture from seasonal rotation; unknown suitability returns `needs_data` with an explicit local expert-review reason, not "fits" | Existing site facts + new salinity-regime fact (freshwater/brackish/seasonal) + species water-quality requirements (sourced, then locally confirmed) | Fit-rule review by cooperative agronomists on test parcels; compare against published suitability factors |
| D, E (trenches, barriers) | "How would I rebuild this parcel, and what does it cost in area?" | Parcel design mode: trench/refuge and escape-barrier as first-class geometry on the farm map, with an area budget (production area lost vs refuge gained) and dig-cost input. The clip's "20 inch" figure appears only as an attributed reference, never a default | Parcel geometry (exists), soil seepage class (FAO basis exists in `techniqueFit.ts`), locally specified barrier heights | Barrier adequacy requires local water-management review — rainfall + barrier height alone cannot establish escape safety |
| F (cycle ladder) | "Which calendar should I run?" | Multi-species cycle template: rice stages and aquatic batches on one timeline, with degree-day logic (exists) driving suggested windows. The 1R+1S/1R+2S/1R+3S ladder is presented as the clip's proposal to evaluate, not a promise; a "third harvest" requires local trial evidence | Species heat/salinity tolerance ranges (sourced), local temperature history, market windows | Replay vs recorded harvest dates; per-farm error tracked. Species switch timing is consequential — treat as expert-reviewed, not automatic |
| C (shade cooling) | "Is heat stress a risk to my stock?" | Experimental water-temperature visualization using canopy stage + air temperature, explicitly labeled as a proxy under validation. It supports discussion, not a stocking or draining decision, until validated against real sensor readings | Air temperature (available), canopy stage (simulated), actual water-temperature readings (needed) | Calibrate per farm against sensors before any decision use |
| E (storm escapes) | "Storm forecast — what should I check?" | A weather-linked checklist task (inspect barriers, check refuge depth) rather than an automatic verdict, since escape safety depends on local water management | Rainfall forecast, barrier inventory from design mode | Check task outcomes against actual escape reports |
| B, G (inputs, profit) | "What inputs could I cut, and does the math work?" | Input-substitution and partial-budget comparison built from documented farmer-entered costs, prices and explicitly supplied scenario assumptions; the comparison offered is unchanged rice production vs one locally reviewed rice–aquaculture scenario, not an assumption that more cycles are always better. Biological outputs or nutrient-substitution effects that current evidence cannot support display "not estimable with current evidence," not an invented range. Always routed through the existing approval gates | Farmer-entered baseline inputs and local prices | Recorded season outcomes close the loop |

---

## 4. Ranked adaptations

Ranked by decision value, data availability, feasibility and consequence of error. Safety and evidence infrastructure come first because every other feature depends on them being trustworthy.

| Rank | Adaptation | Rationale |
|---|---|---|
| P0 | Safety gates + outcome capture for the new workflow | Acting on a wrong stocking or input recommendation causes real losses; the human-approval gate, expert-review routing for unknown species suitability, and a field-outcome record are prerequisites, not afterthoughts |
| P0 | Composite rice–aquaculture technique template + species-specific eligibility | Pure data work on the existing catalog/fit architecture; the entry point for every other question |
| P1 | Multi-species cycle calendar (evaluate the ladder) | Highest decision value in the clip; reuses plan lifecycle and degree-day math; expert-reviewed windows |
| P1 | Parcel design mode (trenches + barriers) | Turns the farm map from viewer into design tool; new geometry entities, moderate build |
| P2 | Heat-risk visualization + storm checklist tasks | Depends on Open-Meteo integration and local calibration; ship as labeled proxy and checklists first |
| P2 | Partial-budget comparison panel | Weakest evidence base; wide ranges, always through approval |

---

## 5. MVP — one end-to-end workflow

**"Should this parcel go rice–aquaculture, and how?"**

1. **Select a parcel** on the farm map.
2. **Species-specific eligibility check** — the exact aquatic species and stock life stage are selected, simultaneous co-culture vs seasonal rotation is established, and the template returns `fits` / `conditional` / `not_here` / `needs_data` with missing evidence listed (salinity regime, water test, soil test) plus an explicit local legal/ecological and water-quality review requirement. No evidence means no "fits."
3. **Compare scenarios** — unchanged rice production vs one locally reviewed rice–aquaculture scenario. The system checks for conflicts with existing rice-water and pesticide recommendations before presenting anything.
4. **Inspect** — layout (trench/barrier sketch with area budget), calendar (rice stages + aquatic batches), and partial budget built from farmer-entered costs, prices and explicit scenario assumptions (anything not estimable is labeled as such).
5. **Approve** — the plan enters the existing approval lifecycle (`approvedAt`/`by`, block/warn checks, human approval token for any actuation). Actionable stocking or input advice additionally requires the completed local species/legal/water-quality review from step 2.
6. **Record outcomes** — the farmer or field agent logs actual harvests, escapes, input use; deltas vs the scenario feed calibration and can advance the coverage ladder.

**Platform roles (proposed division, aligned with existing modules):** AgroGuard supplies observations and risk flags; AgriQill compares scenarios; cooperative specialists approve; field records close the feedback loop. This integration is proposed, not yet implemented.

**Out of scope:** yield predictions stated as fact, unsourced profit guarantees, automatic species-switching decisions, and any clip figure hardcoded as a model parameter.

---

## 6. Phased dependencies

- **Phase 1 — Evidence and safety foundation:** composite template with species variants; salinity-regime site fact; expert-review routing; outcome-record schema; i18n strings (my, vi, en first).
- **Phase 2 — Design mode:** trench/barrier entities in the farm data model (provenance `demo-fixture` until real data), parcel editor, area budget.
- **Phase 3 — Calendar:** multi-species cycle template on the existing plan lifecycle; expert-reviewed windows.
- **Phase 4 — Visualization + tasks:** heat proxy (labeled experimental), storm checklist tasks.
- **Phase 5 — Economics:** partial-budget panel with cited reference ranges.

Phases 1 → 2 → 3 are sequential; 4 and 5 can follow in parallel.

---

## 7. Data provenance rules

Every value rendered to a user carries one label, so no fixture silently becomes a real-farm input:

| Label | Meaning |
|---|---|
| `demo-fixture` | Prototype placeholder, as the existing data model already enforces |
| `measured` | Sensor or field-agent reading from this farm |
| `forecast` | Model output with stated horizon and source |
| `assumption` | Farmer- or co-op-entered value, versioned |
| `modeled-estimate` | Simulation output with confidence range — never presented as fact |
| `attributed-claim` | A figure quoted from a source such as the clip, shown with its origin |

---

## 8. Proposed pilot success criteria

These are targets to evaluate in a pilot, not demonstrated performance:

- Fit verdicts agree with cooperative agronomist review on at least 80% of 20 test parcels.
- No consequential in-platform stocking or input change (or actuation) proceeds without the human-approval gate (100% compliance, auditable).
- After one calibration season, median absolute error between suggested and recorded activity windows within ±10 days.
- Zero unsourced numeric claims rendered as fact, per an audit against the coverage ladder and the provenance labels above.
- Cooperative staff complete the six-step workflow unaided in usability testing.

---

## 9. Evidence ledger

| Claim | Status | Basis |
|---|---|---|
| Rice–shrimp is a real, regionally significant system | Verified | [FAO](https://www.fao.org/fi/static-media/MeetingDocuments/Workshop2AMR/presentations/28.pdf), [VietnamPlus](https://en.vietnamplus.vn/rice-shrimp-farming-model-needs-zoning-post97635.vnp) |
| IRRI is building rice–shrimp digital decision tools (suitability maps, water forecasts, alerts) | Verified | [IRRI, 2026-10-13](https://www.irri.org/news-and-events/news/mechanization-and-digital-tools-support-sustainable-rice-shrimp-farming) |
| General rice–fish mutualism mechanism (shade, waste nutrients, refuge channels) | Verified as general background | [Wikipedia](https://en.wikipedia.org/wiki/Rice-fish_system) |
| Clip figures: 3–4 °C cooling, 20-inch barriers, 1R+3S ladder, profit gains | Attributed claims — test locally | Clip captions only |
| Species suitability (crayfish, prawns, brackish shrimp) in Myanmar delta conditions | Unknown — needs local trial and expert review | No Myanmar-specific evidence found in this pass |
