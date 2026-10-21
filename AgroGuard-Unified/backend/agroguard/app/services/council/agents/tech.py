from __future__ import annotations

from typing import Any
from ..schemas import (
    BuildBreakPitch,
    CrossExaminationItem,
    RiskItem,
    SmartObjective,
    TechAssessment,
    WorkDefinition,
)

SYSTEM_PROMPT = """You are Lou (Frontier Agri-Tech, Edge AI & Sensor Systems Architect in the AgroGuard Council).
Core Identity: You are a frontier AI and embedded IoT systems architect specializing in cyber-physical agricultural systems. You bridge low-power ground hardware (ESP32 nodes, LoRaWAN mesh networks, soil dielectric/EC sensors, micro-climate stations) with lightweight Edge AI and computer vision (Vision Transformers, SVD-based anomaly detection, multimodal sensor fusion).

How You Outthink Cropin & Global AgTech:
- You know that platforms like Cropin and OneSoil over-rely on macro satellite imagery (Sentinel-2/Planet at 3m–10m resolution) and regional gridded weather APIs. In tropical/sub-tropical or monsoon climates, cloud cover blinds optical satellites for weeks, and macro grids miss micro-climate fungal pockets (like early blight or blast) by 500 meters.
- Your thesis is Ground-Truth Edge Superiority: fusing sub-canopy micro-climate telemetry (leaf wetness, VPD, soil matric potential) with localized vision models to detect biological stress 72–96 hours before it ever shows up on a satellite NDVI map.

Technical Heuristics & Mental Models:
- Signal-to-Noise & Sensor Drift: Always account for capacitive soil sensor drift in high-clay/saline soils, lens fouling on field cameras, and packet loss through dense wet foliage (2.4GHz dies in wet canopies; favor sub-GHz LoRaWAN or edge inference).
- Compute & Power Budgets: Never propose cloud-heavy continuous video streaming from a field. Propose event-triggered wake cycles, solar/LiFePO4 duty cycling, and quantized edge inference or compressed feature payloads.

Hard Veto Gate: LOU'S TELEMETRY INTEGRITY KILL-SWITCH (HARDWARE_DRIFT_VETO)
- Evaluate affected_nodes / active_nodes and sensor_confidence_score.
- If an anomaly appears on only 1 node while adjacent nodes are normal, OR if rate-of-change violates physical dynamics (e.g. instant 40% moisture drop due to soil cracking around probe), Lou MUST issue a HARDWARE_DRIFT_VETO.
- When triggered, suppress all chemical/irrigation spend and output a 2-minute physical verification check for the farmer.

Friction Trigger: You push back hard against Alpha when traditional manual scouting is too slow to catch exponential pathogen spread, and you push back against Qill when cost-cutting threatens sensor accuracy or telemetry reliability."""


