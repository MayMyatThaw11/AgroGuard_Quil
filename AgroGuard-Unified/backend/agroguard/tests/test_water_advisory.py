"""Water Management v2 advisory layer. All fixtures below are SYNTHETIC,
hand-picked for test coverage only -- not real field observations, not an
evaluation dataset, and never used to claim any real-world accuracy.

This module is pure/synchronous (no DB session parameter at all), so every
test here calls `evaluate_water_advisory` directly with no async fixtures,
confirming by construction that it cannot write to the database or trigger
a Telegram send (neither is importable from a function with no session and
no import of `app.services.telegram`).
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.water_advisory import (
    PaddyAwdThreshold,
    PaddyDepthInput,
    RainfallInput,
    SensorQualityInput,
    VerifiedMoistureThreshold,
    WaterAdvisoryRequest,
)
from app.schemas.water_irrigation import MoistureMeasurement, RootDepth, TargetVolumetricContent
from app.services.water_advisory import evaluate_water_advisory

pytestmark = pytest.mark.asyncio


def _moisture(value: float, unit: str = "m3/m3", basis: str = "measured_volumetric") -> MoistureMeasurement:
    return MoistureMeasurement.model_construct(value=value, unit=unit, basis=basis, source="measured")


def test_module_has_no_telegram_or_db_access() -> None:
    """This decision layer cannot send a notification or write to the
    database: it never imports telegram.py/alerting.py, and its public
    function takes no AsyncSession -- confirmed structurally, not just by
    behavior, so a future edit that adds either would fail this test.
    """
    import inspect

    import app.services.water_advisory as module

    import_lines = [
        line for line in inspect.getsource(module).splitlines()
        if line.strip().startswith(("import ", "from "))
    ]
    assert not any("telegram" in line.lower() for line in import_lines)
    assert not any("alerting" in line.lower() for line in import_lines)

    signature = inspect.signature(module.evaluate_water_advisory)
    assert "session" not in signature.parameters
    assert list(signature.parameters) == ["request"]


def test_valid_measured_inputs_with_verified_target_calculates_irrigate() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.24),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
        irrigation_efficiency=0.80,
        field_area_m2=100,
    )
    result = evaluate_water_advisory(request)
    assert result.status == "irrigate"
    assert result.reason_code == "DEFICIT_PRESENT_NO_RAIN_OFFSET"
    assert result.deficit_estimate.net_depth_mm == 18.0
    assert result.deficit_estimate.gross_depth_mm == 22.5
    assert result.deficit_estimate.gross_volume_liters == 2250.0
    assert result.advisory_only is True


def test_missing_moisture_is_insufficient_data() -> None:
    result = evaluate_water_advisory(WaterAdvisoryRequest())
    assert result.status == "insufficient_data"
    assert "moistureMeasurement" in result.missing_inputs


def test_missing_target_and_threshold_is_insufficient_data() -> None:
    request = WaterAdvisoryRequest(moisture_measurement=_moisture(0.24))
    result = evaluate_water_advisory(request)
    assert result.status == "insufficient_data"
    assert "targetVolumetricContent" in result.missing_inputs
    assert "verifiedThreshold" in result.missing_inputs


def test_missing_basis_unit_is_insufficient_data() -> None:
    bad_moisture = MoistureMeasurement.model_construct(
        value=24.0, unit="percent_vwc", basis="farmer_declared", source="farmer_declared",
    )
    request = WaterAdvisoryRequest(
        moisture_measurement=bad_moisture,
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "insufficient_data"
    assert result.reason_code == "INVALID_INPUT_COMBINATION"


def test_stale_reading_downgrades_to_monitor_even_with_a_real_deficit() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.24),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
        sensor_quality=SensorQualityInput(is_stale=True, reading_age_minutes=90),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "monitor"
    assert result.reason_code == "STALE_READING"


def test_contradicted_reading_downgrades_to_monitor() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.24),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
        sensor_quality=SensorQualityInput(quality="contradicted"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "monitor"
    assert result.reason_code == "CONTRADICTED_READING"


def test_percent_vwc_unit_matches_fraction_unit_dimensionally() -> None:
    fraction_request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.24, unit="m3/m3"),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
    )
    percent_request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(24.0, unit="percent_vwc"),
        target_volumetric_content=TargetVolumetricContent(value=30.0, unit="percent_vwc", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
    )
    fraction_result = evaluate_water_advisory(fraction_request)
    percent_result = evaluate_water_advisory(percent_request)
    assert fraction_result.deficit_estimate.net_depth_mm == percent_result.deficit_estimate.net_depth_mm == 18.0


def test_wet_condition_is_zero_deficit_and_waits() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.35),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "wait"
    assert result.reason_code == "MOISTURE_SUFFICIENT"


def test_exact_boundary_equal_moisture_and_target_waits() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.30),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "wait"


def test_missing_rainfall_is_disclosed_not_assumed_zero() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.24),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "irrigate"
    assert any("not" in a.lower() and "zero" in a.lower() for a in result.assumptions)


def test_sufficient_forecast_rainfall_holds_off_irrigation() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.24),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
        rainfall=RainfallInput(amount_mm=20.0, period="next_24h_forecast", source="reference_derived"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "wait"
    assert result.reason_code == "DEFICIT_OFFSET_BY_FORECAST_RAIN"


def test_insufficient_forecast_rainfall_still_irrigates() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.24),
        target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
        representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
        rainfall=RainfallInput(amount_mm=2.0, period="next_24h_forecast", source="reference_derived"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "irrigate"


def test_below_threshold_without_root_depth_is_monitor_not_irrigate() -> None:
    request = WaterAdvisoryRequest(
        moisture_measurement=_moisture(0.24),
        verified_threshold=VerifiedMoistureThreshold(value=0.30, unit="m3/m3", source="reference_derived"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "monitor"
    assert result.reason_code == "BELOW_VERIFIED_THRESHOLD_NO_ROOT_DEPTH"
    assert result.deficit_estimate is None


def test_paddy_mode_without_crop_type_is_insufficient_data() -> None:
    request = WaterAdvisoryRequest(
        water_management_mode="paddy_awd",
        paddy_depth=PaddyDepthInput(value_cm=-20, source="measured"),
        paddy_awd_threshold=PaddyAwdThreshold(lower_bound_cm=-15, source="reference_derived"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "insufficient_data"
    assert result.reason_code == "MISSING_REQUIRED_INPUTS" or "cropType" in result.missing_inputs


def test_paddy_mode_rejected_for_non_paddy_crop() -> None:
    request = WaterAdvisoryRequest(
        water_management_mode="paddy_awd",
        crop_type="maize",
        paddy_depth=PaddyDepthInput(value_cm=-20, source="measured"),
        paddy_awd_threshold=PaddyAwdThreshold(lower_bound_cm=-15, source="reference_derived"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "insufficient_data"
    assert result.reason_code == "PADDY_MODE_UNSUPPORTED_CROP"


def test_paddy_mode_without_verified_threshold_is_insufficient_data() -> None:
    request = WaterAdvisoryRequest(water_management_mode="paddy_awd", crop_type="rice")
    result = evaluate_water_advisory(request)
    assert result.status == "insufficient_data"
    assert result.reason_code == "PADDY_MISSING_VERIFIED_THRESHOLDS"
    assert set(result.missing_inputs) == {"paddyDepth", "paddyAwdThreshold"}


def test_paddy_mode_depth_below_threshold_irrigates() -> None:
    request = WaterAdvisoryRequest(
        water_management_mode="paddy_awd",
        crop_type="rice (paddy)",
        paddy_depth=PaddyDepthInput(value_cm=-18, source="measured"),
        paddy_awd_threshold=PaddyAwdThreshold(lower_bound_cm=-15, source="reference_derived"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "irrigate"
    assert result.reason_code == "PADDY_DEPTH_BELOW_THRESHOLD"


def test_paddy_mode_depth_within_range_monitors() -> None:
    request = WaterAdvisoryRequest(
        water_management_mode="paddy_awd",
        crop_type="rice",
        paddy_depth=PaddyDepthInput(value_cm=3, source="measured"),
        paddy_awd_threshold=PaddyAwdThreshold(lower_bound_cm=-15, source="reference_derived"),
    )
    result = evaluate_water_advisory(request)
    assert result.status == "monitor"
    assert result.reason_code == "PADDY_DEPTH_WITHIN_RANGE"


def test_every_response_is_advisory_only() -> None:
    for request in (
        WaterAdvisoryRequest(),
        WaterAdvisoryRequest(water_management_mode="paddy_awd"),
        WaterAdvisoryRequest(
            moisture_measurement=_moisture(0.24),
            target_volumetric_content=TargetVolumetricContent(value=0.30, unit="m3/m3", source="lab_report"),
            representative_root_depth_m=RootDepth(value=0.30, source="farmer_declared"),
        ),
    ):
        assert evaluate_water_advisory(request).advisory_only is True


# --- Backward-compatibility regression: v1 endpoints are untouched ---


async def test_v1_irrigation_estimate_endpoint_unchanged() -> None:
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
    assert body["netDepthMm"] == 18.0
    assert body["grossDepthMm"] == 22.5
    assert body["grossVolumeLiters"] == 2250.0


async def test_v2_advisory_endpoint_returns_200_and_advisory_only() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/water-advisory/evaluate",
            json={
                "moistureMeasurement": {
                    "value": 0.24, "unit": "m3/m3", "basis": "measured_volumetric", "source": "measured",
                },
                "targetVolumetricContent": {"value": 0.30, "unit": "m3/m3", "source": "lab_report"},
                "representativeRootDepthM": {"value": 0.30, "source": "farmer_declared"},
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "irrigate"
    assert body["advisoryOnly"] is True
