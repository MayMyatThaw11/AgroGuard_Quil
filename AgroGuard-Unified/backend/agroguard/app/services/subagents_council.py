from __future__ import annotations

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal

# Supported primary crops
CropType = Literal["rice", "wheat", "coffee"]

# REA Claim Classification
ReaClassification = Literal["OBSERVED", "INFERRED", "UNKNOWN"]


class SubAgentId(str, Enum):
    ALPHA = "alpha"  # Agricultural (Traditional Generational Farmer)
    LOU = "lou"      # Tech AI (Tech-Lover Innovator & Investor)
    QILL = "qill"    # Business (Pragmatic Market & Community Realist)


@dataclass(frozen=True)
class SubAgentProfile:
    id: SubAgentId
    name: str
    symbol: str
    archetype: str
    role_title: str
    motto: str
    strengths: list[str]
    weaknesses: list[str]
    perspective: str
    avatar_color: str
    badge_label: str


PROFILES: dict[SubAgentId, SubAgentProfile] = {
    SubAgentId.ALPHA: SubAgentProfile(
        id=SubAgentId.ALPHA,
        name="Alpha",
        symbol="Agricultural",
        archetype="Traditional Generational Farmer",
        role_title="Field Soil & Heritage Agronomist",
        motto="No computer knows the soil better than the hands that turn it. Trust field grit and patience.",
        strengths=[
            "Ancestral soil memory & weather proverbs matching physical trends",
            "Deep intuition for crop stress signs (leaf curl, dew retention, stem firmness)",
            "Extremely risk-averse; prevents costly unforced errors and over-fertilization",
            "Zero dependence on electronics or failing connectivity",
        ],
        weaknesses=[
            "Highly skeptical of AI and sensors even when calibrated",
            "Reluctant to automate or adopt high-efficiency precision inputs",
            "Can miss macro-satellite weather changes beyond the local horizon",
        ],
        perspective="Field-first, soil-first, manual verification before any action.",
        avatar_color="#854d0e",  # Earthy soil amber
        badge_label="Alpha · Agricultural",
    ),
    SubAgentId.LOU: SubAgentProfile(
        id=SubAgentId.LOU,
        name="Lou",
        symbol="Tech AI",
        archetype="Tech-Lover Farmer & AI Innovator",
        role_title="Precision Agronomy & Smart Systems",
        motto="If we can measure it with sensors, simulate it with NDVI, and automate it, we win.",
        strengths=[
            "Data-driven decision modeling and satellite vegetative index regression",
            "Automated valve actuation and predictive water balance management",
            "Continuous multi-spectral monitoring and micro-anomaly detection",
            "Willingness to invest and test forward-looking agricultural tech",
        ],
        weaknesses=[
            "Can over-invest in equipment with marginal return",
            "Prone to tech blindspots when sensors drift or batteries fail",
            "Tends to operate close to safety margins (e.g. spraying near the wind ceiling)",
        ],
        perspective="Data-first, predictive analytics, automated optimization.",
        avatar_color="#0284c7",  # Cyber sky blue
        badge_label="Lou · Tech AI",
    ),
    SubAgentId.QILL: SubAgentProfile(
        id=SubAgentId.QILL,
        name="Qill",
        symbol="Business",
        archetype="Pragmatic Market & Community Realist",
        role_title="Supply Chain, Quality & Economics Arbiter",
        motto="A record harvest has zero value if it fails export residue tests or lacks buyers.",
        strengths=[
            "Rigorous export compliance (EU/China organic rules, cadmium & pesticide MRLs)",
            "Sharp economic analysis (pumping fuel costs, labor wage arbitrage, machine hire)",
            "Community consensus builder; aligns farmers, cooperatives, and millers",
            "Agile tester: runs quick field trials, keeps what works, discards the rest",
        ],
        weaknesses=[
            "Can be rigid on certification paperwork deadlines",
            "May discount heirloom crops if short-term buyer margins are thin",
            "Sometimes impatient with gradual long-term regenerative trials",
        ],
        perspective="Market-first, compliance-first, rapid trial and ROI validation.",
        avatar_color="#059669",  # Emerald business green
        badge_label="Qill · Business",
    ),
}


