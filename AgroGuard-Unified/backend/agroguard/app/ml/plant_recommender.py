import logging
from functools import lru_cache
from math import exp
from pathlib import Path

import pandas as pd

from app.ml.crop_predictor import crop_predictor

logger = logging.getLogger(__name__)

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "plants.csv"
MYANMAR_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "plants_mm.csv"
TOWNSHIP_DATA_PATH = (
    Path(__file__).resolve().parents[1] / "data" / "township_agricultural_data.csv"
)
ASEAN_PRICES_PATH = (
    Path(__file__).resolve().parents[1] / "data" / "ASEAN_Crop_Prices_Lookup.csv"
)
_CROP_NAMES_MY = {
    "Rice": "စပါး",
    "Wheat": "ဂျုံ",
    "Corn": "ပြောင်း",
    "Beans": "ပဲ",
    "Sesame": "နှမ်း",
}

# Maps ASEAN Top 50 crop names to existing township_agricultural_data.csv / plants.csv keys
_MARKET_KEY_ALIASES = {
    "rice (paddy)": ["rice", "paddy"],
    "maize (corn)": ["corn", "maize"],
    "black gram (matpe)": ["beans", "black gram", "matpe"],
    "mung bean (green gram)": ["beans", "mung bean", "green gram"],
    "pigeon pea (toor)": ["beans", "pigeon pea"],
    "chickpea": ["beans", "chickpea"],
    "soybean": ["beans", "soybean"],
    "cowpea": ["beans", "cowpea"],
    "common bean": ["beans", "common bean"],
    "lablab bean": ["beans", "lablab bean"],
    "groundnut (peanut)": ["groundnut", "peanut"],
    "sesame": ["sesame"],
}


class PlantDatasetUnavailableError(RuntimeError):
    """Raised when the plants dataset cannot be read."""


@lru_cache(maxsize=1)
def _load_plants() -> pd.DataFrame:
    if not DATA_PATH.is_file():
        raise PlantDatasetUnavailableError(f"Plant dataset is missing: {DATA_PATH}")
    try:
        plants = pd.read_csv(DATA_PATH)
        plants["lowest_temp"] = pd.to_numeric(plants["lowest_temp"], errors="coerce")
        plants["highest_temp"] = pd.to_numeric(plants["highest_temp"], errors="coerce")
        plants["min_area_square_feet"] = pd.to_numeric(
            plants["min_area_square_feet"], errors="coerce"
        ).fillna(1)
        return plants.dropna(subset=["plant_name", "lowest_temp", "highest_temp"])
    except Exception as exc:
        raise PlantDatasetUnavailableError("The plants dataset is invalid.") from exc


@lru_cache(maxsize=1)
def _load_asean_prices() -> pd.DataFrame | None:
    """Load the cleaned ASEAN crop prices lookup table (cached)."""
    if not ASEAN_PRICES_PATH.is_file():
        return None
    try:
        df = pd.read_csv(ASEAN_PRICES_PATH, encoding="utf-8-sig")
        df["_key"] = df["crop_name_en"].astype(str).str.strip().str.casefold()
        return df
    except (OSError, ValueError):
        return None


def _lookup_market_and_yield(
    crop_name_en: str,
    history: pd.DataFrame,
    plants_df: pd.DataFrame | None = None,
) -> tuple[int, float, dict[str, object]]:
    """Return (price_mmk_per_kg, yield_per_acre_kg, extra_price_info).

    Primary source: ``ASEAN_Crop_Prices_Lookup.csv`` (exact ``crop_name_en``
    match).  Falls back to the township history and plants.csv datasets when the
    crop is not found in the ASEAN prices table.
    """
    base_key = crop_name_en.casefold().strip()
    stripped_paren = base_key.split("(")[0].strip()
    candidate_keys = list(
        dict.fromkeys([base_key, stripped_paren] + _MARKET_KEY_ALIASES.get(base_key, []))
    )

    extra: dict[str, object] = {}

    # ── 1. Primary: ASEAN_Crop_Prices_Lookup.csv ─────────────────────────
    asean_df = _load_asean_prices()
    if asean_df is not None:
        match = asean_df[asean_df["_key"].isin(candidate_keys)]
        if not match.empty:
            row = match.iloc[0]
            price_mmk = int(round(float(row.get("price_mmk_per_kg", 0) or 0)))
            # Convert avg_yield_tonnes_per_ha → kg/acre (1 ha ≈ 2.47105 acres)
            yield_t_ha = float(row.get("avg_yield_tonnes_per_ha", 0) or 0)
            yield_per_acre_kg = round(yield_t_ha * 1000 / 2.47105, 1)
            extra = {
                "price_usd_per_kg": float(row.get("price_usd_per_kg", 0) or 0),
                "price_mmk_per_viss": int(
                    round(float(row.get("price_mmk_per_viss", 0) or 0))
                ),
                "est_gross_revenue_usd_per_ha": float(
                    row.get("est_gross_revenue_usd_per_ha", 0) or 0
                ),
                "price_source": str(row.get("price_source", "")).strip(),
            }
            return price_mmk, yield_per_acre_kg, extra

    # ── 2. Fallback: plants.csv → township_agricultural_data.csv ─────────
    plant_price = 0
    if plants_df is not None and "Current_Market_Price_MMK_per_kg" in plants_df.columns:
        plant_matches = plants_df[
            plants_df["plant_name"].astype(str).str.strip().str.casefold().isin(candidate_keys)
        ]
        if not plant_matches.empty:
            raw_price = (
                str(plant_matches.iloc[0].get("Current_Market_Price_MMK_per_kg", ""))
                .replace(",", "")
                .strip()
            )
            try:
                plant_price = round(float(raw_price)) if raw_price else 0
            except ValueError:
                plant_price = 0

    crop_history = history[history["crop_key"].isin(candidate_keys)]
    prices = (
        pd.to_numeric(crop_history["local_grain_price"], errors="coerce").dropna()
        if "local_grain_price" in crop_history
        else pd.Series(dtype=float)
    )
    yields = (
        pd.to_numeric(crop_history["historic_yield_tons_per_ha"], errors="coerce").dropna()
        if "historic_yield_tons_per_ha" in crop_history
        else pd.Series(dtype=float)
    )

    if prices.empty and "local_grain_price" in history:
        prices = pd.to_numeric(history["local_grain_price"], errors="coerce").dropna()
    if yields.empty and "historic_yield_tons_per_ha" in history:
        yields = pd.to_numeric(history["historic_yield_tons_per_ha"], errors="coerce").dropna()

    township_price = round(float(prices.mean())) if not prices.empty else 0
    market_price = plant_price or township_price
    township_yield = round(float(yields.mean()) * 404.686, 1) if not yields.empty else 0.0

    return market_price, township_yield, extra


