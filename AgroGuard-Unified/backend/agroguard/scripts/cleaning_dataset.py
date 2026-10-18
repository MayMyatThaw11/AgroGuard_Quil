import pandas as pd
import numpy as np
from pathlib import Path

# File paths
TRAINING_CSV = "../app/data/ASEAN_Top50_Crop_Training_Data.csv"
RULES_CSV = "../app/data/ASEAN_Top50_Crop_Rules_Cleaned.csv"
OUTPUT_CSV = "../app/data/ASEAN_Top50_Crop_Training_Data_Verified.csv"


def reclean_training_dataset(training_path: str, rules_path: str, output_path: str):
    print("=" * 65)
    print("STARTING DATA CLEANING & AUDIT PIPELINE")
    print("=" * 65)

    # 1. Load datasets
    df = pd.read_csv(training_path, encoding="utf-8-sig")
    initial_rows = len(df)
    print(f"Initial row count: {initial_rows:,}")

    rules_df = None
    if Path(rules_path).exists():
        rules_df = pd.read_csv(rules_path, encoding="utf-8-sig")
        print(f"Loaded reference rules table: {len(rules_df)} crops found.")
    else:
        print("Warning: Reference rules CSV not found. Using global ASEAN bounds.")

    # -------------------------------------------------------------------------
    # STEP 1: TEXT NORMALIZATION & LABEL CONSISTENCY
    # -------------------------------------------------------------------------
    str_cols = ["label", "label_mm", "scientific_name", "category"]
    for col in str_cols:
        if col in df.columns:
            # Convert to string, strip whitespace, collapse multiple spaces, and replace blank strings with NaN
            df[col] = (
                df[col]
                .astype("string")
                .str.strip()
                .str.replace(r"\s+", " ", regex=True)
            )
            df[col] = df[col].replace({"": pd.NA, "nan": pd.NA, "None": pd.NA, "null": pd.NA})

    # Standardize scientific_name to Binomial format ("Genus species")
    if "scientific_name" in df.columns:
        df["scientific_name"] = df["scientific_name"].str.capitalize()

    # Cross-check & repair label/category inconsistencies using Rules CSV
    if rules_df is not None:
        # Build lookup dictionaries keyed by crop_name_en or scientific_name
        sci_to_en = dict(zip(rules_df["scientific_name"], rules_df["crop_name_en"]))
        en_to_mm = dict(zip(rules_df["crop_name_en"], rules_df["crop_name_mm"]))
        en_to_sci = dict(zip(rules_df["crop_name_en"], rules_df["scientific_name"]))
        en_to_cat = dict(zip(rules_df["crop_name_en"], rules_df["category"]))

        # Recover missing English label if scientific_name is present
        missing_label_mask = df["label"].isna() & df["scientific_name"].notna()
        df.loc[missing_label_mask, "label"] = df.loc[missing_label_mask, "scientific_name"].map(sci_to_en)

        # Enforce consistent Myanmar name, scientific name, and category based on English label
        valid_label_mask = df["label"].isin(en_to_mm.keys())
        df.loc[valid_label_mask, "label_mm"] = df.loc[valid_label_mask, "label"].map(en_to_mm)
        df.loc[valid_label_mask, "scientific_name"] = df.loc[valid_label_mask, "label"].map(en_to_sci)
        df.loc[valid_label_mask, "category"] = df.loc[valid_label_mask, "label"].map(en_to_cat)

    # Drop rows where the target 'label' is still missing or not in our Top 50 crops
    before_target_drop = len(df)
    df = df.dropna(subset=["label"]).copy()
    if rules_df is not None:
        df = df[df["label"].isin(rules_df["crop_name_en"])].copy()
    dropped_invalid_labels = before_target_drop - len(df)
    print(f"[Step 1] Removed {dropped_invalid_labels} rows with missing or unrecognized crop labels.")

    # -------------------------------------------------------------------------
    # STEP 2: NUMERIC TYPE COERCION & MISSING VALUE HANDLING
    # -------------------------------------------------------------------------
    num_cols = ["ph", "rainfall", "temperature"]
    for col in num_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Drop rows missing 2 or more numeric features (too corrupted to impute reliably)
    missing_num_count = df[num_cols].isna().sum(axis=1)
    heavily_missing = (missing_num_count >= 2).sum()
    df = df[missing_num_count < 2].copy()

    # Impute single missing numeric values using the crop-specific median
    imputed_counts = {}
    for col in num_cols:
        n_missing = df[col].isna().sum()
        imputed_counts[col] = n_missing
        if n_missing > 0:
            df[col] = df[col].fillna(df.groupby("label")[col].transform("median"))

    # Final dropna in case an entire crop group had NaNs
    df = df.dropna(subset=num_cols).copy()
    print(
        f"[Step 2] Dropped {heavily_missing} heavily missing rows; "
        f"imputed missing values per column: {imputed_counts}"
    )

    # -------------------------------------------------------------------------
    # STEP 3: BIOPHYSICAL INCONSISTENCY & OUTLIER CLEANING
    # -------------------------------------------------------------------------
    before_inconsistency = len(df)

    # A. Global physical impossibility filter (e.g., negative rainfall, pH <= 0 or > 14)
    global_valid_mask = (
        df["ph"].between(3.0, 9.5)
        & df["rainfall"].between(100.0, 8000.0)
        & df["temperature"].between(0.0, 50.0)
    )
    df = df[global_valid_mask].copy()

    # B. Crop-specific biological boundary check (against ASEAN_Top50_Crop_Rules_Cleaned.csv)
    if rules_df is not None:
        df = df.merge(
            rules_df[[
                "crop_name_en",
                "ph_abs_min", "ph_abs_max",
                "rain_abs_min", "rain_abs_max",
                "temp_abs_min", "temp_abs_max"
            ]],
            left_on="label",
            right_on="crop_name_en",
            how="left"
        )

        # Clip slight floating-point boundary drift or remove extreme corrupted outliers
        # If a value is wildly outside absolute bounds (>20% beyond abs_min/abs_max), drop it;
        # otherwise clamp it to [abs_min, abs_max].
        ph_wild = (df["ph"] < df["ph_abs_min"] - 1.0) | (df["ph"] > df["ph_abs_max"] + 1.0)
        rain_wild = (df["rainfall"] < df["rain_abs_min"] * 0.75) | (df["rainfall"] > df["rain_abs_max"] * 1.25)
        temp_wild = (df["temperature"] < df["temp_abs_min"] - 4.0) | (df["temperature"] > df["temp_abs_max"] + 4.0)

        df = df[~(ph_wild | rain_wild | temp_wild)].copy()

        # Clamp subtle boundary drift strictly into [abs_min, abs_max]
        df["ph"] = df["ph"].clip(lower=df["ph_abs_min"], upper=df["ph_abs_max"])
        df["rainfall"] = df["rainfall"].clip(lower=df["rain_abs_min"], upper=df["rain_abs_max"])
        df["temperature"] = df["temperature"].clip(lower=df["temp_abs_min"], upper=df["temp_abs_max"])

        # Drop temporary rule columns
        df = df.drop(columns=[
            "crop_name_en",
            "ph_abs_min", "ph_abs_max",
            "rain_abs_min", "rain_abs_max",
            "temp_abs_min", "temp_abs_max"
        ])
    else:
        # Fallback IQR outlier removal per crop if rules file isn't available
        def filter_iqr(group):
            for col in num_cols:
                q1 = group[col].quantile(0.25)
                q3 = group[col].quantile(0.75)
                iqr = q3 - q1
                group = group[group[col].between(q1 - 2.0 * iqr, q3 + 2.0 * iqr)]
            return group

        df = df.groupby("label", group_keys=False).apply(filter_iqr).copy()

    removed_inconsistent = before_inconsistency - len(df)
    print(f"[Step 3] Removed {removed_inconsistent} rows with impossible or inconsistent biophysical values.")

    # -------------------------------------------------------------------------
    # STEP 4: EXACT & NEAR-DUPLICATE REMOVAL
    # -------------------------------------------------------------------------
    # Standardize numeric precision first so floating-point noise (e.g., 6.500001 vs 6.500002) is caught
    df["ph"] = df["ph"].round(2)
    df["rainfall"] = df["rainfall"].round(1)
    df["temperature"] = df["temperature"].round(2)

    before_dedup = len(df)
    # 4A. Remove exact duplicate rows for the same crop and feature values
    df = df.drop_duplicates(subset=["ph", "rainfall", "temperature", "label"], keep="first").copy()
    exact_dups_removed = before_dedup - len(df)

    # 4B. Check for conflicting duplicates (identical pH, rainfall, and temperature assigned to the SAME crop twice)
    print(f"[Step 4] Removed {exact_dups_removed} duplicate training rows.")

    # -------------------------------------------------------------------------
    # STEP 5: FINAL VALIDATION & EXPORT
    # -------------------------------------------------------------------------
    df = df.sort_values(["category", "label", "ph"]).reset_index(drop=True)

    # Assertions to guarantee clean contract before saving
    assert df.isna().sum().sum() == 0, "Cleaning Error: NaNs still remain in DataFrame!"
    assert df.duplicated(subset=["ph", "rainfall", "temperature", "label"]).sum() == 0, "Duplicates remain!"

    df.to_csv(output_path, index=False, encoding="utf-8-sig")

    print("=" * 65)
    print("CLEANING SUMMARY")
    print("=" * 65)
    print(f"Total initial rows       : {initial_rows:,}")
    print(f"Total verified rows saved: {len(df):,}")
    print(f"Total unique crops       : {df['label'].nunique()}")
    print(f"Min/Max samples per crop : {df['label'].value_counts().min()} / {df['label'].value_counts().max()}")
    print(f"Saved clean dataset to   : {output_path}")
    print("=" * 65)

    return df


if __name__ == "__main__":
    cleaned_df = reclean_training_dataset(
        training_path=TRAINING_CSV,
        rules_path=RULES_CSV,
        output_path=OUTPUT_CSV
    )