class TechAgent:
    name: str = "Lou"
    title: str = "Frontier Agri-Tech, Edge AI & Sensor Systems Architect"
    domain: str = "tech"
    symbol: str = "⚡ Tech AI (Lou)"

    @classmethod
    def evaluate(cls, context: dict[str, Any]) -> TechAssessment:
        crop = str(context.get("crop", "rice")).lower()
        stage = str(context.get("stage", "Ripening"))
        water = float(context.get("water_depth_cm", -12.0))
        wind = float(context.get("wind_speed_ms", 3.2))
        ndvi_slope = float(context.get("ndvi_slope", -0.04))
        active_nodes = int(context.get("active_nodes", 4))
        affected_nodes = int(context.get("affected_nodes", 1))
        confidence = float(context.get("sensor_confidence_score", 0.88))
        soil_type = str(context.get("soil_type", "clay")).lower()
        drop_rate = float(context.get("soil_moisture_drop_rate_pct_per_hr", 0.5))
        leaf_wetness = float(context.get("leaf_wetness_hours", 6.0))
        vpd = float(context.get("vpd_kpa", 0.95))
        preset = str(context.get("scenario_preset", "")).lower()

        # Rule 1: Single-node isolation / Impossible rate of change (Clay soil cracking false alarm)
        is_sensor_crack = (
            preset in ("clay_sensor_crack", "sensor_drift", "type_1")
            or (affected_nodes == 1 and active_nodes >= 3 and soil_type == "clay" and drop_rate >= 15.0)
            or (confidence < 0.50)
        )

        # Rule 2: Monsoon fungal blight spike
        is_monsoon_blight = (
            preset in ("monsoon_blight", "blight_risk", "fungal_spike")
            or (leaf_wetness >= 12.0 and vpd <= 0.40)
        )

        # Rule 3: Fertilizer price spike
        is_fertilizer_spike = preset in ("fertilizer_spike", "npk_shortage")

        # Rule 4: Pre-harvest rain
        is_pre_harvest_rain = (
            preset in ("pre_harvest_rain", "rain_penalty", "grade_threat")
            or (stage == "Ripening" and float(context.get("rain_forecast_48h_mm", 0.0)) >= 20.0)
        )

        if is_sensor_crack:
            stance = "REJECT"
            arg = (
                f"Node 2 dropped {drop_rate:.1f}% moisture/hr while adjacent nodes (1, 3, 4) remain saturated. "
                "Spatial consensus is 0.25 (1/4 nodes). Signal spike is an air-gap boundary artifact from shrinking clay soil around probe."
            )
            constraint = "HARDWARE_DRIFT_VETO: Suppress automated irrigation relay. Force 2-minute physical probe tamp before any pump activation."
            why_fails = (
                "Macro AgTech platforms (Cropin, Climate FieldView) ingest single-node threshold drops blindly and trigger "
                "automated pump cycles, causing catastrophic soil waterlogging, root hypoxia, and wasted diesel/electricity."
            )
            tech_spec = (
                "Flag Node 2 as TYPE_1_SENSOR_FAULT. Apply spatial median consensus filter across 4 nodes; "
                "firmware latch locks pump relay until physical tamp confirmation is logged."
            )
        elif is_monsoon_blight:
            stance = "DEPLOY"
            arg = (
                f"Ground-truth edge telemetry detects {leaf_wetness:.1f}h continuous leaf wetness and canopy VPD at {vpd:.2f} kPa (< 0.40 kPa threshold) "
                "across 3 of 4 LoRa nodes. Spore germination incubation window is actively breached."
            )
            constraint = "Cloud backhaul latency cannot exceed 30m; edge node must compute local disease severity index (DSI) onboard ESP32."
            why_fails = (
                "Optical satellites (Sentinel-2/Planet) are blinded by 100% monsoon cloud cover for 14+ days. "
                "Macro weather grids smooth humidity over 5km, missing the humid sub-canopy micro-climate pocket by 500 meters."
            )
            tech_spec = (
                "Isolate center 30% low-lying micro-zone (Nodes 2 & 3). Narrow LoRaWAN telemetry wake interval from 60m to 15m; "
                "stream sub-canopy DSI trigger packets with SF8 spreading factor."
            )
        elif is_fertilizer_spike:
            stance = "MODIFY"
            arg = (
                "Vision Transformer leaf-color index and edge dielectric EC telemetry reveal nitrogen chlorosis "
                "is localized to exactly 24% of the plot along historical drainage channels."
            )
            constraint = "Battery budget on mobile NDVI imaging node requires sleep duty cycling; allocate 1 scan per 72 hours."
            why_fails = (
                "Enterprise AgTech recommends flat-rate calendar NPK broadcasting based on regional soil maps, "
                "forcing bankrupting fertilizer expenditures during regional supply shortages."
            )
            tech_spec = (
                "Generate a 3-tier variable-rate micro-dosing prescription polygon directly on edge gateway, "
                "routing inputs exclusively to verified chlorotic zones."
            )
        elif is_pre_harvest_rain:
            stance = "DEPLOY"
            arg = (
                f"Barometric pressure drop (-4.2 hPa/3h) and Doppler radar ingest confirm heavy rain arriving within 48h. "
                f"Current grain moisture ({float(context.get('grain_moisture_pct', 23.0)):.1f}%) will reverse dry-down."
            )
            constraint = "Post-harvest storage requires continuous relative humidity tracking below 65% to prevent storage mold."
            why_fails = (
                "Macro weather apps give generic rain warnings without computing physiological harvest dry-down curves "
                "or buyer contract moisture-penalty thresholds."
            )
            tech_spec = (
                "Switch edge nodes to 15-min duty cycles; re-deploy Node 4 as mobile wireless hygrometer inside "
                "cooperative curing/drying shed."
            )
        elif wind > 5.5:
            stance = "REJECT"
            arg = (
                f"Wind telemetry ({wind:.1f} m/s) triggers a hard safety interrupt against the 5.5 m/s ceiling. "
                "Any drone aerial scouting or automated spray mission must be mechanically locked."
            )
            constraint = "HARDWARE_SAFETY_LOCK: Flight controller lockout active until mean wind stabilizes under 4.0 m/s for 30 minutes."
            why_fails = "Macro platforms lack real-time anemometer telemetry locks, causing off-target chemical drift."
            tech_spec = "Lock electronic speed controllers on spray drones; broadcast drift hold to farm mobile app."
        else:
            stance = "APPROVE"
            arg = (
                f"Sentinel-2 10m NDVI slope ({ndvi_slope:+.3f}) confirms consistent canopy chlorosis. "
                f"Sensor water level ({water:.1f} cm) indicates drainage is proceeding at 1.8 cm/day without ponding."
            )
            constraint = "LoRaWAN node battery levels are at 3.4V; sleep interval set to 60m to preserve autonomy through harvest."
            why_fails = "Macro satellites miss soil bearing capacity and bund waterlogging under dense canopy."
            tech_spec = "LoRaWAN SX1262 transceiver (+14 dBm TX, SF8) with rolling median 3-sample hydrostatic filter."

        smart = SmartObjective(
            specific="Maintain LoRaWAN edge telemetry pipeline integrity, enforce sensor integrity gate, and optimize node power autonomy.",
            measurable=">=99.2% packet reception rate over SF8, 0 false pump pulses, 338-day LiFePO4 dark battery autonomy.",
            achievable="Achieved via edge median filtering, local threshold triggers, and sub-GHz propagation.",
            relevant="Provides real-time ground truth that outperforms cloud-blinded satellite AgTech.",
            time_bound="Telemetry lock and filter deployment completed within 15 minutes."
        )

        work_def = WorkDefinition(
            project_objective="Deliver real-time ground-truth sensing that catches biological stress 72-96h ahead of satellites without false alarms.",
            deliverables=[
                "LoRaWAN node duty cycle profile (15m wake during alert / 60m normal)",
                "Rolling median 3-sample hydrostatic/capacitive filter configuration",
                "Automated actuator safety lockout (wind & single-node drift protection)",
                "Sub-canopy micro-climate leaf wetness & VPD telemetry feed"
            ],
            success_criteria=[
                "Zero false pump or spray triggers from single-node sensor cracks",
                "Sub-canopy fungal risk flagged >= 72h before satellite NDVI detection",
                "Packet delivery >= 98% through wet canopy foliage"
            ],
            scope_included=[
                "ESP32 edge firmware configuration and median filtering",
                "LoRaWAN gateway backhaul and packet error rate monitoring",
                "Mobile sensor redeployment to post-harvest curing shed"
            ],
            scope_excluded=[
                "Continuous cloud video streaming (banned due to rural bandwidth limits)",
                "Manual foot-scouting data entry workflows"
            ]
        )

        build_break_pitch = BuildBreakPitch(
            build_it="Deploy solar-harvested ESP32-S3 + SX1262 LoRaWAN nodes with capacitive/hydrostatic sensors inside perforated PVC stilling wells.",
            break_it="Severe clay desiccation cracking causes air gaps around probes; wet foliage causes 18 dBm RF attenuation; wind >5.5 m/s causes drift.",
            pitch_it="Delivers 72-hour early biological warning that cloud-blinded satellites miss, backed by 338-day battery autonomy and zero false-alarm lockouts."
        )

        top_risks = [
            RiskItem(
                id="R-TECH-01",
                name="Hydrostatic & Capacitive Sensor Crack/Sedimentation Drift",
                category="Technical",
                likelihood="Medium",
                impact="Medium",
                heat_score="Medium",
                mitigation_plan="Perforated PVC stilling well with sediment trap; spatial consensus median filter in firmware.",
                owner="Lou (Edge IoT Architect)"
            ),
            RiskItem(
                id="R-TECH-02",
                name="High-Wind Agrochemical Spray Drift (>5.5 m/s)",
                category="Technical",
                likelihood="Low",
                impact="High",
                heat_score="Medium",
                mitigation_plan="Automated hardware/firmware flight controller lock triggering automatically when mean wind exceeds 5.5 m/s.",
                owner="Lou (Edge IoT Architect)"
            ),
        ]

        return TechAssessment(
            stance=stance,
            core_argument=arg,
            system_constraint=constraint,
            edge_architecture_diagnosis=arg,
            why_macro_agtech_fails_here=why_fails,
            proposed_tech_spec=tech_spec,
            smart_objective=smart,
            work_definition=work_def,
            build_break_pitch=build_break_pitch,
            top_risks=top_risks,
        )

    @classmethod
    def cross_examine_agriculture(cls, ag_assessment: dict[str, Any], context: dict[str, Any]) -> CrossExaminationItem:
        return CrossExaminationItem(
            from_agent="tech",
            to_agent="agriculture",
            challenge=(
                "Your insistence on manual morning thumb inspections does not scale across a 200-hectare cooperative: "
                "human scouting produces inconsistent subjective reports and misses overnight micro-climate humidity traps until days later."
            ),
            proposed_compromise=(
                "Use automated sub-canopy leaf wetness and hydrostatic alerts as the primary triage filter, and dispatch manual checks "
                "only to specific GPS coordinates flagged by edge anomaly polygons."
            ),
        )

    @classmethod
    def cross_examine_market(cls, market_assessment: dict[str, Any], context: dict[str, Any]) -> CrossExaminationItem:
        return CrossExaminationItem(
            from_agent="tech",
            to_agent="market",
            challenge=(
                "Your demand for low-cost $10 sensors with 5-year lifespans violates physical hardware realities: "
                "cheap uncalibrated capacitive sensors suffer severe thermal drift and deceive farmers with erroneous moisture numbers."
            ),
            proposed_compromise=(
                "Deploy industrial-grade reference nodes at cooperative hub points and interpolate satellite Sentinel-2 "
                "NDVI over individual smallholder plots to amortize capital costs."
            ),
        )


def evaluate_tech(context: dict[str, Any]) -> TechAssessment:
    return TechAgent.evaluate(context)
