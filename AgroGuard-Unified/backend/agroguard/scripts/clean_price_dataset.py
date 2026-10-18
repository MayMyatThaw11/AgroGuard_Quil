import pandas as pd
import numpy as np
from pathlib import Path

# Resolve paths relative to AgroGuard/backend/scripts -> ../app/data/
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = (BASE_DIR / "../app/data").resolve()

# Input files (READ-ONLY)
INPUT_FAO_PRICE_CSV = DATA_DIR / "FAOSTAT_ASEAN_Historical_Prices.csv"
EXISTING_CROP_RULES_CSV = DATA_DIR / "ASEAN_Top50_Crop_Rules_Cleaned.csv"
EXISTING_TRAINING_CSV = DATA_DIR / "ASEAN_Top50_Crop_Training_Data.csv"

# Output files (ONLY Price Datasets are created)
CLEAN_COUNTRY_PRICE_CSV = DATA_DIR / "ASEAN_Country_Level_Prices_Cleaned.csv"
CLEAN_PRICE_LOOKUP_CSV = DATA_DIR / "ASEAN_Crop_Prices_Lookup.csv"

# Reference ASEAN Price (USD/tonne) & Yield (tonnes/ha) for outlier filtering & missing FAO items
ASEAN_PRICE_AND_YIELD_REF = {
    "Rice (Paddy)": (360.0, 4.2),
    "Maize (Corn)": (265.0, 5.0),
    "Sorghum": (250.0, 2.8),
    "Black Gram (Matpe)": (980.0, 1.4),
    "Mung Bean (Green Gram)": (1050.0, 1.3),
    "Pigeon Pea (Toor)": (920.0, 1.3),
    "Chickpea": (820.0, 1.5),
    "Soybean": (540.0, 2.1),
    "Cowpea": (780.0, 1.2),
    "Common Bean": (890.0, 1.6),
    "Lablab Bean": (760.0, 1.3),
    "Sesame": (1650.0, 0.9),
    "Groundnut (Peanut)": (1280.0, 1.8),
    "Sunflower": (680.0, 1.7),
    "Mustard Seed": (790.0, 1.2),
    "Castor Bean": (950.0, 1.4),
    "Oil Palm": (240.0, 18.5),
    "Rubber": (1680.0, 1.5),
    "Coconut": (320.0, 6.5),
    "Sugarcane": (48.0, 65.0),
    "Cotton": (1850.0, 1.8),
    "Jute": (720.0, 2.2),
    "Coffee (Arabica)": (4600.0, 1.1),
    "Coffee (Robusta)": (3400.0, 1.8),
    "Tea": (2350.0, 2.0),
    "Cassava (Tapioca)": (115.0, 22.0),
    "Sweet Potato": (340.0, 14.0),
    "Potato": (480.0, 16.5),
    "Taro": (520.0, 11.0),
    "Durian": (3800.0, 9.5),
    "Mango": (850.0, 10.0),
    "Banana": (420.0, 24.0),
    "Papaya": (390.0, 28.0),
    "Pineapple": (410.0, 32.0),
    "Pomelo": (780.0, 14.0),
    "Mangosteen": (2100.0, 7.5),
    "Rambutan": (920.0, 10.5),
    "Jackfruit": (460.0, 18.0),
    "Avocado": (1750.0, 9.0),
    "Watermelon": (310.0, 25.0),
    "Chili Pepper": (2150.0, 2.8),
    "Ginger": (1180.0, 12.0),
    "Turmeric": (1250.0, 4.5),
    "Black Pepper": (4800.0, 1.8),
    "Betel Nut (Areca)": (2200.0, 2.2),
    "Cacao (Cocoa)": (5200.0, 0.9),
    "Onion": (540.0, 15.0),
    "Garlic": (1450.0, 8.5),
    "Tomato": (460.0, 22.0),
    "Cabbage": (320.0, 26.0),
}


def get_existing_crop_labels() -> pd.DataFrame:
    """
    Reads your existing trained crop dataset (READ-ONLY) so the price lookup table
    uses the exact same crop names/labels without modifying your crop files.
    """
    if EXISTING_CROP_RULES_CSV.exists():
        df = pd.read_csv(EXISTING_CROP_RULES_CSV, encoding="utf-8-sig")
        return df[["crop_name_en", "crop_name_mm", "scientific_name", "category"]].drop_duplicates()
    elif EXISTING_TRAINING_CSV.exists():
        df = pd.read_csv(EXISTING_TRAINING_CSV, encoding="utf-8-sig")
        df = df.rename(columns={"label": "crop_name_en", "label_mm": "crop_name_mm"})
        return df[["crop_name_en", "crop_name_mm", "scientific_name", "category"]].drop_duplicates()
    else:
        return pd.DataFrame([
            {"crop_name_en": k, "crop_name_mm": "", "scientific_name": "", "category": ""}
            for k in ASEAN_PRICE_AND_YIELD_REF.keys()
        ])


