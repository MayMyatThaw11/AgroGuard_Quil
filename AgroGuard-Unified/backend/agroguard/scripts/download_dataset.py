import pandas as pd
import numpy as np

# 1. Define the Top 50 Commercial Crops for ASEAN & Myanmar Markets
# Mapped via exact Botanical/Scientific Names to avoid messy common-name strings
ASEAN_TOP_50_CROPS = {
    # --- Cereals (3) ---
    "Oryza sativa": ("Rice (Paddy)", "စပါး", "Cereal"),
    "Zea mays": ("Maize (Corn)", "ပြောင်း", "Cereal"),
    "Sorghum bicolor": ("Sorghum", "နှံစားပြောင်း", "Cereal"),

    # --- Pulses & Legumes (8) - Major Myanmar & ASEAN Export Staples ---
    "Vigna mungo": ("Black Gram (Matpe)", "မတ်ပဲ", "Pulse"),
    "Vigna radiata": ("Mung Bean (Green Gram)", "ပဲတီစိမ်း", "Pulse"),
    "Cajanus cajan": ("Pigeon Pea (Toor)", "ပဲစဉ်းငုံ", "Pulse"),
    "Cicer arietinum": ("Chickpea", "ကုလားပဲ", "Pulse"),
    "Glycine max": ("Soybean", "ပဲပုပ်", "Pulse"),
    "Vigna unguiculata": ("Cowpea", "ပဲလွမ်း", "Pulse"),
    "Phaseolus vulgaris": ("Common Bean", "ဘိုစားပဲ", "Pulse"),
    "Lablab purpureus": ("Lablab Bean", "ပဲကြီး", "Pulse"),

    # --- Oilseeds (5) ---
    "Sesamum indicum": ("Sesame", "နှမ်း", "Oilseed"),
    "Arachis hypogaea": ("Groundnut (Peanut)", "မြေပဲ", "Oilseed"),
    "Helianthus annuus": ("Sunflower", "နေကြာ", "Oilseed"),
    "Brassica juncea": ("Mustard Seed", "မုန်ညင်းစေ့", "Oilseed"),
    "Ricinus communis": ("Castor Bean", "ကြက်ဆူ", "Oilseed"),

    # --- Industrial & Plantation Crops (9) ---
    "Elaeis guineensis": ("Oil Palm", "ဆီအုန်း", "Plantation"),
    "Hevea brasiliensis": ("Rubber", "ရာဘာ", "Plantation"),
    "Cocos nucifera": ("Coconut", "အုန်း", "Plantation"),
    "Saccharum officinarum": ("Sugarcane", "ကြံ", "Plantation"),
    "Gossypium hirsutum": ("Cotton", "ဝါ", "Plantation"),
    "Corchorus capsularis": ("Jute", "ဂုန်လျှော်", "Plantation"),
    "Coffea arabica": ("Coffee (Arabica)", "ကော်ဖီ (အာရေဗီကာ)", "Plantation"),
    "Coffea canephora": ("Coffee (Robusta)", "ကော်ဖီ (ရိုဘတ်စတာ)", "Plantation"),
    "Camellia sinensis": ("Tea", "လက်ဖက်", "Plantation"),

    # --- Root & Tuber Crops (4) ---
    "Manihot esculenta": ("Cassava (Tapioca)", "ပီလောပီနံ", "Tuber"),
    "Ipomoea batatas": ("Sweet Potato", "ကန်စွန်းဥ", "Tuber"),
    "Solanum tuberosum": ("Potato", "အာလူး", "Tuber"),
    "Colocasia esculenta": ("Taro", "ပိန်းဥ", "Tuber"),

    # --- Tropical Fruits (11) ---
    "Durio zibethinus": ("Durian", "ဒူးရင်း", "Fruit"),
    "Mangifera indica": ("Mango", "သရက်", "Fruit"),
    "Musa paradisiaca": ("Banana", "ငှက်ပျော", "Fruit"),
    "Carica papaya": ("Papaya", "သင်္ဘော", "Fruit"),
    "Ananas comosus": ("Pineapple", "နာနတ်", "Fruit"),
    "Citrus maxima": ("Pomelo", "ကျွဲကော", "Fruit"),
    "Garcinia mangostana": ("Mangosteen", "မင်းဂွတ်", "Fruit"),
    "Nephelium lappaceum": ("Rambutan", "ကြက်မောက်", "Fruit"),
    "Artocarpus heterophyllus": ("Jackfruit", "ပိန္နဲ", "Fruit"),
    "Persea americana": ("Avocado", "ထောပတ်သီး", "Fruit"),
    "Citrullus lanatus": ("Watermelon", "ဖရဲ", "Fruit"),

    # --- Spices, Betel & High-Value Cash Crops (6) ---
    "Capsicum annuum": ("Chili Pepper", "ငရုတ်", "Spice/Cash"),
    "Zingiber officinale": ("Ginger", "ချင်း (ဂျင်း)", "Spice/Cash"),
    "Curcuma longa": ("Turmeric", "နနွင်း", "Spice/Cash"),
    "Piper nigrum": ("Black Pepper", "ငရုတ်ကောင်း", "Spice/Cash"),
    "Areca catechu": ("Betel Nut (Areca)", "ကွမ်းသီး", "Spice/Cash"),
    "Theobroma cacao": ("Cacao (Cocoa)", "ကိုကိုး", "Spice/Cash"),

    # --- Commercial Vegetables (4) ---
    "Allium cepa": ("Onion", "ကြက်သွန်နီ", "Vegetable"),
    "Allium sativum": ("Garlic", "ကြက်သွန်ဖြူ", "Vegetable"),
    "Solanum lycopersicum": ("Tomato", "ခရမ်းချဉ်", "Vegetable"),
    "Brassica oleracea": ("Cabbage", "ဂေါ်ဖီထုပ်", "Vegetable"),
}

