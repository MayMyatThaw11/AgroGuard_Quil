# Farm map: technical edge over competing tools

Written 2026-10-24. It extends FARM_MAP_COMPETITIVE.md with four more searches, the text of Verra's VM0051 v1.1 (read from the PDF, 90 pages), and a check of our own production build. "Not found" means the sources I read were silent.

## What anyone can copy, and what is hard to copy

Easy to copy: the crop engines. AquaCrop and WOFOST are open source and any competitor can run them. A map, a diary form or a satellite layer is also copyable.

Hard to copy, because it depends on data a competitor does not have and on discipline in the code:
1. **Per-field scoring on the farm's own harvests.** Published field-scale rice validations in the sources are research case studies on small samples (for example AquaCrop with satellite imagery on 126 pixels in Thailand, RMSE 0.18 t/ha) or checks against district statistics. I found no operational smallholder service that publishes per-field error. The farm map scores every engine against each recorded harvest and shows the baseline next to it.
2. **A correction that proves itself before it is used.** New in this branch: from 3 or more scored seasons the farm map learns a per-engine factor (median of measured over engine), tests it by leaving each season out in turn, and uses it only when its held-out error is below both the raw engine and the national baseline. On a drifting engine it refuses (the hand-computed test case: 15.0 % raw, 19.9 % corrected, so it stays in shadow). On a steadily biased engine it promotes (raw 52 %, held-out 2.6 %). Code: `calibration.py`; tests: `test_agriquill_calibration.py`. Live check on the e2e test farm with three typed-in harvests (not real measurements): the own engine was 47.5, 55.4 and 47.9 % low, so its raw error was 50.3 %; the learned factor was 1.92 and cut the held-out error to 10.7 %, but the national baseline scored 6.9 % on the same seasons, so the correction stayed in shadow. AquaCrop and WOFOST still failed there with "soil texture unknown", which is why the soil cache is on the list below.
3. **Records that can be audited.** Corrected or voided records stay, with a reason and a ledger entry. A test fails when an API number has no source.
4. **Independent witnesses agreeing.** Farmer tube readings, the water-balance model and a Sentinel-1 radar check (shadow mode) are compared, and the radar check withholds a verdict under 10 pairs and says when revisits are too far apart to see a wet-dry cycle.

None of this is an advantage until there are harvests to learn from. The edge is a data loop, and the loop starts with the pilot.

## Research findings that shape the work

**Carbon and certification programmes ask for records the farm map already holds.** VM0051 v1.1 (Verra, rice) lists in Table 2 the minimum a project must establish for each field: irrigation yes or no, flooding on-season (continuous, single or multiple), pre-season flooding, irrigation rate or volume, flooding duration in days, water level below the surface, crop type, rice variety, seeding practice (direct seeded or transplanted), seeding date, harvest date and yield. It ranks acceptable evidence: management records backed by logs, receipts or sensor data first, then written plans, then a signed farmer attestation (a digital acceptance record counts), then regional averages. It defines AWD as more than one drainage event during the cultivation period, besides end-of-season drainage.

| VM0051 Table 2 item | Farm map today |
|---|---|
| Water level below the surface | recorded as time-stamped tube readings |
| Crop, variety, seeding and harvest dates, yield | recorded (parcel, harvest record) |
| Seeding practice (direct seeded or transplanted) | not recorded as a field; the plan assumes transplanting |
| Irrigation volume actually applied | planned events only; no log of applied volume |
| Flooding regime (continuous, single, multiple) and duration | not recorded; could be derived from tube readings |
| Pre-season flooding | not recorded |

Whether a verifier would accept any of this is unknown; I checked no registry. The gaps in the table are concrete work for an MRV-ready record set.

**Plot-level traceability is a live requirement in ASEAN export chains.** Vendor sources say the EU deforestation rules want plot coordinates, polygons above a size they put at 4 ha (unconfirmed), and no mass balance, so a blended lot must list each plot. Our lots already carry the list of plots. The regulation covers palm, coffee, cocoa and rubber but not rice; I have not read the regulation text, so check it before relying on this. Incumbents here are Koltiva and Tracextech.

**Radar for AWD is research-grade.** A 2026 Thai study reports per-stage balanced accuracy between 0.59 and 0.89 for water regime from radar. That spread argues for pairing radar with farmer records, as the farm map does, rather than selling radar alone.

## Our own build (the part of REA that applies)

REA is for shipped binaries, packages and observed runtime behaviour. It is not connected in this session, and I did not reverse engineer any competitor's product: that can breach licence terms and is not needed, because the public sources above answer the question. The useful check is on our own build, done with ordinary tools:
- `vite build` output is 7.5 MB in 17 script files. The farm map path loads about 1.28 MB gzipped (farmsim 632 KB, map style 281 KB, shell 204 KB, map view 160 KB) before the 3D models (0.5 MB, loaded only for the 3D field).
- The bundle calls these hosts straight from the browser: Open-Meteo (forecast and archive), two public Overpass mirrors, OpenFreeMap, Esri imagery tiles, SoilGrids, OpenStreetMap. That list is what the provider-terms review in FARM_MAP_ASEAN_LAUNCH.md has to cover.
- A pattern search for API keys, private keys and the dev access code found nothing in the bundle.

## Blender and the 3D field

The Blender MCP could not connect: the addon was not running in Blender. The models are built by `assets-src/farmmap/build_models.py` in headless Blender, so they can be changed without the MCP, but looking at results live needs the addon on. Plant height in the 3D field is not model output (no engine here simulates it), so it is labelled illustrative. A data-driven height would need a cited per-stage height table for the variety and a source for the farm's variety.

## Next engineering steps, in order of edge per effort

1. Run the calibration on real harvests (needs the pilot).
2. Add an irrigation log with applied volume, a seeding-practice field and a derived flooding regime, so the record set covers VM0051 Table 2.
3. Soil cache per field so the other two engines survive a soil-service outage.
4. Queue harvest and record forms offline.
