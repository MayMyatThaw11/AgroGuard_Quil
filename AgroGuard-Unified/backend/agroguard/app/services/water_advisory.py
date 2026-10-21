"""Water Management v2: a backward-compatible, advisory-only irrigation
decision layer.

This module adds nothing to the existing v1 surface (`water_irrigation.py`,
`water_forecast.py`, `water_scenario.py`, `assessment.py`/`alerting.py`) --
it is a new, additive, opt-in function and endpoint. v1 stays the default
and is unchanged by this file.

Design:
- Pure, synchronous, no DB access. The caller already has (or doesn't have)
  sensor-quality/staleness/rainfall information and passes it in as typed,
  provenance-tagged input -- this module never invents it and never fetches
  it itself, so it is trivially unit-testable with synthetic fixtures.
- Reuses `water_irrigation.estimate_irrigation` for the one piece of real
  math that already exists (root-zone volumetric deficit) rather than
  recomputing it. This module adds only the *rule layer* around it:
  which inputs are present, whether a stale/contradicted reading should
  block a recommendation, whether forecast rainfall should hold off an
  irrigate call, and the separate (and separately gated) paddy AWD path.
- Every branch that would need a crop-specific agronomic constant this
  codebase does not have (a default AWD threshold, a default crop/stage
  moisture target, a default rainfall-offset fraction) instead returns
  `insufficient_data` naming exactly what is missing. Nothing here invents
  a number to fill that gap.
"""

from app.schemas.water_advisory import WaterAdvisoryRequest, WaterAdvisoryResponse
from app.schemas.water_irrigation import (
    IrrigationEstimateRequest,
)
from app.services.water_irrigation import (
    IrrigationValidationError,
    _to_vwc,
    estimate_irrigation,
)

ADVISORY_ONLY = True


def _paddy_advisory(request: WaterAdvisoryRequest) -> WaterAdvisoryResponse:
    """Paddy AWD path. Entirely separate units (cm depth) and separate
    vetted threshold from the upland volumetric-moisture path -- never
    reachable by converting a percentage, and never defaulted to a
    built-in -15 cm (or any other) bound.
    """
    missing: list[str] = []

    crop_type = (request.crop_type or "").strip().lower()
    if not crop_type:
        missing.append("cropType")
    elif "rice" not in crop_type and "paddy" not in crop_type:
        return WaterAdvisoryResponse(
            status="insufficient_data",
            reason_code="PADDY_MODE_UNSUPPORTED_CROP",
            reason=(
                f"waterManagementMode is 'paddy_awd' but cropType ('{request.crop_type}') "
                "does not identify a paddy/rice crop. AWD water-depth logic is never applied "
                "to a crop that has not been explicitly identified as paddy."
            ),
            reason_my="ဤ cropType သည် paddy/rice ဖြစ်ကြောင်း အတည်မပြုနိုင်သောကြောင့် AWD ယန္တရားကို အသုံးမပြုပါ။",
            inputs_used={"cropType": request.crop_type, "waterManagementMode": request.water_management_mode},
            data_quality="unknown",
            advisory_only=ADVISORY_ONLY,
        )

    if request.paddy_depth is None:
        missing.append("paddyDepth")
    if request.paddy_awd_threshold is None:
        missing.append("paddyAwdThreshold")

    if missing:
        return WaterAdvisoryResponse(
            status="insufficient_data",
            reason_code="PADDY_MISSING_VERIFIED_THRESHOLDS",
            reason=(
                "Paddy AWD mode requires a measured standing-water depth and a vetted, "
                "explicitly supplied AWD threshold. No built-in default threshold (e.g. a "
                "generic -15 cm) is ever substituted. Missing: " + ", ".join(missing)
            ),
            reason_my="AWD အတွက် လိုအပ်သော အချက်အလက် မပြည့်စုံပါ — ပုံသေ threshold ကို အလိုအလျောက် အသုံးမပြုပါ။",
            inputs_used={"cropType": request.crop_type},
            missing_inputs=missing,
            data_quality="unknown",
            advisory_only=ADVISORY_ONLY,
        )

    depth = request.paddy_depth
    threshold = request.paddy_awd_threshold
    inputs_used = {
        "paddyDepthCm": {"value": depth.value_cm, "source": depth.source},
        "paddyAwdThresholdCm": {"value": threshold.lower_bound_cm, "source": threshold.source},
    }

    if depth.value_cm <= threshold.lower_bound_cm:
        return WaterAdvisoryResponse(
            status="irrigate",
            reason_code="PADDY_DEPTH_BELOW_THRESHOLD",
            reason=(
                f"Standing-water depth ({depth.value_cm} cm) has reached or dropped below the "
                f"supplied AWD threshold ({threshold.lower_bound_cm} cm)."
            ),
            reason_my=f"ရေအနက် ({depth.value_cm} cm) သည် သတ်မှတ် AWD အဆင့် ({threshold.lower_bound_cm} cm) သို့ ရောက်ရှိနေသည်။",
            inputs_used=inputs_used,
            data_quality="high",
            assumptions=[
                "No verified upper (stop-irrigating) depth was supplied, so this advisory "
                "only signals when to start re-flooding, not when to stop.",
            ],
            advisory_only=ADVISORY_ONLY,
        )

    return WaterAdvisoryResponse(
        status="monitor",
        reason_code="PADDY_DEPTH_WITHIN_RANGE",
        reason=(
            f"Standing-water depth ({depth.value_cm} cm) is above the supplied AWD threshold "
            f"({threshold.lower_bound_cm} cm); continue monitoring."
        ),
        reason_my=f"ရေအနက် ({depth.value_cm} cm) သည် AWD အဆင့်ထက် မြင့်နေသည်; ဆက်လက်စောင့်ကြည့်ပါ။",
        inputs_used=inputs_used,
        data_quality="high",
        advisory_only=ADVISORY_ONLY,
    )