def build_clean_price_dataset(usd_to_mmk_rate: float = 4500.0):
    print("=" * 68)
    print("BUILDING STANDALONE ASEAN CROP PRICE DATASET (READ-ONLY ON CROP DATA)")
    print("=" * 68)

    df = pd.read_csv(INPUT_FAO_PRICE_CSV, encoding="utf-8-sig", low_memory=False)
    print(f"Loaded '{INPUT_FAO_PRICE_CSV.name}' with {len(df):,} initial rows.")

    # Standardize strings and ASEAN country names
    for col in ["Area", "crop_name_en", "Item"]:
        if col in df.columns:
            df[col] = df[col].astype("string").str.strip()

    country_map = {
        "Viet Nam": "Vietnam",
        "Lao People's Democratic Republic": "Laos",
        "Brunei Darussalam": "Brunei"
    }
    df["Area"] = df["Area"].replace(country_map)

    # 1. Select recent market years (Y2018 - Y2025) so old 2000s prices don't skew current prices
    all_year_cols = sorted([c for c in df.columns if c.startswith("Y20") and len(c) == 5])
    recent_year_cols = [c for c in all_year_cols if int(c[1:]) >= 2018]
    year_cols = recent_year_cols if recent_year_cols else all_year_cols
    print(f"[Step 1] Using recent market year columns: {year_cols}")

    for col in year_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # 2. Deduplicate country-crop rows
    before_dedup = len(df)
    df = df.groupby(["Area", "crop_name_en"], as_index=False)[year_cols].median()
    print(f"[Step 2] Consolidated duplicate country-crop records: {before_dedup} -> {len(df)} rows.")

    # 3. Clean exchange-rate / hyperinflation outliers in year columns
    outliers_clipped = 0
    for idx, row in df.iterrows():
        crop = row["crop_name_en"]
        ref_price, _ = ASEAN_PRICE_AND_YIELD_REF.get(crop, (500.0, 3.0))
        low_bound = max(15.0, ref_price * 0.20)
        high_bound = ref_price * 3.50

        for y_col in year_cols:
            val = row[y_col]
            if pd.notna(val) and (val < low_bound or val > high_bound):
                df.at[idx, y_col] = np.nan
                outliers_clipped += 1

    print(f"[Step 3] Nullified {outliers_clipped} outlier cells across recent year columns.")

    # 4. Interpolate missing year gaps and save country-level price table
    if len(year_cols) > 1:
        df[year_cols] = df[year_cols].T.interpolate(method="linear", limit_direction="both").T

    df["median_usd_per_tonne"] = df[year_cols].median(axis=1).round(2)
    df = df.dropna(subset=["median_usd_per_tonne"]).reset_index(drop=True)
    df.to_csv(CLEAN_COUNTRY_PRICE_CSV, index=False, encoding="utf-8-sig")
    print(f"[Step 4] Saved cleaned country-level prices: '{CLEAN_COUNTRY_PRICE_CSV.name}' ({len(df)} rows).")

    # 5. Build Standalone Price Lookup Table matching your existing trained crops
    existing_crops_df = get_existing_crop_labels()
    print(f"[Step 5] Matching prices to your {len(existing_crops_df)} existing trained crops...")

    price_records = []
    for _, crop_row in existing_crops_df.iterrows():
        crop_en = crop_row["crop_name_en"]
        crop_subset = df[df["crop_name_en"] == crop_en]
        ref_price, avg_yield = ASEAN_PRICE_AND_YIELD_REF.get(crop_en, (500.0, 3.0))

        if len(crop_subset) > 0:
            asean_median = float(crop_subset["median_usd_per_tonne"].median())
            asean_min = float(crop_subset["median_usd_per_tonne"].min())
            asean_max = float(crop_subset["median_usd_per_tonne"].max())

            mm_row = crop_subset[crop_subset["Area"] == "Myanmar"]
            mm_usd_price = float(mm_row["median_usd_per_tonne"].iloc[0]) if len(mm_row) > 0 else asean_median
            source = "FAOSTAT_Cleaned"
        else:
            asean_median = ref_price
            asean_min = round(ref_price * 0.85, 2)
            asean_max = round(ref_price * 1.15, 2)
            mm_usd_price = ref_price
            source = "ASEAN_Market_Baseline"

        price_usd_kg = round(asean_median / 1000.0, 2)
        price_mmk_kg = round((mm_usd_price / 1000.0) * usd_to_mmk_rate, 0)
        price_mmk_viss = round(price_mmk_kg * 1.63293, 0)
        est_revenue_usd_ha = round(asean_median * avg_yield, 0)

        price_records.append({
            "crop_name_en": crop_en,
            "crop_name_mm": crop_row["crop_name_mm"],
            "scientific_name": crop_row["scientific_name"],
            "category": crop_row["category"],
            "asean_median_usd_tonne": round(asean_median, 2),
            "myanmar_usd_tonne": round(mm_usd_price, 2),
            "price_min_usd_tonne": round(asean_min, 2),
            "price_max_usd_tonne": round(asean_max, 2),
            "price_usd_per_kg": price_usd_kg,
            "price_mmk_per_kg": int(price_mmk_kg),
            "price_mmk_per_viss": int(price_mmk_viss),
            "avg_yield_tonnes_per_ha": avg_yield,
            "est_gross_revenue_usd_per_ha": int(est_revenue_usd_ha),
            "price_source": source
        })

    price_lookup_df = pd.DataFrame(price_records)

    # Validate no NaNs or duplicates exist in the price lookup table
    assert price_lookup_df.isna().sum().sum() == 0, "NaNs remain in price lookup table!"
    assert price_lookup_df["crop_name_en"].duplicated().sum() == 0, "Duplicate crop entries found!"

    price_lookup_df.to_csv(CLEAN_PRICE_LOOKUP_CSV, index=False, encoding="utf-8-sig")
    print(f"[Step 6] Saved standalone Price Lookup CSV: '{CLEAN_PRICE_LOOKUP_CSV.name}' ({len(price_lookup_df)} crops).")
    print("=" * 68)

    return price_lookup_df


if __name__ == "__main__":
    build_clean_price_dataset()