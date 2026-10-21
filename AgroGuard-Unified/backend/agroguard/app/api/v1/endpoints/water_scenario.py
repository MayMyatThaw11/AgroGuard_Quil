from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.field import Field
from app.db.session import get_db_session
from app.schemas.water_scenario import WaterScenarioRequest, WaterScenarioResponse
from app.services.water_scenario import get_water_scenarios

router = APIRouter(tags=["water-scenarios"])


@router.post(
    "/fields/{field_id}/water-scenarios",
    response_model=WaterScenarioResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare Hold/Irrigate/Dry water scenarios for a field, when supported",
)
async def water_scenarios(
    field_id: int,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    request: WaterScenarioRequest = WaterScenarioRequest(),
):
    field = await session.get(Field, field_id)
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    return get_water_scenarios(field_id, request)
