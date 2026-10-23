"""Tests for the EU fruit export-readiness extension. Covers the parts of
the mandatory test matrix that don't require fabricated legal thresholds:
fruit catalog mapping, the never-verified-by-default honesty rule, unit
mismatch handling, missing evidence, unknown fruit/lot handling, and the
import validator's rejection rules.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.models.export_lot import ExportCertificate, ExportLabResult, ExportLot
from app.db.session import engine
from app.main import app
from app.schemas.eu_export_quality import EUCriterionReference
from app.services.eu_criteria_importer import validate_rows
from app.services.eu_export_readiness import evaluate_eu_readiness
from app.services.eu_fruit_catalog import get_fruit_by_code, get_fruit_catalog

pytestmark = pytest.mark.asyncio


def _lot(lab_results=None, certificates=None, crop_name="Mango", fruit_code=None) -> ExportLot:
    lot = ExportLot(id=1, field_id=1, crop_name=crop_name, fruit_code=fruit_code)
    lot.lab_results = lab_results or []
    lot.certificates = certificates or []
    return lot


def _verified_numeric_criterion(**overrides) -> EUCriterionReference:
    defaults = dict(
        criterion_id="TEST-NUM-1", fruit_code="mango", origin_country="MM", destination_market="EU",
        member_state=None, product_form="fresh", cn_code=None, criterion_type="pesticide_mrl", analyte_or_metric="chlorpyrifos",
        residue_definition=None, comparison_operator="<=", limit_value=0.01, limit_unit="mg/kg",
        required_evidence="lab report", legal_reference="Regulation (EC) No 396/2005", article_or_annex=None,
        source_url="https://food.ec.europa.eu/plants/pesticides/eu-pesticides-database_en",
        effective_from=None, effective_to=None, last_verified_at=None, verification_status="verified",
    )
    defaults.update(overrides)
    return EUCriterionReference(**defaults)


def _document_criterion(**overrides) -> EUCriterionReference:
    defaults = dict(
        criterion_id="TEST-DOC-1", fruit_code="mango", origin_country="MM", destination_market="EU",
        member_state=None, product_form="fresh", cn_code=None, criterion_type="phytosanitary",
        analyte_or_metric="phytosanitary_certificate", residue_definition=None, comparison_operator=None,
        limit_value=None, limit_unit=None, required_evidence="certificate",
        legal_reference="Regulation (EU) 2019/2072", article_or_annex=None,
        source_url="https://food.ec.europa.eu/plants/plant-health-and-biosecurity/plant-health-rules_en",
        effective_from=None, effective_to=None, last_verified_at=None, verification_status="verified",
    )
    defaults.update(overrides)
    return EUCriterionReference(**defaults)


# --- fruit catalog -----------------------------------------------------


def test_all_ten_fruit_codes_present() -> None:
    codes = {f.fruit_code for f in get_fruit_catalog()}
    assert codes == {
        "avocado", "banana", "durian", "jackfruit", "mango",
        "mangosteen", "papaya", "pineapple", "rambutan", "watermelon",
    }


def test_fruit_lookup_returns_scientific_name() -> None:
    mango = get_fruit_by_code("mango")
    assert mango is not None
    assert mango.scientific_name == "Mangifera indica"


def test_unknown_fruit_code_returns_none() -> None:
    assert get_fruit_by_code("not_a_real_fruit") is None


# --- readiness evaluator: the never-upgrade-unverified rule ------------


def test_unverified_criterion_is_always_source_not_verified_even_with_passing_measurement() -> None:
    criterion = _verified_numeric_criterion(verification_status="needs_review")
    lot = _lot(lab_results=[ExportLabResult(analyte="chlorpyrifos", result_value=0.001, unit="mg/kg")])
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "SOURCE_NOT_VERIFIED"
    assert response.status == "INSUFFICIENT_EVIDENCE"


def test_unavailable_criterion_is_source_not_verified() -> None:
    criterion = _verified_numeric_criterion(verification_status="unavailable")
    lot = _lot()
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "SOURCE_NOT_VERIFIED"


def test_zero_applicable_criteria_is_insufficient_evidence_not_a_pass() -> None:
    lot = _lot()
    response = evaluate_eu_readiness(lot, "watermelon", "EU", None, [])
    assert response.status == "INSUFFICIENT_EVIDENCE"
    assert response.criteria == []


# --- readiness evaluator: numeric comparisons (verified criteria only) -


def test_verified_numeric_criterion_missing_lab_result_is_missing_evidence() -> None:
    criterion = _verified_numeric_criterion()
    lot = _lot()
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "MISSING_EVIDENCE"
    assert response.status == "ACTION_REQUIRED"


def test_verified_numeric_criterion_within_limit_meets_requirement() -> None:
    criterion = _verified_numeric_criterion()
    lot = _lot(lab_results=[ExportLabResult(analyte="chlorpyrifos", result_value=0.005, unit="mg/kg")])
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "MEETS_RECORDED_CRITERION"
    assert response.status == "READY_FOR_REVIEW"


def test_verified_numeric_criterion_above_limit_does_not_meet_requirement() -> None:
    criterion = _verified_numeric_criterion()
    lot = _lot(lab_results=[ExportLabResult(analyte="chlorpyrifos", result_value=0.05, unit="mg/kg")])
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "DOES_NOT_MEET_RECORDED_CRITERION"
    assert response.status == "ACTION_REQUIRED"


def test_unit_mismatch_requires_human_review_not_numeric_comparison() -> None:
    criterion = _verified_numeric_criterion()
    lot = _lot(lab_results=[ExportLabResult(analyte="chlorpyrifos", result_value=5, unit="ug/kg")])
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "REQUIRES_HUMAN_REVIEW"


def test_verified_numeric_criterion_with_no_limit_value_is_source_not_verified() -> None:
    criterion = _verified_numeric_criterion(limit_value=None)
    lot = _lot(lab_results=[ExportLabResult(analyte="chlorpyrifos", result_value=0.005, unit="mg/kg")])
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "SOURCE_NOT_VERIFIED"


# --- readiness evaluator: document-existence criteria ------------------


def test_document_criterion_missing_certificate_is_missing_evidence() -> None:
    criterion = _document_criterion()
    lot = _lot()
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "MISSING_EVIDENCE"


def test_document_criterion_with_unexpired_phytosanitary_certificate_meets_requirement() -> None:
    from datetime import date, timedelta

    criterion = _document_criterion()
    lot = _lot(certificates=[ExportCertificate(
        issuer="DOA", certificate_number="X", certificate_type="phytosanitary",
        valid_to=date.today() + timedelta(days=30),
    )])
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "MEETS_RECORDED_CRITERION"


def test_document_criterion_with_expired_certificate_is_still_missing_evidence() -> None:
    from datetime import date, timedelta

    criterion = _document_criterion()
    lot = _lot(certificates=[ExportCertificate(
        issuer="DOA", certificate_number="X", certificate_type="phytosanitary",
        valid_to=date.today() - timedelta(days=1),
    )])
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "MISSING_EVIDENCE"


def test_document_criterion_with_undated_certificate_is_still_missing_evidence() -> None:
    """P1-6/F: a certificate with no stated expiry is an unknown, never a
    pass -- this app must never silently assume "valid forever".
    """
    criterion = _document_criterion()
    lot = _lot(certificates=[ExportCertificate(
        issuer="DOA", certificate_number="X", certificate_type="phytosanitary", valid_to=None,
    )])
    response = evaluate_eu_readiness(lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "MISSING_EVIDENCE"


def test_document_criterion_with_wrong_certificate_type_is_still_missing_evidence() -> None:
    """A certificate recorded as "organic" (or left uncategorized) must
    never satisfy a phytosanitary-certificate requirement just because
    *some* certificate exists on the lot.
    """
    from datetime import date, timedelta

    criterion = _document_criterion()
    future = date.today() + timedelta(days=30)
    organic_cert_lot = _lot(certificates=[ExportCertificate(
        issuer="DOA", certificate_number="X", certificate_type="organic", valid_to=future,
    )])
    response = evaluate_eu_readiness(organic_cert_lot, "mango", "EU", "DE", [criterion])
    assert response.criteria[0].status == "MISSING_EVIDENCE"

    uncategorized_cert_lot = _lot(certificates=[ExportCertificate(
        issuer="DOA", certificate_number="X", certificate_type=None, valid_to=future,
    )])
    response2 = evaluate_eu_readiness(uncategorized_cert_lot, "mango", "EU", "DE", [criterion])
    assert response2.criteria[0].status == "MISSING_EVIDENCE"


# --- phytosanitary exemption rows never auto-pass -----------------------


def test_banana_phytosanitary_exemption_is_not_applicable_never_missing_evidence() -> None:
    """P0-1 regression: banana's phytosanitary-certificate requirement is an
    explicit EXEMPTION (Reg. (EU) 2019/2072, Annex XI Part C) -- the cited
    regulation says no certificate is required at all, for any origin
    country including Myanmar. Showing this as "MISSING EVIDENCE" /
    "Record the required certificate for this lot" told a farmer to go get
    a certificate the law says they don't need, which is the exact
    opposite of what the rule means. It must always be NOT_APPLICABLE,
    with no certificate on file, with an expired one, or with any other
    certificate recorded -- and this never exempts the lot from any other
    requirement for the same fruit (marketing standard, pesticide MRL,
    contaminant, customs code), which remain independently evaluated.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("banana", "EU", None)
    assert len(rows) == 8
    assert not any(r.criterion_id == "EU-MM-BANANA-MKT-GEN-001" for r in rows)
    phyto = next(r for r in rows if r.criterion_id == "EU-MM-BANANA-PHYTO-001")
    assert phyto.verification_status == "verified"
    assert phyto.cn_code == "0803 10 10, 0803 10 90, 0803 90 10, 0803 90 90"

    lot_no_cert = _lot()
    response = evaluate_eu_readiness(lot_no_cert, "banana", "EU", None, rows)
    phyto_result = next(c for c in response.criteria if c.criterion_id == "EU-MM-BANANA-PHYTO-001")
    assert phyto_result.status == "NOT_APPLICABLE"
    assert phyto_result.reason_code == "exemption_confirmed_in_source"
    # Other applicable requirements (e.g. the banana-specific marketing
    # standard, chlorpyrifos MRL) still independently report missing
    # evidence -- the exemption never silently clears the whole lot.
    other_results = [c for c in response.criteria if c.criterion_id != "EU-MM-BANANA-PHYTO-001"]
    assert any(c.status == "MISSING_EVIDENCE" for c in other_results)
    assert response.status != "READY_FOR_REVIEW"

    # A certificate on file -- of any type, even an unrelated one -- must
    # never change the exemption's outcome either.
    from datetime import date, timedelta
    lot_with_cert = _lot(certificates=[ExportCertificate(
        issuer="DOA", certificate_number="X", certificate_type="organic",
        valid_to=date.today() + timedelta(days=30),
    )])
    response2 = evaluate_eu_readiness(lot_with_cert, "banana", "EU", None, rows)
    phyto_result2 = next(c for c in response2.criteria if c.criterion_id == "EU-MM-BANANA-PHYTO-001")
    assert phyto_result2.status == "NOT_APPLICABLE"