def recommend_plants(
    soil_ph: float,
    rainfall_mm: float,
    temperature_c: float,
    field_area_acres: float = 1,
    limit: int = 3,
    language: str = "en",
    crop_only: bool = False,
) -> list[dict[str, object]]:
    plants = _load_plants().copy()
    if crop_only:
        agricultural_uses = (
            "culinary|food|fruit|salad|spice|medicinal|juice|dessert|"
            "pickle|edible|cooking"
        )
        plants = plants[
            plants["plant_group"]
            .astype(str)
            .str.casefold()
            .isin({"vegetable", "fruit"})
            & plants["Uses"]
            .astype(str)
            .str.contains(agricultural_uses, case=False, regex=True)
            & ~plants["plant_name"]
            .astype(str)
            .str.contains("tree|wood", case=False, regex=True)
        ].copy()
    midpoint = (plants["lowest_temp"] + plants["highest_temp"]) / 2
    half_range = ((plants["highest_temp"] - plants["lowest_temp"]) / 2).clip(lower=1)
    temperature_difference = (midpoint - temperature_c).abs()
    temperature_score = 100 - (temperature_difference / half_range * 50)
    outside_range = temperature_difference > half_range
    temperature_score.loc[outside_range] = (
        50 - ((temperature_difference.loc[outside_range] - half_range.loc[outside_range]) * 15)
    )
    ph_penalty = abs(6.5 - soil_ph) * 8
    water_need = pd.to_numeric(
        plants["water_necessity (1Lcup/day)"], errors="coerce"
    ).fillna(1)
    water_penalty = ((water_need > 2) & (rainfall_mm < 20)).astype(int) * 10
    plants["match_score"] = (
        temperature_score - ph_penalty - water_penalty
    ).clip(15, 98)

    viable = plants[
        (temperature_c >= plants["lowest_temp"] - 2)
        & (temperature_c <= plants["highest_temp"] + 2)
    ]
    if viable.empty:
        viable = plants

    ranked = (
        viable.sort_values("match_score", ascending=False)
        .drop_duplicates("plant_name")
    )
    best = ranked.head(limit)
    localized: dict[object, tuple[str, str]] = {}
    if language == "my":
        try:
            myanmar = pd.read_csv(MYANMAR_DATA_PATH)
            localized = {
                row["plant_id"]: (
                    str(row["plant_name"]).strip(),
                    str(row.get("description", "")).strip(),
                )
                for _, row in myanmar.drop_duplicates("plant_id").iterrows()
            }
        except (OSError, ValueError, KeyError):
            localized = {}

    results: list[dict[str, object]] = []
    for _, plant in best.iterrows():
        minimum_area = max(float(plant["min_area_square_feet"]), 1)
        localized_name, localized_description = localized.get(
            plant.get("plant_id"),
            (
                str(plant["plant_name"]).strip(),
                str(plant.get("description", "")).strip(),
            ),
        )
        results.append(
            {
                "name": localized_name,
                "name_en": str(plant["plant_name"]).strip(),
                "match_score": round(float(plant["match_score"]), 1),
                "estimated_capacity": int(field_area_acres * 43_560 * 0.8 / minimum_area),
                "description": localized_description,
                "market_price_mmk_per_kg": str(
                    plant.get("Current_Market_Price_MMK_per_kg", "")
                ).strip(),
            }
        )
    return results


