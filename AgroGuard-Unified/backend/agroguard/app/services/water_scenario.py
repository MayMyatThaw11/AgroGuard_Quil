from app.schemas.water_scenario import WaterScenarioRequest, WaterScenarioResponse

# No verified irrigation rate, evapotranspiration time series, or soil
# hydraulic parameters exist anywhere in AgroGuard's data model today.
# Hold/Irrigate/Dry therefore stay unavailable rather than producing an
# illustrative numerical trajectory that would misrepresent a guess as a
# physically defensible simulation. Revisit once those inputs are captured.
UNAVAILABLE_REASON = (
    "What-if scenario simulation requires verified irrigation-rate, "
    "evapotranspiration, and soil hydraulic parameters that are not yet "
    "captured anywhere in AgroGuard's data model. No numerical scenario "
    "points are computed to avoid presenting a guess as a validated "
    "simulation."
)


def get_water_scenarios(field_id: int, request: WaterScenarioRequest) -> WaterScenarioResponse:
    return WaterScenarioResponse(
        field_id=field_id,
        requested_scenarios=request.scenarios,
        status="unavailable",
        reason=UNAVAILABLE_REASON,
    )