# --- newly-integrated verified criteria (Reg. 2019/2072, 2023/2429, 2020/1085) --


def test_general_marketing_standard_is_verified_for_every_fruit_except_banana() -> None:
    """One EU-wide, verified general-marketing-standard row per fruit,
    extracted from the Official Journal text (OJ L, 3.11.2023) via
    pdftotext, Commission Delegated Regulation (EU) 2023/2429 Article 2(1)
    and Annex I Part A -- EXCEPT banana, which Article 2(1) exempts from
    the general standard because it has its own specific standard
    (Article 4(1)(k)).
    """
    from app.services.eu_criteria_reference import get_requirements
    from app.services.eu_fruit_catalog import get_fruit_catalog

    for fruit in get_fruit_catalog():
        rows = get_requirements(fruit.fruit_code, "EU", None)
        mkt = [r for r in rows if r.criterion_id == f"EU-MM-{fruit.fruit_code.upper()}-MKT-GEN-001"]
        if fruit.fruit_code == "banana":
            assert len(mkt) == 0, "banana must not have a general-marketing-standard row"
            continue
        assert len(mkt) == 1, f"missing general marketing standard row for {fruit.fruit_code}"
        assert mkt[0].verification_status == "verified"
        assert mkt[0].legal_reference == (
            "Commission Delegated Regulation (EU) 2023/2429, Article 2(1), Annex I Part A"
        )
        assert mkt[0].effective_from.isoformat() == "2025-01-01"


