# AgriQuill — Cyber-Physical Agriculture IDE & Autonomous AI Agent Farm Simulator

AgriQuill Beta is a universal agriculture decision-support environment and simulation platform designed for ASEAN farming ecosystems (starting with Myanmar Ayeyarwady Delta lowland rice). It combines a VS Code-style declarative `.agri` editor, 3D WebGL spatial terrain scene, 120-day crop physiological simulator (FAO AquaCrop v7.3 neural surrogate), and an autonomous multi-agent swarm acting through Model Context Protocol (MCP) tools.

---

## 1. Quick Start & Verified Run Commands

```bash
# Within AGRIQILL/source/frontend/agriquill-ide or workspace root:
npm install
npm run typecheck
npm test              # Executes 39 unit, contract, and acceptance gate tests
npm run test:integration # Executes 9 live API integration tests
npm run build         # Produces production bundle
npm run dev           # Starts local dev server at http://localhost:3000
```

---

## 2. Data Connectors, Provenance & Licensing

Every metric and dataset displayed in AgriQuill is explicitly tagged with its provenance: `[REAL]`, `[DERIVED]`, or `[SYNTHETIC]`. Imports lacking license or timestamp provenance are automatically rejected.

| Domain | Provider / Specification | Provenance | License & Terms | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Satellite Imagery** | Sentinel-2 MSI (Copernicus / GEE) | `[REAL]` | CC-BY-SA 3.0 IGO / Open Access | 10m multispectral surface reflectance bands (B4, B8) for NDVI & NDRE canopy indexing. |
| **Digital Elevation (DEM)** | NASA SRTM v3 & Google Earth Pro | `[REAL]` | Public Domain / Fair Use GIS | 30m / 0.5m digital elevation models used to derive slope, contour relief, and flood planes. |
| **Soil Stratigraphy** | ISRIC SoilGrids 2.0 | `[REAL]` | CC-BY 4.0 | 6 depth horizons (0-5, 5-15, 15-30, 30-60, 60-100, 100-200cm) reporting sand, clay, organic carbon, pH, and CEC. |
| **Weather & Forecast** | Open-Meteo & JMA MSM (ECMWF Fallback) | `[REAL]` | CC-BY 4.0 | 14-day daily and hourly forecast assimilating 2m temperature, rainfall, and 10m wind velocity (m/s). |
| **Crop Model** | FAO AquaCrop v7.3 Neural Surrogate | `[DERIVED]` | FAO Open Source | Process-based crop water productivity and biomass growth solver; steps 120 days in &lt; 250 ms. |
| **Decision Ledger** | Chained SHA-256 Ledger | `[DERIVED]` | Proprietary AgriQuill Specification | Append-only cryptographic transaction receipts recording every agent action. |
| **3D Micro-Topography** | Synthetic Terrain Mesh | `[SYNTHETIC]` | Synthetic Demonstration | Procedurally synthesized micro-relief bounded by empirical elevation envelopes for 3D camera interaction. |

---

## 3. Autonomous Multi-Agent Farming Swarm

AgriQuill features a hierarchical multi-agent swarm where agents act **exclusively via FastMCP tool calls**, producing cryptographically signed receipts with inputs, outputs, rule evaluations, and SHA-256 HMAC hashes:

1. **Sovereign Farmer Agent**: Master orchestrator balancing whole-farm water budget, crop rotation, and carbon abatement.
2. **Planner Subagent**: Manages 120-day phenology roadmap, Alternate Wetting and Drying (AWD) drying phases, and harvest scheduling.
3. **Irrigation Subagent**: Tracks perched water table depth and soil matric potential; triggers LoRaWAN solenoid valve reflood pulses at -15cm threshold.
4. **Pest-Scout Subagent**: Performs multispectral canopy analysis and dispatches drone bio-spray sorties while enforcing hard wind drift interlocks.
5. **Soil-Health Subagent**: Ingests ISRIC SoilGrids stratigraphy and inoculates biological nitrogen fixers (Azolla bio-compost).
6. **Market Subagent**: Computes certified organic export price deltas (+25-35%) and net gross margin ($/ha).
7. **Compliance Subagent**: Audits `.agri` scripts against ASEAN Standard for Organic Agriculture (ASOA) 2026 rules.

---

## 4. Hard Safety Interlocks & Rules Engine

1. **Wind Ceiling Guard (AGENTS.md Rule #6 & ASOA-RULE-5.4-DRIFT)**:
   - Any drone spray sortie is aborted immediately if field anemometer wind exceeds **5.5 m/s**.
2. **Two-Phase Human Confirmation for Actuation**:
   - Hardware actuations (solenoid valves, tidal sluice gates, aerators) require an authenticated human-in-the-loop cryptographic token before LoRaWAN downlink emission.
3. **Deterministic Rules Engine (`ASOA-RULE-3.2.1-BIO`)**:
   - Any declarative `.agri` file containing prohibited synthetic inputs (e.g., `synthetic_urea`, `glyphosate`, `paraquat`) fails compilation with a BLOCKING diagnostic citing formal regulatory clauses.

---

## 5. How to Reproduce a Run

1. Open AgriQuill IDE in your browser (`http://localhost:3000`).
2. Select **Myanmar: Ayeyarwady Delta Bogale** from the country preset selector.
3. Click **"Google Earth GIS"** in the top bar to inspect or load real-world digital elevation models.
4. Open the `.agri` script editor; observe the blocking rule diagnostic if `synthetic_urea` is present.
5. Click **"Replace with AzollaBioCompost"** to resolve the diagnostic.
6. Click **"Replay Season"** (or press the Play button in the bottom dock scrubber) to step through the 120-day AquaCrop simulation.
7. Observe the automatic water stress breakpoint trigger at **Day 48** (perched water table reaching -15cm), initiating the AWD reflood valve recommendation.
8. Switch to the **"AI Agents"** tab in the Activity Bar to view the autonomous agent thoughts, FastMCP tool receipts, and pending actuation approvals.
9. Click **"Save Record"** to append the cryptographically verified decision package to the immutable ledger.
