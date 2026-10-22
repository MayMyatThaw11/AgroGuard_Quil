import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import app
from app.services import decision_engine as de
from app.services import disease_advice as da
from app.services import pesticide_rules

MODELS = Path(__file__).resolve().parents[3] / "plant_disease_detection" / "trained_models"
FRUIT_GRADE = ("_fruit",)
NOT_DISEASES = ("healthy", "background", "not_a_plant", *FRUIT_GRADE)


def model_classes() -> list[str]:
    names: list[str] = []
    for path in sorted(MODELS.glob("*/class_names.json")):
        loaded = json.loads(path.read_text(encoding="utf-8"))
        names += loaded if isinstance(loaded, list) else list(loaded.values())
    return names


def model_disease_classes() -> list[str]:
    return [n for n in model_classes() if not any(word in n.lower() for word in NOT_DISEASES)]


@pytest.fixture(autouse=True)
def reviewed_only(monkeypatch):
    # Most tests check the strict mode; the unreviewed-listing tests turn it on themselves.
    monkeypatch.setattr(get_settings(), "disease_advice_unreviewed_sprays", False)


def sign_off(monkeypatch, *classes: str) -> None:
    review = {"reviewed_by": "Test Agronomist", "reviewed_on": "2026-11-01"}
    monkeypatch.setattr(da, "_reviews", lambda: {c: review for c in classes})


def test_every_disease_class_the_model_can_return_has_advice_and_a_decision():
    classes = model_disease_classes()
    assert len(classes) == 62
    assert [c for c in classes if da.advice_for(c) is None] == []
    assert [c for c in classes if de.category_of(c) != "disease"] == []
    assert sorted(classes) == sorted(da.known_classes())


def test_all_86_model_classes_get_a_decision_and_the_decision_table_has_no_strays():
    classes = model_classes()
    assert len(classes) == 86
    assert [c for c in classes if de.decide(c) is None] == []
    used = {de.label_for(c) for c in model_disease_classes()}
    assert used == set(de.disease_classes())


def test_every_step_and_spray_code_exists_in_both_languages():
    data = da._management()
    for name, row in data["classes"].items():
        assert row["cause"] in data["causes"], name
        for code in row["steps"]:
            assert {"en", "my"} <= set(data["steps"][code]), (name, code)
        for code in row["spray"]:
            assert {"en", "my"} <= set(data["spray_kinds"][code]), (name, code)
    assert all({"en", "my"} <= set(line) for line in data["safety"] + data["when_to_spray"])


def test_no_banned_or_restricted_ingredient_appears_anywhere_in_the_advice_data():
    for name in ("disease_management.json", "disease_decisions.json"):
        text = (da.DATA_DIR / name).read_text(encoding="utf-8")
        assert pesticide_rules.mentions(text) == [], name
    everything = [de.decide(c, lang) for c in model_classes() for lang in ("en", "my")]
    assert pesticide_rules.mentions(json.dumps(everything)) == []


def test_decision_groups_match_the_spec_counts():
    rows = de._table()["decisions"]
    both = [r for r in rows.values() if r["needs_spray"] and r["needs_fertilizer"]]
    spray_only = [r for r in rows.values() if r["needs_spray"] and not r["needs_fertilizer"]]
    fert_only = [r for r in rows.values() if not r["needs_spray"] and r["needs_fertilizer"]]
    neither = [r for r in rows.values() if not r["needs_spray"] and not r["needs_fertilizer"]]
    assert (len(both), len(spray_only), len(fert_only), len(neither)) == (57, 3, 1, 1)
    assert set(spray_only_labels()) == {
        "Corn - Cercospora gray leaf spot",
        "Cassava - Brown streak disease",
        "Mango (leaf) - Cutting weevil",
    }
    assert de.decide("Rice___Leaf_Smut")["needs_spray"] is False
    assert de.decide("Rice___Leaf_Smut")["needs_fertilizer"] is True
    assert de.decide("Cassava___Green_Mottle")["fertilizer_action"] == "none_sanitation_only"