def test_general_marketing_standard_document_criterion_still_requires_evidence() -> None:
    """Being verified does not mean being pre-met: with no certificate
    evidence recorded, the general marketing standard criterion must still
    report missing evidence, not a pass.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("mango", "EU", None)
    lot = _lot()
    response = evaluate_eu_readiness(lot, "mango", "EU", None, rows)
    mkt_result = next(c for c in response.criteria if c.criterion_id == "EU-MM-MANGO-MKT-GEN-001")
    assert mkt_result.status == "MISSING_EVIDENCE"


def test_chlorpyrifos_default_mrl_is_verified_and_correctly_evaluated() -> None:
    """Chlorpyrifos/chlorpyrifos-methyl's EU-wide default MRL of 0.01 mg/kg
    (Commission Regulation (EU) 2020/1085) is now verified for every fruit.
    A lab result at or below 0.01 mg/kg meets it; above does not.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("mango", "EU", None)
    chlorpyrifos = next(r for r in rows if r.criterion_id == "EU-MM-MANGO-MRL-CHLORPYRIFOS-001")
    assert chlorpyrifos.verification_status == "verified"
    assert chlorpyrifos.limit_value == 0.01
    assert chlorpyrifos.limit_unit == "mg/kg"

    passing_lot = _lot(lab_results=[ExportLabResult(analyte="chlorpyrifos", result_value=0.005, unit="mg/kg")])
    response = evaluate_eu_readiness(passing_lot, "mango", "EU", None, [chlorpyrifos])
    assert response.criteria[0].status == "MEETS_RECORDED_CRITERION"

    failing_lot = _lot(lab_results=[ExportLabResult(analyte="chlorpyrifos", result_value=0.05, unit="mg/kg")])
    response2 = evaluate_eu_readiness(failing_lot, "mango", "EU", None, [chlorpyrifos])
    assert response2.criteria[0].status == "DOES_NOT_MEET_RECORDED_CRITERION"


