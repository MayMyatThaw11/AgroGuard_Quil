"""Tests for the 27-EU-Member-State model: the member list itself, rejection
of non-EU codes (UK/Switzerland/Norway), and the full 10 fruit x 27 country
routing matrix -- this verifies software routing never crashes and never
fabricates a verified rule, not that 270 legal combinations are researched.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.eu_export_quality import EUCriterionReference
from app.services.eu_fruit_catalog import get_fruit_catalog
from app.services.eu_member_states import EU_MEMBER_STATES, is_valid_member_state

pytestmark = pytest.mark.asyncio


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


def test_exactly_27_member_states() -> None:
    assert len(EU_MEMBER_STATES) == 27


def test_no_duplicate_codes() -> None:
    codes = [s.code for s in EU_MEMBER_STATES]
    assert len(codes) == len(set(codes))


def test_uk_switzerland_norway_are_not_members() -> None:
    codes = {s.code for s in EU_MEMBER_STATES}
    assert "UK" not in codes
    assert "GB" not in codes
    assert "CH" not in codes
    assert "NO" not in codes


def test_known_member_state_is_valid() -> None:
    assert is_valid_member_state("FR") is True
    assert is_valid_member_state("DE") is True


def test_none_member_state_is_valid_eu_wide() -> None:
    assert is_valid_member_state(None) is True


def test_non_member_state_is_invalid() -> None:
    assert is_valid_member_state("UK") is False
    assert is_valid_member_state("CH") is False
    assert is_valid_member_state("NO") is False
    assert is_valid_member_state("XX") is False


async def test_endpoint_member_states_returns_27() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/export/eu/member-states")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 27
    codes = {row["code"] for row in data}
    assert "UK" not in codes and "CH" not in codes and "NO" not in codes


async def test_endpoint_requirements_rejects_non_eu_member_state() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/export/eu/requirements", params={"fruit": "mango", "memberState": "UK"})
    assert response.status_code == 422


async def test_endpoint_requirements_accepts_every_real_member_state() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for state in EU_MEMBER_STATES:
            response = await client.get(
                "/api/v1/export/eu/requirements", params={"fruit": "mango", "memberState": state.code}
            )
            assert response.status_code == 200, f"failed for {state.code}"


def test_eu_wide_rule_applies_to_every_state_while_a_member_specific_row_stays_scoped(monkeypatch) -> None:
    """The EU_ALL + member-specific-override resolution itself, tested
    against a synthetic fixture rather than a specific live CSV row -- so
    this stays correct across future legal-data cleanups (e.g. retiring a
    duplicate/orphaned row) that change which real rows happen to carry a
    member_state value. An EU-wide row (member_state=None) must apply to
    every state; a row scoped to one specific state must appear only for
    that state, never leak to any other, and never be silently treated as
    EU-wide just because a value is missing.
    """
    from app.services import eu_criteria_reference
    from app.services.eu_criteria_reference import get_requirements

    eu_wide = _verified_numeric_criterion(criterion_id="SYN-EU-WIDE", member_state=None)
    de_only = _verified_numeric_criterion(criterion_id="SYN-DE-ONLY", member_state="DE")
    monkeypatch.setattr(eu_criteria_reference, "_load_all", lambda: [eu_wide, de_only])

    de_ids = {r.criterion_id for r in get_requirements("mango", "EU", "DE")}
    fr_ids = {r.criterion_id for r in get_requirements("mango", "EU", "FR")}
    eu_wide_only_ids = {r.criterion_id for r in get_requirements("mango", "EU", None)}

    assert de_ids == {"SYN-EU-WIDE", "SYN-DE-ONLY"}
    assert fr_ids == {"SYN-EU-WIDE"}
    assert eu_wide_only_ids == {"SYN-EU-WIDE"}


async def test_full_10_fruit_27_country_matrix_never_crashes() -> None:
    """270 combinations: every one must return 200 and a well-formed
    response, even where zero criteria rows exist yet. This tests routing,
    not 270 verified legal rule sets.
    """
    fruit_codes = [f.fruit_code for f in get_fruit_catalog()]
    assert len(fruit_codes) == 10
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for fruit in fruit_codes:
            for state in EU_MEMBER_STATES:
                response = await client.get(
                    "/api/v1/export/eu/requirements", params={"fruit": fruit, "memberState": state.code}
                )
                assert response.status_code == 200, f"{fruit}/{state.code} failed"
                body = response.json()
                assert body["fruitCode"] == fruit
                assert body["memberState"] == state.code
                assert isinstance(body["requirements"], list)
                # Every row returned must genuinely apply: either EU-wide
                # or explicitly scoped to this exact state -- never a
                # mismatched state leaking through.
                for row in body["requirements"]:
                    assert row["memberState"] in (None, state.code)