def spray_only_labels() -> list[str]:
    rows = de._table()["decisions"]
    return [k for k, r in rows.items() if r["needs_spray"] and not r["needs_fertilizer"]]


def test_non_action_classes_say_no_spray_and_no_fertilizer():
    healthy = de.decide("Rice___Healthy")
    assert healthy["category"] == "healthy" and not healthy["needs_spray"]
    assert healthy["spray_recommendation"] == (
        "Routine maintenance; no corrective spray or fertilizer adjustment needed."
    )
    background = de.decide("00_Background_Non_Plant")
    assert background["category"] == "not_a_plant"
    assert background["spray_recommendation"] == "Invalid input; please retake photo of the plant."
    for fruit in (
        "Pepper_Fruit",
        "Tomato_Fruit_Ripe",
        "Tomato_Fruit_Unripe",
        "Tomato_Fruit_Reject",
    ):
        decided = de.decide(fruit)
        assert decided["category"] == "fruit_grade"
        assert decided["needs_spray"] is False and decided["needs_fertilizer"] is False
        assert "Post-harvest" in decided["fertilizer_recommendation"]
    assert de.decide("Banana___Made_Up_Disease") is None


def test_fertilizer_sentences_say_more_or_less_for_each_nutrient():
    assert de.fertilizer_text("reduce_N_boost_K", "en").startswith(
        "Use less nitrogen. Give more potassium."
    )
    assert "late-season nitrogen" in de.fertilizer_text("reduce_late_N", "en")
    assert "ammonium nitrogen" in de.fertilizer_text("reduce_ammonium_N_boost_Ca_K", "en")
    assert "calcium and potassium" in de.fertilizer_text("reduce_ammonium_N_boost_Ca_K", "en")
    assert "shortage" in de.fertilizer_text("correct_deficiency_boost_K", "en")
    assert "steady" in de.fertilizer_text("maintain_steady_N_K", "en")
    assert "Keep nitrogen, phosphorus and potassium and micronutrients in balance" in (
        de.fertilizer_text("balance_NPK_micronutrients", "en")
    )
    assert "leaf feed" in de.fertilizer_text("boost_foliar_NPK_micronutrients", "en")
    assert de.fertilizer_text("reduce_N_boost_K", "my") != de.fertilizer_text(
        "reduce_N_boost_K", "en"
    )
    for row in de._table()["decisions"].values():
        if row["needs_fertilizer"]:
            assert de.fertilizer_text(row["fertilizer_action"], "en"), row
            assert de.fertilizer_text(row["fertilizer_action"], "my"), row


def test_spray_type_matches_the_cause_of_the_disease():
    data = da._management()
    for name, row in data["classes"].items():
        spray_type = de.decide(name)["spray_type"]
        if row["cause"] == "virus":
            assert spray_type in ("insecticide_vector", "insecticide_vector_conditional", "none")
        if row["cause"] == "bacterium":
            assert spray_type == "bactericide_copper", name
        if row["cause"] == "mite":
            assert spray_type == "miticide", name
        if row["cause"] == "algae":
            assert spray_type in ("algaecide_copper", "fungicide_copper"), name


def test_a_spray_is_listed_exactly_when_the_decision_says_it_is_needed(monkeypatch):
    monkeypatch.setattr(get_settings(), "disease_advice_unreviewed_sprays", True)
    for name in da.known_classes():
        advice = da.advice_for(name)
        if advice["decision"]["needs_spray"]:
            assert advice["spray"]["status"] == "shown", name
            assert advice["spray"]["kinds"] and len(advice["spray"]["safety"]) == 4, name
        else:
            assert advice["spray"]["status"] == "not_applicable", name
            assert advice["spray"]["kinds"] == [], name


def test_unreviewed_advice_hides_the_ingredient_list():
    advice = da.advice_for("Rice___Rice_Blast")
    assert advice["spray"] == {
        "status": "awaiting_review",
        "when": [],
        "kinds": [],
        "safety": [],
    }
    assert advice["decision"]["needs_spray"] and advice["steps"]
    assert advice["reviewed_by"] is None
    assert "not yet reviewed" in advice["disclaimer"]