def test_mango_has_exactly_one_customs_code_obligation_not_two() -> None:
    """Regression: an orphaned early-session stub row (EU-MM-MANGO-DOC-001,
    analyte customs_hs_code, no actual code value, generic tool link) and
    the later, complete TARIC-sourced row (EU-MM-MANGO-CUSTOMS-CN-001,
    analyte customs_cn_taric_code, real cn_code, specific source) both
    represented the exact same real-world obligation -- "confirm the
    correct CN/TARIC customs code for mango" -- which rendered as two
    separate, confusing cards for the farmer. Only the complete row should
    remain; every other fruit already has exactly one.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("mango", "EU", None)
    customs_rows = [r for r in rows if r.criterion_type == "documentation" and "customs" in r.analyte_or_metric]
    assert len(customs_rows) == 1
    assert customs_rows[0].criterion_id == "EU-MM-MANGO-CUSTOMS-CN-001"
    assert customs_rows[0].cn_code == "0804 50 00 40"


def test_banana_specific_marketing_standard_does_not_apply_to_other_fruits() -> None:
    from app.services.eu_criteria_reference import get_requirements

    assert any(
        r.criterion_id == "EU-MM-BANANA-MKT-SPECIFIC-001" for r in get_requirements("banana", "EU", None)
    )
    for fruit in ["mango", "durian", "pineapple", "avocado"]:
        assert not any(
            r.criterion_id == "EU-MM-BANANA-MKT-SPECIFIC-001" for r in get_requirements(fruit, "EU", None)
        )


def test_rice_lot_evidence_is_never_used_for_a_mango_readiness_check() -> None:
    """The exact defect a farmer could hit in the real UI: a rice lot
    (e.g. 'Paw San rice (Shwebo)') selected while checking mango
    requirements must never have its lab results/certificates read as
    mango evidence. Every criterion must report missing evidence, and the
    response must clearly flag the mismatch.
    """
    from app.services.eu_criteria_reference import get_requirements

    rice_lot = _lot(
        crop_name="Paw San rice (Shwebo)",
        lab_results=[ExportLabResult(analyte="cadmium", result_value=0.001, unit="mg/kg")],
        certificates=[ExportCertificate(issuer="DOA", certificate_number="X", valid_to=None)],
    )
    rows = get_requirements("mango", "EU", None)
    response = evaluate_eu_readiness(rice_lot, "mango", "EU", None, rows)

    assert response.lot_matches_fruit is False
    assert response.lot_crop_name == "Paw San rice (Shwebo)"
    assert response.mismatch_warning is not None
    assert "mango" in response.mismatch_warning.lower()
    # None of the rice lot's real cadmium result or certificate ever counts.
    assert all(c.status in ("MISSING_EVIDENCE", "SOURCE_NOT_VERIFIED") for c in response.criteria)
    assert response.status != "READY_FOR_REVIEW"


def test_matching_fruit_lot_has_no_mismatch_warning() -> None:
    from app.services.eu_criteria_reference import get_requirements

    mango_lot = _lot(crop_name="Shwe Hin Thar mango")
    rows = get_requirements("mango", "EU", None)
    response = evaluate_eu_readiness(mango_lot, "mango", "EU", None, rows)
    assert response.lot_matches_fruit is True
    assert response.mismatch_warning is None


def test_stable_fruit_code_is_trusted_over_the_free_text_crop_name() -> None:
    """A lot recorded through the EU fruit-lot form carries a stable
    fruit_code -- that must be trusted directly, even if its free-text
    crop_name/variety would otherwise look ambiguous or mismatched. And in
    the other direction: a wrong fruit_code must still deny a mismatch,
    never be overridden by a crop_name that happens to look plausible.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("mango", "EU", None)

    correct_code_lot = _lot(crop_name="Shwe Hin Thar", fruit_code="mango")
    response = evaluate_eu_readiness(correct_code_lot, "mango", "EU", None, rows)
    assert response.lot_matches_fruit is True
    assert response.mismatch_warning is None

    wrong_code_lot = _lot(crop_name="Mango something", fruit_code="banana")
    response2 = evaluate_eu_readiness(wrong_code_lot, "mango", "EU", None, rows)
    assert response2.lot_matches_fruit is False
    assert response2.mismatch_warning is not None


