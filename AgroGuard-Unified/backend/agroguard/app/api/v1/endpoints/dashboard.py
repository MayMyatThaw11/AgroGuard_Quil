from fastapi import APIRouter, HTTPException, Query, status
from pymongo.errors import PyMongoError

from app.db.mongo import health_updates
from app.schemas.dashboard import DashboardResponse, FarmRecords, RecentUpdate
from app.services import dashboard_data

router = APIRouter(tags=["dashboard"])


async def _farm_records() -> FarmRecords:
    try:
        collection = health_updates()
        total = await collection.count_documents({})
        diseased = await collection.count_documents({"is_diseased": True})
        recent = [
            RecentUpdate(
                plant_type=doc["plant_type"],
                health_status=doc["health_status"],
                disease_name=doc.get("disease_name"),
                township=doc.get("township"),
                reported_at=doc.get("reported_at"),
            )
            async for doc in collection.find({}).sort("reported_at", -1).limit(5)
        ]
    except PyMongoError:
        return FarmRecords(available=False)
    return FarmRecords(available=True, total=total, diseased=diseased, recent=recent)


@router.get(
    "/dashboard/stats",
    response_model=DashboardResponse,
    status_code=status.HTTP_200_OK,
    summary="Dashboard figures from real data sources",
)
async def get_dashboard_stats(crop: str = Query(default=dashboard_data.DEFAULT_PRICE_CROP)):
    try:
        crops = dashboard_data.price_crops()
        return DashboardResponse(
            records=await _farm_records(),
            prices=dashboard_data.asean_prices(crop if crop in crops else crops[0]),
            price_crops=crops,
            price_crop_names_mm=dashboard_data.crop_names_mm(),
            myanmar=dashboard_data.myanmar_crops(),
        )
    except dashboard_data.DashboardDataError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