def _sensor_quality_veto(request: WaterAdvisoryRequest) -> WaterAdvisoryResponse | None:
    """A stale or contradicted reading can downgrade a would-be `irrigate`
    to `monitor`, but it is applied by the caller (`evaluate_water_advisory`)
    after a status is computed, not here -- this only builds the shared
    reason text for that downgrade.
    """
    sq = request.sensor_quality
    if sq is None:
        return None
    if sq.is_stale:
        return WaterAdvisoryResponse(
            status="monitor",
            reason_code="STALE_READING",
            reason=(
                f"The moisture reading is flagged stale"
                + (f" ({sq.reading_age_minutes:.0f} minutes old)" if sq.reading_age_minutes is not None else "")
                + "; downgraded to monitor rather than acting on a reading that may no longer "
                "reflect field conditions."
            ),
            reason_my="ဖတ်ရှုချက်မှာ ရက်ကြာနေသောကြောင့် 'စောင့်ကြည့်ရန်' အဆင့်သို့ ပြောင်းထားသည်။",
            data_quality="low",
            advisory_only=ADVISORY_ONLY,
        )
    if sq.quality == "contradicted":
        return WaterAdvisoryResponse(
            status="monitor",
            reason_code="CONTRADICTED_READING",
            reason=(
                "Other nearby readings disagree with this one; downgraded to monitor rather "
                "than acting on a contradicted measurement."
            ),
            reason_my="အနီးအနား ဖတ်ရှုချက်များ မကိုက်ညီသောကြောင့် 'စောင့်ကြည့်ရန်' အဆင့်သို့ ပြောင်းထားသည်။",
            data_quality="low",
            advisory_only=ADVISORY_ONLY,
        )
    return None


