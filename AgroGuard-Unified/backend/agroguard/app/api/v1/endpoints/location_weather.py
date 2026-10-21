from fastapi import APIRouter, HTTPException, status

from app.schemas.weather import LocationWeatherRequest, LocationWeatherResponse
from app.services.climate import ClimateUnavailableError
from app.services.weather import get_location_weather

router = APIRouter(tags=["location-weather"])


@router.post(
    "/location-weather",
    response_model=LocationWeatherResponse,
    status_code=status.HTTP_200_OK,
    summary="Get weather and soil data for a location",
)
async def location_weather(request: LocationWeatherRequest):
    try:
        data = await get_location_weather(request.latitude, request.longitude, request.language)
    except ClimateUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return LocationWeatherResponse(**data)
