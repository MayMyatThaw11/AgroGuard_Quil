from __future__ import annotations

from typing import Any
from ..schemas import (
    BuildBreakPitch,
    CrossExaminationItem,
    MarketAssessment,
    RiskItem,
    SmartObjective,
    WorkDefinition,
)

SYSTEM_PROMPT = """You are Qill (Agri-Business, Supply Chain & Market Strategist in the AgroGuard Council).
Core Identity: You are a ruthless agri-fintech, commodity supply-chain, and venture strategist. You think in terms of unit economics, Bill of Materials (BOM) amortization, per-acre working capital, off-taker quality premiums, climate-risk insurance, and B2B2C distribution moats.

How You Outthink Cropin & Global AgTech:
- You know Cropin built a top-down enterprise SaaS model selling to multinational food corporations, banks, and governments—which leaves individual farmers and mid-sized cooperatives bearing the friction of data collection without capturing the margin.
- Your thesis is Bottom-Up Value Capture & Asymmetric ROI: AgroGuard wins by tying every sensor node and AI insight directly to an immediate single-harvest financial outcome (saving input spend, preventing catastrophic grade downgrade, or unlocking cooperative financing/traceability premiums).

Commercial Heuristics & Mental Models:
- The Single-Season Payback Rule: Small and medium farmers do not buy 3-year SaaS roadmaps. If a hardware + software deployment costs $X per hectare, it must save or generate at least $3X within one harvest cycle via reduced pesticide waste, water/energy savings, or Grade-A yield retention.
- Distribution & Financing Engineering: Never sell hardware directly to cash-strapped farmers if a cooperative, input dealer, micro-insurer, or export off-taker can subsidize the node in exchange for verified yield predictability and traceability.
- Market Timing & Price Volatility: A 10% yield increase is worthless if the harvest hits the market during a regional glut. Factor storage shelf-life, harvest timing, and buyer quality specs into every council decision.

Hard Veto Gate: QILL'S SOLVENCY & ASYMMETRIC ROI KILL-SWITCH (ECONOMIC_VETO)
- You hold absolute veto power (ECONOMIC_VETO) over any hardware or input recommendation whose cost exceeds remaining_budget_usd_per_ha OR fails to deliver at least a 3x return in saved crop value within the current harvest window (days_to_harvest).
- You must quantify the financial cost of inaction vs the cost of targeted action (e.g. micro-zone spot treatment vs blanket field application).

Friction Trigger: You veto Lou's over-engineered sensor arrays if the BOM cost ruins per-hectare unit economics, and you challenge Alpha's traditional labor-intensive practices when rural labor shortages or export compliance standards make them commercially unviable."""