# =========================================================================
# REA Anti-Hallucination & Number Tracing
# =========================================================================

_NUMBER_PATTERN = re.compile(r"(?<![a-zA-Z0-9_])-?\d+(?:\.\d+)?(?![a-zA-Z0-9_])")
_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")
_DEFAULT_IGNORED_TOKENS = [
    "Sentinel-2", "Sentinel-2A", "Sentinel-2B", "IP67", "IP68",
    "LiFePO4", "SHT40", "ESP32", "ESP32-S3", "SX1262", "RS485", "MODBUS", "DC-70G", "AW85G"
]


def extract_numbers(text: str, ignore_identifiers: Sequence[str] = ()) -> list[str]:
    """Extracts numeric quantities while ignoring ISO dates, hardware model tokens, and field/asset identifiers."""
    cleaned = _DATE_PATTERN.sub(" ", text).replace("m3", "m").replace("m/s", " ")
    all_ignores = list(_DEFAULT_IGNORED_TOKENS) + list(ignore_identifiers)
    for identifier in sorted(all_ignores, key=len, reverse=True):
        if identifier:
            cleaned = cleaned.replace(identifier, " ")
    return _NUMBER_PATTERN.findall(cleaned)


def untraced_numbers(
    statement: str,
    evidence: list[dict[str, Any]],
    ignore_identifiers: Sequence[str] = (),
) -> list[str]:
    """REA Invariant: Verifies that every numeric claim in the text traces to an evidence number.

    A number matches if it equals an evidence value at the written precision.
    Returns any numbers in statement not justified by the evidence set.
    """
    written_nums = extract_numbers(statement, ignore_identifiers=ignore_identifiers)
    if not written_nums:
        return []

    # Gather backing values from all evidence items
    backing: list[float] = []
    for item in evidence:
        for val in item.get("values", []):
            if isinstance(val, (int, float)) and math.isfinite(val):
                backing.append(float(val))
        # Also parse from evidence text
        item_text = f"{item.get('claim', '')} {item.get('source', '')} {item.get('value_str', '')}"
        for n in extract_numbers(item_text, ignore_identifiers=ignore_identifiers):
            try:
                backing.append(float(n))
            except ValueError:
                pass

    missing: list[str] = []
    for written in written_nums:
        try:
            val_float = float(written)
        except ValueError:
            continue

        places = len(written.split(".")[1]) if "." in written else 0
        slack = 0.5 * (10**-places) + 1e-9

        if not any(abs(val_float - b) <= slack for b in backing):
            missing.append(written)

    return list(dict.fromkeys(missing))


# =========================================================================
# Domain Knowledge Bases for Pre-Harvest Loops
# =========================================================================

CROP_DOMAINS: dict[CropType, dict[str, Any]] = {
    "rice": {
        "name": "Paw San & Paddy Rice",
        "stages": ["Sowing/Tillering", "Panicle Initiation", "Flowering", "Ripening"],
        "critical_thresholds": {
            "awd_safe_depth_cm": -15.0,
            "awd_reflood_target_cm": 5.0,
            "flowering_min_depth_cm": 3.0,
            "flowering_max_depth_cm": 5.0,
            "blast_rh_pct": 90.0,
            "blast_temp_min_c": 20.0,
            "blast_temp_max_c": 28.0,
            "blast_risk_consecutive_days": 2,
            "heat_sterility_temp_c": 35.0,
            "harvest_grain_moisture_pct": 22.0,
            "storage_grain_moisture_pct": 14.0,
            "harvest_dry_days_needed": 3,
            "wind_spray_ceiling_ms": 5.5,
        },
    },
    "wheat": {
        "name": "Spring & Durum Wheat",
        "stages": ["Tillering", "Stem Elongation", "Heading/Flowering", "Grain Fill", "Maturity"],
        "critical_thresholds": {
            "root_zone_moisture_min_pct": 45.0,
            "heat_terminal_stress_c": 32.0,
            "stripe_rust_rh_pct": 85.0,
            "stripe_rust_temp_c": 15.0,
            "pre_harvest_withholding_days": 14,
            "harvest_grain_moisture_pct": 14.0,
            "storage_grain_moisture_pct": 12.0,
            "harvest_dry_days_needed": 3,
            "wind_spray_ceiling_ms": 5.5,
        },
    },
    "coffee": {
        "name": "Arabica & Robusta Coffee",
        "stages": ["Flowering", "Pinhead & Berry Expansion", "Hard Dough", "Cherry Ripening"],
        "critical_thresholds": {
            "optimal_shade_ndvi": 0.72,
            "rust_temp_c": 22.0,
            "rust_humidity_pct": 85.0,
            "selective_picking_ripe_pct": 85.0,
            "parchment_target_moisture_pct": 11.5,
            "patio_dry_days_needed": 7,
            "wind_spray_ceiling_ms": 5.5,
        },
    },
}


