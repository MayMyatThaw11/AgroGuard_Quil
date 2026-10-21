from __future__ import annotations

from typing import Literal, Any
from pydantic import BaseModel, Field, ConfigDict

AgentDomain = Literal["agriculture", "tech", "market"]
AgentStance = Literal["APPROVE", "CAUTION", "REJECT", "DEPLOY", "MODIFY", "VETO", "FUND", "RESTRUCTURE", "KILL"]
RiskLevel = Literal["Low", "Medium", "High"]

# =========================================================================
# HARD VETO GATES & TRIAGE CLASSIFICATION STANDARDS
# =========================================================================

TriageClassification = Literal[
    "TYPE_1_SENSOR_FAULT",
    "TYPE_2_LOCALIZED_STRESS",
    "TYPE_3_SYSTEMIC_CRISIS",
]

VetoType = Literal[
    "HARDWARE_DRIFT_VETO",
    "BIOLOGICAL_VETO",
    "ECONOMIC_VETO",
]

CouncilAgentName = Literal["Lou", "Alpha", "Qill"]


class ActiveVetoItem(BaseModel):
    agent: str = Field(description="Agent issuing the veto: Lou | Alpha | Qill")
    veto_type: str = Field(description="Veto category: HARDWARE_DRIFT_VETO | BIOLOGICAL_VETO | ECONOMIC_VETO")
    reason: str = Field(description="Mechanistic explanation of the veto")


# =========================================================================
# AMCHAM / PEPSI / AGROGUARD PROJECT EXECUTION STANDARDS (01 - 08)
# =========================================================================

class SmartObjective(BaseModel):
    specific: str = Field(description="What exactly are we trying to accomplish?")
    measurable: str = Field(description="How will we measure success? Quantifiable metrics.")
    achievable: str = Field(description="Can we realistically deliver it under field constraints?")
    relevant: str = Field(description="Why does it matter to the farm, crop, or business?")
    time_bound: str = Field(description="By when must it be achieved?")


class WorkDefinition(BaseModel):
    project_objective: str = Field(description="WHY ARE WE DOING THIS?")
    deliverables: list[str] = Field(description="WHAT WILL WE PRODUCE?")
    success_criteria: list[str] = Field(description="HOW WILL WE KNOW WE SUCCEEDED?")
    scope_included: list[str] = Field(description="WHAT IS INCLUDED?")
    scope_excluded: list[str] = Field(description="WHAT IS NOT INCLUDED?")


class BuildBreakPitch(BaseModel):
    build_it: str = Field(description="How the agent constructs the solution within their domain.")
    break_it: str = Field(description="How the agent stress-tests failure modes, edge cases, and catastrophic risks.")
    pitch_it: str = Field(description="How the agent pitches the proposal and value proposition to stakeholders.")


class RaciEntry(BaseModel):
    activity: str = Field(description="Task or deliverable activity")
    responsible: str = Field(description="Does the work (R)")
    accountable: str = Field(description="Owns the outcome (A)")
    consulted: str = Field(description="Provides input (C)")
    informed: str = Field(description="Needs to know (I)")


class WbsActivity(BaseModel):
    id: str = Field(description="WBS work package code (e.g. 1.1, 2.1)")
    what: str = Field(description="What needs to be done?")
    who: str = Field(description="Who owns it?")
    when: str = Field(description="When does it start and finish?")
    dependency: str = Field(description="What must happen first?")
    milestone: str = Field(description="What major achievement are we looking for?")


class RiskItem(BaseModel):
    id: str = Field(description="Risk identifier (e.g. R-01)")
    name: str = Field(description="Description of the risk")
    category: str = Field(description="Domain category (Agronomic, Technical, Commercial)")
    likelihood: RiskLevel = Field(description="Likelihood (Low, Medium, High)")
    impact: RiskLevel = Field(description="Impact (Low, Medium, High)")
    heat_score: str = Field(description="Risk Level on 3x3 Heat Map: Low, Medium, or High")
    mitigation_plan: str = Field(description="Actionable mitigation countermeasure")
    owner: str = Field(description="Risk owner")


class ProjectPlan8Point(BaseModel):
    smart_objective: SmartObjective
    scope_and_deliverables: WorkDefinition
    stakeholders: list[str] = Field(default_factory=list)
    raci_matrix: list[RaciEntry] = Field(default_factory=list)
    wbs: list[WbsActivity] = Field(default_factory=list)
    timeline_and_milestones: list[str] = Field(default_factory=list)
    top_risks: list[RiskItem] = Field(default_factory=list)
    mitigation_summary: list[str] = Field(default_factory=list)


# =========================================================================
# PERSONA ASSESSMENTS (LOU, ALPHA, QILL)
# =========================================================================