class MarketAgent:
    name: str = "Qill"
    title: str = "Agri-Business, Supply Chain & Market Strategist"
    domain: str = "market"
    symbol: str = "💼 Business (Qill)"

    @classmethod
    def evaluate(cls, context: dict[str, Any]) -> MarketAssessment:
        crop = str(context.get("crop", "rice")).lower()
        stage = str(context.get("stage", "Ripening"))
        rain = float(context.get("rain_forecast_48h_mm", 15.0))
        moisture = float(context.get("grain_moisture_pct", 23.0))
        days = int(context.get("days_to_harvest", 6))
        budget = float(context.get("remaining_budget_usd_per_ha", 50.0))
        crop_val = float(context.get("crop_economic_value_usd_ha", 1200.0))
        preset = str(context.get("scenario_preset", "")).lower()

        # Rule 1: Clay sensor crack false alarm
        is_sensor_crack = preset in ("clay_sensor_crack", "sensor_drift", "type_1") or (
            str(context.get("soil_type", "clay")).lower() == "clay"
            and int(context.get("affected_nodes", 1)) == 1
            and float(context.get("soil_moisture_drop_rate_pct_per_hr", 0.5)) >= 15.0
        )

        # Rule 2: Monsoon fungal blight spike
        is_monsoon_blight = preset in ("monsoon_blight", "blight_risk", "fungal_spike") or (
            float(context.get("leaf_wetness_hours", 6.0)) >= 12.0 and float(context.get("vpd_kpa", 0.95)) <= 0.40
        )

        # Rule 3: Fertilizer price spike
        is_fertilizer_spike = preset in ("fertilizer_spike", "npk_shortage")

        # Rule 4: Pre-harvest rain
        is_pre_harvest_rain = preset in ("pre_harvest_rain", "rain_penalty", "grade_threat") or (
            stage == "Ripening" and rain >= 20.0
        )

        # Rule 5: Regional market glut / post-hype overplanting crash
        is_regional_glut = preset in ("regional_glut", "post_hype_glut", "cobweb_glut", "market_glut") or (
            str(context.get("glut_risk_level", "")).upper() in ("HIGH", "CRITICAL")
            or float(context.get("cobweb_glut_risk_index", 0.0)) >= 0.65
        )

        if is_sensor_crack:
            stance = "KILL"
            arg = (
                "Activating motorized diesel pumps based on a cracked sensor reading burns $42/ha in wasted fuel and induces "
                "anaerobic root rot that risks losing $380/ha in yield value. Total economic downside is -$422/ha with ZERO return."
            )
            impact = "ECONOMIC_VETO: Suppress pump runtime. Zero cash required; farmer boot-heel tamp saves $42/ha in operating liquidity."
            econ_roi = "Cost of Inaction: $0. Cost of False-Alarm Intervention: -$422/ha. Net Savings: +$422/ha."
            supply_angle = "Preserving cooperative diesel reserves ensures fuel availability for mechanical harvesting operations."
            commercial_model = "Hardware-as-a-Service ($3/ha/season) includes automated spatial anomaly filters to prevent erroneous pumping."
        elif is_regional_glut:
            stance = "RESTRUCTURE"
            arg = (
                f"Regional market demand alert: Local planting rush has expanded township acreage significantly beyond "
                f"regional off-taker and drying depot capacity. Holding unhedged spot volume risks a catastrophic 40-70% price "
                f"collapse below the ${crop_val * 0.55:.1f}/ha regional production cost benchmark. ECONOMIC_VETO on speculative acreage expansion."
            )
            impact = "Mandate 40% forward-contracting, staggered planting cohorts, and cooperative storage reservation to preserve solvent margins."
            econ_roi = "Cost of Inaction (Unhedged Glut Dump): -$380/ha margin loss. Cost of Hedged Strategy: $18/ha. Net Advantage: +$362/ha."
            supply_angle = "Forward-contracts certified volume with regional millers/exporters to secure floor pricing before harvest glut hits."
            commercial_model = "Cooperative Aggregation SLA guaranteeing floor price protection against regional spot collapse."
        elif is_monsoon_blight:
            stance = "RESTRUCTURE"
            arg = (
                f"Blanket preventive fungicide across 10 hectares costs $45/ha ($450 total), consuming 90% of the farmer's remaining "
                f"${budget:.1f}/ha cash reserve with high risk of rain wash-off. However, restricting application to the 30% center high-risk "
                "micro-zone costs only $13.50/ha and protects $340/ha in Grade-A export yield."
            )
            impact = "Restructure chemical protocol from blanket spraying to targeted 30% micro-zone spot treatment; saves 65% in input spend."
            econ_roi = "Cost of Inaction: -$340/ha (loss of Grade-A premium). Cost of Targeted Action: $13.50/ha. Net ROI Multiple: 25.2x."
            supply_angle = "Guarantees Grade-1 disease-free grain spec required by export off-taker for $480/ton premium pricing."
            commercial_model = "Input-supplier subsidized spray kit amortized against certified export grain delivery."
        elif is_fertilizer_spike:
            stance = "RESTRUCTURE"
            arg = (
                f"Local 45% fertilizer shortage pushes standard blanket NPK application to $58/ha, exceeding the remaining ${budget:.1f}/ha budget. "
                "ECONOMIC_VETO on blanket chemical purchase. Buying on credit at 28% informal lender interest destroys seasonal profit margins."
            )
            impact = "Reallocate capital to precision foliar micro-dosing ($14/ha) on Lou's mapped deficit zones + organic straw mulching ($0)."
            econ_roi = "Cost of Inaction: -$220/ha (stunted panicles). Cost of Targeted Action: $14/ha. Net ROI Multiple: 15.7x."
            supply_angle = "Demonstrates input efficiency metrics that unlock low-interest cooperative green micro-loans."
            commercial_model = "Variable-rate input credit facility indexed to verified soil EC deficiency maps."
        elif is_pre_harvest_rain:
            stance = "FUND"
            arg = (
                "Waiting 4 days through incoming storm risks lodging and grain discoloration, triggering a 35% milling dockage penalty "
                f"(-${crop_val * 0.35:.1f}/ha revenue loss). Harvesting 48h early incurs a minor 4% dry-weight loss (-${crop_val * 0.04:.1f}/ha), "
                "but locks in Grade-1 Pawsan 100% export spec with under 5% broken grains."
            )
            impact = f"Net financial advantage of early harvest: +${(crop_val * 0.35) - (crop_val * 0.04):.1f}/ha in cash revenue preserved."
            econ_roi = f"Cost of Inaction: -${crop_val * 0.35:.1f}/ha. Early Harvest Coordination: $18/ha. Net ROI Multiple: 23.3x."
            supply_angle = "Forward-contracts combine harvester ($85/ha) on guaranteed Day 4 entry and reserves cooperative dryer floor space."
            commercial_model = "Export off-taker advances drying floor reservation fees against verified pre-harvest grain delivery."
        elif crop == "rice" and stage == "Ripening":
            stance = "APPROVE"
            arg = (
                f"Securing a combine harvester booking for day {days} is the decisive margin lever. "
                f"Cutting at {moisture:.1f}% moisture followed by immediate cooperative drying floor allocation "
                "protects the 'Pawsan 100%' export grade with under 5% broken rice, capturing a 25% price premium."
            )
            impact = (
                "Every day of delayed harvesting during peak regional season increases local combine hire rates by 12% "
                "and risks post-rain lodging that carries a 15% milling dockage penalty."
            )
            econ_roi = "Cost of Inaction: -$236.21/ha in dockage and drying fees. Combine SLA: $85/ha. Net Advantage: +$236.21/ha."
            supply_angle = "Cooperative milling contract guarantees 25% premium for under 5% broken grain delivery."
            commercial_model = "Hardware-as-a-Service ($3/ha/season) bundled with guaranteed off-take floor pricing."
        else:
            stance = "APPROVE"
            arg = f"Preserve seasonal cash flow and optimize market timing on {crop}."
            impact = "Ensures input expenditures remain under 20% of expected gross harvest value."
            econ_roi = "Target minimum 3.0x return on any external input expenditure."
            supply_angle = "Aligns harvest timing with local wholesale commodity trading peaks."
            commercial_model = "Cooperative group purchasing for input cost reduction."

        smart = SmartObjective(
            specific="Enforce asymmetric ROI hurdles, protect gross margins, and secure export quality premiums.",
            measurable=">=3.0x ROI within harvest cycle, zero default on input credit, +$236.21/ha net margin advantage.",
            achievable="Achieved through targeted micro-zone inputs, forward machine booking, and off-take contracts.",
            relevant="Guarantees farm financial solvency and delivers bottom-up economic value.",
            time_bound="Harvester booking and input budget allocation locked within 24 hours."
        )

        work_def = WorkDefinition(
            project_objective="Deliver asymmetric ROI by replacing expensive blanket inputs with targeted interventions and forward contracts.",
            deliverables=[
                f"Signed combine harvester SLA with guaranteed Day {days} entry",
                "Cooperative batch drying floor reservation for 14.0% export spec",
                "Micro-zone input allocation budget (saving 65% vs blanket spray)",
                "Export off-take agreement with Grade-1 quality premium"
            ],
            success_criteria=[
                "Benefit-to-Cost Ratio (BCR) >= 3.0 on all input expenditures",
                "Milling broken rice <= 5.0%, capturing 25% price premium",
                "Working capital preserved under remaining seasonal budget"
            ],
            scope_included=[
                "Commercial combine harvester hiring and logistics",
                "Cooperative mechanical batch dryer floor booking",
                "Off-taker contract negotiation and quality spec compliance"
            ],
            scope_excluded=[
                "Unsubsidized expensive hardware sales to cash-strapped farmers",
                "Unnecessary blanket chemical treatments with <3x ROI"
            ]
        )

        build_break_pitch = BuildBreakPitch(
            build_it="Forward-hire combine harvester ($85/ha), reserve drying floor, and package edge sensing at $3/ha/season HaaS.",
            break_it="Panic-cutting at 23% moisture burns -$236.21/ha in drying surcharges and 15% broken grain discounts.",
            pitch_it="Standing fast captures +$236/ha in clean cash and delivers a 78.7:1 Benefit-to-Cost Ratio on precision sensing."
        )

        top_risks = [
            RiskItem(
                id="R-MKT-01",
                name="Panic-Cutting Moisture Dockage & Broken Grain De-escalation",
                category="Commercial",
                likelihood="High",
                impact="High",
                heat_score="High",
                mitigation_plan="Hold cutting date until optimal moisture; guarantee batch dryer floor reservation.",
                owner="Qill (Agri-Economics Strategist)"
            ),
            RiskItem(
                id="R-MKT-02",
                name="Agrochemical Export Container Seizure (MRL Breach at Border)",
                category="Commercial",
                likelihood="Low",
                impact="High",
                heat_score="Medium",
                mitigation_plan="Enforce strict 14-day pre-harvest pesticide withholding ledger; lock chemical sprayers in co-op depot.",
                owner="Qill (Agri-Economics Strategist)"
            ),
        ]

        return MarketAssessment(
            stance=stance,
            core_argument=arg,
            unit_economics_impact=impact,
            unit_economics_and_roi=econ_roi,
            supply_chain_and_buyer_angle=supply_angle,
            proposed_commercial_model=commercial_model,
            smart_objective=smart,
            work_definition=work_def,
            build_break_pitch=build_break_pitch,
            top_risks=top_risks,
        )

    @classmethod
    def cross_examine_agriculture(cls, ag_assessment: dict[str, Any], context: dict[str, Any]) -> CrossExaminationItem:
        return CrossExaminationItem(
            from_agent="market",
            to_agent="agriculture",
            challenge=(
                "Your demand that farmers walk every plot on foot twice daily ignores rural labor reality: "
                "daily agricultural wage rates have risen 30%, and young farmworkers are migrating to urban centers. "
                "If an intervention requires 4 hours of daily manual tracking, smallholders will abandon it by week two."
            ),
            proposed_compromise=(
                "Concentrate manual inspection on high-value seed multiplication and specialty export plots, "
                "and accept batch-level automated risk indicators for commercial baseline acreage."
            ),
        )

    @classmethod
    def cross_examine_tech(cls, tech_assessment: dict[str, Any], context: dict[str, Any]) -> CrossExaminationItem:
        return CrossExaminationItem(
            from_agent="market",
            to_agent="tech",
            challenge=(
                "Your multi-sensor node architecture carries a $120/hectare upfront Bill of Materials (BOM). "
                "Smallholder net farm income in Myanmar is $400-$700/year; a farmer will never finance a 4-year hardware "
                "payback on a 1-year informal land tenancy agreement."
            ),
            proposed_compromise=(
                "Shift hardware to a Hardware-as-a-Service (HaaS) cooperative model charged at $3/hectare/season, "
                "bundled with guaranteed miller harvest off-take agreements."
            ),
        )


def evaluate_market(context: dict[str, Any]) -> MarketAssessment:
    return MarketAgent.evaluate(context)
