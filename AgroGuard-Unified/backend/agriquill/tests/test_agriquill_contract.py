from pathlib import Path

import pytest

from agriquill import contract, dsl

PARCELS = Path(__file__).resolve().parents[1] / "parcels"
BRIEF = """
parcel myanmar_field_01 {
  area: 12.5 ha
  crop: "Paw San Hmwe (Pearl Grain)"
  standard: ASOA_ORGANIC

  hydrology {
    regime: AWD_SAFE
    trigger_irrig_below: -15 cm
    flowering_lock_depth: 3 cm .. 5 cm
  }

  actuation_gates {
    max_wind_speed: 5.5 m/s
    valid_delta_t: 2.0 C .. 8.0 C
    max_rain_6h_post: 10.0 mm
  }

  yield_logic {
    max_canopy_nitrogen: 85 kg/ha   # Hard cap to prevent Paw San Hmwe lodging
    min_marginal_roi: 1.5x
  }
}
"""


def codes(result):
    return {d["code"] for d in result["diagnostics"]}


def test_brief_contract_parses_and_normalizes_units():
    out = contract.verify(BRIEF)
    assert out["is_valid"] is True
    parcel = out["contract"]["parcels"][0]
    assert parcel["area_ha"] == 12.5
    assert parcel["standard"] == "ASOA_ORGANIC"
    terms = parcel["terms"]
    assert terms["hydrology"]["trigger_cm"] == -15.0
    assert terms["hydrology"]["flowering_lock_cm"] == [3.0, 5.0]
    assert terms["gates"] == {"max_wind_ms": 5.5, "delta_t_c": [2.0, 8.0], "max_rain_6h_mm": 10.0}
    assert terms["yield"] == {"max_canopy_n_kg_ha": 85.0, "min_roi": 1.5}
    assert {"AGRI-W020", "AGRI-W021"} <= codes(out)


def test_demo_coop_contract_is_valid():
    out = contract.verify((PARCELS / "delta_demo_coop.agri").read_text(encoding="utf-8"))
    assert out["is_valid"] is True, out["diagnostics"]
    c = out["contract"]
    assert c["farm"]["id"] == "farm_ayeyarwady_demo"
    assert len(c["parcels"]) == 7 and len(c["assets"]) == 7
    assert all(len(p["boundary"]) >= 4 and p["osm"].startswith("way/") for p in c["parcels"])
    assert c["farm"]["terms"]["schedule"]["durations_h"]["spray"] == 2.0
    assert contract.to_thresholds(c)["flowering_max_depth_cm"] == 5.0


def test_legacy_sample_still_parses():
    out = contract.verify((PARCELS / "field_01_paddy.agri").read_text(encoding="utf-8"))
    assert out["contract"] is not None
    assert out["contract"]["farm"]["terms"]["hydrology"]["trigger_cm"] == -15.0
    assert "AGRI-E001" not in codes(out)


def test_contract_cannot_relax_wind_ceiling():
    out = contract.verify(BRIEF.replace("5.5 m/s", "7.0 m/s"))
    assert "AGRI-E020" in codes(out) and out["is_valid"] is False


def test_km_per_hour_is_converted():
    out = contract.verify(BRIEF.replace("5.5 m/s", "18 km/h"))
    assert out["contract"]["parcels"][0]["terms"]["gates"]["max_wind_ms"] == 5.0


def test_inverted_range_and_wrong_unit():
    assert "AGRI-E021" in codes(contract.verify(BRIEF.replace("3 cm .. 5 cm", "5 cm .. 3 cm")))
    assert "AGRI-E022" in codes(contract.verify(BRIEF.replace("85 kg/ha", "85 m/s")))


def test_awd_trigger_above_surface_is_rejected():
    assert "AGRI-E024" in codes(contract.verify(BRIEF.replace("-15 cm", "2 cm")))


def test_fertigation_above_nitrogen_cap():
    text = BRIEF.replace("}\n}", "}\n  fertigation { max_nitrogen_rate: 90 kg_N/ha }\n}")
    assert "AGRI-E023" in codes(contract.verify(text))


def test_syntax_error_is_error_only_with_contract_blocks():
    assert "AGRI-E001" in codes(contract.verify("parcel x { hydrology { trigger_irrig_below: }"))
    assert "AGRI-W010" in codes(contract.verify("management { day 10: x }"))


def test_lint_keeps_e010_and_adds_contract_terms():
    out = dsl.lint(
        BRIEF.replace("max_canopy_nitrogen", "material: synthetic_urea\n max_canopy_nitrogen")
    )
    assert "AGRI-E010" in codes(out)
    assert dsl.lint(BRIEF)["contract"] is not None


def test_patch_rewrites_one_value():
    text = contract.patch(BRIEF, "myanmar_field_01.hydrology.trigger_irrig_below", "-12 cm")
    out = contract.verify(text)
    assert out["contract"]["parcels"][0]["terms"]["hydrology"]["trigger_cm"] == -12.0
    assert text.count("-12 cm") == 1
    with pytest.raises(KeyError):
        contract.patch(BRIEF, "nope.trigger", "1")