def test_scientific_name_also_matches_a_fruit_lot() -> None:
    from app.services.eu_fruit_catalog import crop_name_matches_fruit

    assert crop_name_matches_fruit("Mangifera indica, variety Sein Ta Lone", "mango") is True
    assert crop_name_matches_fruit("", "mango") is False
    assert crop_name_matches_fruit("Paw San rice", "mango") is False


def test_general_marketing_standard_is_not_satisfied_by_an_unrelated_certificate() -> None:
    """Regression test for a real bug this integration surfaced: a lot's
    phytosanitary/export certificate must never be read as satisfying the
    general marketing standard (a physical-inspection requirement) just
    because some certificate exists on the lot -- that would be exactly
    the false-pass the brief warns against.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("mango", "EU", None)
    lot_with_unrelated_cert = _lot(certificates=[ExportCertificate(issuer="DOA", certificate_number="X", valid_to=None)])
    response = evaluate_eu_readiness(lot_with_unrelated_cert, "mango", "EU", None, rows)
    mkt_result = next(c for c in response.criteria if c.criterion_id == "EU-MM-MANGO-MKT-GEN-001")
    assert mkt_result.status == "MISSING_EVIDENCE"
    assert mkt_result.reason_code == "no_evidence_capture_mechanism_yet"


def test_document_type_criteria_have_no_comparison_operator() -> None:
    """Regression test for a fixed bug: comparison_operator used to hold
    the literal string "document_required" for document-existence rows
    instead of being empty/None, which would have broken the moment any
    such row was marked verified (it would fall into the numeric-
    comparison branch instead of the document-existence branch).
    """
    from app.services.eu_criteria_reference import get_all_criteria

    for row in get_all_criteria():
        if row.criterion_type in ("phytosanitary", "market_access", "physical_grade", "documentation"):
            if row.limit_value is None and "MRL" not in row.criterion_id:
                assert row.comparison_operator is None, f"{row.criterion_id} has a stray comparison_operator"


def test_wp2_imported_rows_stay_needs_review_unless_independently_reverified() -> None:
    """The 49 rows imported from the teammate's research register (WP2
    pass, 22 Oct) started needs_review -- 29 of them (the lead/cadmium/
    perchlorate contaminant rows except watermelon-cadmium) were
    subsequently upgraded to verified in a later pass after this project
    itself read the primary OJ text of Reg. (EU) 2023/915 (via a FAOLEX
    mirror, FAOC217510, pdftotext) and found clean, unambiguous mg/kg
    values. The remaining 20 (phytosanitary-required, Annex VII
    derogations, CN/TARIC codes, and watermelon-cadmium specifically)
    were never independently re-opened and must still be needs_review.
    """
    from app.services.eu_criteria_reference import get_all_criteria

    imported = [
        r for r in get_all_criteria()
        if "PHYTO-REQUIRED" in r.criterion_id
        or "ANNEXVII" in r.criterion_id
        or "CONTAM-" in r.criterion_id
        or "CUSTOMS-CN" in r.criterion_id
    ]
    assert len(imported) == 49
    verified = [r for r in imported if r.verification_status == "verified"]
    still_needs_review = [r for r in imported if r.verification_status == "needs_review"]
    assert len(verified) == 29
    assert len(still_needs_review) == 20
    assert all("CONTAM-" in r.criterion_id for r in verified), "only contaminant rows were upgraded this pass"
    assert any(r.criterion_id == "EU-MM-WATERMELON-CONTAM-CADMIUM-001" for r in still_needs_review), (
        "watermelon cadmium specifically must stay needs_review -- its table row was garbled on extraction"
    )


def test_contaminant_rows_have_no_guessed_limit_value_except_the_29_independently_verified() -> None:
    """29 of the 30 contaminant placeholder rows now carry a real mg/kg
    value read from primary text; the 30th (watermelon cadmium) still has
    none, because this project could not cleanly extract that one cell --
    never guessed rather than left blank.
    """
    from app.services.eu_criteria_reference import get_all_criteria

    contaminant_rows = [r for r in get_all_criteria() if r.criterion_type == "contaminant"]
    assert len(contaminant_rows) == 30  # 10 fruits x 3 analytes
    with_value = [r for r in contaminant_rows if r.limit_value is not None]
    without_value = [r for r in contaminant_rows if r.limit_value is None]
    assert len(with_value) == 29
    assert len(without_value) == 1
    assert without_value[0].criterion_id == "EU-MM-WATERMELON-CONTAM-CADMIUM-001"
    assert all(r.verification_status == "verified" for r in with_value)
    assert without_value[0].verification_status == "needs_review"


def test_lead_and_perchlorate_correctly_distinguish_watermelon_as_a_fruiting_vegetable() -> None:
    """Lead and perchlorate both have a different value for watermelon
    (classified as a fruiting vegetable / Cucurbitaceae) than for the
    other 9 fruits -- confirming the category distinction was actually
    read from the regulation's own text, not applied uniformly.
    """
    from app.services.eu_criteria_reference import get_requirements

    watermelon = get_requirements("watermelon", "EU", None)
    mango = get_requirements("mango", "EU", None)

    wm_lead = next(r for r in watermelon if r.analyte_or_metric == "lead")
    mango_lead = next(r for r in mango if r.analyte_or_metric == "lead")
    assert wm_lead.limit_value == 0.050
    assert mango_lead.limit_value == 0.10

    wm_perchlorate = next(r for r in watermelon if r.analyte_or_metric == "perchlorate")
    mango_perchlorate = next(r for r in mango if r.analyte_or_metric == "perchlorate")
    assert wm_perchlorate.limit_value == 0.10
    assert mango_perchlorate.limit_value == 0.05


def test_cadmium_correctly_distinguishes_named_fruits_from_the_default_category() -> None:
    """Cadmium names banana/mango/papaya/pineapple explicitly at a lower
    limit (0.020) than the general fruit default (0.050) -- confirming
    the distinction was read, not applied as one blanket number.
    """
    from app.services.eu_criteria_reference import get_requirements

    for fruit, expected in [("banana", 0.020), ("mango", 0.020), ("papaya", 0.020), ("pineapple", 0.020),
                             ("avocado", 0.050), ("durian", 0.050), ("jackfruit", 0.050),
                             ("mangosteen", 0.050), ("rambutan", 0.050)]:
        rows = get_requirements(fruit, "EU", None)
        cadmium = next(r for r in rows if r.analyte_or_metric == "cadmium")
        assert cadmium.limit_value == expected, f"{fruit}: expected {expected}, got {cadmium.limit_value}"
        assert cadmium.verification_status == "verified"


def test_verified_contaminant_criterion_correctly_evaluates_a_real_lab_result() -> None:
    """End-to-end: a lab result at/below the now-real cadmium limit for
    mango must meet it; above it must not -- exercising the newly
    verified numeric data through the unmodified readiness evaluator.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("mango", "EU", None)
    cadmium = next(r for r in rows if r.analyte_or_metric == "cadmium")
    assert cadmium.verification_status == "verified"

    passing = _lot(lab_results=[ExportLabResult(analyte="cadmium", result_value=0.015, unit="mg/kg")])
    response = evaluate_eu_readiness(passing, "mango", "EU", None, [cadmium])
    assert response.criteria[0].status == "MEETS_RECORDED_CRITERION"

    failing = _lot(lab_results=[ExportLabResult(analyte="cadmium", result_value=0.08, unit="mg/kg")])
    response2 = evaluate_eu_readiness(failing, "mango", "EU", None, [cadmium])
    assert response2.criteria[0].status == "DOES_NOT_MEET_RECORDED_CRITERION"


