"""Dashboard figures computed from real data files; nothing here is invented.

Every section reports where it came from and as of when, and is empty when the source
has nothing for it, so the page can say "no data" instead of guessing.
"""

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
PRICES_FILE = "FAOSTAT_ASEAN_Historical_Prices.csv"
MYANMAR_FILE = "mmr_faostat_crops_livestock_products.csv"
DEFAULT_PRICE_CROP = "Rice (Paddy)"
NAME_FILES = ("ASEAN_Top50_Crop_Prices.csv", "ASEAN_Crop_Prices_Lookup.csv")
# FAOSTAT mixes crop groups ("Cereals, primary") in with single crops; counting both would
# double the area, so groups and catch-all rows are left out.
GROUP_ROW = re.compile(r"total|primary|equivalent|n\.e\.c|^other", re.IGNORECASE)
TOP_CROPS = 6
# FAOSTAT item names, matched to the crop names in the project's price tables so their
# Burmese names can be reused. "Beans, dry" is a group with no single entry there, so its
# Burmese name is written here and needs a native check.
FAOSTAT_ALIASES = {
    "Rice": "Rice (Paddy)",
    "Maize (corn)": "Maize (Corn)",
    "Groundnuts, excluding shelled": "Groundnut (Peanut)",
    "Sesame seed": "Sesame",
    "Pigeon peas, dry": "Pigeon Pea (Toor)",
    "Soya beans": "Soybean",
}
EXTRA_MM = {"Beans, dry": "ပဲမျိုးစုံ (အခြောက်)"}


class DashboardDataError(RuntimeError):
    """A source file is missing or unreadable."""


@lru_cache(maxsize=1)
def _prices() -> pd.DataFrame:
    try:
        return pd.read_csv(DATA_DIR / PRICES_FILE, encoding="utf-8-sig")
    except (OSError, ValueError) as exc:
        raise DashboardDataError(f"Unable to load {PRICES_FILE}") from exc


@lru_cache(maxsize=1)
def _myanmar() -> pd.DataFrame:
    try:
        return pd.read_csv(
            DATA_DIR / MYANMAR_FILE, usecols=["Item", "Element", "Year", "Unit", "Value"]
        )
    except (OSError, ValueError) as exc:
        raise DashboardDataError(f"Unable to load {MYANMAR_FILE}") from exc


@lru_cache(maxsize=1)
def crop_names_mm() -> dict[str, str]:
    """Burmese crop names from the project's own price tables; a crop with none is left out."""
    names: dict[str, str] = {}
    for file in NAME_FILES:
        try:
            frame = pd.read_csv(DATA_DIR / file, encoding="utf-8-sig")
        except (OSError, ValueError):
            continue
        names.update(
            {
                en: mm
                for en, mm in zip(frame["crop_name_en"], frame["crop_name_mm"], strict=False)
                if isinstance(mm, str) and mm.strip()
            }
        )
    return names


def crop_name_mm(faostat_item: str) -> str | None:
    names = crop_names_mm()
    return names.get(FAOSTAT_ALIASES.get(faostat_item, "")) or EXTRA_MM.get(faostat_item)


def _year_columns(frame: pd.DataFrame) -> list[str]:
    return sorted(c for c in frame.columns if re.fullmatch(r"Y\d{4}", c))


def price_crops() -> list[str]:
    """Crops with a producer price in at least three ASEAN countries."""
    years = _year_columns(_prices())
    frame = _prices()
    has_price = frame[years].notna().any(axis=1)
    counts = frame[has_price].groupby("crop_name_en")["Area"].nunique()
    return sorted(counts[counts >= 3].index)


def asean_prices(crop: str = DEFAULT_PRICE_CROP) -> dict[str, Any]:
    frame = _prices()
    rows = frame[frame["crop_name_en"] == crop]
    source = "FAOSTAT producer prices (USD per tonne)"
    years = _year_columns(frame)
    countries: list[dict[str, Any]] = []
    for _, row in rows.iterrows():
        seen = [(y, row[y]) for y in years if pd.notna(row[y])]
        if seen:
            year, value = seen[-1]
            countries.append(
                {
                    "country": row["Area"],
                    "usdPerTonne": round(float(value), 1),
                    "year": int(year[1:]),
                }
            )
    countries.sort(key=lambda c: c["usdPerTonne"], reverse=True)
    trend = [
        {"year": int(y[1:]), "medianUsdPerTonne": round(float(rows[y].median()), 1)}
        for y in years
        if rows[y].notna().any()
    ]
    return {
        "crop": crop,
        "source": source,
        "countries": countries,
        "trend": trend,
        "asOf": max((c["year"] for c in countries), default=None),
    }


def myanmar_crops() -> dict[str, Any]:
    data = _myanmar()
    source = "FAOSTAT, Myanmar crop production"
    single = ~data["Item"].str.contains(GROUP_ROW)
    area = data[(data["Element"] == "Area harvested") & single]
    if area.empty:
        return {"source": source, "year": None, "crops": []}
    year = int(area["Year"].max())
    by_item = area[area["Year"] == year].groupby("Item")["Value"].sum().sort_values(ascending=False)
    yields = data[(data["Element"] == "Yield") & (data["Unit"] == "kg/ha") & (data["Year"] == year)]
    yield_by_item = yields.groupby("Item")["Value"].mean()
    total = float(by_item.sum())
    crops = [
        {
            "crop": item,
            "areaHa": round(float(ha)),
            "sharePercent": round(float(ha) / total * 100, 1),
            "cropMm": crop_name_mm(item),
            "yieldTPerHa": (
                round(float(yield_by_item[item]) / 1000, 2) if item in yield_by_item else None
            ),
        }
        for item, ha in by_item.head(TOP_CROPS).items()
    ]
    return {
        "source": source,
        "year": year,
        "totalAreaHa": round(total),
        "otherSharePercent": round(100 - sum(c["sharePercent"] for c in crops), 1),
        "crops": crops,
    }