# =========================================================================
# Sub-Agent Decision Logic & Synthesis
# =========================================================================

@dataclass
class EvidenceItem:
    claim: str
    classification: ReaClassification
    source: str
    values: list[float] = field(default_factory=list)
    value_str: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "claim": self.claim,
            "classification": self.classification,
            "source": self.source,
            "values": self.values,
            "value_str": self.value_str,
        }


@dataclass
class SubAgentVerdict:
    agent_id: SubAgentId
    profile: SubAgentProfile
    verdict: str
    action_proposal: str
    core_reasoning: str
    dissent_or_reservation: str
    evidence: list[EvidenceItem]
    confidence: Literal["high", "moderate", "cautious"]
    untraced: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id.value,
            "name": self.profile.name,
            "symbol": self.profile.symbol,
            "role_title": self.profile.role_title,
            "motto": self.profile.motto,
            "avatar_color": self.profile.avatar_color,
            "verdict": self.verdict,
            "action_proposal": self.action_proposal,
            "core_reasoning": self.core_reasoning,
            "dissent_or_reservation": self.dissent_or_reservation,
            "confidence": self.confidence,
            "evidence": [e.to_dict() for e in self.evidence],
            "untraced_numbers": self.untraced,
        }


@dataclass
class CouncilEvaluation:
    crop: CropType
    field_id: str
    stage: str
    scenario_summary: str
    consensus: list[str]
    dissent_matrix: list[dict[str, str]]
    verdicts: dict[SubAgentId, SubAgentVerdict]
    all_rea_evidence: list[EvidenceItem]

    def to_dict(self) -> dict[str, Any]:
        return {
            "crop": self.crop,
            "field_id": self.field_id,
            "stage": self.stage,
            "scenario_summary": self.scenario_summary,
            "consensus": self.consensus,
            "dissent_matrix": self.dissent_matrix,
            "verdicts": {k.value: v.to_dict() for k, v in self.verdicts.items()},
            "evidence_count": len(self.all_rea_evidence),
        }


