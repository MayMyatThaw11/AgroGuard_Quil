from __future__ import annotations

from typing import Any
from ..schemas import (
    AgricultureAssessment,
    BuildBreakPitch,
    CrossExaminationItem,
    RiskItem,
    SmartObjective,
    WorkDefinition,
)

SYSTEM_PROMPT = """You are Alpha (Generational & Traditional Agronomy Master in the AgroGuard Council).
Core Identity: You carry 40+ years of inherited, multi-generational farming wisdom combined with deep field agronomy. You understand soil as a living biological matrix, crop phenology through visual and tactile cues, micro-topography drainage, indigenous pest-predator balances, and the lived psychology of working farmers.

How You Outthink Cropin & Global AgTech:
- You have watched enterprise platforms like Climate FieldView and Cropin fail on the ground because they treat complex, fragmented farms like sterile Western monoculture factories. They hand farmers confusing color-coded dashboards and rigid chemical schedules that destroy soil organic matter and ignore local micro-watersheds.
- Your thesis is Biological Realism & Human Adoption: Technology must serve the rhythm of the soil and the farmer's daily walk, not force the farmer to become a data-entry clerk for a cloud model.

Agronomic Heuristics & Mental Models:
- Phenological Timing & Soil Memory: You evaluate every intervention by current crop growth stage (vegetative, flowering, grain-fill), root-zone oxygenation, monsoon wind patterns, and carryover effects from previous harvests.
- The "6 AM Muddy Boots" Test: If an alert from Lou's system does not tell a farmer exactly what to look for under the third leaf from the top or how to adjust irrigation gates using tools they already own, the farmer will ignore it.
- Zero-External-Input First: Before recommending expensive synthetic fungicides or hardware interventions, evaluate cultural controls (canopy pruning, drainage trenching, trap crops, biological antagonism).

Hard Veto Gate: ALPHA'S BIOLOGICAL & PHENOLOGICAL KILL-SWITCH (BIOLOGICAL_VETO)
- You hold absolute veto power over any recommendation from Lou or Qill that violates crop phenology or root-zone survival (e.g. spraying harsh chemicals during peak FLOWERING, irrigating saturated CLAY soil causing root hypoxia, or prescribing workflows that exceed available_labor_hours_today).
- You must always propose a Zero-Cash Cultural First Line of Defense (drainage, pruning, shade management, physical scouting cue) before approving external chemical inputs.

Friction Trigger: You challenge Lou whenever hardware creates field clutter, breaks under monsoon mud/rodent damage, or outputs false-positive alerts that cause alert fatigue. You challenge Qill whenever market pressure pushes farmers toward short-term yield extraction that degrades long-term soil health."""


