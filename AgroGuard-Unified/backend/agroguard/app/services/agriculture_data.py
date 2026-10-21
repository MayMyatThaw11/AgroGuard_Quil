import json
from functools import lru_cache
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


class AgricultureDatasetError(RuntimeError):
    """Raised when an imported agriculture dataset is unavailable or invalid."""


@lru_cache(maxsize=1)
def load_township_data() -> pd.DataFrame:
    path = DATA_DIR / "township_agricultural_data.csv"
    try:
        data = pd.read_csv(path)
        data["date"] = pd.to_datetime(data["date"], errors="coerce")
        return data.dropna(subset=["date"])
    except (OSError, ValueError, KeyError) as exc:
        raise AgricultureDatasetError(f"Unable to load township dataset: {path}") from exc


@lru_cache(maxsize=1)
def load_ndvi_data() -> pd.DataFrame:
    path = DATA_DIR / "mmr-ndvi-subnat-full.csv"
    columns = ["date", "adm_level", "adm_id", "PCODE", "vim", "vim_avg", "viq"]
    try:
        data = pd.read_csv(path, usecols=columns)
        data["date"] = pd.to_datetime(data["date"], errors="coerce")
        return data.dropna(subset=["date", "PCODE"])
    except (OSError, ValueError, KeyError) as exc:
        raise AgricultureDatasetError(f"Unable to load NDVI dataset: {path}") from exc


def dataset_summary() -> dict:
    township = load_township_data()
    ndvi = load_ndvi_data()
    return {
        "total_records": int(len(township)),
        "avg_yield": round(float(township["historic_yield_tons_per_ha"].mean()), 2),
        "avg_rainfall": round(float(township["rainfall_mm"].mean()), 2),
        "township_count": int(township["township"].nunique()),
        "crop_distribution": township["best_crop"].value_counts().to_dict(),
        "ndvi_avg": round(float(ndvi["vim"].mean()), 4),
        "date_range": {
            "start": ndvi["date"].min().date().isoformat(),
            "end": ndvi["date"].max().date().isoformat(),
        },
    }


def dashboard_data() -> list[dict]:
    data = load_township_data()
    grouped = (
        data.groupby("township", as_index=False)
        .agg(
            rainfall_mm=("rainfall_mm", "mean"),
            historic_yield_tons_per_ha=("historic_yield_tons_per_ha", "mean"),
        )
        .round(2)
    )
    return grouped.to_dict(orient="records")


def crop_analysis() -> dict:
    data = load_township_data()
    return {
        "crop_distribution": data["best_crop"].value_counts().to_dict(),
        "avg_yield_per_crop": (
            data.groupby("best_crop")["historic_yield_tons_per_ha"].mean().round(2).to_dict()
        ),
        "avg_price_per_crop": (
            data.groupby("best_crop")["local_grain_price"].mean().round(2).to_dict()
        ),
    }


@lru_cache(maxsize=1)
def load_regions() -> dict[str, dict]:
    """State and district names (English and Burmese) with centre points, keyed by PCODE."""
    path = DATA_DIR / "mmr_regions.csv"
    try:
        frame = pd.read_csv(path, keep_default_na=False)
    except (OSError, ValueError) as exc:
        raise AgricultureDatasetError(f"Unable to load region names: {path}") from exc
    return {
        row["pcode"]: {
            "level": row["level"],
            "state_pcode": row["state_pcode"] or None,
            "name_en": row["name_en"],
            "name_my": row["name_my"],
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
        }
        for row in frame.to_dict(orient="records")
    }


def ndvi_regions() -> list[dict]:
    """Regions that have NDVI data, with names, level and centre point for the picker."""
    data = load_ndvi_data()
    names = load_regions()
    regions = (
        data[["PCODE", "adm_id"]]
        .drop_duplicates()
        .sort_values(["PCODE", "adm_id"])
        .to_dict(orient="records")
    )
    return [{**region, **names.get(region["PCODE"], {})} for region in regions]


@lru_cache(maxsize=1)
def ndvi_boundaries() -> dict:
    """District outlines (thinned for the web) with their names, for the clickable map."""
    path = DATA_DIR / "mmr_districts.geojson"
    names = load_regions()
    try:
        source = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise AgricultureDatasetError(f"Unable to load district outlines: {path}") from exc
    for feature in source["features"]:
        pcode = feature["properties"]["pcode"]
        feature["properties"] = {
            "PCODE": pcode,
            "state_pcode": feature["properties"]["state_pcode"],
            "name_en": names.get(pcode, {}).get("name_en", pcode),
            "name_my": names.get(pcode, {}).get("name_my", pcode),
        }
    return source


def ndvi_series(pcode: str | None = None) -> dict:
    data = load_ndvi_data()
    cutoff = data["date"].max() - pd.DateOffset(years=5)
    filtered = data[data["date"] >= cutoff].copy()
    if pcode:
        filtered = filtered[filtered["PCODE"] == pcode].copy()
    filtered["month_year"] = filtered["date"].dt.to_period("M").astype(str)
    grouped = (
        filtered.groupby("month_year", as_index=False)
        .agg(vim=("vim", "mean"), viq=("viq", "mean"))
        .sort_values("month_year")
    )
    return {
        "labels": grouped["month_year"].tolist(),
        "vim": grouped["vim"].round(4).tolist(),
        "viq": grouped["viq"].round(2).tolist(),
    }


def ndvi_rainfall_correlation() -> dict:
    township = load_township_data().copy()
    ndvi = load_ndvi_data().copy()
    township["month"] = township["date"].dt.month
    ndvi["month"] = ndvi["date"].dt.month
    rainfall = township.groupby("month")["rainfall_mm"].mean()
    vegetation = ndvi.groupby("month")["vim"].mean()
    months = list(range(1, 13))
    return {
        "labels": [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ],
        "rainfall_mm": [round(float(rainfall.get(month, 0)), 2) for month in months],
        "ndvi_index": [round(float(vegetation.get(month, 0)), 4) for month in months],
    }