def test_rambutan_cn_code_carries_its_unverified_flag() -> None:
    """The research register itself flags the rambutan CN code as chosen
    by elimination, not officially confirmed -- that caveat must survive
    into the live data, not be silently dropped.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("rambutan", "EU", None)
    cn_row = next(r for r in rows if r.criterion_id == "EU-MM-RAMBUTAN-CUSTOMS-CN-001")
    assert "UNVERIFIED" in cn_row.cn_code


# --- import validator ----------------------------------------------------


def _valid_row(**overrides) -> dict:
    row = dict(
        criterion_id="NEW-001", fruit_code="mango", origin_country="MM", destination_market="EU",
        product_form="fresh", criterion_type="pesticide_mrl", analyte_or_metric="chlorpyrifos",
        comparison_operator="<=", limit_value=0.01, limit_unit="mg/kg", required_evidence="lab report",
        legal_reference="Regulation (EC) No 396/2005",
        source_url="https://food.ec.europa.eu/plants/pesticides/eu-pesticides-database_en",
        verification_status="needs_review",
    )
    row.update(overrides)
    return row


def test_import_validator_rejects_unknown_fruit_code() -> None:
    from app.schemas.eu_export_quality import EUCriteriaImportRow

    row = EUCriteriaImportRow(**_valid_row(fruit_code="dragonfruit"))
    results = validate_rows([row])
    assert results[0].accepted is False
    assert any("Unknown fruit_code" in e for e in results[0].errors)


def test_import_validator_rejects_verified_status_outright() -> None:
    from app.schemas.eu_export_quality import EUCriteriaImportRow

    row = EUCriteriaImportRow(**_valid_row(verification_status="verified"))
    results = validate_rows([row])
    assert results[0].accepted is False
    assert any("never be accepted as 'verified'" in e for e in results[0].errors)


def test_import_validator_rejects_duplicate_within_submission() -> None:
    from app.schemas.eu_export_quality import EUCriteriaImportRow

    row = EUCriteriaImportRow(**_valid_row())
    results = validate_rows([row, row])
    assert results[1].accepted is False
    assert any("duplicated within this submission" in e for e in results[1].errors)


def test_import_validator_rejects_existing_criterion_id() -> None:
    from app.schemas.eu_export_quality import EUCriteriaImportRow

    row = EUCriteriaImportRow(**_valid_row(criterion_id="EU-MM-MANGO-MRL-001"))
    results = validate_rows([row])
    assert results[0].accepted is False
    assert any("already exists" in e for e in results[0].errors)


def test_import_validator_rejects_numeric_type_without_operator() -> None:
    from app.schemas.eu_export_quality import EUCriteriaImportRow

    row = EUCriteriaImportRow(**_valid_row(comparison_operator=None))
    results = validate_rows([row])
    assert results[0].accepted is False
    assert any("requires a comparison_operator" in e for e in results[0].errors)


def test_import_validator_accepts_well_formed_needs_review_row() -> None:
    from app.schemas.eu_export_quality import EUCriteriaImportRow

    row = EUCriteriaImportRow(**_valid_row())
    results = validate_rows([row])
    assert results[0].accepted is True
    assert results[0].errors == []


# --- endpoint-level tests -------------------------------------------------


async def test_endpoint_list_fruits_returns_ten() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/export/fruits")
    assert response.status_code == 200
    assert len(response.json()) == 10


async def test_endpoint_requirements_unknown_fruit_is_404() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/export/eu/requirements", params={"fruit": "not_a_fruit"})
    assert response.status_code == 404


async def test_endpoint_eu_readiness_unknown_lot_is_404() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/export/lots/999999/eu-readiness", params={"fruit": "mango"})
    assert response.status_code == 404
    await engine.dispose()


async def test_endpoint_eu_readiness_never_returns_approved_status() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/export/eu/requirements", params={"fruit": "mango", "memberState": "DE"})
    assert response.status_code == 200
    for row in response.json()["requirements"]:
        assert row["verificationStatus"] in ("needs_review", "unavailable", "verified")


async def test_endpoint_import_validate_never_mutates_reference_dataset() -> None:
    from app.services.eu_criteria_reference import get_all_criteria

    before = len(get_all_criteria())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/api/v1/export/eu/criteria/import/validate",
            json={"rows": [_valid_row()]},
        )
    after = len(get_all_criteria())
    assert before == after


# --- mandatory acceptance scenario D/E: mango cadmium, lot isolation ----


def test_mango_germany_cadmium_exceedance_and_within_limit_scenarios() -> None:
    """Mandatory scenario D: a real verified numeric criterion (mango
    cadmium <= 0.02 mg/kg per Reg. (EU) 2023/915, Annex I point 3.2.1) must
    flag an exceedance as DOES_NOT_MEET_RECORDED_CRITERION, and a result
    under the limit as MEETS -- which is never "export approved", only
    this one recorded criterion.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("mango", "EU", "DE")
    cadmium = next(r for r in rows if r.criterion_id == "EU-MM-MANGO-CONTAM-CADMIUM-001")
    assert cadmium.verification_status == "verified"
    assert cadmium.limit_value == 0.02

    exceeding_lot = _lot(lab_results=[ExportLabResult(analyte="cadmium", result_value=0.050, unit="mg/kg")])
    exceeding_response = evaluate_eu_readiness(exceeding_lot, "mango", "EU", "DE", [cadmium])
    assert exceeding_response.criteria[0].status == "DOES_NOT_MEET_RECORDED_CRITERION"
    assert exceeding_response.status == "ACTION_REQUIRED"

    within_limit_lot = _lot(lab_results=[ExportLabResult(analyte="cadmium", result_value=0.010, unit="mg/kg")])
    within_limit_response = evaluate_eu_readiness(within_limit_lot, "mango", "EU", "DE", [cadmium])
    assert within_limit_response.criteria[0].status == "MEETS_RECORDED_CRITERION"
    # Never an export-approval claim -- the disclaimer always says so.
    assert "not a government export permit" in within_limit_response.disclaimer.lower()


