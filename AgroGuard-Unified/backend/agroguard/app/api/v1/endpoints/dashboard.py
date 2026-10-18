from fastapi import APIRouter, status
from pymongo.errors import ConnectionFailure

from app.db.mongo import health_updates
from app.schemas.dashboard import (
    CropDistribution,
    DashboardResponse,
    OverviewStats,
    YieldByCrop,
)

router = APIRouter(tags=["dashboard"])


@router.get(
    "/dashboard/stats",
    response_model=DashboardResponse,
    status_code=status.HTTP_200_OK,
    summary="Get dashboard overview statistics",
)
async def get_dashboard_stats():
    # Health update records now live in MongoDB; show 0 rather than failing
    # the whole dashboard when it isn't running.
    try:
        total_records = await health_updates().count_documents({})
    except ConnectionFailure:
        total_records = 0

    return DashboardResponse(
        overview=OverviewStats(
            townships=112,
            records=total_records,
            yield_="3.6",
            rainfall="184",
        ),
        cropDistribution=[
            CropDistribution(crop="Rice", percent=42),
            CropDistribution(crop="Maize", percent=23),
            CropDistribution(crop="Pulses", percent=19),
            CropDistribution(crop="Sesame", percent=16),
        ],
        yieldByCrop=[
            YieldByCrop(crop="Rice", yield_=4.1),
            YieldByCrop(crop="Maize", yield_=3.2),
            YieldByCrop(crop="Pulses", yield_=2.6),
            YieldByCrop(crop="Sesame", yield_=1.9),
        ],
    )