class AgricultureAssessment(BaseModel):
    stance: AgentStance = "APPROVE"
    core_argument: str
    blind_spot_warning: str
    biological_and_field_reality: str = ""
    generational_intuition_check: str = ""
    proposed_field_protocol: str = ""
    smart_objective: SmartObjective | None = None
    work_definition: WorkDefinition | None = None
    build_break_pitch: BuildBreakPitch | None = None
    top_risks: list[RiskItem] = Field(default_factory=list)


class TechAssessment(BaseModel):
    stance: AgentStance = "APPROVE"
    core_argument: str
    system_constraint: str
    edge_architecture_diagnosis: str = ""
    why_macro_agtech_fails_here: str = ""
    proposed_tech_spec: str = ""
    smart_objective: SmartObjective | None = None
    work_definition: WorkDefinition | None = None
    build_break_pitch: BuildBreakPitch | None = None
    top_risks: list[RiskItem] = Field(default_factory=list)


class MarketAssessment(BaseModel):
    stance: AgentStance = "APPROVE"
    core_argument: str
    unit_economics_impact: str
    unit_economics_and_roi: str = ""
    supply_chain_and_buyer_angle: str = ""
    proposed_commercial_model: str = ""
    smart_objective: SmartObjective | None = None
    work_definition: WorkDefinition | None = None
    build_break_pitch: BuildBreakPitch | None = None
    top_risks: list[RiskItem] = Field(default_factory=list)


class InitialAssessments(BaseModel):
    agriculture: AgricultureAssessment
    tech: TechAssessment
    market: MarketAssessment


# =========================================================================
# UPGRADED AGENT DELIBERATION SCHEMA
# =========================================================================

class LouDiagnosis(BaseModel):
    telemetry_verdict: str
    micro_zone_isolation: str
    edge_system_adjustment: str
    why_macro_agtech_fails_here: str = ""
    stance: str = "DEPLOY"


class AlphaDiagnosis(BaseModel):
    physiological_mechanism: str
    visual_field_verification_cue: str
    zero_cost_cultural_action: str
    generational_intuition_check: str = ""
    stance: str = "APPROVE"


class QillDiagnosis(BaseModel):
    cost_of_inaction_usd_ha: float
    intervention_cost_usd_ha: float
    net_roi_multiple: float
    market_timing_strategy: str
    stance: str = "FUND"


class AgentDeliberation(BaseModel):
    lou_diagnosis: LouDiagnosis
    alpha_diagnosis: AlphaDiagnosis
    qill_diagnosis: QillDiagnosis