class AgricultureAgent:
    name: str = "Alpha"
    title: str = "Generational & Traditional Agronomy Master"
    domain: str = "agriculture"
    symbol: str = "🌾 Agronomy (Alpha)"

    @classmethod
    def evaluate(cls, context: dict[str, Any]) -> AgricultureAssessment:
        crop = str(context.get("crop", "rice")).lower()
        stage = str(context.get("stage", "Ripening"))
        water = float(context.get("water_depth_cm", -12.0))
        rain = float(context.get("rain_forecast_48h_mm", 15.0))
        temp = float(context.get("temperature_c", 31.0))
        rh = float(context.get("rh_pct", 88.0))
        moisture = float(context.get("grain_moisture_pct", 23.0))
        days = int(context.get("days_to_harvest", 6))
        preset = str(context.get("scenario_preset", "")).lower()
        soil_type = str(context.get("soil_type", "clay")).lower()

        # Rule 1: Clay sensor crack false alarm
        is_sensor_crack = preset in ("clay_sensor_crack", "sensor_drift", "type_1") or (
            soil_type == "clay" and int(context.get("affected_nodes", 1)) == 1 and float(context.get("soil_moisture_drop_rate_pct_per_hr", 0.5)) >= 15.0
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

        if is_sensor_crack:
            stance = "VETO"
            arg = (
                "Heavy clay soil shrinks and cracks at the surface within 48 hours of sun, creating air voids around shallow probes. "
                "However, at 15cm depth in the active root zone, the soil is still saturated at field capacity. "
                "Pumping water now will induce root-zone hypoxia (oxygen starvation) and black root rot."
            )
            blind_spot = "BIOLOGICAL_VETO: Suppress automated irrigation. Irrigating clay fissures creates anaerobic mud and kills active root hairs."
            bio_reality = "Root zone 15cm below the cracked crust remains at 82% field capacity. Plant turgor is fully intact."
            intuition_check = "Stick your finger 2 inches into the soil between plants; cool moist subsoil proves the crop is not stressed."
            protocol = "Farmer walks to Node 2 at dawn and tamps down soil around the probe base with their boot heel ($0 cash outlay)."
        elif is_monsoon_blight:
            stance = "CAUTION"
            arg = (
                "High leaf wetness and warm muggy air create ideal spore incubation. However, spraying chemical fungicide during intermittent "
                "rain is useless because rain washes the chemical into drainage ditches before stomatal absorption. "
                "Furthermore, if crops are in flowering, high-pressure chemical droplets blast open floral organs and sterilize pollen."
            )
            blind_spot = "BIOLOGICAL_VETO against blanket spraying during rain/flowering. Cultural controls must precede any synthetic application."
            bio_reality = "Fungal pathogens require 12+ hours of film moisture on lower leaves to penetrate cuticle layers."
            intuition_check = "Inspect the underside of the 3rd leaf down from the canopy top in low hollows for water-soaked lesions."
            protocol = "Prune dense lower leaves and dig perimeter toe-drains with a hoe today to increase airflow; spot-spray only if lesions sporulate after rain."
        elif is_fertilizer_spike:
            stance = "APPROVE"
            arg = (
                "Blanket broadcasting synthetic NPK during dry or excessively hot periods causes 40% volatilization loss. "
                "Shift immediately to foliar micro-nutrition synchronized with the panicle initiation/booting transition, "
                "and retain organic straw mulch to preserve soil moisture and native microbial mineralization."
            )
            blind_spot = "Applying granular fertilizer on dry soil burns feeder roots through osmotic shock."
            bio_reality = "Foliar nutrient uptake through open stomata during early morning (06:00-08:30) is 4x more efficient than root uptake under water stress."
            intuition_check = "Look for pale yellowing on lowest leaves (mobile N translocation) vs new shoots (immobile micronutrient deficiency)."
            protocol = "Micro-dose foliar nitrogen spray at dawn only on pale zones; cover exposed soil with rice straw mulch ($0 cash)."
        elif is_pre_harvest_rain:
            stance = "APPROVE"
            arg = (
                "Panicle straw-color inspection shows 88% physiological maturity across benchmark tillers. "
                "Grain filling is biologically complete; vascular connection to the stem has formed a natural abscission layer. "
                "Leaving mature panicles through a 48h storm will cause severe lodging, soil contact, and vivipary (grain sprouting on the panicle)."
            )
            blind_spot = "Waiting for calendar date maturity while incoming rain turns topsoil into impassable slurry."
            bio_reality = "Grain moisture at 23% is safe for early harvest if panicles are shade-cured with active cross-ventilation."
            intuition_check = "Bite a grain from the lower third of the panicle; if it cracks cleanly with no milky dough, the crop is ready to cut."
            protocol = "Advance harvest 48 hours ahead of rain; mobilize local sickle harvest crews and stage grain on elevated bamboo slats."
        elif crop == "rice" and stage == "Ripening":
            stance = "APPROVE"
            arg = (
                f"Field drainage is biologically urgent. At {moisture:.1f}% grain moisture, standing water inhibits "
                "final vascular maturation and creates anaerobic soil softening that will bog down combine harvesters."
            )
            blind_spot = "Failing to walk the perimeter bunds to check subsoil shear strength before bringing in heavy machinery."
            bio_reality = "Rice roots need oxygen during senescence to firm up cell walls and prevent pre-harvest lodging."
            intuition_check = "Check if 85% of panicles have turned golden yellow while flag leaves remain slightly green."
            protocol = "Open perimeter drainage notches at dawn; dig shallow toe-drains through standing hollows with a hand hoe ($0 cash)."
        else:
            stance = "APPROVE"
            arg = f"Biological balance on {crop} is stable under current field micro-climate."
            blind_spot = "Over-reliance on synthetic sprays suppresses beneficial predatory spiders and parasitic wasps."
            bio_reality = "Native soil microbiome is maintaining root health."
            intuition_check = "Morning leaf turgor is upright with healthy guttation droplets at leaf margins."
            protocol = "Continue routine cultural monitoring; preserve soil organic matter."

        smart = SmartObjective(
            specific="Execute zero-cost cultural field interventions, protect root-zone biology, and prevent crop lodging.",
            measurable="Zero root rot/hypoxia, 0% vivipary germination on panicles, subsoil bearing capacity >= 300 kPa.",
            achievable="Achieved using farmer's existing hand tools (hoe, sickle) and 4 hours of morning labor.",
            relevant="Preserves biological yield and farmer autonomy while avoiding unnecessary chemical expenditures.",
            time_bound="Drainage and visual inspection completed by 08:00 AM tomorrow."
        )

        work_def = WorkDefinition(
            project_objective="Ground decisions in plant physiology, soil health, and realistic farmer adoption.",
            deliverables=[
                "Perimeter gravity drainage toe-drains cleared with hand hoe ($0)",
                "Panicle maturity inspection (golden straw ratio >= 85%)",
                "Subsoil boot-heel firmness test across lowest hollows",
                "Zero-cash cultural protection protocol (pruning/mulching)"
            ],
            success_criteria=[
                "Zero waterlogging or root hypoxia in active root zone",
                "Combine harvester operates without rutting or bogging",
                "Zero pesticide spray wash-off waste into field ditches"
            ],
            scope_included=[
                "Manual furrow clearing and water gate adjustment",
                "Physical leaf and grain inspection routines",
                "Cultural first line of defense"
            ],
            scope_excluded=[
                "Prophylactic chemical blanket spraying",
                "Complex sensor calibrations that burden the farmer"
            ]
        )

        build_break_pitch = BuildBreakPitch(
            build_it="Dig manual finger toe-drains through hollows, clear perimeter weirs at dawn, and verify panicle maturity cues.",
            break_it="25 mm rain ponds in clay depressions; soil liquefies; combine bogs down; vivipary ruins seed viability.",
            pitch_it="45 minutes with a hoe at dawn costs zero cash, but saves the family crop from rotting in the mud."
        )

        top_risks = [
            RiskItem(
                id="R-AGRI-01",
                name="Topsoil Liquefaction & Heavy Combine Harvester Bogging",
                category="Agronomic",
                likelihood="Medium",
                impact="High",
                heat_score="High",
                mitigation_plan="Cut perimeter surface toe-drains immediately; mandate boot-heel firmness test before combine entry.",
                owner="Alpha (Generational Agronomist)"
            ),
            RiskItem(
                id="R-AGRI-02",
                name="Pre-Harvest Sprouting (Vivipary) & Lodging in Mud",
                category="Agronomic",
                likelihood="High",
                impact="High",
                heat_score="High",
                mitigation_plan="Hold cutting until grain moisture hits target; if storm arrives, early-harvest and shade-cure on racks.",
                owner="Alpha (Generational Agronomist)"
            ),
        ]

        return AgricultureAssessment(
            stance=stance,
            core_argument=arg,
            blind_spot_warning=blind_spot,
            biological_and_field_reality=bio_reality,
            generational_intuition_check=intuition_check,
            proposed_field_protocol=protocol,
            smart_objective=smart,
            work_definition=work_def,
            build_break_pitch=build_break_pitch,
            top_risks=top_risks,
        )

    @classmethod
    def cross_examine_tech(cls, tech_assessment: dict[str, Any], context: dict[str, Any]) -> CrossExaminationItem:
        return CrossExaminationItem(
            from_agent="agriculture",
            to_agent="tech",
            challenge=(
                "Your automated solenoid valves and LoRaWAN soil telemetry ignore real field degradation: "
                "mud, rat-chewed cables, and soil shrinking away from probes will cause false dry readings during monsoon downpours."
            ),
            proposed_compromise=(
                "Require a 2-minute physical water tube thumb-check protocol once weekly to recalibrate edge sensor zeroes."
            ),
        )

    @classmethod
    def cross_examine_market(cls, market_assessment: dict[str, Any], context: dict[str, Any]) -> CrossExaminationItem:
        return CrossExaminationItem(
            from_agent="agriculture",
            to_agent="market",
            challenge=(
                "Your demand for rigid harvesting schedules to catch commodity forward contracts ignores crop phenology: "
                "cutting 3 days before physiological maturity increases immature green grains and ruins seed viability."
            ),
            proposed_compromise=(
                "Lock the buyer contract window with a ±4 day biological float based on actual grain moisture readings."
            ),
        )


def evaluate_agriculture(context: dict[str, Any]) -> AgricultureAssessment:
    return AgricultureAgent.evaluate(context)
