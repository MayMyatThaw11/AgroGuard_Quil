from agriquill import dsl, onboard, safety


def test_every_annex_row_cites_its_clause_and_stays_to_verify():
    rows = safety.annex_rows()
    assert rows
    for row in rows:
        assert row["rule"] in {"prohibited", "not_authorised", "conditional"}
        assert row["clause"] and row["status"] == "TO VERIFY"
        if not row["clause"].startswith("ASOA text not fetched"):
            assert row["source_url"].startswith("http") and row["retrieved"]


def test_nop_blocks_its_named_natural_bans_and_unlisted_synthetics():
    banned = safety.prohibited_for("USDA_NOP")
    assert banned is not None
    assert {"rotenone", "arsenic", "strychnine", "carbamate_insecticide"} <= set(banned)
    assert onboard._banned_match("Rotenone 5% EC", "rotenone")
    assert "potassium_chloride" not in banned


def test_conditional_inputs_warn_with_their_condition_instead_of_blocking():
    rows = {r["item"]: r for r in safety.conditional_for("USDA_NOP")}
    assert "20 %" in rows["sodium_nitrate"]["condition"]
    assert rows["synthetic_storage_fumigant"]["clause"] == "7 CFR 205.271(d)"
    eu = {r["item"]: r for r in safety.conditional_for("EU_2018_848")}
    assert "28 kg" in eu["copper"]["condition"]


def test_eu_keeps_plant_pyrethrins_apart_from_synthetic_pyrethroids():
    assert "synthetic_pyrethroids" in (safety.prohibited_for("EU_2018_848") or ())
    assert not onboard._banned_match("Pyrethrins extracted from plants", "synthetic_pyrethroids")


def test_nop_now_flags_a_carbamate_with_its_clause():
    out = dsl.lint('standard: "USDA_NOP"\nspray: carbamate_insecticide')
    assert out["is_valid"] is False
    assert safety.clause_for("USDA_NOP", "carbamate_insecticide").startswith("7 CFR 205.105(a)")