def recommend_crops(
    soil_ph: float,
    rainfall_mm: float,
    temperature_c: float,
    language: str = "en",
    limit: int = 4,
) -> list[dict[str, object]]:
    try:
        history = pd.read_csv(TOWNSHIP_DATA_PATH)
    except (OSError, ValueError) as exc:
        raise PlantDatasetUnavailableError(
            f"Township agriculture dataset is unavailable: {TOWNSHIP_DATA_PATH}"
        ) from exc

    history["crop_key"] = history["best_crop"].astype(str).str.casefold()
    try:
        plants_df = _load_plants()
    except PlantDatasetUnavailableError:
        plants_df = None

    # 1. Primary path: Use trained GaussianNB model (returns Top `limit` = 4 crops)
    try:
        gnb_result = crop_predictor.recommend(
            ph=soil_ph,
            rainfall=rainfall_mm,
            temperature=temperature_c,
            top_k=limit,
        )
        gnb_recommendations: list[dict[str, object]] = []
        for item in gnb_result["recommendations"]:
            crop_en = str(item["crop_en"])
            crop_mm = str(item.get("crop_mm") or crop_en)
            display_name = crop_mm if language == "my" else crop_en

            market_price, township_yield, extra_price = _lookup_market_and_yield(
                crop_en, history, plants_df
            )

            rec: dict[str, object] = {
                "name": display_name,
                "name_en": crop_en,
                "match_score": float(item["confidence_pct"]),
                "estimated_capacity": 0,
                "description": (
                    f"{crop_en} ({item['scientific_name']}) is recommended by the "
                    f"Gaussian Naive Bayes model for pH {soil_ph}, "
                    f"{rainfall_mm} mm rainfall, and {temperature_c}°C."
                ),
                "market_price_mmk_per_kg": market_price,
                "yield_per_acre_kg": township_yield,
            }
            rec.update(extra_price)
            gnb_recommendations.append(rec)
        if gnb_recommendations:
            return gnb_recommendations[:limit]
    except FileNotFoundError:
        # Model artifact missing: fall back to the dataset-based ranking below
        # rather than failing the request.
        logger.warning("ASEAN crop model is missing; using the dataset fallback.")

    # 2. Fallback path: plants.csv ranking plus township nearest-neighbour
    # candidates (the original recommender), priced from the ASEAN table.
    recommendations = recommend_plants(
        soil_ph,
        rainfall_mm,
        temperature_c,
        limit=10,
        language=language,
        crop_only=True,
    )
    for recommendation in recommendations:
        crop_en = str(recommendation["name_en"])
        market_price, township_yield, extra_price = _lookup_market_and_yield(
            crop_en, history, plants_df
        )
        recommendation["market_price_mmk_per_kg"] = market_price
        recommendation["yield_per_acre_kg"] = township_yield
        recommendation.update(extra_price)

    recommendations.extend(
        _township_candidates(
            history,
            soil_ph,
            rainfall_mm,
            temperature_c,
            language,
            plants_df,
            existing={str(r["name_en"]).casefold() for r in recommendations},
        )
    )

    return sorted(
        recommendations,
        key=lambda recommendation: float(recommendation["match_score"]),
        reverse=True,
    )[:limit]


def _township_candidates(
    history: pd.DataFrame,
    soil_ph: float,
    rainfall_mm: float,
    temperature_c: float,
    language: str,
    plants_df: pd.DataFrame | None,
    existing: set[str],
) -> list[dict[str, object]]:
    """Score township crops by distance to the nearest similar township records."""
    feature_names = ["soil_pH", "rainfall_mm", "temperature_c"]
    conditions = pd.Series([soil_ph, rainfall_mm, temperature_c], index=feature_names)
    scales = history[feature_names].std().replace(0, 1)
    history = history.assign(
        distance=((history[feature_names] - conditions) / scales)
        .pow(2)
        .sum(axis=1)
        .pow(0.5)
    )
    candidates: list[dict[str, object]] = []
    for crop, group in history.groupby("best_crop"):
        crop_name = str(crop)
        if crop_name.casefold() in existing:
            continue
        nearest = group.nsmallest(20, "distance")
        suitability = max(0, min(98, 99 * exp(-0.2 * float(nearest["distance"].mean()))))
        market_price, township_yield, extra_price = _lookup_market_and_yield(
            crop_name, history, plants_df
        )
        candidate: dict[str, object] = {
            "name": _CROP_NAMES_MY.get(crop_name, crop_name) if language == "my" else crop_name,
            "name_en": crop_name,
            "match_score": round(suitability, 1),
            "estimated_capacity": 0,
            "description": (
                f"{crop_name} is supported by similar township soil and climate records."
            ),
            "market_price_mmk_per_kg": market_price,
            "yield_per_acre_kg": township_yield,
        }
        candidate.update(extra_price)
        candidates.append(candidate)
    return candidates
