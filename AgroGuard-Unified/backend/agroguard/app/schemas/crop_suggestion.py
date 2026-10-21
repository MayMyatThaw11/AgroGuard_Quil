from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.base import APIModel


class CropSuggestionRequest(BaseModel):
    soil_ph: float = Field(alias="soil_pH", ge=0, le=14)
    rainfall_mm: float = Field(ge=0)
    temperature_c: float = Field(ge=-50, le=70)
    language: Literal["en", "my"] = "en"


class ModelInfo(APIModel):
    """What the suggestion is, so a screen can say so instead of implying more."""

    name: str
    trained_on: str
    # False until the model is scored on real field outcomes.
    validated_on_field_data: bool
    # The scores rank crops against each other (the top one is always near the top of the
    # scale); they are not a probability of success.
    score_is_probability: bool


class CropSuggestionResponse(APIModel):
    crop: str
    confidence_percent: float = Field(ge=0, le=100)
    recommendations: list["CropRecommendation"]
    model_info: ModelInfo


class CropRecommendation(APIModel):
    crop: str
    crop_key: str
    suitability_percent: float = Field(ge=0, le=100)
    market_price_mmk_per_kg: float = Field(ge=0)
    yield_per_acre_kg: float = Field(ge=0)
    description: str
    price_usd_per_kg: float = Field(default=0, ge=0)
    price_mmk_per_viss: int = Field(default=0, ge=0)
    est_gross_revenue_usd_per_ha: float = Field(default=0, ge=0)
    price_source: str = ""


class PlantSuggestionRequest(CropSuggestionRequest):
    field_area_acres: float = Field(default=1, gt=0, le=100_000)


class PlantRecommendation(APIModel):
    name: str
    match_score: float = Field(ge=0, le=100)
    estimated_capacity: int = Field(ge=0)
    description: str
    market_price_mmk_per_kg: str


class PlantSuggestionResponse(APIModel):
    recommendations: list[PlantRecommendation]
