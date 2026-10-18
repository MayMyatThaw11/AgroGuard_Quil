import pandas as pd
import numpy as np
from pathlib import Path

# 1. Verified ASEAN Market Price & Yield Baseline for the Top 50 Crops
# Format: "crop_name_en": (price_usd_per_tonne, price_volatility_pct, avg_yield_tonnes_per_ha, primary_market_tier)
# Prices reflect ASEAN regional wholesale / FOB export averages (USD / Metric Tonne)
ASEAN_TOP50_PRICE_BASELINES = {
    # --- Cereals (3) ---
    "Rice (Paddy)": (360.0, 12.0, 4.2, "High Demand Staple"),
    "Maize (Corn)": (265.0, 14.0, 5.0, "High Demand Feed/Staple"),
    "Sorghum": (250.0, 11.0, 2.8, "Regional Feed/Dryland"),

    # --- Pulses & Legumes (8) - Major Myanmar/ASEAN Export Cash Crops ---
    "Black Gram (Matpe)": (980.0, 18.0, 1.4, "Top Export Cash Crop"),
    "Mung Bean (Green Gram)": (1050.0, 16.0, 1.3, "Top Export Cash Crop"),
    "Pigeon Pea (Toor)": (920.0, 20.0, 1.3, "Top Export Cash Crop"),
    "Chickpea": (820.0, 15.0, 1.5, "High Demand Pulse"),
    "Soybean": (540.0, 14.0, 2.1, "High Demand Oil/Feed"),
    "Cowpea": (780.0, 13.0, 1.2, "Domestic & Regional Pulse"),
    "Common Bean": (890.0, 14.0, 1.6, "Regional Pulse"),
    "Lablab Bean": (760.0, 15.0, 1.3, "Domestic Pulse"),

    # --- Oilseeds (5) ---
    "Sesame": (1650.0, 19.0, 0.9, "High-Value Export Oilseed"),
    "Groundnut (Peanut)": (1280.0, 15.0, 1.8, "High-Value Domestic/Export"),
    "Sunflower": (680.0, 14.0, 1.7, "Domestic Edible Oil"),
    "Mustard Seed": (790.0, 13.0, 1.2, "Regional Oilseed"),
    "Castor Bean": (950.0, 16.0, 1.4, "Industrial Export Oilseed"),

    # --- Industrial & Plantation Crops (9) ---
    "Oil Palm": (240.0, 18.0, 18.5, "Plantation (Fresh Fruit Bunch)"),
    "Rubber": (1680.0, 22.0, 1.5, "Industrial Export (TSR20/RSS3)"),
    "Coconut": (320.0, 14.0, 6.5, "Plantation / Copra"),
    "Sugarcane": (48.0, 10.0, 65.0, "High-Volume Industrial"),
    "Cotton": (1850.0, 18.0, 1.8, "Industrial Fiber"),
    "Jute": (720.0, 14.0, 2.2, "Industrial Fiber"),
    "Coffee (Arabica)": (4600.0, 24.0, 1.1, "Premium Highland Export"),
    "Coffee (Robusta)": (3400.0, 22.0, 1.8, "High-Demand Export"),
    "Tea": (2350.0, 12.0, 2.0, "Highland Plantation"),

    # --- Root & Tuber Crops (4) ---
    "Cassava (Tapioca)": (115.0, 15.0, 22.0, "High-Volume Export Starch/Chip"),
    "Sweet Potato": (340.0, 13.0, 14.0, "Domestic Staple/Processing"),
    "Potato": (480.0, 16.0, 16.5, "High-Demand Cash Tuber"),
    "Taro": (520.0, 14.0, 11.0, "Regional Tuber"),

    # --- Tropical Fruits (11) ---
    "Durian": (3800.0, 25.0, 9.5, "Ultra-High Value Export Fruit"),
    "Mango": (850.0, 18.0, 10.0, "High-Demand Export/Domestic"),
    "Banana": (420.0, 12.0, 24.0, "High-Yield Commercial Fruit"),
    "Papaya": (390.0, 14.0, 28.0, "Fast-Return Commercial Fruit"),
    "Pineapple": (410.0, 13.0, 32.0, "Cannery & Fresh Export"),
    "Pomelo": (780.0, 15.0, 14.0, "Commercial Citrus"),
    "Mangosteen": (2100.0, 20.0, 7.5, "Premium Export Fruit"),
    "Rambutan": (920.0, 17.0, 10.5, "Commercial Tropical Fruit"),
    "Jackfruit": (460.0, 13.0, 18.0, "Processing & Fresh Market"),
    "Avocado": (1750.0, 19.0, 9.0, "High-Value Highland Fruit"),
    "Watermelon": (310.0, 22.0, 25.0, "Fast-Cash Seasonal Fruit"),

    # --- Spices, Betel & High-Value Cash Crops (6) ---
    "Chili Pepper": (2150.0, 28.0, 2.8, "High-Demand Dry/Fresh Spice"),
    "Ginger": (1180.0, 24.0, 12.0, "Export & Domestic Spice"),
    "Turmeric": (1250.0, 20.0, 4.5, "Dried Cure Spice"),
    "Black Pepper": (4800.0, 25.0, 1.8, "Premium Export Spice"),
    "Betel Nut (Areca)": (2200.0, 18.0, 2.2, "High-Value Regional Cash Crop"),
    "Cacao (Cocoa)": (5200.0, 26.0, 0.9, "High-Value Global Export"),

    # --- Commercial Vegetables (4) ---
    "Onion": (540.0, 30.0, 15.0, "Essential Culinary Cash Crop"),
    "Garlic": (1450.0, 25.0, 8.5, "High-Value Culinary Bulb"),
    "Tomato": (460.0, 28.0, 22.0, "High-Demand Fresh Market"),
    "Cabbage": (320.0, 24.0, 26.0, "High-Volume Highland/Cool Crop"),
}