def test_the_unreviewed_listing_switch_shows_sprays_but_never_invents_a_review(monkeypatch):
    monkeypatch.setattr(get_settings(), "disease_advice_unreviewed_sprays", True)
    advice = da.advice_for("Rice___Rice_Blast")
    assert advice["spray"]["status"] == "shown" and advice["spray"]["kinds"]
    assert advice["reviewed_by"] is None and advice["reviewed_on"] is None
    assert "not yet reviewed" in advice["disclaimer"]
    everything = json.dumps([da.advice_for(c) for c in da.known_classes()])
    assert not pesticide_rules.mentions(everything)
    assert " ml " not in everything.lower()


def test_spraying_is_framed_as_only_if_needed(monkeypatch):
    monkeypatch.setattr(get_settings(), "disease_advice_unreviewed_sprays", True)
    for lang in ("en", "my"):
        assert len(da.advice_for("Tomato_Leaf___Late_Blight", lang)["spray"]["when"]) == 4
    english = da.advice_for("Tomato_Leaf___Late_Blight", "en")
    assert any("not spreading" in line for line in english["spray"]["when"])
    assert da.advice_for("Rice___Leaf_Smut")["spray"]["when"] == []


def test_reviewed_advice_shows_kinds_with_safety_lines_and_no_dose(monkeypatch):
    sign_off(monkeypatch, "Rice___Rice_Blast")
    advice = da.advice_for("Rice___Rice_Blast")
    assert advice["spray"]["status"] == "shown"
    assert advice["spray"]["kinds"][0]["ingredients"] == ["tricyclazole", "isoprothiolane"]
    assert advice["reviewed_by"] == "Test Agronomist"
    text = json.dumps(advice).lower()
    assert " ml " not in text and "per litre" not in text and "kg/ha" not in text


def test_a_banned_ingredient_is_dropped_even_from_a_reviewed_row(monkeypatch):
    sign_off(monkeypatch, "Rice___Rice_Blast")
    data = da._management()
    monkeypatch.setitem(data["spray_kinds"]["rice_blast"], "ingredients", ["monocrotophos"])
    advice = da.advice_for("Rice___Rice_Blast")
    assert not any("monocrotophos" in k["ingredients"] for k in advice["spray"]["kinds"])


def test_burmese_text_comes_back_when_asked():
    english = da.advice_for("Tomato_Leaf___Late_Blight", "en")
    burmese = da.advice_for("Tomato_Leaf___Late_Blight", "my")
    assert burmese["steps"] != english["steps"] and burmese["cause_label"] != english["cause_label"]
    assert (
        burmese["decision"]["fertilizer_recommendation"]
        != english["decision"]["fertilizer_recommendation"]
    )
    assert da.advice_for("Tomato_Leaf___Late_Blight", "xx")["steps"] == english["steps"]


@pytest.mark.asyncio
async def test_endpoints_return_advice_and_decision_and_404_for_unknown():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        advice = await client.get(
            "/api/v1/disease-advice", params={"class_name": "Rice___Rice_Blast", "language": "my"}
        )
        decision = await client.get(
            "/api/v1/disease-decision", params={"class_name": "Rice___Healthy"}
        )
        unknown = await client.get("/api/v1/disease-decision", params={"class_name": "Foo___Bar"})
        no_advice = await client.get(
            "/api/v1/disease-advice", params={"class_name": "Rice___Healthy"}
        )
        bad_language = await client.get(
            "/api/v1/disease-advice", params={"class_name": "Rice___Rice_Blast", "language": "fr"}
        )
    assert advice.status_code == 200
    body = advice.json()
    assert body["className"] == "Rice___Rice_Blast" and body["spray"]["status"] == "awaiting_review"
    assert body["decision"]["needsSpray"] is True and body["decision"]["sprayType"] == "fungicide"
    assert decision.status_code == 200 and decision.json()["category"] == "healthy"
    assert unknown.status_code == 404 and no_advice.status_code == 404
    assert bad_language.status_code == 422
