from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.field import Field
from app.db.session import get_db_session
from app.schemas.water_forecast import WaterForecastResponse
from app.services.water_forecast import get_water_forecast

router = APIRouter(tags=["water-forecast"])


@router.get(
    "/fields/{field_id}/water-forecast",
    response_model=WaterForecastResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a soil-moisture baseline forecast for a field, when enough history exists",
)
async def water_forecast(
    field_id: int,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    field = await session.get(Field, field_id)
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    return await get_water_forecast(session, field_id)