# Verified ASEAN fallback profiles in case a subspecies name differs in EcoCrop
ASEAN_FALLBACK_PROFILES = {
    "Durio zibethinus": [24, 32, 18, 38, 2000, 3500, 1500, 5000, 5.0, 6.5, 4.5, 7.5],
    "Garcinia mangostana": [25, 32, 20, 38, 1800, 3000, 1200, 4500, 5.5, 6.5, 4.5, 7.5],
    "Nephelium lappaceum": [24, 32, 20, 38, 2000, 3500, 1500, 4500, 5.0, 6.5, 4.5, 7.0],
    "Solanum lycopersicum": [20, 27, 10, 35, 600, 1300, 400, 1800, 6.0, 6.8, 5.0, 7.5],
    "Musa paradisiaca": [24, 30, 15, 38, 1500, 2500, 1000, 4000, 5.5, 7.0, 4.5, 8.0],
}


def load_and_extract_asean_crops(csv_url_or_path: str) -> pd.DataFrame:
    print("1. Loading raw FAO EcoCrop dataset...")
    raw_df = pd.read_csv(csv_url_or_path, encoding="latin1", low_memory=False)

    # Normalize scientific names (strip whitespace and subspecies suffixes if needed)
    raw_df["SciName_Clean"] = (
        raw_df["ScientificName"]
        .astype(str)
        .str.strip()
        .str.split()
        .str[:2]
        .str.join(" ")
    )

    # Filter for our Top 50 ASEAN scientific names
    extracted = raw_df[raw_df["SciName_Clean"].isin(ASEAN_TOP_50_CROPS.keys())].copy()

    # Keep the row with the fewest NaNs if multiple varieties exist for the same species
    num_cols = [
        "TOPMN", "TOPMX", "TMIN", "TMAX",
        "ROPMN", "ROPMX", "RMIN", "RMAX",
        "PHOPMN", "PHOPMX", "PHMIN", "PHMAX"
    ]
    for col in num_cols:
        extracted[col] = pd.to_numeric(extracted[col], errors="coerce")

    extracted["valid_count"] = extracted[num_cols].notna().sum(axis=1)
    extracted = (
        extracted.sort_values("valid_count", ascending=False)
        .drop_duplicates(subset=["SciName_Clean"], keep="first")
        .copy()
    )

    # Ensure all 50 ASEAN crops are present (fill from verified fallback if missing in raw CSV)
    found_species = set(extracted["SciName_Clean"])
    missing_species = set(ASEAN_TOP_50_CROPS.keys()) - found_species

    fallback_rows = []
    for sci_name in missing_species:
        if sci_name in ASEAN_FALLBACK_PROFILES:
            vals = ASEAN_FALLBACK_PROFILES[sci_name]
            row_dict = {"SciName_Clean": sci_name, "ScientificName": sci_name}
            row_dict.update(dict(zip(num_cols, vals)))
            fallback_rows.append(row_dict)

    if fallback_rows:
        extracted = pd.concat([extracted, pd.DataFrame(fallback_rows)], ignore_index=True)

    # Map clean English name, Myanmar name, and Crop Category
    extracted["crop_name_en"] = extracted["SciName_Clean"].map(lambda x: ASEAN_TOP_50_CROPS[x][0])
    extracted["crop_name_mm"] = extracted["SciName_Clean"].map(lambda x: ASEAN_TOP_50_CROPS[x][1])
    extracted["category"] = extracted["SciName_Clean"].map(lambda x: ASEAN_TOP_50_CROPS[x][2])

    return extracted


