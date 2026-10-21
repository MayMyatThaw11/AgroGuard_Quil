"""Stateless root-zone irrigation estimator. Pure unit tests (service-level)
plus endpoint tests confirming no DB involvement.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.water_irrigation import (
    IrrigationEstimateRequest,
    MoistureMeasurement,
    RootDepth,
    TargetVolumetricContent,
)
from app.services.water_irrigation import IrrigationValidationError, estimate_irrigation

pytestmark = pytest.mark.asyncio


def _full_request(**overrides):
    defaults = dict(
        moisture_measurement=MoistureMeasurement(
            value=0.24, unit="m3/m3", basis="measured_volumetric", source="measured",
        ),
        target_volumetric_content=TargetVolumetricContent(
            value=0.30, unit="m3/m3", source="lab_report",
        ),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
        irrigation_efficiency=0.80,
        field_area_m2=100,
    )
    defaults.update(overrides)
    return IrrigationEstimateRequest(**defaults)


def test_missing_all_inputs_is_insufficient_data() -> None:
    result = estimate_irrigation(IrrigationEstimateRequest())
    assert result.status == "insufficient_data"
    assert set(result.missing_inputs) == {
        "moistureMeasurement", "targetVolumetricContent", "representativeRootDepthM",
    }


def test_missing_one_input_names_only_that_one() -> None:
    request = _full_request(field_area_m2=None, irrigation_efficiency=None)
    request = request.model_copy(update={"representative_root_depth_m": None})
    result = estimate_irrigation(request)
    assert result.status == "insufficient_data"
    assert result.missing_inputs == ["representativeRootDepthM"]


def test_full_valid_inputs_match_the_brief_worked_example() -> None:
    result = estimate_irrigation(_full_request())
    assert result.status == "estimate_available"
    assert result.method == "simplified_root_zone_volumetric_deficit"
    assert result.net_depth_mm == 18.0
    assert result.gross_depth_mm == 22.5
    assert result.gross_volume_liters == 2250.0
    assert result.validated_for_farm_use is False
    assert len(result.limitations) >= 2


def test_missing_efficiency_leaves_gross_and_volume_unavailable() -> None:
    result = estimate_irrigation(_full_request(irrigation_efficiency=None, field_area_m2=None))
    assert result.status == "estimate_available"
    assert result.net_depth_mm == 18.0
    assert result.gross_depth_mm is None
    assert result.gross_volume_liters is None
    assert any("efficiency" in limitation.lower() for limitation in result.limitations)


def test_missing_area_leaves_only_volume_unavailable() -> None:
    result = estimate_irrigation(_full_request(field_area_m2=None))
    assert result.status == "estimate_available"
    assert result.gross_depth_mm == 22.5
    assert result.gross_volume_liters is None
    assert any("area" in limitation.lower() for limitation in result.limitations)


def test_percent_vwc_unit_is_converted_before_calculation() -> None:
    result = estimate_irrigation(_full_request(
        moisture_measurement=MoistureMeasurement(
            value=24.0, unit="percent_vwc", basis="measured_volumetric", source="measured",
        ),
        target_volumetric_content=TargetVolumetricContent(value=30.0, unit="percent_vwc", source="lab_report"),
    ))
    assert result.status == "estimate_available"
    assert result.net_depth_mm == 18.0


def test_non_volumetric_basis_is_refused() -> None:
    request = _full_request()
    bad_moisture = MoistureMeasurement.model_construct(
        value=24.0, unit="percent_vwc", basis="farmer_declared", source="farmer_declared",
    )
    request = request.model_copy(update={"moisture_measurement": bad_moisture})
    with pytest.raises(IrrigationValidationError):
        estimate_irrigation(request)


def test_target_at_or_below_current_reports_zero_deficit_not_an_error() -> None:
    request = _full_request(
        target_volumetric_content=TargetVolumetricContent(value=0.10, unit="m3/m3", source="lab_report"),
    )
    result = estimate_irrigation(request)
    assert result.status == "estimate_available"
    assert result.net_depth_mm == 0.0
    assert result.gross_depth_mm == 0.0
    assert result.gross_volume_liters == 0.0
    assert any("already meets or exceeds" in limitation for limitation in result.limitations)


def test_target_equal_to_current_reports_zero_deficit() -> None:
    request = _full_request(
        target_volumetric_content=TargetVolumetricContent(value=0.24, unit="m3/m3", source="lab_report"),
    )
    result = estimate_irrigation(request)
    assert result.status == "estimate_available"
    assert result.net_depth_mm == 0.0


def test_root_depth_out_of_range_is_refused() -> None:
    request = _full_request(representative_root_depth_m=RootDepth(value=10.0, source="farmer_declared"))
    with pytest.raises(IrrigationValidationError):
        estimate_irrigation(request)


def test_efficiency_out_of_range_is_refused() -> None:
    request = _full_request(irrigation_efficiency=1.5)
    with pytest.raises(IrrigationValidationError):
        estimate_irrigation(request)


def test_negative_area_is_refused() -> None:
    request = _full_request(field_area_m2=-5)
    with pytest.raises(IrrigationValidationError):
        estimate_irrigation(request)


def test_moisture_value_out_of_physical_range_is_refused() -> None:
    request = _full_request(
        moisture_measurement=MoistureMeasurement(
            value=1.5, unit="m3/m3", basis="measured_volumetric", source="measured",
        ),
    )
    with pytest.raises(IrrigationValidationError):
        estimate_irrigation(request)


# ── endpoint ────────────────────────────────────────────────────────────


async def test_endpoint_returns_insufficient_data_for_empty_body() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/water-irrigation/estimate", json={})
    assert response.status_code == 200
    assert response.json()["status"] == "insufficient_data"


async def test_endpoint_returns_422_for_invalid_combination() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/water-irrigation/estimate",
            json={
                "moistureMeasurement": {
                    "value": 0.24, "unit": "m3/m3", "basis": "measured_volumetric", "source": "measured",
                },
                "targetVolumetricContent": {"value": 0.30, "unit": "m3/m3", "source": "lab_report"},
                "representativeRootDepthM": {"value": 10.0, "source": "farmer_declared"},
            },
        )
    assert response.status_code == 422


async def test_endpoint_full_estimate_matches_worked_example() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/water-irrigation/estimate",
            json={
                "moistureMeasurement": {
                    "value": 0.24, "unit": "m3/m3", "basis": "measured_volumetric", "source": "measured",
                },
                "targetVolumetricContent": {"value": 0.30, "unit": "m3/m3", "source": "lab_report"},
                "representativeRootDepthM": {"value": 0.30, "source": "farmer_declared"},
                "irrigationEfficiency": 0.80,
                "fieldAreaM2": 100,
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "estimate_available"
    assert body["netDepthMm"] == 18.0
    assert body["grossDepthMm"] == 22.5
    assert body["grossVolumeLiters"] == 2250.0
    assert body["validatedForFarmUse"] is False
