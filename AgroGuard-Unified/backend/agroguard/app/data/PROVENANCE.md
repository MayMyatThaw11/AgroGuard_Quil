# Data provenance

Each file the API loads, where it came from, and whether its numbers may be shown as real.
Verdicts: `verified` (an official or open source, unchanged), `derived` (computed from a verified file by a script in this repo), `mixed` (some rows derived, some typed in), `synthetic` (generated, never real).
Only `verified` and `derived` rows may be labelled measured or historical. `synthetic` files load in development and demo only, and their numbers are labelled demo.

| File | Origin | Verdict | Units | Read by |
|---|---|---|---|---|
| `FAOSTAT_ASEAN_Historical_Prices.csv` | FAOSTAT Prices bulk download, `scripts/download_price_dataset.py` | verified | producer price, USD/t, yearly | `dashboard_data.py` |
| `mmr_faostat_crops_livestock_products.csv` | FAOSTAT Crops and livestock products for Myanmar (HDX export format, FAO flags kept) | verified | ha, t, kg/ha, yearly | `dashboard_data.py` |
| `ASEAN_Crop_Prices_Lookup.csv` | `scripts/clean_price_dataset.py`: 34 rows `price_source=FAOSTAT_Cleaned`, 16 rows `ASEAN_Market_Baseline` | mixed | USD/t, MMK at a fixed 4,500 rate | `regional_market.py`, `plant_recommender.py`, `dashboard_data.py` |
| `ASEAN_Top50_Prices_Cleaned_Summary.csv` | same columns and source split as the lookup | mixed | USD/t | `market_demand.py` |
| `ASEAN_Top50_Crop_Prices.csv` | `scripts/prices_dataset.py` dict `ASEAN_TOP50_PRICE_BASELINES`, typed in (its "Verified" comment names no source) | synthetic | USD/t | `dashboard_data.py` |
| `Agricultural Crop-production Data of Shan State.csv` | Ministry of Agriculture in Shan State, reconfigured by TAF (see the `.rtf` codebook), 2014-15 to 2018-19 | verified | acres, baskets/acre | `regional_market.py`, `market_demand.py` |
| `township_agricultural_data.csv` | `app/ml/training/generate_dataset.py`, `random.uniform` with seed 42 | synthetic | price has no unit | `regional_market.py`, `market_demand.py`, `crop_predictor.py`, `plant_recommender.py`, `agriculture_data.py` |
| `ASEAN_Top50_Crop_Rules_Cleaned.csv` | EcoCrop database (OpenCLIM/ecocrop on GitHub), `scripts/download_dataset.py` | derived | crop climate ranges | `train_model.py`, `eu_fruit_catalog.py` |
| `ASEAN_Top50_Crop_Training_Data_Verified.csv` | samples drawn at random inside EcoCrop ranges (`download_dataset.py` "synthetic training samples"), then range-checked | synthetic | n/a | `train_model.py` |
| `mmr-ndvi-subnat-full.csv` | subnational NDVI for Myanmar in the WFP/HDX `*-ndvi-subnat-full.csv` format; download not scripted here | verified (origin to confirm) | NDVI, dekadal | `agriculture_data.py` |
| `mmr_regions.csv`, `mmr_districts.geojson` | `scripts/prepare_ndvi_regions.py` | derived | names, centres, boundaries | `agriculture_data.py` |
| `myanmar_banned_restricted.csv` | each row cites a Myanmar notification in its `source` column | verified (per row) | n/a | `pesticide_rules.py` |
| `plants.csv`, `plants_mm.csv` | no source recorded; includes typed MMK/kg prices | synthetic/unknown | mixed | `plant_recommender.py` |
| `disease_management.json`, `disease_advice_reviews.json`, `disease_decisions.json` | authored advice and review records | authored | n/a | `disease_advice.py`, `decision_engine.py` |
