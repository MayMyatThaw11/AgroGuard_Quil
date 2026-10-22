# Disease detection: fertilizer and spray advice, discovery

Status: research notes before building. Nothing here is built yet. Items marked **VERIFY** need a
Myanmar agronomist or the Plant Protection Division (PPD) before the app says them to a farmer.

## 1. What the disease model can name

86 classes across 5 group models (25 crops). 66 are disease or condition classes; the rest are
healthy or background. By cause:

| Cause | Classes | What chemicals can do |
|---|---|---|
| Fungus or oomycete (blast, rusts, leaf spots, mildews, blights) | 36 | Fungicides work, but timing matters, and cultural steps come first |
| Virus (tungro, mosaics, leaf curl, yellow leaf, ringspot, brown streak) | 11 | **No chemical cures a virus.** Only the insect carrying it can be controlled, plus removing sick plants and clean planting material |
| Bacteria (bacterial blight, canker, bacterial spot) | 7 | Fungicides do not work on bacteria. Copper gives partial protection at best; cultural steps and resistant varieties matter most |
| Algae (tea and durian algal leaf spot, tea red leaf spot) | 3 | Mostly cultural; copper is the usual protectant (**VERIFY**) |
| Insect or mite (spider mites, gall midge, cutting weevil) | 4 | Insecticide or miticide, or biological control |
| Not a disease (tomato fruit reject grade, bud root dropping) | 2 | None; the fruit grade classes are not diseases |
| Fruit grading (pepper fruit, tomato ripe and unripe) | 3 | None |

Finding: **the model detects diseases, not nutrient deficiency.** It cannot tell a farmer which
fertilizer a crop is short of. Fertilizer advice can only be (a) the nutrition habits known to
raise or lower a given disease (for example, less nitrogen for blast), and (b) a general
deficiency guide shown separately. It should never be presented as "the photo shows you lack X".

## 2. What the app already says

`plant_disease_detection/app/ml/disease_data.py` has advice per pathogen type (anthracnose, blight,
rust, virus, mildew, rot). It already names products such as Mancozeb, Chlorothalonil, Metalaxyl,
Copper oxychloride, Azoxystrobin, Imidacloprid and Trichoderma. Problems:

- The advice is by **type of pathogen, not by the actual disease**, so "Tomato Late Blight" and
  "Rice Sheath Blight" get the same wording.
- It names chemicals with **no check that they are registered or allowed in Myanmar**.
- It gives no safety information (protective gear, waiting time before harvest, wind and rain).
- Bacterial and viral diseases get fungicide-style wording in places (**VERIFY**: re-read lines 117, 139, 181).

## 3. Fertilizer types (general agronomy; VERIFY local products and rates)

| Group | Common forms | Role | Disease link |
|---|---|---|---|
| Nitrogen (N) | urea, ammonium sulfate, manure | leaf growth | Too much N raises blast, sheath blight, bacterial blight and leaf spots |
| Phosphorus (P) | DAP, triple or single superphosphate, bone meal | roots, flowering | Little direct link |
| Potassium (K) | muriate of potash, sulfate of potash, wood ash | strength, water use | Enough K lowers many leaf diseases; low K worsens them |
| Compound | NPK blends | balanced feed | Use balanced, not N-heavy |
| Organic | compost, manure, green manure | soil structure, slow N | Needs to be well rotted |
| Lime, gypsum | lime for acid soil | pH, calcium | Fixes pH for crops like groundnut |
| Micronutrients | zinc sulfate, borax | specific gaps (zinc in rice) | Hard to diagnose from a photo |

Sourced: leaf symptom patterns (N older leaves yellow, P dark or purple leaves, K scorched leaf
edges, Zn strap-shaped leaves) agree across the guides found; smallholders usually have no soil
test, so symptom keys are used; FAO-linked work from Malawi reports N, P and Zn shortages are
common. No source found yet for application rates, so **the app should not give rates**.

## 4. Spray types (general agronomy; VERIFY each against the registered list)

| Spray | Examples of active ingredient | Used for | Concern |
|---|---|---|---|
| Copper fungicide or bactericide | copper oxychloride, copper hydroxide | many fungal and bacterial spots, mildews | Builds up in soil; protectant, not a cure |
| Contact fungicide | mancozeb, chlorothalonil | leaf spots, blights | Use limits on edible crops (**VERIFY**) |
| Systemic fungicide | triazoles (hexaconazole, propiconazole), strobilurins (azoxystrobin) | rusts, blast, sheath blight, powdery mildew | Resistance if repeated; one mode of action only |
| Rice-specific | tricyclazole (blast), validamycin (sheath blight) | rice | **VERIFY** registration |
| Oomycete fungicide | metalaxyl, fosetyl-Al | late blight, downy mildew, root and bud rot | Resistance |
| Sulfur | wettable sulfur | powdery mildew, mites | Burns leaves in heat |
| Insecticide for virus carriers | imidacloprid and other neonicotinoids | whiteflies, aphids, leafhoppers | Harms bees; resistance |
| Miticide | abamectin, sulfur | spider mites | Resistance, harms natural enemies |
| Biological | neem, Trichoderma, Bacillus | mild pressure, root rots | Slower, weather sensitive |

