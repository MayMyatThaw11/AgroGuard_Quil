import pytest

from agriquill import mixfarm


def farm(**over):
    base = {
        "area_ha": 1.0,
        "rice": True,
        "salinity_ppt": 0.5,
        "temp_c": 28.0,
        "soil": "clay",
        "perimeter_m": 400.0,
    }
    return {**base, **over}


def ids(rows):
    return [r["id"] for r in rows]


def test_fresh_water_rice_farm_gets_duck_and_fish_not_brackish_shrimp() -> None:
    rows = mixfarm.suggest(farm())
    assert "rice_duck" in ids(rows) and "rice_fish" in ids(rows)
    assert "rice_shrimp" not in ids(rows)


def test_brackish_coast_gets_rice_shrimp_with_salt_tolerant_species() -> None:
    rows = mixfarm.suggest(farm(salinity_ppt=14.0))
    shrimp = next(r for r in rows if r["id"] == "rice_shrimp")
    assert {s["id"] for s in shrimp["species"]} <= {"black_tiger", "whiteleg_shrimp"}
    assert "rice_fish" not in ids(rows)


def test_without_rice_the_rice_systems_are_not_offered() -> None:
    rows = mixfarm.suggest(farm(rice=False))
    assert not {"rice_duck", "rice_fish", "rice_shrimp"} & set(ids(rows))
    assert "pond_fish" in ids(rows)


def test_every_suggestion_carries_reasons_and_the_verify_status() -> None:
    for row in mixfarm.suggest(farm()):
        assert row["reasons"] and row["status"].startswith("TO VERIFY")
        assert row["fit"] in {"strong", "good", "weak"}


def test_fish_toxic_sprays_weaken_rice_fish_and_add_a_caution() -> None:
    plain = next(r for r in mixfarm.suggest(farm()) if r["id"] == "rice_fish")
    sprayed = next(
        r for r in mixfarm.suggest(farm(sprays_toxic_to_fish=True)) if r["id"] == "rice_fish"
    )
    assert "fish-toxic-spray" in [c["id"] for c in sprayed["cautions"]]
    order = ["weak", "good", "strong"]
    assert order.index(sprayed["fit"]) < order.index(plain["fit"])


def test_rice_fish_carries_a_trench_inside_the_ten_percent_limit() -> None:
    row = next(r for r in mixfarm.suggest(farm()) if r["id"] == "rice_fish")
    assert 0.05 <= row["trench"]["share"] <= 0.10
    assert row["trench"]["volume_m3"] > 0


def test_margin_needs_prices_and_never_invents_them() -> None:
    row = next(r for r in mixfarm.suggest(farm()) if r["id"] == "rice_fish")
    assert row["margin"]["missing"] == ["sell_mmk_kg", "seed_mmk_each"]


def test_margin_follows_units_survival_weight_and_prices() -> None:
    out = mixfarm.margin(
        "nile_tilapia",
        units=1000,
        prices={"sell_mmk_kg": 4000, "seed_mmk_each": 50, "feed_mmk_kg": 1500},
    )
    kg = 1000 * 0.85 * 400 / 1000
    assert out["harvest_kg"] == pytest.approx(kg)
    assert out["revenue_mmk"] == pytest.approx(kg * 4000)
    assert out["cost_mmk"] == pytest.approx(1000 * 50 + 1.6 * kg * 1500)
    assert out["margin_mmk"] == pytest.approx(out["revenue_mmk"] - out["cost_mmk"])


def test_ranking_orders_by_margin_when_prices_are_given() -> None:
    prices = {
        "nile_tilapia": {"sell_mmk_kg": 4000, "seed_mmk_each": 50, "feed_mmk_kg": 1500},
        "rohu": {"sell_mmk_kg": 2000, "seed_mmk_each": 50, "feed_mmk_kg": 1500},
    }
    rows = mixfarm.rank_species(["nile_tilapia", "rohu"], pond_m2=1000, prices=prices)
    assert rows[0]["id"] == "nile_tilapia"
    unpriced = mixfarm.rank_species(["nile_tilapia", "rohu"], pond_m2=1000, prices={})
    assert all(r["margin"]["missing"] for r in unpriced)


def test_species_outside_their_salinity_or_temperature_are_dropped() -> None:
    assert "whiteleg_shrimp" not in [
        s["id"] for s in mixfarm.species_for(salinity_ppt=0.5, temp_c=28.0)
    ]
    assert "nile_tilapia" in [s["id"] for s in mixfarm.species_for(salinity_ppt=0.5, temp_c=28.0)]
    assert "nile_tilapia" not in [
        s["id"] for s in mixfarm.species_for(salinity_ppt=0.5, temp_c=12.0)
    ]


def test_unknown_salinity_is_reported_not_assumed() -> None:
    rows = mixfarm.suggest(farm(salinity_ppt=None))
    assert any("salinity-unknown" in [r["id"] for r in row["reasons"]] for row in rows)


def test_birds_near_water_carry_the_biosecurity_caution() -> None:
    row = next(r for r in mixfarm.suggest(farm()) if r["id"] == "dike_poultry")
    assert "avian-influenza" in [c["id"] for c in row["cautions"]]
