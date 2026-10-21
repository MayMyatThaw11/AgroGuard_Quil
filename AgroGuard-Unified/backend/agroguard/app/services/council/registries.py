from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class AgronomyCatalogItem(BaseModel):
    sku_id: str
    name: str
    category: str  # bio_fungicide, chemical_fungicide, foliar_nutrient, granular_fertilizer, cultural
    phi_days: int  # Pre-Harvest Interval in days
    target_pest_or_condition: str
    safe_growth_stages: list[str]
    banned_growth_stages: list[str]
    dosage_per_ha: str
    unit_cost_usd_ha: float
    export_mrl_compliant: bool
    description: str


class MarketContractItem(BaseModel):
    contract_id: str
    buyer_name: str
    crop: str
    grade_spec: str
    max_moisture_pct: float
    max_broken_pct: float
    min_phi_clean_days: int
    base_price_usd_ton: float
    grade_a_premium_pct: float
    severe_dockage_penalty_pct: float


# =========================================================================
# CLOSED-WORLD AGRONOMY CATALOG (VERIFIED GROUNDING REGISTRY)
# =========================================================================

VERIFIED_AGRONOMY_CATALOG: dict[str, AgronomyCatalogItem] = {
    "NONE_CULTURAL_ONLY": AgronomyCatalogItem(
        sku_id="NONE_CULTURAL_ONLY",
        name="Zero-Cash Cultural & Biological Protocol",
        category="cultural",
        phi_days=0,
        target_pest_or_condition="Field drainage, lower canopy pruning, aeration, mulch, soil tamping",
        safe_growth_stages=["Vegetative", "Tillering", "Booting", "Flowering", "Ripening", "Maturity"],
        banned_growth_stages=[],
        dosage_per_ha="0 kg (Manual farmer labor with hand hoe/sickle)",
        unit_cost_usd_ha=0.0,
        export_mrl_compliant=True,
        description="Zero cash outlay physical intervention: water furrow drainage, aeration pruning, or soil tamping.",
    ),
    "SKU-BIO-BACILLUS-01": AgronomyCatalogItem(
        sku_id="SKU-BIO-BACILLUS-01",
        name="Bacillus subtilis Bio-Fungicide (Serenade ASO / BioGuard)",
        category="bio_fungicide",
        phi_days=0,
        target_pest_or_condition="Fungal blast (Magnaporthe oryzae), sheath blight, brown spot",
        safe_growth_stages=["Tillering", "Booting", "Flowering", "Ripening"],
        banned_growth_stages=[],
        dosage_per_ha="1.5 L/ha in 200 L water",
        unit_cost_usd_ha=13.50,
        export_mrl_compliant=True,
        description="Bio-antagonist bacterial strain; 0-day PHI; leaves zero synthetic chemical residue; safe during flowering.",
    ),
    "SKU-CHEM-PROPICON-02": AgronomyCatalogItem(
        sku_id="SKU-CHEM-PROPICON-02",
        name="Propiconazole 25% EC Chemical Fungicide",
        category="chemical_fungicide",
        phi_days=21,
        target_pest_or_condition="Severe systemic sheath blight & glume blotch",
        safe_growth_stages=["Tillering", "Booting"],
        banned_growth_stages=["Flowering", "Ripening", "Maturity"],
        dosage_per_ha="500 mL/ha",
        unit_cost_usd_ha=28.00,
        export_mrl_compliant=False,  # Restricted by EU/China strict MRL within 21d of harvest
        description="Triazole synthetic fungicide. STRICT 21-day PHI. Banned during flowering (pollinator damage) and ripening.",
    ),
    "SKU-FOLIAR-N-01": AgronomyCatalogItem(
        sku_id="SKU-FOLIAR-N-01",
        name="Chelated Amino-Nitrogen & Zinc Foliar Booster",
        category="foliar_nutrient",
        phi_days=3,
        target_pest_or_condition="Nitrogen chlorosis & panicle initiation stunting",
        safe_growth_stages=["Tillering", "Booting", "Flowering"],
        banned_growth_stages=["Maturity"],
        dosage_per_ha="2.0 L/ha dawn mist application",
        unit_cost_usd_ha=14.00,
        export_mrl_compliant=True,
        description="Stomatal micro-dosing spray for rapid early morning uptake; prevents soil ammonia volatilization.",
    ),
    "SKU-NPK-BLANKET-01": AgronomyCatalogItem(
        sku_id="SKU-NPK-BLANKET-01",
        name="Granular NPK 15-15-15 Compound Fertilizer",
        category="granular_fertilizer",
        phi_days=14,
        target_pest_or_condition="Basal soil macronutrient replenishment",
        safe_growth_stages=["Vegetative", "Tillering"],
        banned_growth_stages=["Flowering", "Ripening", "Maturity"],
        dosage_per_ha="50 kg/ha broadcast",
        unit_cost_usd_ha=58.00,
        export_mrl_compliant=True,
        description="Heavy granular broadcasting. High cost ($58/ha). Vulnerable to 40% volatilization on dry soil.",
    ),
}