## 5. Myanmar rules (what was found)

- Pesticide Law, Pyidaungsu Hluttaw Law No. 14, 2016: a Pesticide Registration Board registers
  products; the Plant Protection Division runs registration. A banned active ingredient cannot be
  registered. ([Tilleke & Gibbins](https://www.tilleke.com/insights/regulatory-pathway-for-pesticide-registration-in-myanmar/28/),
  [UNEP LEAP](https://leap.unep.org/en/countries/mm/national-legislation/pesticide-law-pyidaungsu-hluttaw-law-no-14-2016),
  [WTO record](https://lic-public.wto.org/en/legislations/1156))
- Notification 6/2018 lists **41 banned** pesticides; Notification 5/2018 lists **7 restricted**
  pesticides usable only by certified applicators; Notification 1/2013 banned earlier highly
  hazardous pesticides (arsenic, mercury compounds, lindane, aldrin and others).
  ([Myanmar Trade Portal 5/2018](https://www.myanmartradeportal.gov.mm/en/legal/211),
  [measure 1/2013](https://myanmartradeportal.gov.mm/measure/164))
- **Now transcribed** in `backend/agroguard/app/data/myanmar_banned_restricted.csv`: the 7
  restricted names were read from the scanned 5/2018 notification
  ([PDF](https://www.myanmartradeportal.gov.mm/uploads/legals/2018/9/5-2018%20(%20Restricted%20Pesticide%20List).pdf)):
  methyl bromide, aluminium phosphide, magnesium phosphide, bromadiolone, zinc phosphide,
  brodifacoum, fenthion. The 41 banned names for 6/2018 were **supplied by the team and are not
  yet checked against the official PDF** (**VERIFY**); they agree with the 2013 table except for 8
  extra names (cyhexatin, ethylene dibromide, EPN, hexachlorobenzene, methomyl, trichlorfon,
  strobane, 2,4,5-T) and thallium, which is only in the 2013 table. The 2018 lists may have changed
  since (**VERIFY** with PPD, ppdmyanmar.org).
- FAO and WHO guidelines on highly hazardous pesticides say smallholders usually cannot manage
  their risks safely; paraquat has been recommended for listing under the Rotterdam Convention
  and farmer groups in Myanmar campaign for a ban (status not confirmed).
  ([FAO](https://www.fao.org/newsroom/detail/New-pesticide-guidelines-seek-faster-phase-out-of-risky-toxins/en),
  [ILO](https://researchrepository.ilo.org/esploro/outputs/report/Banning-hazardous-pesticides-recommendations-for-Myanmar/995218984502676))
- Rice disease sources found: IRRI says resistant varieties are the most practical blast control;
  extension guides for sheath blight list drainage, moderate fertilizer and lower seeding density
  before fungicide; bacterial blight and tungro are not controlled by fungicide (tungro: control
  the leafhopper). ([IRRI](https://irri.org/node/355),
  [PhilRice](https://www.philrice.gov.ph/wp-content/uploads/2023/02/Major-diseases-of-the-rice-plant-in-the-Philippines.pdf),
  [TNAU](https://agritech.tnau.ac.in/crop_protection/crop_prot_crop%20diseases_cereals_paddy.html))
- Not found: IRRI's own fungicide tables, WHO hazard-class criteria, per-crop pre-harvest waiting times.

## 6. Proposed design

Advice per **disease class** (66 rows), not per pathogen type, in three tiers, shown in this order:

1. **Do first (cultural and clean-up):** remove infected parts, drain or space, resistant variety, clean tools.
2. **Feeding:** how nutrition affects this disease (for example "avoid extra urea"). General only; no rates.
3. **Spray, only if needed:** the *kind* of product (for example "a copper fungicide") and the
   active ingredient names that are **registered in Myanmar and not banned or restricted**. Never a
   dose, never a brand. Always with: "Check the product is registered, read the label, ask your
   extension officer or agronomist."

Rules the code enforces:
- A banned or restricted ingredient can never be shown (checked against a list file, with a test).
- Viruses show no spray against the virus; only the insect, and "remove sick plants".
- Bacterial diseases never get a fungicide as the cure.
- Safety line on every spray suggestion: protective gear, keep away from children, waiting time
  before harvest on the label, do not spray in wind or rain (the Farm Simulation scheduler already has wind and rain gates).
- Every row records its source and who reviewed it and when. Rows with no reviewer show only tiers 1 and 2.
- High-severity detections say "see an agronomist" first.
- Burmese text for all of it, reviewed by a native speaker.

Data file: `disease_management.csv` with columns: class, cause, cultural, nutrition, spray_kind,
active_ingredients, source, reviewed_by, reviewed_on. A separate `myanmar_banned_restricted.csv`.

## 7. Decisions needed

1. Who reviews the rows (an agronomist or the extension service)? Without a reviewer, only tiers 1 and 2 ship.
2. Who transcribes the 41 banned and 7 restricted lists from the notifications?
3. Show product groups only, or also registered brand names? (Recommended: groups only.)
4. Replace the existing generic text in `disease_data.py`, or add this beside it? (Recommended: replace, so two sets of advice never disagree.)
