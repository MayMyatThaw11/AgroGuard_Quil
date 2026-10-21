"""How a region's vegetation moves with its weather, from real monthly data.

Monthly NDVI (the project's satellite table) is paired with monthly rainfall and mean
temperature at the region's centre point (NASA POWER). Soil pH is left out on purpose: it does
not change month to month, so it has nothing to correlate with.

Both series follow the seasons, so a strong coefficient mostly says "both rise in the wet
season". It describes association, not cause.
"""

from typing import Any

import pandas as pd

from app.services import climate
from app.services.agriculture_data import AgricultureDatasetError, load_ndvi_data, load_regions

MIN_MONTHS = 24
YEARS = 5


async def ndvi_environment_correlation(pcode: str) -> dict[str, Any]:
    region = load_regions().get(pcode)
    if region is None:
        raise AgricultureDatasetError(f"Unknown region {pcode}")
    ndvi = load_ndvi_data()
    ndvi = ndvi[ndvi["PCODE"] == pcode]
    if ndvi.empty:
        raise AgricultureDatasetError(f"No NDVI observations for region {pcode}")
    last = ndvi["date"].max()
    ndvi = ndvi[ndvi["date"] >= last - pd.DateOffset(years=YEARS)]
    monthly_ndvi = ndvi.groupby(ndvi["date"].dt.to_period("M").astype(str))["vim"].mean()

    weather = await climate.fetch_monthly(
        region["latitude"], region["longitude"], last.year - YEARS, last.year
    )
    paired = pd.DataFrame(
        [
            {"month": m, "vim": v, "rainfall_mm": weather[m][0], "temperature_c": weather[m][1]}
            for m, v in monthly_ndvi.items()
            if m in weather
        ]
    )
    if len(paired) < MIN_MONTHS:
        raise AgricultureDatasetError(
            f"Only {len(paired)} months of NDVI and weather overlap for {pcode}; "
            f"at least {MIN_MONTHS} are needed."
        )
    correlations: dict[str, float | None] = {}
    for column in ("rainfall_mm", "temperature_c"):
        coefficient = paired["vim"].corr(paired[column])
        correlations[column] = None if pd.isna(coefficient) else round(float(coefficient), 3)
    return {
        "pcode": pcode,
        "weather_point": [round(region["latitude"], 3), round(region["longitude"], 3)],
        "source": "NASA POWER monthly weather at the region centre, and the project NDVI table",
        "sample_count": int(len(paired)),
        "period_start": str(paired["month"].min()),
        "period_end": str(paired["month"].max()),
        "correlations": correlations,
    }