def clean_biophysical_features(df: pd.DataFrame) -> pd.DataFrame:
    print("2. Cleaning temperature, rainfall, and soil pH columns...")
    clean_df = df.copy()

    # Rename columns to intuitive snake_case names
    rename_map = {
        "SciName_Clean": "scientific_name",
        "TOPMN": "temp_opt_min",
        "TOPMX": "temp_opt_max",
        "TMIN": "temp_abs_min",
        "TMAX": "temp_abs_max",
        "ROPMN": "rain_opt_min",
        "ROPMX": "rain_opt_max",
        "RMIN": "rain_abs_min",
        "RMAX": "rain_abs_max",
        "PHOPMN": "ph_opt_min",
        "PHOPMX": "ph_opt_max",
        "PHMIN": "ph_abs_min",
        "PHMAX": "ph_abs_max",
    }
    clean_df = clean_df.rename(columns=rename_map)

    feature_cols = [
        "temp_opt_min", "temp_opt_max", "temp_abs_min", "temp_abs_max",
        "rain_opt_min", "rain_opt_max", "rain_abs_min", "rain_abs_max",
        "ph_opt_min", "ph_opt_max", "ph_abs_min", "ph_abs_max"
    ]

    # Step A: Replace 0s in pH or Temperature Max with NaN (corrupted entries in raw EcoCrop)
    for col in ["ph_opt_min", "ph_opt_max", "ph_abs_min", "ph_abs_max", "temp_opt_max", "temp_abs_max"]:
        clean_df.loc[clean_df[col] <= 0, col] = np.nan

    # Step B: Impute missing optimal bounds from absolute bounds (or vice versa)
    # Temperature (°C)
    clean_df["temp_opt_min"] = clean_df["temp_opt_min"].fillna(clean_df["temp_abs_min"] + 4.0)
    clean_df["temp_opt_max"] = clean_df["temp_opt_max"].fillna(clean_df["temp_abs_max"] - 4.0)
    clean_df["temp_abs_min"] = clean_df["temp_abs_min"].fillna(clean_df["temp_opt_min"] - 5.0)
    clean_df["temp_abs_max"] = clean_df["temp_abs_max"].fillna(clean_df["temp_opt_max"] + 5.0)

    # Rainfall (mm/year)
    clean_df["rain_opt_min"] = clean_df["rain_opt_min"].fillna(clean_df["rain_abs_min"] * 1.25)
    clean_df["rain_opt_max"] = clean_df["rain_opt_max"].fillna(clean_df["rain_abs_max"] * 0.75)
    clean_df["rain_abs_min"] = clean_df["rain_abs_min"].fillna(clean_df["rain_opt_min"] * 0.70)
    clean_df["rain_abs_max"] = clean_df["rain_abs_max"].fillna(clean_df["rain_opt_max"] * 1.35)

    # Soil pH (0 - 14 scale)
    clean_df["ph_opt_min"] = clean_df["ph_opt_min"].fillna(clean_df["ph_abs_min"] + 0.5)
    clean_df["ph_opt_max"] = clean_df["ph_opt_max"].fillna(clean_df["ph_abs_max"] - 0.5)
    clean_df["ph_abs_min"] = clean_df["ph_abs_min"].fillna(clean_df["ph_opt_min"] - 0.5)
    clean_df["ph_abs_max"] = clean_df["ph_abs_max"].fillna(clean_df["ph_opt_max"] + 0.5)

    # Step C: Enforce monotonic ordering (abs_min <= opt_min <= opt_max <= abs_max)
    for prefix in ["temp", "rain", "ph"]:
        o_min, o_max = f"{prefix}_opt_min", f"{prefix}_opt_max"
        a_min, a_max = f"{prefix}_abs_min", f"{prefix}_abs_max"

        # Swap if min > max in raw data
        swap_opt = clean_df[o_min] > clean_df[o_max]
        clean_df.loc[swap_opt, [o_min, o_max]] = clean_df.loc[swap_opt, [o_max, o_min]].values

        # Clamp absolute bounds outside optimal bounds
        clean_df[a_min] = np.minimum(clean_df[a_min], clean_df[o_min])
        clean_df[a_max] = np.maximum(clean_df[a_max], clean_df[o_max])

    # Step D: Clip to realistic ASEAN physical ranges
    clean_df[["ph_abs_min", "ph_opt_min", "ph_opt_max", "ph_abs_max"]] = (
        clean_df[["ph_abs_min", "ph_opt_min", "ph_opt_max", "ph_abs_max"]].clip(3.0, 9.5).round(1)
    )
    clean_df[["temp_abs_min", "temp_opt_min", "temp_opt_max", "temp_abs_max"]] = (
        clean_df[["temp_abs_min", "temp_opt_min", "temp_opt_max", "temp_abs_max"]].clip(0.0, 50.0).round(1)
    )
    clean_df[["rain_abs_min", "rain_opt_min", "rain_opt_max", "rain_abs_max"]] = (
        clean_df[["rain_abs_min", "rain_opt_min", "rain_opt_max", "rain_abs_max"]].clip(100.0, 8000.0).round(0)
    )

    # Select and order final columns
    final_cols = [
        "crop_name_en", "crop_name_mm", "scientific_name", "category",
        "ph_opt_min", "ph_opt_max", "ph_abs_min", "ph_abs_max",
        "rain_opt_min", "rain_opt_max", "rain_abs_min", "rain_abs_max",
        "temp_opt_min", "temp_opt_max", "temp_abs_min", "temp_abs_max"
    ]
    clean_df = clean_df[final_cols].sort_values(["category", "crop_name_en"]).reset_index(drop=True)
    return clean_df