def test_second_mango_lot_never_inherits_first_lots_cadmium_result() -> None:
    """Mandatory scenario E: two different mango lots for the same farmer
    must be evaluated completely independently -- lot B must never show
    lot A's recorded lab result just because they're the same fruit.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("mango", "EU", "DE")
    cadmium = next(r for r in rows if r.criterion_id == "EU-MM-MANGO-CONTAM-CADMIUM-001")

    lot_a = _lot(lab_results=[ExportLabResult(analyte="cadmium", result_value=0.050, unit="mg/kg")])
    lot_a.id = 101
    response_a = evaluate_eu_readiness(lot_a, "mango", "EU", "DE", [cadmium])
    assert response_a.criteria[0].status == "DOES_NOT_MEET_RECORDED_CRITERION"

    lot_b = _lot(lab_results=[])
    lot_b.id = 102
    response_b = evaluate_eu_readiness(lot_b, "mango", "EU", "DE", [cadmium])
    assert response_b.criteria[0].status == "MISSING_EVIDENCE"
    assert response_b.lot_id == 102


# --- legal-data corrections from the 398-row register audit -------------


def test_chlorpyrifos_application_date_reflects_the_published_corrigendum() -> None:
    """Commission Regulation (EU) 2020/1085's original text said it applies
    from 6 August 2020, but a corrigendum (OJ L 245/31, 30 July 2020)
    replaced that with 13 November 2020 and moved chlorpyrifos/
    chlorpyrifos-methyl from Annex II to Annex V -- independently confirmed
    this session via FAOLEX/Ecolex mirrors and a WTO SPS notification
    (EUR-Lex itself remains bot-gated). The numeric limit (0.01 mg/kg) is
    unaffected and unchanged; only the metadata date was wrong.
    """
    from app.services.eu_criteria_reference import get_all_criteria

    chlorpyrifos_rows = [
        r for r in get_all_criteria() if r.analyte_or_metric in ("chlorpyrifos", "chlorpyrifos-methyl")
    ]
    assert len(chlorpyrifos_rows) == 20  # 10 fruits x 2 substances
    for row in chlorpyrifos_rows:
        assert row.effective_from.isoformat() == "2020-11-13"
        assert row.limit_value == 0.01
        assert row.verification_status == "verified"
        assert "corrigendum" in row.legal_reference.lower()


def test_watermelon_cadmium_stays_unresolved_not_guessed() -> None:
    """The 398-row register audit proposed 0.020 mg/kg as a *candidate*
    correction for watermelon cadmium (Reg. (EU) 2023/915, Annex I point
    3.2.4.1, "Fruiting vegetables except aubergines"), but this session's
    own independent re-extraction of the same primary-source PDF
    (faolex.fao.org/docs/pdf/eur217510.pdf) found the point-code-to-value
    table genuinely ambiguous in both plain and -layout pdftotext modes --
    the numeric value for 3.2.4 vs. 3.2.4.1 cannot be read off with
    confidence; a neighbouring row's value could easily be miscounted as
    this one's. Per the project's own no-guessing rule, this stays
    needs_review with no numeric value, not silently upgraded on a
    secondhand register claim alone.
    """
    from app.services.eu_criteria_reference import get_requirements

    rows = get_requirements("watermelon", "EU", None)
    cadmium = next(r for r in rows if r.criterion_id == "EU-MM-WATERMELON-CONTAM-CADMIUM-001")
    assert cadmium.verification_status == "needs_review"
    assert cadmium.limit_value is None


def test_banana_durian_pineapple_phytosanitary_exemption_applies_eu_wide() -> None:
    """Reg. (EU) 2019/2072 Annex XI Part C lists these three fruits as
    exempt from the phytosanitary certificate for all third countries of
    origin -- confirmed EU-wide (member_state=None), so every one of the
    27 member states must see the same NOT_APPLICABLE outcome, not just
    the one or two states exercised elsewhere in this test file.
    """
    from app.services.eu_criteria_reference import get_requirements
    from app.services.eu_member_states import EU_MEMBER_STATES

    sample_states = [s.code for s in EU_MEMBER_STATES[:5]] + ["DE", "FR"]
    for fruit_code, exemption_id in [
        ("banana", "EU-MM-BANANA-PHYTO-001"),
        ("durian", "EU-MM-DURIAN-PHYTO-001"),
        ("pineapple", "EU-MM-PINEAPPLE-PHYTO-001"),
    ]:
        for state in sample_states:
            rows = get_requirements(fruit_code, "EU", state)
            exemption_row = next(r for r in rows if r.criterion_id == exemption_id)
            lot = _lot(crop_name=fruit_code.capitalize(), fruit_code=fruit_code)
            response = evaluate_eu_readiness(lot, fruit_code, "EU", state, [exemption_row])
            assert response.criteria[0].status == "NOT_APPLICABLE", f"{fruit_code}/{state} failed"
