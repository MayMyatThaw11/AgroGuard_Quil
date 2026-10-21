from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.field import Field
from app.db.session import get_db_session
from app.schemas.water_weather import (
    DailyWeatherDayResponse,
    WaterWeatherByLocationRequest,
    WaterWeatherResponse,
    WaterWeatherSummaryResponse,
)
from app.services.nasa_power import (
    UNITS,
    InvalidRequestError,
    NasaPowerUnavailableError,
    fetch_daily_weather,
    summarize_daily_weather,
    validate_coordinates,
)

router = APIRouter(tags=["water-weather"])


def _to_response(
    result,
    *,
    location_mode: str,
    field_id: int | None,
) -> WaterWeatherResponse:
    return WaterWeatherResponse(
        source="NASA POWER",
        dataset="daily point gridded weather estimate",
        location_mode=location_mode,
        field_id=field_id,
        latitude=result.latitude,
        longitude=result.longitude,
        start_date=result.start,
        end_date=result.end,
        time_convention="NASA POWER local solar time",
        units=UNITS,
        days=[
            DailyWeatherDayResponse(
                date=d.day,
                temperature=d.temperature,
                relative_humidity=d.relative_humidity,
                precipitation=d.precipitation,
                solar_radiation=d.solar_radiation,
            )
            for d in result.days
        ],
        warnings=result.warnings,
    )


@router.get(
    "/fields/{field_id}/water-weather",
    response_model=WaterWeatherResponse,
    status_code=status.HTTP_200_OK,
    summary="Get NASA POWER daily weather for a saved field's location",
)
async def field_water_weather(
    field_id: int,
    start: date,
    end: date,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    field = await session.get(Field, field_id)
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    try:
        validate_coordinates(field.latitude, field.longitude)
    except InvalidRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="This field's stored coordinates are invalid.",
        ) from exc

    try:
        result = await fetch_daily_weather(field.latitude, field.longitude, start, end)
    except InvalidRequestError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except NasaPowerUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return _to_response(result, location_mode="saved_field", field_id=field.id)


@router.post(
    "/water-weather/by-location",
    response_model=WaterWeatherResponse,
    status_code=status.HTTP_200_OK,
    summary="Get NASA POWER daily weather for an explicit device/browser-supplied location",
)
async def location_water_weather(request: WaterWeatherByLocationRequest):
    try:
        result = await fetch_daily_weather(
            request.latitude, request.longitude, request.start_date, request.end_date
        )
    except InvalidRequestError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except NasaPowerUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return _to_response(result, location_mode="device_location", field_id=None)


@router.post(
    "/water-weather/summary/by-location",
    response_model=WaterWeatherSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get an aggregated NASA POWER daily weather summary for an explicit location (no DB writes)",
)
async def location_water_weather_summary(request: WaterWeatherByLocationRequest):
    try:
        result = await fetch_daily_weather(
            request.latitude, request.longitude, request.start_date, request.end_date
        )
    except InvalidRequestError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except NasaPowerUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    summary = summarize_daily_weather(result)
    return WaterWeatherSummaryResponse(
        source="NASA POWER",
        dataset="daily point gridded weather estimate",
        latitude=result.latitude,
        longitude=result.longitude,
        start_date=result.start,
        end_date=result.end,
        time_convention="NASA POWER local solar time",
        units=UNITS,
        total_days=summary.total_days,
        valid_counts=summary.valid_counts,
        missing_counts=summary.missing_counts,
        total_precipitation_mm=summary.total_precipitation_mm,
        precipitation_coverage_complete=summary.precipitation_coverage_complete,
        mean_temperature_c=summary.mean_temperature_c,
        mean_relative_humidity_pct=summary.mean_relative_humidity_pct,
        mean_solar_radiation_mj_m2_day=summary.mean_solar_radiation_mj_m2_day,
        warnings=summary.warnings,
    )