def generate_ml_training_samples(clean_df: pd.DataFrame, samples_per_crop: int = 120) -> pd.DataFrame:
    """
    Converts the cleaned min/max range table into a sample-level ML dataset
    (columns: temperature, rainfall, ph, label, label_mm, category)
    ready for Random Forest / XGBoost training.
    """
    print(f"3. Generating {samples_per_crop} synthetic training samples per crop...")
    rng = np.random.default_rng(seed=42)
    records = []

    for _, row in clean_df.iterrows():
        # 85% of samples drawn from the Optimal range, 15% from the broader Tolerable (Absolute) range
        n_opt = int(samples_per_crop * 0.85)
        n_tol = samples_per_crop - n_opt

        ph_samples = np.concatenate([
            rng.uniform(row["ph_opt_min"], row["ph_opt_max"], n_opt),
            rng.uniform(row["ph_abs_min"], row["ph_abs_max"], n_tol)
        ])
        rain_samples = np.concatenate([
            rng.uniform(row["rain_opt_min"], row["rain_opt_max"], n_opt),
            rng.uniform(row["rain_abs_min"], row["rain_abs_max"], n_tol)
        ])
        temp_samples = np.concatenate([
            rng.uniform(row["temp_opt_min"], row["temp_opt_max"], n_opt),
            rng.uniform(row["temp_abs_min"], row["temp_abs_max"], n_tol)
        ])

        for ph, rain, temp in zip(ph_samples, rain_samples, temp_samples):
            records.append({
                "ph": round(float(ph), 2),
                "rainfall": round(float(rain), 1),
                "temperature": round(float(temp), 2),
                "label": row["crop_name_en"],
                "label_mm": row["crop_name_mm"],
                "scientific_name": row["scientific_name"],
                "category": row["category"]
            })

    ml_df = pd.DataFrame(records)
    return ml_df.sample(frac=1.0, random_state=42).reset_index(drop=True)


if __name__ == "__main__":
    ECOCROP_URL = "https://raw.githubusercontent.com/OpenCLIM/ecocrop/main/EcoCrop_DB.csv"

    # Step 1: Extract Top 50 ASEAN crops
    raw_asean_df = load_and_extract_asean_crops(ECOCROP_URL)

    # Step 2: Clean & standardize ranges (Rule-Based Lookup Table)
    clean_asean_df = clean_biophysical_features(raw_asean_df)
    clean_asean_df.to_csv("ASEAN_Top50_Crop_Rules_Cleaned.csv", index=False, encoding="utf-8-sig")
    print(f"Saved cleaned reference table: ASEAN_Top50_Crop_Rules_Cleaned.csv ({len(clean_asean_df)} crops)")

    # Step 3: Generate ML-ready tabular dataset (6,000 rows = 50 crops x 120 samples)
    ml_training_df = generate_ml_training_samples(clean_asean_df, samples_per_crop=120)
    ml_training_df.to_csv("ASEAN_Top50_Crop_Training_Data.csv", index=False, encoding="utf-8-sig")
    print(f"Saved ML training dataset: ASEAN_Top50_Crop_Training_Data.csv ({len(ml_training_df)} rows)")