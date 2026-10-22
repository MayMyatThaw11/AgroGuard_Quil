from datetime import date

from agriquill import contract, conversion


def plot(standard, start, planted, harvest=None):
    lines = [
        "parcel p1 {",
        "  area: 1 ha",
        f"  standard: {standard}",
        "  sell_as: organic",
        f'  planted: "{planted}"',
    ]
    if start:
        lines.append(f'  conversion_start: "{start}"')
    if harvest:
        lines.append(f'  harvest: "{harvest}"')
    return contract.verify("\n".join([*lines, "}"]))


def codes(out):
    return {d["code"] for d in out["diagnostics"]}


def test_eu_plot_sown_at_month_23_is_blocked_even_if_harvested_at_month_28():
    out = plot("EU_2018_848", "2024-01-15", "2025-12-15", "2026-05-15")
    assert out["is_valid"] is False and "AGRI-E034" in codes(out)
    rec = out["contract"]["parcels"][0]["conversion"]
    assert rec["earliest"] == "2026-01-15" and rec["anchor"] == "sowing"


def test_eu_plot_sown_at_month_24_passes():
    out = plot("EU_2018_848", "2024-01-15", "2026-01-15")
    assert "AGRI-E034" not in codes(out)
    assert out["contract"]["parcels"][0]["conversion"]["qualifies"] is True


def test_nop_anchors_on_harvest_not_sowing():
    assert conversion.check("USDA_NOP", "2023-03-01", "2025-12-01", "2026-03-01")["qualifies"]
    late = conversion.check("USDA_NOP", "2023-03-02", "2025-12-01", "2026-03-01")
    assert late["qualifies"] is False and late["clause"] == "7 CFR 205.202(b)"


def test_nop_without_a_harvest_date_warns_instead_of_guessing():
    out = plot("USDA_NOP", "2020-01-01", "2026-06-01")
    assert out["is_valid"] is True and "AGRI-W034" in codes(out)


def test_organic_claim_without_a_conversion_record_is_blocked():
    out = plot("ASOA_ORGANIC", None, "2026-06-01")
    assert "AGRI-E034" in codes(out)
    assert out["contract"]["parcels"][0]["conversion"]["status"] == "TO VERIFY"


def test_conventional_plot_has_no_conversion_record():
    out = contract.verify('parcel p1 {\n  area: 1 ha\n  planted: "2026-06-01"\n}')
    assert out["contract"]["parcels"][0]["conversion"] is None


def test_month_arithmetic_clamps_to_the_last_day():
    assert conversion.add_months(date(2024, 2, 29), 24) == date(2026, 2, 28)
    assert conversion.add_months(date(2023, 11, 30), 3) == date(2024, 2, 29)
