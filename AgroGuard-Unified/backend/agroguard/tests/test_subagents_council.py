import pytest

from app.services.subagents_council import (
    SubAgentId,
    PROFILES,
    evaluate_pre_harvest_council,
    untraced_numbers,
    extract_numbers,
)


def test_subagents_profile_properties():
    alpha = PROFILES[SubAgentId.ALPHA]
    lou = PROFILES[SubAgentId.LOU]
    qill = PROFILES[SubAgentId.QILL]

    assert alpha.symbol == "Agricultural"
    assert "Traditional" in alpha.archetype
    assert "hands that turn it" in alpha.motto

    assert lou.symbol == "Tech AI"
    assert "Tech-Lover" in lou.archetype
    assert "sensors" in lou.motto

    assert qill.symbol == "Business"
    assert "Pragmatic" in qill.archetype
    assert "export residue" in qill.motto


def test_rice_pre_harvest_evaluation():
    evaluation = evaluate_pre_harvest_council(
        crop="rice",
        field_id="Paddy-09",
        stage="Ripening",
        water_depth_cm=-10.0,
        rain_forecast_48h_mm=12.0,
        wind_speed_ms=3.0,
        temperature_c=30.0,
        rh_pct=85.0,
        grain_moisture_pct=22.0,
        days_to_harvest=5,
    )

    assert evaluation.crop == "rice"
    assert len(evaluation.consensus) >= 2
    assert len(evaluation.dissent_matrix) >= 1

    verdicts = evaluation.verdicts
    assert SubAgentId.ALPHA in verdicts
    assert SubAgentId.LOU in verdicts
    assert SubAgentId.QILL in verdicts

    # Zero untraced numbers (anti-hallucination invariant)
    assert verdicts[SubAgentId.ALPHA].untraced == []
    assert verdicts[SubAgentId.LOU].untraced == []
    assert verdicts[SubAgentId.QILL].untraced == []

    # Persona differentiation
    assert "drain" in verdicts[SubAgentId.ALPHA].action_proposal.lower()
    assert "ndvi" in verdicts[SubAgentId.LOU].action_proposal.lower()
    assert "milling" in verdicts[SubAgentId.QILL].action_proposal.lower() or "harvester" in verdicts[SubAgentId.QILL].verdict.lower()


def test_wheat_pre_harvest_evaluation():
    evaluation = evaluate_pre_harvest_council(
        crop="wheat",
        field_id="Wheat-Plot-3",
        stage="Grain Fill",
        water_depth_cm=0.0,
        rain_forecast_48h_mm=5.0,
        wind_speed_ms=2.5,
        temperature_c=33.0,  # heat stress condition
        rh_pct=75.0,
    )

    assert evaluation.crop == "wheat"
    verdicts = evaluation.verdicts

    assert verdicts[SubAgentId.ALPHA].untraced == []
    assert verdicts[SubAgentId.LOU].untraced == []
    assert verdicts[SubAgentId.QILL].untraced == []

    # Lou flags heat stress / canopy temperature
    assert "33.0" in verdicts[SubAgentId.LOU].verdict
    # Qill flags withholding / dockage fees
    assert "withholding" in verdicts[SubAgentId.QILL].verdict.lower() or "dockage" in verdicts[SubAgentId.QILL].core_reasoning.lower()


def test_coffee_pre_harvest_evaluation():
    evaluation = evaluate_pre_harvest_council(
        crop="coffee",
        field_id="Estate-Highland-1",
        stage="Cherry Ripening",
        temperature_c=24.0,
        rh_pct=80.0,
    )

    assert evaluation.crop == "coffee"
    verdicts = evaluation.verdicts

    assert verdicts[SubAgentId.ALPHA].untraced == []
    assert verdicts[SubAgentId.LOU].untraced == []
    assert verdicts[SubAgentId.QILL].untraced == []

    # Alpha insists on selective hand picking
    assert "hand-picking" in verdicts[SubAgentId.ALPHA].verdict.lower()
    # Lou references canopy / Brix
    assert "shade canopy" in verdicts[SubAgentId.LOU].verdict.lower()
    # Qill references specialty cup scores and moisture
    assert "specialty" in verdicts[SubAgentId.QILL].verdict.lower()


def test_rea_anti_hallucination_tracer_catches_unbacked_numbers():
    evidence = [
        {"claim": "Water depth is -15.0 cm", "values": [-15.0]},
        {"claim": "Rain forecast is 25.0 mm", "values": [25.0]},
    ]

    clean_text = "The water depth of -15.0 cm matches the 25.0 mm forecast."
    assert untraced_numbers(clean_text, evidence) == []

    hallucinated_text = "The water depth of -15.0 cm with 99.9 degrees temperature."
    missing = untraced_numbers(hallucinated_text, evidence)
    assert "99.9" in missing

