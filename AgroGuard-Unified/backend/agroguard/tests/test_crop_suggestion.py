from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_crop_suggestion() -> None:
    transport = ASGITransport(app=app)
    with patch(
        "app.api.v1.endpoints.crop_suggestion.recommend_crops",
        return_value=[
            {
                "name": "Rice",
                "name_en": "Rice",
                "match_score": 94.5,
                "market_price_mmk_per_kg": 1504,
                "yield_per_acre_kg": 1700.0,
                "description": "Rice description",
                "price_usd_per_kg": 0.33,
                "price_mmk_per_viss": 2456,
                "est_gross_revenue_usd_per_ha": 1404.0,
                "price_source": "FAOSTAT_Cleaned",
            },
            {
                "name": "Corn",
                "name_en": "Corn",
                "match_score": 88.0,
                "market_price_mmk_per_kg": 1267,
                "yield_per_acre_kg": 2023.4,
                "description": "Corn description",
                "price_usd_per_kg": 0.28,
                "price_mmk_per_viss": 2069,
                "est_gross_revenue_usd_per_ha": 1408.0,
                "price_source": "FAOSTAT_Cleaned",
            },
        ],
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/crop-suggestion",
                json={
                    "soil_pH": 6.5,
                    "rainfall_mm": 450,
                    "temperature_c": 28,
                },
            )

    assert response.status_code == 200
    assert response.json() == {
        "modelInfo": {
            "name": "ASEAN Top-50 Gaussian Naive Bayes",
            "trainedOn": (
                "synthetic samples drawn from crop range tables (FAO EcoCrop and ASEAN rules)"
            ),
            "validatedOnFieldData": False,
            "scoreIsProbability": False,
        },
        "crop": "Rice",
        "confidencePercent": 94.5,
        "recommendations": [
            {
                "crop": "Rice",
                "cropKey": "Rice",
                "suitabilityPercent": 94.5,
                "marketPriceMmkPerKg": 1504.0,
                "yieldPerAcreKg": 1700.0,
                "description": "Rice description",
                "priceUsdPerKg": 0.33,
                "priceMmkPerViss": 2456,
                "estGrossRevenueUsdPerHa": 1404.0,
                "priceSource": "FAOSTAT_Cleaned",
            },
            {
                "crop": "Corn",
                "cropKey": "Corn",
                "suitabilityPercent": 88.0,
                "marketPriceMmkPerKg": 1267.0,
                "yieldPerAcreKg": 2023.4,
                "description": "Corn description",
                "priceUsdPerKg": 0.28,
                "priceMmkPerViss": 2069,
                "estGrossRevenueUsdPerHa": 1408.0,
                "priceSource": "FAOSTAT_Cleaned",
            },
        ],
    }


@pytest.mark.asyncio
async def test_crop_suggestion_asean_prices_integration() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/crop-suggestion",
            json={
                "soil_pH": 6.5,
                "rainfall_mm": 450,
                "temperature_c": 28,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "crop" in data
    assert len(data["recommendations"]) > 0
    top_rec = data["recommendations"][0]
    # Check that prices are sourced from ASEAN_Crop_Prices_Lookup.csv
    assert top_rec["marketPriceMmkPerKg"] > 0
    assert top_rec["yieldPerAcreKg"] > 0
    assert top_rec["priceSource"] in ("FAOSTAT_Cleaned", "ASEAN_Market_Baseline")
    assert top_rec["priceUsdPerKg"] > 0


@pytest.mark.asyncio
async def test_plant_suggestions_from_dataset() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/plant-suggestions",
            json={
                "soil_pH": 6.5,
                "rainfall_mm": 100,
                "temperature_c": 28,
                "field_area_acres": 1,
            },
        )

    assert response.status_code == 200
    recommendations = response.json()["recommendations"]
    assert len(recommendations) == 3
    assert all(item["name"] for item in recommendations)