def build_asean_price_dataset(
    rules_csv: str = "../app/data/ASEAN_Top50_Crop_Rules_Cleaned.csv",
    output_csv: str = "../app/data/ASEAN_Top50_Crop_Prices.csv",
    usd_to_mmk_rate: float = 4500.0  # Adjustable exchange rate for local MMK conversions
) -> pd.DataFrame:
    print("Building ASEAN Top 50 Crop Price & Profitability Dataset...")

    if Path(rules_csv).exists():
        base_df = pd.read_csv(rules_csv, encoding="utf-8-sig")[
            ["crop_name_en", "crop_name_mm", "scientific_name", "category"]
        ].copy()
    else:
        # Fallback if run standalone
        base_df = pd.DataFrame(
            [{"crop_name_en": k, "crop_name_mm": "", "scientific_name": "", "category": ""}
             for k in ASEAN_TOP50_PRICE_BASELINES.keys()]
        )

    records = []
    for _, row in base_df.iterrows():
        crop_en = row["crop_name_en"]
        price_ton, volatility, yield_ha, tier = ASEAN_TOP50_PRICE_BASELINES.get(
            crop_en, (500.0, 15.0, 3.0, "Standard Commercial")
        )

        price_usd_kg = round(price_ton / 1000.0, 2)
        # 1 Viss (ပိဿာ) = 1.63293 kg
        price_mmk_kg = round(price_usd_kg * usd_to_mmk_rate, 0)
        price_mmk_viss = round(price_mmk_kg * 1.63293, 0)

        # Estimated gross revenue per hectare (USD/ha) = Price/tonne * Avg Yield (tonnes/ha)
        est_revenue_usd_ha = round(price_ton * yield_ha, 0)

        records.append({
            "crop_name_en": crop_en,
            "crop_name_mm": row["crop_name_mm"],
            "scientific_name": row["scientific_name"],
            "category": row["category"],
            "price_usd_per_tonne": price_ton,
            "price_usd_per_kg": price_usd_kg,
            "price_mmk_per_kg": int(price_mmk_kg),
            "price_mmk_per_viss": int(price_mmk_viss),
            "price_min_usd_tonne": round(price_ton * (1 - volatility / 100.0), 1),
            "price_max_usd_tonne": round(price_ton * (1 + volatility / 100.0), 1),
            "price_volatility_pct": volatility,
            "avg_yield_tonnes_per_ha": yield_ha,
            "est_gross_revenue_usd_per_ha": int(est_revenue_usd_ha),
            "market_tier": tier,
        })

    price_df = pd.DataFrame(records).sort_values(
        by="est_gross_revenue_usd_per_ha", ascending=False
    ).reset_index(drop=True)

    price_df.to_csv(output_csv, index=False, encoding="utf-8-sig")
    print(f"Saved ASEAN Price Dataset: {output_csv} ({len(price_df)} crops)")
    return price_df


def merge_rules_with_prices(
    rules_csv: str = "../app/data/ASEAN_Top50_Crop_Rules_Cleaned.csv",
    price_csv: str = "../app/data/ASEAN_Top50_Crop_Prices.csv",
    merged_output: str = "../app/data/ASEAN_Top50_Master_Crop_Dataset.csv"
):
    """
    Merges biophysical suitability bounds (pH, rainfall, temperature) with
    ASEAN market prices and yield/revenue metrics into a single Master CSV.
    """
    if not (Path(rules_csv).exists() and Path(price_csv).exists()):
        print("Ensure both rules_csv and price_csv exist before merging.")
        return None

    rules_df = pd.read_csv(rules_csv, encoding="utf-8-sig")
    price_df = pd.read_csv(price_csv, encoding="utf-8-sig")

    master_df = pd.merge(
        rules_df,
        price_df.drop(columns=["crop_name_mm", "scientific_name", "category"]),
        on="crop_name_en",
        how="left"
    )
    master_df.to_csv(merged_output, index=False, encoding="utf-8-sig")
    print(f"Saved Master Combined Dataset: {merged_output} ({len(master_df)} rows, {len(master_df.columns)} columns)")
    return master_df


if __name__ == "__main__":
    # 1. Generate the clean Top 50 Price Dataset
    price_df = build_asean_price_dataset()

    # 2. Merge with your cleaned biophysical rules table to create a single Master Dataset
    merge_rules_with_prices()