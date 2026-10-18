import pandas as pd

def score_parameter(val: float, opt_min: float, opt_max: float, abs_min: float, abs_max: float) -> float:
    """Returns 1.0 if inside optimal range, linearly decays to 0.0 at absolute bounds."""
    if opt_min <= val <= opt_max:
        return 1.0
    elif abs_min <= val < opt_min:
        return (val - abs_min) / max(opt_min - abs_min, 1e-5)
    elif opt_max < val <= abs_max:
        return (abs_max - val) / max(abs_max - opt_max, 1e-5)
    return 0.0

def recommend_asean_crops(ph: float, rainfall: float, temperature: float, rules_csv="../app/data/ASEAN_Top50_Crop_Rules_Cleaned.csv", top_k=5):
    df = pd.read_csv(rules_csv)
    results = []

    for _, row in df.iterrows():
        s_ph = score_parameter(ph, row["ph_opt_min"], row["ph_opt_max"], row["ph_abs_min"], row["ph_abs_max"])
        s_rain = score_parameter(rainfall, row["rain_opt_min"], row["rain_opt_max"], row["rain_abs_min"], row["rain_abs_max"])
        s_temp = score_parameter(temperature, row["temp_opt_min"], row["temp_opt_max"], row["temp_abs_min"], row["temp_abs_max"])

        # Liebig's Law of the Minimum: if any single factor is 0 (impossible to grow), overall suitability is 0
        if s_ph == 0 or s_rain == 0 or s_temp == 0:
            total_score = 0.0
        else:
            # Geometric mean weights all three environmental constraints equally
            total_score = round(((s_ph * s_rain * s_temp) ** (1 / 3)) * 100, 1)

        if total_score > 0:
            results.append({
                "crop_en": row["crop_name_en"],
                "crop_mm": row["crop_name_mm"],
                "category": row["category"],
                "suitability_pct": total_score,
                "ph_score": round(s_ph * 100, 1),
                "rain_score": round(s_rain * 100, 1),
                "temp_score": round(s_temp * 100, 1)
            })

    return sorted(results, key=lambda x: x["suitability_pct"], reverse=True)[:top_k]

# Example: Central Dry Zone (Magway / Mandalay) -> pH 7.2, 850mm rain, 31°C
print(recommend_asean_crops(ph=7.2, rainfall=850, temperature=31.0))