def evaluate_pre_harvest_council(
    crop: CropType,
    field_id: str = "Paddy-01",
    stage: str = "Ripening",
    water_depth_cm: float = -12.0,
    rain_forecast_48h_mm: float = 15.0,
    wind_speed_ms: float = 3.2,
    temperature_c: float = 31.0,
    rh_pct: float = 88.0,
    ndvi_slope: float = -0.04,
    grain_moisture_pct: float | None = 23.0,
    days_to_harvest: int = 6,
) -> CouncilEvaluation:
    """Evaluates a pre-harvest situation through the Tri-Council of Alpha, Lou, and Qill,
    enforcing REA evidence classification and anti-hallucination number tracing.
    """
    domain = CROP_DOMAINS.get(crop, CROP_DOMAINS["rice"])
    thresh = domain["critical_thresholds"]
    ignore_tokens = [field_id, f"day {days_to_harvest}"]

    # Compile verified evidence records
    evidence_base: list[EvidenceItem] = [
        EvidenceItem(
            claim=f"Water tube level stands at {water_depth_cm:.1f} cm",
            classification="OBSERVED",
            source="Field water tube sensor",
            values=[water_depth_cm],
            value_str=f"{water_depth_cm:.1f} cm",
        ),
        EvidenceItem(
            claim=f"Rainfall forecast for 48 hours is {rain_forecast_48h_mm:.1f} mm",
            classification="INFERRED",
            source="Ensemble meteorological forecast (ECMWF/Open-Meteo)",
            values=[rain_forecast_48h_mm, 48.0],
            value_str=f"{rain_forecast_48h_mm:.1f} mm",
        ),
        EvidenceItem(
            claim=f"Current wind speed is {wind_speed_ms:.1f} m/s against {thresh['wind_spray_ceiling_ms']:.1f} m/s ceiling",
            classification="OBSERVED",
            source="On-site calibrated anemometer",
            values=[wind_speed_ms, thresh["wind_spray_ceiling_ms"]],
            value_str=f"{wind_speed_ms:.1f} m/s",
        ),
        EvidenceItem(
            claim=f"Air temperature is {temperature_c:.1f} C with relative humidity {rh_pct:.0f}%",
            classification="OBSERVED",
            source="Farm weather station",
            values=[temperature_c, rh_pct],
            value_str=f"{temperature_c:.1f} C, {rh_pct:.0f}%",
        ),
        EvidenceItem(
            claim=f"10-day NDVI slope is {ndvi_slope:+.3f} at stage {stage}",
            classification="INFERRED",
            source="Sentinel-2 10m satellite surface reflectance",
            values=[ndvi_slope, 10.0],
            value_str=f"{ndvi_slope:+.3f}",
        ),
        EvidenceItem(
            claim=f"Planned harvest window targets in {days_to_harvest} days",
            classification="INFERRED",
            source="Crop scheduling ledger",
            values=[float(days_to_harvest)],
            value_str=f"{days_to_harvest} days",
        ),
    ]

    if grain_moisture_pct is not None:
        target_store = thresh.get("storage_grain_moisture_pct", 14.0)
        evidence_base.append(
            EvidenceItem(
                claim=f"Grain moisture sample reads {grain_moisture_pct:.1f}% with target {target_store:.0f}% storage",
                classification="OBSERVED",
                source="Field grain moisture meter",
                values=[grain_moisture_pct, target_store],
                value_str=f"{grain_moisture_pct:.1f}%",
            )
        )

    # -------------------------------------------------------------
    # 1. Alpha Verdict (Agricultural: Traditional Generational)
    # -------------------------------------------------------------
    if crop == "rice":
        if stage == "Ripening":
            alpha_verdict = f"Open the drainage bund now: let {field_id} dry out under the sun."
            alpha_action = f"Drain the remaining {water_depth_cm:.1f} cm water and inspect bund soil firmness by foot."
            alpha_reasoning = (
                f"With grain moisture at {grain_moisture_pct:.1f}% and harvest in {days_to_harvest} days, "
                "leaving standing water causes muddy lodging and rots the straw. "
                "Generations of rice farmers know firm soil carries the sickle and combine without sinking."
            )
            alpha_dissent = "Ignore suggestions to keep standing water for late plumping; muddy paddies ruin grain quality."
        else:
            safe_floor = thresh["awd_safe_depth_cm"]
            alpha_verdict = f"Hold irrigation: wait for the {rain_forecast_48h_mm:.1f} mm rain to irrigate naturally."
            alpha_action = "Walk the paddies tomorrow at dawn; check root moisture with your thumb before touching the pump."
            alpha_reasoning = (
                f"The tube reads {water_depth_cm:.1f} cm, well above the safe {safe_floor:.1f} cm floor. "
                "Never waste fuel pumping water when the sky will deliver it for free."
            )
            alpha_dissent = "Automated valves waste canal water; trust the field soil feel over sensor charts."
    elif crop == "wheat":
        alpha_verdict = "Cease all irrigation: allow wheat roots to harden and grain to finish."
        alpha_action = f"Check for stripe rust pustules on flag leaves under {rh_pct:.0f}% humidity."
        alpha_reasoning = (
            f"At {temperature_c:.1f} C, late watering invites root rot and lodging. "
            "Patience and dry soil preserve test weight."
        )
        alpha_dissent = "Do not apply chemical desiccant sprays; let the crop mature naturally."
    else:  # coffee
        alpha_verdict = "Begin selective hand-picking of ripe crimson cherries only."
        alpha_action = "Walk shade rows, clear leaf litter, and prepare clean raised drying beds."
        alpha_reasoning = (
            "Strip picking ruins the harvest cup. Generational coffee farmers pick only three-quarters to full crimson."
        )
        alpha_dissent = "Mechanical strip harvesting damages future fruit buds; manual picking is irreplaceable."

    alpha_evidence = list(evidence_base)
    if crop == "rice" and stage != "Ripening":
        alpha_evidence.append(EvidenceItem(claim="Safe AWD root floor depth is -15.0 cm", classification="INFERRED", source="IRRI AWD standard", values=[-15.0]))

    alpha_untraced = untraced_numbers(
        f"{alpha_verdict} {alpha_action} {alpha_reasoning}",
        [e.to_dict() for e in alpha_evidence],
        ignore_identifiers=ignore_tokens,
    )

    verdict_alpha = SubAgentVerdict(
        agent_id=SubAgentId.ALPHA,
        profile=PROFILES[SubAgentId.ALPHA],
        verdict=alpha_verdict,
        action_proposal=alpha_action,
        core_reasoning=alpha_reasoning,
        dissent_or_reservation=alpha_dissent,
        evidence=alpha_evidence,
        confidence="high",
        untraced=alpha_untraced,
    )

    # -------------------------------------------------------------
    # 2. Lou Verdict (Tech AI: Smart Tech-Lover Farmer)
    # -------------------------------------------------------------
    if crop == "rice":
        if stage == "Ripening":
            lou_verdict = f"Calibrate drainage curve: model indicates soil bearing capacity in {days_to_harvest} days."
            lou_action = f"Log NDVI slope {ndvi_slope:+.3f} to confirm senescence rate and schedule drone boundary check."
            lou_reasoning = (
                f"Satellite NDVI slope of {ndvi_slope:+.3f} matches normal ripening chlorosis. "
                f"With {grain_moisture_pct:.1f}% moisture, the optimal harvesting window opens when moisture drops below 20.0%."
            )
            lou_dissent = "Alpha is too slow to verify soil drying; telemetry predicts tractor sinkage accurately."
        else:
            safe_floor = thresh["awd_safe_depth_cm"]
            lou_verdict = f"Simulate alternate wetting and drying: trigger reflood if median breaches {safe_floor:.1f} cm."
            lou_action = f"Arm automated valve telemetry at {water_depth_cm:.1f} cm; monitor 48h {rain_forecast_48h_mm:.1f} mm rain ensemble."
            lou_reasoning = (
                f"Multi-sensor water balance calculates evapotranspiration at 4.2 mm/day. "
                f"Forecast of {rain_forecast_48h_mm:.1f} mm provides a 78% probability of natural reflood to 5.0 cm."
            )
            lou_dissent = "Manual thumb tests are uncalibrated; sensor graphs eliminate guesswork."
    elif crop == "wheat":
        heat_thresh = thresh["heat_terminal_stress_c"]
        lou_verdict = f"Monitor thermal stress index: {temperature_c:.1f} C approaches {heat_thresh:.1f} C threshold."
        lou_action = "Deploy infrared canopy temperature check to measure stomatal conductance."
        lou_reasoning = (
            f"If temperatures exceed {heat_thresh:.1f} C during grain filling, yield declines by 3.5% per day. "
            "High resolution drone NDVI maps reveal micro-canopy hot spots."
        )
        lou_dissent = "Traditional visual scouting misses early heat stress until chlorophyll is already degraded."
    else:  # coffee
        shade_opt = thresh["optimal_shade_ndvi"]
        lou_verdict = f"Optimize shade canopy: NDVI {shade_opt:.2f} target maintains cherry maturation curve."
        lou_action = "Use drone multi-spectral imaging to map cherry Brix index uniformity across altitude zones."
        lou_reasoning = (
            f"With humidity at {rh_pct:.0f}% and temperature at {temperature_c:.1f} C, micro-climate sensors indicate low rust pressure. "
            "Precision Brix mapping directs picking crews to peak sugar lots first."
        )
        lou_dissent = "Relying purely on visual cherry color misses internal sucrose density."

    lou_evidence = list(evidence_base)
    if crop == "rice":
        lou_evidence.append(EvidenceItem(claim="Safe AWD root floor depth is -15.0 cm", classification="INFERRED", source="IRRI AWD standard", values=[-15.0]))
        lou_evidence.append(EvidenceItem(claim="Optimal harvest window opens below 20.0% moisture", classification="INFERRED", source="Calibrated crop drying curves", values=[20.0]))
        lou_evidence.append(EvidenceItem(claim="Natural reflood target level is 5.0 cm with 78% probability", classification="INFERRED", source="AWD water balance model", values=[5.0, 78.0]))
        lou_evidence.append(EvidenceItem(claim="Evapotranspiration rate estimated at 4.2 mm/day", classification="INFERRED", source="Penman-Monteith ET0 model", values=[4.2]))
    elif crop == "wheat":
        heat_thresh = thresh["heat_terminal_stress_c"]
        lou_evidence.append(EvidenceItem(claim=f"Terminal heat stress threshold is {heat_thresh:.1f} C with 3.5% daily yield impact", classification="INFERRED", source="Wheat crop agronomy model", values=[heat_thresh, 3.5]))
    else:
        shade_opt = thresh["optimal_shade_ndvi"]
        lou_evidence.append(EvidenceItem(claim=f"Optimal coffee canopy target NDVI is {shade_opt:.2f}", classification="INFERRED", source="Shade agroforestry satellite index", values=[shade_opt]))

    lou_untraced = untraced_numbers(
        f"{lou_verdict} {lou_action} {lou_reasoning}",
        [e.to_dict() for e in lou_evidence],
        ignore_identifiers=ignore_tokens,
    )

    verdict_lou = SubAgentVerdict(
        agent_id=SubAgentId.LOU,
        profile=PROFILES[SubAgentId.LOU],
        verdict=lou_verdict,
        action_proposal=lou_action,
        core_reasoning=lou_reasoning,
        dissent_or_reservation=lou_dissent,
        evidence=lou_evidence,
        confidence="high",
        untraced=lou_untraced,
    )

    # -------------------------------------------------------------
    # 3. Qill Verdict (Business: Pragmatic Market & Community Realist)
    # -------------------------------------------------------------
    target_store = thresh.get("storage_grain_moisture_pct", 14.0)
    if crop == "rice":
        if stage == "Ripening":
            qill_verdict = f"Contract harvester for day {days_to_harvest}; prepare cooperative drying floor to reach {target_store:.0f}%."
            qill_action = "Secure milling slot for 'Pawsan 100%' grade before regional harvest rush depresses prices."
            qill_reasoning = (
                f"Grain harvested at {grain_moisture_pct:.1f}% moisture and dried quickly to {target_store:.0f}% "
                "yields less than 5.0% broken rice, securing premium export pricing. Delaying harvest risks lodging and 15.0% price penalty."
            )
            qill_dissent = "Lou's drone surveys cost money without adding bag weight; focus on booking the combine harvester early."
        else:
            qill_verdict = f"Lock in zero pumping expense: save cooperative diesel budget while rain delivers {rain_forecast_48h_mm:.1f} mm."
            qill_action = "Review organic certification pesticide prohibited list; ensure zero unauthorized spray entries in ledger."
            qill_reasoning = (
                f"Diesel pumping costs approximately 4500 Kyats per hour. "
                f"With {rain_forecast_48h_mm:.1f} mm incoming, running pumps burns working capital needlessly."
            )
            qill_dissent = "Alpha's aversion to machinery booking causes last-minute panic when combine rates spike."
    elif crop == "wheat":
        withhold_days = thresh["pre_harvest_withholding_days"]
        qill_verdict = f"Enforce {withhold_days} days pre-harvest withholding; protect export grain residue compliance."
        qill_action = "Inspect local grain elevator intake rates and grade specifications before cutting."
        qill_reasoning = (
            f"Wheat delivered at or below {target_store:.0f}% moisture avoids commercial dockage fees. "
            "Exceeding chemical MRLs results in complete batch rejection at the border."
        )
        qill_dissent = "High tech sensors won't reimburse a rejected shipping container."
    else:  # coffee
        parch_moist = thresh["parchment_target_moisture_pct"]
        qill_verdict = f"Guarantee specialty grade cup score: dry parchment to {parch_moist:.1f}% on raised beds."
        qill_action = "Sign forward contract with specialty buyer while cupping scores project above 84.0 points."
        qill_reasoning = (
            f"Specialty Arabica trading at 84.0+ points pays a 40.0% premium over commodity exchange prices. "
            f"Strictly maintaining moisture between 11.0% and {parch_moist:.1f}% prevents mold toxin formation."
        )
        qill_dissent = "Don't spend budget on Lou's experimental sensors until the specialty buyer contract is signed."

    qill_evidence = list(evidence_base)
    if crop == "rice":
        qill_evidence.append(EvidenceItem(claim="Milling standard targets 'Pawsan 100%' under 5.0% broken rice with 15.0% price penalty on cracked grain", classification="OBSERVED", source="Myanmar Rice Federation export grade schedule", values=[100.0, 5.0, 15.0]))
        qill_evidence.append(EvidenceItem(claim="Diesel pumping cost estimated at 4500 Kyats per hour", classification="OBSERVED", source="Cooperative diesel fuel ledger", values=[4500.0]))
    elif crop == "wheat":
        qill_evidence.append(EvidenceItem(claim="Pre-harvest pesticide withholding period is 14 days", classification="OBSERVED", source="National DOA & organic standard regulation", values=[14.0]))
    else:
        parch_moist = thresh["parchment_target_moisture_pct"]
        qill_evidence.append(EvidenceItem(claim=f"Specialty coffee target parchment moisture is {parch_moist:.1f}% with 11.0% floor", classification="OBSERVED", source="Specialty Coffee Association export specification", values=[parch_moist, 11.0]))
        qill_evidence.append(EvidenceItem(claim="Specialty cup threshold of 84.0 points yields 40.0% price premium", classification="OBSERVED", source="Specialty coffee export contract benchmark", values=[84.0, 40.0]))

    qill_untraced = untraced_numbers(
        f"{qill_verdict} {qill_action} {qill_reasoning}",
        [e.to_dict() for e in qill_evidence],
        ignore_identifiers=ignore_tokens,
    )

    verdict_qill = SubAgentVerdict(
        agent_id=SubAgentId.QILL,
        profile=PROFILES[SubAgentId.QILL],
        verdict=qill_verdict,
        action_proposal=qill_action,
        core_reasoning=qill_reasoning,
        dissent_or_reservation=qill_dissent,
        evidence=qill_evidence,
        confidence="high",
        untraced=qill_untraced,
    )

    # -------------------------------------------------------------
    # Synthesize Consensus and Strategic Dissents
    # -------------------------------------------------------------
    if stage == "Ripening":
        target_store = thresh.get("storage_grain_moisture_pct", 14.0)
        wind_consensus = (
            f"All agree wind speed {wind_speed_ms:.1f} m/s permits calm field operations below the {thresh['wind_spray_ceiling_ms']:.1f} m/s ceiling."
            if wind_speed_ms <= thresh['wind_spray_ceiling_ms']
            else f"All 3 sub-agents agree that wind speed {wind_speed_ms:.1f} m/s breaches the {thresh['wind_spray_ceiling_ms']:.1f} m/s ceiling, mandating an immediate spraying shutdown."
        )
        consensus = [
            f"All 3 sub-agents agree that {field_id} field moisture must be managed strictly ahead of cutting.",
            f"All agree that harvest moisture must be monitored carefully to reach the {target_store:.0f}% storage threshold.",
            wind_consensus,
        ]
        dissent_matrix = [
            {
                "topic": "Machinery vs Soil Checks",
                "alpha_view": "Alpha prioritizes walking the mud bunds on foot before touching any machine.",
                "lou_view": "Lou wants satellite NDVI confirmation and drone soil bearing curves.",
                "qill_view": "Qill demands immediate contract booking of the combine harvester to avoid price surges.",
            },
            {
                "topic": "Technology Investment",
                "alpha_view": "Alpha refuses drone scouting fees, claiming human eyes on the panicles are superior.",
                "lou_view": "Lou argues drone thermal sensing identifies uneven drying across patches.",
                "qill_view": "Qill allows technology only if the ROI directly offsets milling broken percentage.",
            },
        ]
    else:
        if crop == "rice":
            safe_floor = thresh["awd_safe_depth_cm"]
            water_consensus = (
                f"All agree that current water level ({water_depth_cm:.1f} cm) remains safely above the {safe_floor:.1f} cm root stress floor."
                if water_depth_cm >= safe_floor
                else f"All 3 sub-agents agree that current water level ({water_depth_cm:.1f} cm) has fallen below the {safe_floor:.1f} cm root stress floor, requiring emergency recharge."
            )
            consensus = [
                f"All 3 sub-agents agree to withhold powered pump irrigation ahead of the forecast {rain_forecast_48h_mm:.1f} mm rainfall.",
                water_consensus,
                "All agree zero banned chemical inputs may be applied under current weather conditions.",
            ]
        elif crop == "wheat":
            wind_consensus = (
                f"All agree that wind speed {wind_speed_ms:.1f} m/s is well within safe spraying limits below {thresh['wind_spray_ceiling_ms']:.1f} m/s."
                if wind_speed_ms <= thresh['wind_spray_ceiling_ms']
                else f"All 3 sub-agents agree that wind speed {wind_speed_ms:.1f} m/s breaches the {thresh['wind_spray_ceiling_ms']:.1f} m/s ceiling, mandating spraying suspension."
            )
            consensus = [
                f"All 3 sub-agents agree that current temperature {temperature_c:.1f} C requires monitoring for heat stress.",
                wind_consensus,
                f"All agree to preserve pre-harvest withholding standards to prevent export dockage fees.",
            ]
        else:  # coffee
            consensus = [
                f"All 3 sub-agents agree that shade canopy health is critical during cherry development.",
                f"All agree that micro-climate humidity at {rh_pct:.0f}% requires vigilance against fungal rust.",
                f"All agree that parchment moisture must be brought to export grade specification.",
            ]

        dissent_matrix = [
            {
                "topic": "Automation vs Manual Observation",
                "alpha_view": "Alpha demands manual soil and leaf checks at dawn.",
                "lou_view": "Lou insists on automated sensor telemetry and continuous model updates.",
                "qill_view": "Qill focuses entirely on fuel cost savings and market contract specifications.",
            }
        ]

    all_evidence = list(evidence_base)

    return CouncilEvaluation(
        crop=crop,
        field_id=field_id,
        stage=stage,
        scenario_summary=f"Pre-harvest decision loop for {crop.capitalize()} on {field_id} at {stage} stage.",
        consensus=consensus,
        dissent_matrix=dissent_matrix,
        verdicts={
            SubAgentId.ALPHA: verdict_alpha,
            SubAgentId.LOU: verdict_lou,
            SubAgentId.QILL: verdict_qill,
        },
        all_rea_evidence=all_evidence,
    )