def _rain_holds_off_irrigation(request: WaterAdvisoryRequest, net_depth_mm: float) -> bool:
    """A verified safety safeguard, not a fabricated one: this only ever
    compares two measurements in the same unit (mm of water). It never
    assumes missing rainfall is zero -- a caller who omits `rainfall`
    simply does not get this safeguard applied, and that omission is
    disclosed in `assumptions`, never silently treated as "no rain".
    """
    rain = request.rainfall
    if rain is None or net_depth_mm <= 0:
        return False
    return rain.amount_mm >= net_depth_mm


def evaluate_water_advisory(request: WaterAdvisoryRequest) -> WaterAdvisoryResponse:
    if request.water_management_mode == "paddy_awd":
        return _paddy_advisory(request)

    # --- Upland root-zone path ---
    assumptions: list[str] = []
    if request.rainfall is None:
        assumptions.append(
            "No rainfall input was supplied; this is NOT treated as zero rainfall -- the "
            "rain-hold safeguard simply does not run."
        )

    moisture = request.moisture_measurement
    if moisture is None:
        return WaterAdvisoryResponse(
            status="insufficient_data",
            reason_code="MISSING_REQUIRED_INPUTS",
            reason="No current moisture measurement was supplied.",
            reason_my="လက်ရှိ မြေဆီအစိုဓာတ် တိုင်းတာချက် မရှိပါ။",
            missing_inputs=["moistureMeasurement"],
            data_quality="unknown",
            assumptions=assumptions,
            advisory_only=ADVISORY_ONLY,
        )

    if moisture.basis != "measured_volumetric":
        return WaterAdvisoryResponse(
            status="insufficient_data",
            reason_code="INVALID_INPUT_COMBINATION",
            reason=(
                "moistureMeasurement.basis must be 'measured_volumetric' -- a raw sensor or "
                "manual percentage without a verified volumetric basis cannot drive an "
                "irrigation decision."
            ),
            reason_my="volumetric အခြေခံ မရှိသော ဖတ်ရှုချက်ဖြင့် ဆုံးဖြတ်ချက် ချမှတ်၍ မရပါ။",
            missing_inputs=["moistureMeasurement.basis=measured_volumetric"],
            data_quality="unknown",
            assumptions=assumptions,
            advisory_only=ADVISORY_ONLY,
        )

    threshold = request.target_volumetric_content or request.verified_threshold
    if threshold is None:
        return WaterAdvisoryResponse(
            status="insufficient_data",
            reason_code="MISSING_REQUIRED_INPUTS",
            reason=(
                "No verified target/threshold moisture value was supplied (neither "
                "targetVolumetricContent nor verifiedThreshold)."
            ),
            reason_my="အတည်ပြုထားသော ပစ်မှတ် မြေဆီအစိုဓာတ် တန်ဖိုး မရှိပါ။",
            missing_inputs=["targetVolumetricContent", "verifiedThreshold"],
            data_quality="unknown",
            assumptions=assumptions,
            inputs_used={
                "moistureMeasurement": {
                    "value": moisture.value, "unit": moisture.unit, "source": moisture.source,
                },
            },
            advisory_only=ADVISORY_ONLY,
        )

    theta_current = _to_vwc(moisture.value, moisture.unit)
    theta_target = _to_vwc(threshold.value, threshold.unit)
    inputs_used = {
        "moistureMeasurement": {"value": moisture.value, "unit": moisture.unit, "source": moisture.source},
        "threshold": {"value": threshold.value, "unit": threshold.unit, "source": threshold.source},
    }

    sensor_veto = _sensor_quality_veto(request)

    if theta_current >= theta_target:
        if sensor_veto is not None:
            return sensor_veto
        return WaterAdvisoryResponse(
            status="wait",
            reason_code="MOISTURE_SUFFICIENT",
            reason="Current moisture already meets or exceeds the verified threshold.",
            reason_my="လက်ရှိ မြေဆီအစိုဓာတ်သည် ပစ်မှတ်ကို ပြီးမြောက်ပြီးဖြစ်သည်။",
            inputs_used=inputs_used,
            data_quality="high",
            assumptions=assumptions,
            advisory_only=ADVISORY_ONLY,
        )

    # Below threshold -- can we also compute a quantity? Only if the exact
    # same three inputs water_irrigation.py's v1 calculator requires are
    # present (target_volumetric_content specifically, plus root depth).
    deficit_estimate = None
    if request.target_volumetric_content is not None and request.representative_root_depth_m is not None:
        try:
            deficit_estimate = estimate_irrigation(
                IrrigationEstimateRequest(
                    moisture_measurement=moisture,
                    target_volumetric_content=request.target_volumetric_content,
                    representative_root_depth_m=request.representative_root_depth_m,
                    irrigation_efficiency=request.irrigation_efficiency,
                    field_area_m2=request.field_area_m2,
                )
            )
        except IrrigationValidationError as exc:
            return WaterAdvisoryResponse(
                status="insufficient_data",
                reason_code="INVALID_INPUT_COMBINATION",
                reason=str(exc),
                inputs_used=inputs_used,
                data_quality="unknown",
                assumptions=assumptions,
                advisory_only=ADVISORY_ONLY,
            )

    if sensor_veto is not None:
        return sensor_veto

    net_depth_mm = deficit_estimate.net_depth_mm if deficit_estimate is not None else None
    if net_depth_mm is not None and _rain_holds_off_irrigation(request, net_depth_mm):
        return WaterAdvisoryResponse(
            status="wait",
            reason_code="DEFICIT_OFFSET_BY_FORECAST_RAIN",
            reason=(
                f"A {net_depth_mm:.1f} mm deficit exists, but {request.rainfall.amount_mm} mm of "
                f"{request.rainfall.period.replace('_', ' ')} rainfall ({request.rainfall.source}) "
                "is expected to offset it. Holding off irrigation; re-check after the rain."
            ),
            reason_my="မိုးရေ ခန့်မှန်းချက်က ရေလိုအပ်ချက်ကို လွှမ်းမိုးနိုင်သောကြောင့် ရေသွင်းခြင်းကို ဆိုင်းငံ့ထားသည်။",
            inputs_used=inputs_used,
            data_quality="medium",
            assumptions=assumptions,
            deficit_estimate=deficit_estimate,
            advisory_only=ADVISORY_ONLY,
        )

    if deficit_estimate is not None:
        return WaterAdvisoryResponse(
            status="irrigate",
            reason_code="DEFICIT_PRESENT_NO_RAIN_OFFSET",
            reason=(
                f"Current moisture is below the verified threshold by a calculated "
                f"{net_depth_mm:.1f} mm root-zone deficit, with no rainfall expected to offset it."
            ),
            reason_my=f"မြေဆီအစိုဓာတ်သည် ပစ်မှတ်အောက်ရှိပြီး {net_depth_mm:.1f} mm ရေလိုအပ်ချက် ရှိသည်။",
            inputs_used=inputs_used,
            data_quality="high",
            assumptions=assumptions,
            deficit_estimate=deficit_estimate,
            advisory_only=ADVISORY_ONLY,
        )

    return WaterAdvisoryResponse(
        status="monitor",
        reason_code="BELOW_VERIFIED_THRESHOLD_NO_ROOT_DEPTH",
        reason=(
            "Current moisture is below the verified threshold, but no root depth (and/or "
            "lab-verified target) was supplied, so no deficit quantity can be calculated. "
            "Monitor and consider irrigating; add a root depth to get a specific amount."
        ),
        reason_my="မြေဆီအစိုဓာတ် ပစ်မှတ်အောက်ရှိသော်လည်း ပမာဏ တွက်ချက်ရန် အချက်အလက် မလုံလောက်ပါ။",
        inputs_used=inputs_used,
        missing_inputs=(
            ["representativeRootDepthM"] if request.representative_root_depth_m is None else []
        ) + (["targetVolumetricContent"] if request.target_volumetric_content is None else []),
        data_quality="medium",
        assumptions=assumptions,
        advisory_only=ADVISORY_ONLY,
    )