class CrossExaminationClash(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_agent: str = Field(alias="from")
    to_agent: str = Field(alias="to")
    constraint_violation_called_out: str
    resolved_tradeoff: str


CouncilCrossExaminationItem = CrossExaminationClash


class CrossExaminationItem(BaseModel):
    from_agent: AgentDomain
    to_agent: AgentDomain
    challenge: str
    proposed_compromise: str


class ActionPlan(BaseModel):
    field_execution: str
    technical_implementation: str
    commercial_positioning: str


# =========================================================================
# TIME-HORIZON ACTION PLAN & CLOSED-LOOP HOOK
# =========================================================================

class TPlus6HoursFieldTriage(BaseModel):
    exact_farmer_action: str
    where_to_look_in_field: str
    cash_required_usd: float = 0.0


class TPlus7DaysSystemAndInputs(BaseModel):
    targeted_intervention: str
    sensor_and_model_recalibration: str
    budget_allocated_usd_ha: float


class HarvestHorizonMarginProtection(BaseModel):
    yield_grade_protection_plan: str
    buyer_and_cashflow_move: str


class TimeHorizonActionPlan(BaseModel):
    t_plus_6_hours_field_triage_alpha: TPlus6HoursFieldTriage
    t_plus_7_days_system_and_inputs_lou: TPlus7DaysSystemAndInputs
    harvest_horizon_margin_protection_qill: HarvestHorizonMarginProtection


class ClosedLoopVerificationHook(BaseModel):
    check_in_hours: int = 48
    expected_telemetry_shift: str
    expected_visual_crop_response: str


class FarmPainPointPayload(BaseModel):
    crop: str = "rice"
    field_id: str = "Paddy-01"
    stage: str = "Ripening"
    water_depth_cm: float = -12.0
    rain_forecast_48h_mm: float = 15.0
    wind_speed_ms: float = 3.2
    temperature_c: float = 31.0
    rh_pct: float = 78.0
    ndvi_slope: float = -0.04
    grain_moisture_pct: float = 23.0
    days_to_harvest: int = 6

    # Telemetry and Veto Ingest Fields
    active_nodes: int = 4
    affected_nodes: int = 1
    sensor_confidence_score: float = 0.88
    soil_type: str = "clay"  # clay, loam, sandy
    soil_moisture_drop_rate_pct_per_hr: float = 0.5
    leaf_wetness_hours: float = 6.0
    vpd_kpa: float = 0.95
    available_labor_hours_today: float = 4.0
    remaining_budget_usd_per_ha: float = 50.0
    crop_economic_value_usd_ha: float = 1200.0
    scenario_preset: str | None = None


class CouncilVerdict(BaseModel):
    final_decision: str
    key_tradeoffs_made: list[str] = Field(default_factory=list)
    action_plan: ActionPlan
    smart_objective: SmartObjective | None = None
    work_definition: WorkDefinition | None = None
    project_plan: ProjectPlan8Point | None = None


class GroundTruthStateVector(BaseModel):
    physical_telemetry: dict[str, Any] = Field(default_factory=dict)
    biological_clock: dict[str, Any] = Field(default_factory=dict)
    economic_envelope: dict[str, Any] = Field(default_factory=dict)
    uncertainty_flags: list[str] = Field(default_factory=list)


# =========================================================================
# TRI-BRIDGE ARCHITECTURE SCHEMAS (ZERO-HALLUCINATION PRODUCTION STANDARD)
# =========================================================================

class DeterministicAudit(BaseModel):
    math_verified: bool = True
    phi_compliance_verified: bool = True
    budget_cap_verified: bool = True
    active_vetoes: list[str] = Field(default_factory=list)


class FieldToEdgeBridge(BaseModel):
    alpha_visual_check_for_farmer: str
    lou_bayesian_recalibration_rule: str


class EdgeToMarketBridge(BaseModel):
    lou_verified_telemetry_proof: str
    qill_buyer_grade_compliance_status: Literal["COMPLIANT", "AT_RISK", "DOWNGRADED"] = "COMPLIANT"


class AgronomyToCommerceBridge(BaseModel):
    approved_catalog_sku_id: str
    unit_cost_usd_ha: float
    verified_roi_multiple: float


class TriBridgeSynthesis(BaseModel):
    field_to_edge_bridge: FieldToEdgeBridge
    edge_to_market_bridge: EdgeToMarketBridge
    agronomy_to_commerce_bridge: AgronomyToCommerceBridge


class FarmerActionCardAlpha(BaseModel):
    t_plus_6h_zero_cost_task: str
    exact_field_zone: str
    tools_needed: str


class IoTDownlinkCommandLou(BaseModel):
    target_node_ids: list[str]
    new_wake_interval_sec: int
    anomaly_threshold_patch: str


class IRLMarketIntentQill(BaseModel):
    action_type: Literal[
        "FREEZE_SPEND",
        "DISPATCH_COOP_INPUT_ORDER",
        "LOCK_FORWARD_HARVEST_LOT",
        "TRIGGER_INSURANCE_PROOF",
    ] = "FREEZE_SPEND"
    counterparty_id: str
    protected_margin_usd_ha: float


class ExecutableDispatchPayloads(BaseModel):
    farmer_action_card_alpha: FarmerActionCardAlpha
    iot_downlink_command_lou: IoTDownlinkCommandLou
    irl_market_intent_qill: IRLMarketIntentQill


# =========================================================================
# UNIFIED RESPONSE SCHEMA
# =========================================================================

class DeliberationResponse(BaseModel):
    # Tri-Bridge Architecture Gold Standard fields
    bridge_transaction_id: str = ""
    triage_status: str = "TYPE_2_LOCALIZED_STRESS"
    deterministic_audit: DeterministicAudit | None = None
    tri_bridge_synthesis: TriBridgeSynthesis | None = None
    executable_dispatch_payloads: ExecutableDispatchPayloads | None = None
    circuit_breaker_intercepts: list[str] = Field(default_factory=list)

    # Upgraded Decision Support Dashboard fields
    triage_classification: str = "TYPE_2_LOCALIZED_STRESS"
    confidence_score: float = 0.88
    active_vetoes_triggered: list[ActiveVetoItem] = Field(default_factory=list)
    state_vector: GroundTruthStateVector | None = None
    agent_deliberation: AgentDeliberation | None = None
    cross_examination_clashes: list[CrossExaminationClash] = Field(default_factory=list)
    time_horizon_action_plan: TimeHorizonActionPlan | None = None
    closed_loop_verification_hook: ClosedLoopVerificationHook | None = None

    # Preserved backward compatibility & AMCHAM fields
    query_context: str = ""
    scenario_summary: str = ""
    initial_assessments: InitialAssessments
    cross_examination: list[CrossExaminationItem] = Field(default_factory=list)
    council_verdict: CouncilVerdict