# =========================================================================
# CLOSED-WORLD IRL MARKET REGISTRY (PRICES, SKUS & CONTRACT SPECIFICATIONS)
# =========================================================================

IRL_MARKET_REGISTRY: dict[str, Any] = {
    "commodity_spot_prices": {
        "rice_pawsan_usd_ton": 480.0,
        "rice_emata_usd_ton": 340.0,
        "wheat_durum_usd_ton": 360.0,
        "coffee_specialty_usd_ton": 3800.0,
    },
    "service_rates": {
        "combine_harvester_hire_usd_ha": 85.0,
        "cooperative_batch_drying_usd_ton": 18.0,
        "diesel_fuel_hourly_pump_usd": 3.50,
        "cooperative_haas_sensor_season_usd_ha": 3.0,
    },
    "buyer_contracts": {
        "BUYER-EXP-01": MarketContractItem(
            contract_id="BUYER-EXP-01",
            buyer_name="Golden Ayeyarwady Rice Millers & Exporters",
            crop="rice",
            grade_spec="Pawsan 100% Export Grade 1",
            max_moisture_pct=14.0,
            max_broken_pct=5.0,
            min_phi_clean_days=14,
            base_price_usd_ton=480.0,
            grade_a_premium_pct=25.0,
            severe_dockage_penalty_pct=35.0,
        ),
        "BUYER-COOP-02": MarketContractItem(
            contract_id="BUYER-COOP-02",
            buyer_name="Shwe Pyi Agricultural Cooperative Federation",
            crop="rice",
            grade_spec="Cooperative Fair-Trade Standard",
            max_moisture_pct=15.0,
            max_broken_pct=10.0,
            min_phi_clean_days=7,
            base_price_usd_ton=410.0,
            grade_a_premium_pct=15.0,
            severe_dockage_penalty_pct=20.0,
        ),
    },
}


def lookup_verified_sku(sku_id: str) -> AgronomyCatalogItem:
    """Retrieve SKU from verified registry or raise ValueError (no hallucinations allowed)."""
    item = VERIFIED_AGRONOMY_CATALOG.get(sku_id)
    if not item:
        raise KeyError(f"UNVERIFIED_EXTERNAL_SKU: '{sku_id}' is not in the VerifiedAgronomyCatalog.")
    return item


def filter_safe_skus(days_to_harvest: int, growth_stage: str) -> list[AgronomyCatalogItem]:
    """Deterministically filter treatments that satisfy both PHI and growth-stage constraints."""
    safe_items: list[AgronomyCatalogItem] = []
    for item in VERIFIED_AGRONOMY_CATALOG.values():
        # PHI constraint: treatment cannot require more withdrawal days than remaining harvest days
        if item.phi_days > days_to_harvest:
            continue
        # Growth stage constraint: cannot be in banned stages
        if growth_stage in item.banned_growth_stages:
            continue
        safe_items.append(item)
    return safe_items

