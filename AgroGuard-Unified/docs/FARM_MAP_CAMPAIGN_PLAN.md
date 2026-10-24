# Farm map: ASEAN pilot campaign plan

Written 2026-10-24. No budget, dates or baseline numbers were given, so this plan is channel-agnostic, every target is a proposal with no baseline behind it, and the owner should replace them. It follows the decision from the launch debate: a closed, invited, no-charge pilot first, public and paid later (see FARM_MAP_ASEAN_LAUNCH.md for the gate).

## 1. Overview

- **Name (working):** Records that stand up to a check.
- **Summary:** invite investors and agribusiness owners with 2 or 3 rice farms to keep every field, harvest and certificate in one place, and show them how far the models can be trusted on their own harvests.
- **Primary objective:** 10 pilot owners across 2 countries, each with at least one farm entered and one harvest recorded, within 8 weeks of the pilot opening. (Proposed. Change it once the owner knows how many partners can be reached.)
- **Secondary objectives:** at least 3 scored seasons in one region; written answers from providers on commercial use; one native-speaker review in each pilot language.

## 2. Audience

- **Primary:** owners or managers of 2 to 3 small and medium rice farms who answer to a lender, a buyer or a certifier and today keep records on paper, in chat apps or in spreadsheets.
- **Secondary:** cooperative managers and extension officers who sign up their members; certification bodies who ask for records.
- **Pain points:** proving what was done on each field; seeing several farms without visiting; advice tools that do not show their own error.
- **Where they are:** to confirm with each pilot partner. Messaging apps and Facebook groups are common in the region, but the right channel differs by country, so the plan starts from partners, not from a platform.
- **Buying stage:** consideration. They know free tools exist (Rice Crop Manager, AgriDOC) and need a reason to try another.

## 3. Key messages

- **Core:** Keep one record of every field and prove it when someone asks.
- **Supporting, each with its proof:**
  1. Put a farm on the map in minutes: draw it, upload a KML or GeoJSON, paste a map link or use a GPS photo. Proof: the entry paths are tested end to end.
  2. Nothing is erased: a correction or a void keeps the old value, who changed it and why. Proof: ledger entries and a test.
  3. The models show their error on your own harvests, and a correction is used only when it beats the raw model and the national figure on held-out seasons. Proof: scored seasons shown in the panel. Do not promise yield accuracy.
  4. Seven languages: English, Burmese, Vietnamese, Thai, Filipino, Indonesian, Khmer. Say "reviewed" only for languages a native speaker has reviewed.
- **Not to say:** any yield forecast figure, any carbon credit eligibility, or "certified" anything.

## 4. Channels

| Channel | Why | Format | Effort |
|---|---|---|---|
| Cooperative and extension partners | They already hold the trust and the farmer lists | Workshop of 60 minutes, then one-to-one set-up | High |
| Direct outreach to investor-owners | The primary audience is small and findable through partners | Short message plus a 90-second demo video | Medium |
| Messaging-app demos | Lets an owner try with a map link or a photo from the phone | Guided session | Medium |
| Owned: one-page evidence-pack sample, language pages | Shows the output a lender or certifier would see | PDF and web page | Low |
| University and research contacts | Source of harvest data and credibility | Joint data agreement | Medium |

No paid channel in this phase: provider terms are unconfirmed and the pilot is invite-only.

## 5. Calendar (8 weeks from pilot opening)

| Week | Piece | Channel | Notes |
|---|---|---|---|
| 0 | Written licence requests to providers; hosting and backups; named per-owner codes | internal | Gate for everything below |
| 1 | Demo video, evidence-pack sample, short guide in each pilot language | owned | Native review before sending |
| 2 | First partner workshop in country A | partners | Collect set-up friction in writing |
| 3 | One-to-one set-up for 5 owners | direct | Time how long the first farm takes |
| 4 | Fix the top 3 friction points; second workshop in country B | partners | |
| 5 | First harvests recorded; first scored season shown | direct | |
| 6 | Owner check-ins; export an evidence pack for a real request | direct | |
| 7 | Case notes with owner consent | owned | No numbers without consent |
| 8 | Review against the metrics; decide on public launch | internal | Uses the gate in the launch plan |

## 6. Content needed

- Must have: demo video (90 s), evidence-pack sample, short guide per language, partner workshop outline, consent form for data use, one-page explanation of "comparison only" and of what the calibration does.
- Nice to have: case notes, a printable field-entry checklist for owners without smartphones at the field.

## 7. Success metrics

- **Primary:** pilot owners with one farm and one harvest recorded (target 10).
- **Secondary:** minutes from first open to first farm saved (aim at 10 or less; measure it, do not assume it); records entered per farm per week; evidence packs downloaded; scored seasons per region; share of owners still active in week 4.
- **How tracked:** the product's own records and the `/metrics` route; one short call per owner at weeks 3 and 6. Report weekly.

## 8. Budget

Not given. Cost drivers to price once known: hosting and backups, native-speaker review in six languages, workshop travel, and any provider licence fees. Keep 10 to 15 % in reserve.

## 9. Risks

- **A provider refuses or charges:** swap tiles or servers before the pilot opens; ask in writing in week 0.
- **A tester reads a model number as a forecast:** keep "comparison only" on every model figure and brief owners at set-up.
- **Records are lost:** backups before week 1, and an export on request.
- **A translation reads badly:** native review before anything goes out in that language.

## 10. Next steps

1. Owner: choose the two pilot countries and the partners; confirm or replace the proposed targets.
2. Owner: send the provider licence requests; decide the sign-in model.
3. Engineering: hosting and backups, named codes, soil cache, offline queue.
4. Owner: arrange native review in the two pilot languages first.
