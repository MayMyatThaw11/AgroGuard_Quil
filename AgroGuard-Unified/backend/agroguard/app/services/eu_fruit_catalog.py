"""The ten-fruit catalog reused from Crop Suggestion's existing dataset, read
only -- this module never calls or modifies app.ml.plant_recommender or
app.ml.crop_predictor, and never changes their predictions. Price/yield
figures live in a separate lookup file and are intentionally not read here:
economics are never part of an export-quality decision.
"""

from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.schemas.eu_export_quality import FruitCatalogEntry

CATALOG_PATH = Path(__file__).resolve().parents[1] / "ml" / "data" / "ASEAN_Top50_Crop_Rules_Cleaned.csv"


def _slugify(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


@lru_cache(maxsize=1)
def get_fruit_catalog() -> list[FruitCatalogEntry]:
    """The real fruit subset of the existing ASEAN crop catalog, read once
    and cached. `fruit_code` is a simple slug of the English name -- there is
    no separate alias table in the source CSV today, so no alias mapping is
    invented here.
    """
    df = pd.read_csv(CATALOG_PATH, encoding="utf-8-sig")
    fruit_rows = df[df["category"].str.strip().str.lower() == "fruit"]
    return [
        FruitCatalogEntry(
            fruit_code=_slugify(row["crop_name_en"]),
            name_en=row["crop_name_en"],
            name_mm=row["crop_name_mm"],
            scientific_name=row["scientific_name"],
            source="app/ml/data/ASEAN_Top50_Crop_Rules_Cleaned.csv",
        )
        for _, row in fruit_rows.iterrows()
    ]


def get_fruit_by_code(fruit_code: str) -> FruitCatalogEntry | None:
    for fruit in get_fruit_catalog():
        if fruit.fruit_code == fruit_code:
            return fruit
    return None


def crop_name_matches_fruit(crop_name: str, fruit_code: str) -> bool:
    """Whether a lot's free-text `crop_name` (e.g. "Paw San rice", "Shwe Hin
    Thar mango") plausibly refers to the given fruit. This is a safety check,
    not a crop-identity system -- it is deliberately conservative: it only
    confirms a match when the fruit's English or scientific name actually
    appears in the lot's crop name, and returns False (never "assume
    match") for anything else, including an unknown/blank crop_name. An
    unmatched lot's lab results/certificates must never be used as evidence
    for a different fruit's EU requirements -- see
    app/services/eu_export_readiness.py.
    """
    fruit = get_fruit_by_code(fruit_code)
    if fruit is None or not crop_name:
        return False
    crop_name_lower = crop_name.strip().lower()
    return fruit.name_en.lower() in crop_name_lower or fruit.scientific_name.lower() in crop_name_lower
