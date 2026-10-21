"""A stateless, data-gated root-zone irrigation depth estimator.

Deliberately not a database-backed feature: no per-field crop/soil/root-
depth/irrigation-history data exists anywhere in AgroGuard's schema today
(confirmed by inspection), so there is nothing real to persist or look up.
Every call is self-contained -- the caller supplies verified inputs with
explicit provenance, or receives `insufficient_data` naming exactly what's
missing. No DB writes, no default/invented soil or crop constants.

Method: simplified uniform root-zone volumetric-moisture deficit --
    net_depth_mm = (theta_target - theta_current) * root_depth_m * 1000
This is dimensionally a depth (m3/m3 * m = m of water, *1000 = mm), not an
on-site measurement or a validated field prescription. It is never
combined with NASA POWER rainfall/ET totals here -- that would require a
verified effective-rainfall model and time-aligned accounting that does
not exist; weather stays separate, descriptive context.
"""

from app.schemas.water_irrigation import IrrigationEstimateRequest, IrrigationEstimateResponse

MAX_PHYSICAL_POROSITY = 0.6  # m3/m3; a generous upper sanity bound, not a soil-class value
MIN_ROOT_DEPTH_M = 0.05
MAX_ROOT_DEPTH_M = 3.0
METHOD = "simplified_root_zone_volumetric_deficit"


class IrrigationValidationError(ValueError):
    """The supplied inputs are present but not a physically valid combination."""


def _to_vwc(value: float, unit: str) -> float:
    return value / 100.0 if unit == "percent_vwc" else value


def estimate_irrigation(request: IrrigationEstimateRequest) -> IrrigationEstimateResponse:
    missing = []
    if request.moisture_measurement is None:
        missing.append("moistureMeasurement")
    if request.target_volumetric_content is None:
        missing.append("targetVolumetricContent")
    if request.representative_root_depth_m is None:
        missing.append("representativeRootDepthM")
    if missing:
        return IrrigationEstimateResponse(status="insufficient_data", missing_inputs=missing)

    moisture = request.moisture_measurement
    target = request.target_volumetric_content
    root = request.representative_root_depth_m

    if moisture.basis != "measured_volumetric":
        raise IrrigationValidationError(
            "moistureMeasurement.basis must be 'measured_volumetric'; a raw sensor or manual "
            "percentage reading has no verified volumetric-water-content basis and cannot be "
            "used for a numeric irrigation estimate."
        )

    theta_current = _to_vwc(moisture.value, moisture.unit)
    theta_target = _to_vwc(target.value, target.unit)
    zr = root.value

    if not (0.0 <= theta_current <= 1.0):
        raise IrrigationValidationError(
            f"moistureMeasurement value {moisture.value} ({moisture.unit}) is out of the "
            "physically valid range"
        )
    if not (0.0 <= theta_target <= MAX_PHYSICAL_POROSITY):
        raise IrrigationValidationError(
            f"targetVolumetricContent value {target.value} ({target.unit}) is out of a "
            f"physically plausible porosity range (0-{MAX_PHYSICAL_POROSITY} m3/m3)"
        )
    if not (MIN_ROOT_DEPTH_M <= zr <= MAX_ROOT_DEPTH_M):
        raise IrrigationValidationError(
            f"representativeRootDepthM must be between {MIN_ROOT_DEPTH_M} and {MAX_ROOT_DEPTH_M} m"
        )

    gross_depth_mm = None
    volume_liters = None
    limitations = [
        "Simplified uniform root-zone moisture assumption.",
        "Not calibrated or validated for this field.",
    ]

    if theta_target <= theta_current:
        # Current moisture already meets or exceeds the verified target under
        # this simplified model: a zero deficit, never an error and never a
        # claim that irrigation should stop or that the field will stay
        # sufficient (soil moisture can still fall before the next reading).
        net_depth_mm = 0.0
        limitations.append(
            "Current moisture already meets or exceeds the verified target; the calculated "
            "deficit is 0 mm under this simplified model, not a prediction of future sufficiency."
        )
    else:
        net_depth_mm = (theta_target - theta_current) * zr * 1000.0

    if request.irrigation_efficiency is not None:
        eta = request.irrigation_efficiency
        if not (0.0 < eta <= 1.0):
            raise IrrigationValidationError("irrigationEfficiency must be in the range (0, 1]")
        gross_depth_mm = net_depth_mm / eta

        if request.field_area_m2 is not None:
            area = request.field_area_m2
            if area <= 0:
                raise IrrigationValidationError("fieldAreaM2 must be positive")
            volume_liters = gross_depth_mm * area
        else:
            limitations.append("Field area not provided; application volume (liters) unavailable.")
    else:
        limitations.append("Irrigation efficiency not provided; gross application depth/volume unavailable.")

    return IrrigationEstimateResponse(
        status="estimate_available",
        method=METHOD,
        net_depth_mm=round(net_depth_mm, 2),
        gross_depth_mm=round(gross_depth_mm, 2) if gross_depth_mm is not None else None,
        gross_volume_liters=round(volume_liters, 1) if volume_liters is not None else None,
        missing_inputs=[],
        limitations=limitations,
        validated_for_farm_use=False,
    )
