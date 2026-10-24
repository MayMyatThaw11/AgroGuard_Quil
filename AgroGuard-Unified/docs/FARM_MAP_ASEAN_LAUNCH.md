# Farm map: ASEAN launch readiness

Written 2026-10-24 from the code and the checks run in this branch. Nothing here is a legal opinion. Items marked "owner" need a decision from the owner; items marked "confirm" need someone to read the provider's current terms.

## Scope of the first release

In scope, because it works today and has tests:
- Enter a farm: draw or trace fields, upload KML, KMZ or GeoJSON, a field sheet, water readings and a spray notebook, find a place by map link, degrees or a GPS photo. Add more fields to an existing farm.
- Record what happened: harvests (weighed, crop cut, mill receipt), lots, certificates, fumigations. Edit or void with a reason; every change is in the ledger.
- Decide: today card, water forecast with a band, flood risk, crew and machine plan, season simulator on real past weather, 3D field.
- Prove: evidence pack (CSV, HTML) per field and season.
- Reference data for all 11 ASEAN countries: Brunei, Cambodia, Indonesia, Laos, Malaysia, Myanmar, Philippines, Singapore, Thailand, Timor-Leste, Viet Nam (FAOSTAT pack in `fao_pack.COUNTRIES`).
- Seven languages: English, Burmese, Vietnamese, Thai, Filipino, Indonesian, Khmer. Light and dark themes.

Out of scope for the first release, and labelled that way in the product:
- Yield forecasts as a promise. The three season engines are uncalibrated. On the one test harvest entered in this branch the own engine was 47.5 % below the entered value. Sell the records, evidence and decision tracking; show the engines as "comparison only" until a region has at least 3 scored seasons.
- Photo or satellite boundary detection (needs an approved model).
- Real-pump PID gains (marked TO VERIFY).

## Must settle before charging users

| # | Item | Why | Who |
|---|------|-----|-----|
| 1 | Provider terms for commercial use | The app calls Open-Meteo (forecast, archive, previous runs), Esri World Imagery tiles directly, public Overpass mirrors, the public OSRM demo router, OpenFreeMap, SoilGrids, NASA POWER, Microsoft Planetary Computer and the Smithsonian volcano list. Several are public or demo endpoints. | confirm, then owner |
| 2 | Real sign-in | Access is by shared codes (`FARMSIM-2026` in dev). An investor with 2 or 3 farms needs their own account, farm ownership, export and delete. | owner |
| 3 | Privacy law per country | Farm outlines and GPS are personal data in several ASEAN countries. | owner, legal |
| 4 | Native review of the 6 non-English languages | New strings were written without a native reviewer. Burmese was checked on screen; Khmer and Thai were not. | owner |
| 5 | Soil data outage | SoilGrids was down during testing and AquaCrop and WOFOST both failed. Cache soil per field after the first success and show the reason when it is missing. | engineering |
| 6 | Offline entry | The offline banner exists, but harvest and record forms are not queued while offline. Many fields have weak signal. | engineering |
| 7 | Real devices | All phone checks used a 375 px emulation with software rendering. Test on one low-end Android phone per target country. | owner |
| 8 | Hosting and backup | One API process and SQLite files. The load run (200 farms, 500 plots, 50 at once) had p99 1.9 s on a laptop with no errors. Needs a host, backups of the ledger and records, and an alert on `/metrics`. | engineering |

## What was checked in this branch

- Frontend: typecheck and 556 tests, including a test that fails when badge or button text drops under 4.5:1 contrast in either theme.
- Backend: 699 tests, ruff, mypy, a provenance test that fails when an API number has no source, and a load harness.
- Browser, Chrome with software rendering, at 1440 and 375 px in light and dark: no console errors, no horizontal overflow, no contrast failures and no touch target under 40 px on the farm panel.
- Reload keeps the open view; a reload used to return to the 3D diorama.

## Known gaps

- The 3D diorama view and Agent Studio use fixed dark colours and stay dark in light mode (about 20 components).
- Frame rate of the 3D field was not measured on a real graphics card.
- Own engine yield has not been compared with FAOSTAT over several years.
- Values still marked TO VERIFY in the handoff stay marked.

## Suggested order

1. Owner: sign-in model, privacy review, provider terms (items 1 to 3).
2. Engineering: soil cache, offline queue, hosting and backups (items 5, 6, 8).
3. Owner: native review and a real-device pass in two pilot countries (items 4, 7).
4. Pilot with a few investors who each own 2 or 3 farms. Collect at least 3 harvests per region before showing any engine as a forecast.
