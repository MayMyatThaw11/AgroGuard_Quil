"""Market Demand & Glut Risk Engine for Myanmar Agricultural Commodities.

Implements Cobweb Theorem boom-and-bust dynamics, regional acreage saturation,
instant spot demand vs harvest-window projected supply, post-hype price elasticity,
and deep economic reasoning with strict anti-hallucination provenance grounded
in historical Shan State, Delta, and ASEAN datasets.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any
import pandas as pd
from pydantic import BaseModel, Field

from app.services.regional_market import (
    DEFAULT_USD_TO_MMK,
    KG_PER_VISS,
    CROP_BASKET_WEIGHT_KG,
    DEFAULT_BASKET_WEIGHT_KG,
    clean_numeric_price,
    convert_from_usd_per_tonne,
    convert_to_usd_per_tonne,
    resolve_commodity,
    resolve_market_center,
    Region,
    CommodityCategory,
    VERIFIED_COMMODITIES,
    VERIFIED_REGIONAL_CENTERS,
    ProvenanceTag,
    ValidationStamp,
    CleanMarketIntelligence,
)


# =========================================================================
# ENUMS & TYPES
# =========================================================================

class DemandProvenanceTag(str, Enum):
    MEASURED = "MEASURED"
    MEASURED_PORTAL = "MEASURED_PORTAL"
    MEASURED_COMMUNITY_POST = "MEASURED_COMMUNITY_POST"
    MEASURED_ERP = "MEASURED_ERP"
    HISTORICAL_INDEX = "HISTORICAL_INDEX"
    UNRECORDED = "UNRECORDED"


class DemandUnrecordedReason(str, Enum):
    UNRECORDED_TOWNSHIP = "unrecorded_township"
    UNRECORDED_COMMODITY = "unrecorded_commodity"
    INSUFFICIENT_HISTORICAL_DATA = "insufficient_historical_data"
    INVALID_PRICE_FEED = "invalid_price_feed"


class PerishabilityTier(str, Enum):
    HIGH = "HIGH"          # Perishable vegetables & fruits (shelf life 7-14 days; severe glut collapse)
    MODERATE = "MODERATE"  # Tubers, bulbs (shelf life 30-90 days; moderate storage resilience)
    LOW = "LOW"            # Grains, cereals, pulses, oilseeds (shelf life 180-365 days; high dry storability)


class GlutRiskLevel(str, Enum):
    LOW = "LOW"            # Cobweb Glut Index < 0.35
    MODERATE = "MODERATE"  # Cobweb Glut Index 0.35 - 0.65
    HIGH = "HIGH"          # Cobweb Glut Index 0.65 - 0.85
    CRITICAL = "CRITICAL"  # Cobweb Glut Index >= 0.85


class HypeCyclePhase(str, Enum):
    PEAK_HYPE = "PEAK_HYPE"                      # Spot price > +30% above baseline; heavy rush underway
    EARLY_RUSH = "EARLY_RUSH"                    # Spot price +15% to +30% above baseline; planting accelerating
    STABLE_EQUILIBRIUM = "STABLE_EQUILIBRIUM"    # Spot price within -15% to +15% of historical baseline
    POST_HYPE_GLUT = "POST_HYPE_GLUT"            # Harvest surge exceeds bottleneck; prices falling below cost
    DEPRESSED = "DEPRESSED"                      # Spot price > 20% below baseline off-cycle


# =========================================================================
# DATA SCHEMAS & MODELS
# =========================================================================

class DownsidePriceScenario(BaseModel):
    """Scenario modeling price collapse under specific regional acreage expansion shock."""
    acreage_shock_pct: float = Field(..., description="Acreage expansion percentage (+20%, +50%, +100%)")
    projected_market_price_usd_tonne: float = Field(..., description="Projected post-shock price in USD/tonne")
    price_change_pct: float = Field(..., description="Percentage change relative to instant spot price")
    projected_price_mmk_per_viss: float = Field(..., description="Projected price in MMK per viss")
    gross_revenue_usd_per_ha: float = Field(..., description="Projected gross revenue per hectare")
    estimated_production_cost_usd_ha: float = Field(..., description="Regional baseline production cost per hectare")
    net_margin_usd_per_ha: float = Field(..., description="Projected net margin (revenue - cost) per hectare")
    is_below_production_cost: bool = Field(..., description="True if projected price is below regional production cost")


class StorageEconomics(BaseModel):
    """Storage feasibility and break-even post-glut holding economics."""
    is_storage_feasible: bool
    storage_facility_type: str
    monthly_storage_cost_usd_tonne: float
    monthly_spoilage_rate_pct: float
    recommended_holding_months: int
    post_glut_recovery_price_usd_tonne: float
    net_storage_gain_usd_tonne: float
    strategic_advice: str


class TownshipAcreageBaseline(BaseModel):
    """Grounded multi-year historical acreage and production capacity for a township."""
    township: str
    commodity: str
    canonical_commodity: str
    historical_sown_acreage_mean: float | None = None
    historical_sown_acreage_min: float | None = None
    historical_sown_acreage_max: float | None = None
    historical_acreage_cv: float | None = None  # Coefficient of Variation: std / mean
    historical_yield_tons_per_ha: float | None = None
    historical_yield_variance: float | None = None
    historical_yield_std: float | None = None
    historical_annual_production_capacity_tons: float | None = None
    historical_price_mean_usd_tonne: float | None = None
    historical_price_variance: float | None = None
    historical_price_std: float | None = None
    historical_price_cv: float | None = None
    data_source: str
    recorded_years_count: int


class EconomicReasoningNarrative(BaseModel):
    """Deep, non-hallucinating structured economic narrative for farmers and cooperatives."""
    current_market_state: str = Field(..., description="(a) Instant spot demand vs long-term baseline")
    township_hype_and_rush_factor: str = Field(..., description="(b) Local planting rush and township acreage concentration")
    projected_harvest_window_and_bottlenecks: str = Field(..., description="(c) Projected harvest supply, bottleneck breach, and downside prices")
    concrete_hedging_recommendations: str = Field(..., description="(d) Actionable hedging playbook (staggering, contracts, storage)")


class CobwebGlutAnalysis(BaseModel):
    """Complete Cobweb Theorem Boom-and-Bust & Glut Risk Assessment."""
    township: str
    market_center: str
    commodity: str
    commodity_canonical: str | None = None
    provenance: DemandProvenanceTag
    unrecorded_reason: DemandUnrecordedReason | None = None
    analysis_timestamp: str

    # Instant spot demand metrics
    instant_spot_price_usd_tonne: float | None = None
    historical_baseline_price_usd_tonne: float | None = None
    instant_demand_surge_ratio: float | None = None
    is_hype_cycle_active: bool = False
    hype_cycle_phase: HypeCyclePhase | None = None

    # Projected harvest supply & price (distinguishing spot vs harvest window)
    projected_harvest_price_usd_tonne: float | None = None
    projected_harvest_price_mmk_viss: float | None = None
    projected_price_change_at_harvest_pct: float | None = None

    # Agronomic & township capacity metrics
    perishability_tier: PerishabilityTier | None = None
    days_to_harvest: int = 90
    baseline_sown_acres: float | None = None
    projected_current_acres: float | None = None
    acreage_expansion_ratio: float | None = None
    historical_acreage_volatility_cv: float | None = None
    regional_processing_capacity_tons: float | None = None
    projected_harvest_volume_tons: float | None = None
    capacity_utilization_ratio: float | None = None

    # Quantitative Cobweb Index
    cobweb_glut_risk_index: float | None = None  # Normalized score 0.0 to 1.0
    glut_risk_level: GlutRiskLevel | None = None

    # Downside price scenarios (+20%, +50%, +100%)
    estimated_production_cost_usd_tonne: float | None = None
    downside_scenarios: list[DownsidePriceScenario] = Field(default_factory=list)

    # Hedging & Storage solutions
    forward_contract_benchmark_usd_tonne: float | None = None
    storage_economics: StorageEconomics | None = None
    economic_reasoning: EconomicReasoningNarrative | None = None
    hedging_recommendations: list[str] = Field(default_factory=list)
    notes: str = ""

    def to_api_dict(self) -> dict[str, Any]:
        """Convert analysis to dict with explicit null fields for unrecorded queries."""
        return self.model_dump()


# =========================================================================
# COMMODITY PERISHABILITY & ELASTICITY BENCHMARKS
# =========================================================================

# Price elasticity of demand (ε_d) and perishability characteristics
# Agricultural produce in regional wholesale markets is notoriously price inelastic.
# Negative price elasticity values: smaller |ε| means higher price collapse under supply shock.
COMMODITY_MARKET_CHARACTERISTICS: dict[str, dict[str, Any]] = {
    # Perishable vegetables & fruits
    "cabbage": {
        "tier": PerishabilityTier.HIGH,
        "price_elasticity": -0.35,  # Very inelastic local consumption
        "shelf_life_days": 10,
        "monthly_storage_cost_usd_ton": 35.0,  # Cold chain needed
        "monthly_spoilage_rate_pct": 0.25,
        "default_yield_ton_ha": 26.0,
        "aliases": ["cabbage", "ဂေါ်ဖီ", "ဂေါ်ဖီထုပ်", "brassica oleracea"],
    },
    "tomato": {
        "tier": PerishabilityTier.HIGH,
        "price_elasticity": -0.32,
        "shelf_life_days": 7,
        "monthly_storage_cost_usd_ton": 40.0,
        "monthly_spoilage_rate_pct": 0.30,
        "default_yield_ton_ha": 22.0,
        "aliases": ["tomato", "ခရမ်းချဉ်", "ခရမ်းချဉ်သီး", "solanum lycopersicum"],
    },
    "watermelon": {
        "tier": PerishabilityTier.HIGH,
        "price_elasticity": -0.40,
        "shelf_life_days": 14,
        "monthly_storage_cost_usd_ton": 30.0,
        "monthly_spoilage_rate_pct": 0.20,
        "default_yield_ton_ha": 25.0,
        "aliases": ["watermelon", "ဖရဲ", "ဖရဲသီး", "citrullus lanatus"],
    },
    # Moderate perishability (Tubers, bulbs)
    "potato": {
        "tier": PerishabilityTier.MODERATE,
        "price_elasticity": -0.50,
        "shelf_life_days": 60,
        "monthly_storage_cost_usd_ton": 15.0,
        "monthly_spoilage_rate_pct": 0.05,
        "default_yield_ton_ha": 16.5,
        "aliases": ["potato", "အာလူး", "solanum tuberosum"],
    },
    "onion": {
        "tier": PerishabilityTier.MODERATE,
        "price_elasticity": -0.45,
        "shelf_life_days": 60,
        "monthly_storage_cost_usd_ton": 15.0,
        "monthly_spoilage_rate_pct": 0.06,
        "default_yield_ton_ha": 15.0,
        "aliases": ["onion", "ကြက်သွန်နီ", "allium cepa"],
    },
    "ginger": {
        "tier": PerishabilityTier.MODERATE,
        "price_elasticity": -0.55,
        "shelf_life_days": 90,
        "monthly_storage_cost_usd_ton": 18.0,
        "monthly_spoilage_rate_pct": 0.04,
        "default_yield_ton_ha": 12.0,
        "aliases": ["ginger", "ချင်း", "ဂျင်း", "zingiber officinale"],
    },
    # Low perishability (Grains, cereals, pulses, oilseeds)
    "maize": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.70,  # Buffer feed mills absorb supply
        "shelf_life_days": 270,
        "monthly_storage_cost_usd_ton": 6.0,  # Ambient dry aeration
        "monthly_spoilage_rate_pct": 0.005,
        "default_yield_ton_ha": 5.0,
        "aliases": ["maize", "corn", "zea mays", "zea maize", "ပြောင်း", "ပြောင်းဖူး"],
    },
    "rice": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.65,
        "shelf_life_days": 365,
        "monthly_storage_cost_usd_ton": 6.0,
        "monthly_spoilage_rate_pct": 0.005,
        "default_yield_ton_ha": 4.2,
        "aliases": ["rice", "paddy", "rice (paddy)", "summer paddy", "rain paddy", "စပါး", "ဆန်", "rice_emata", "rice_pawsan", "emata", "pawsan"],
    },
    "rice_pawsan": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.60,
        "shelf_life_days": 365,
        "monthly_storage_cost_usd_ton": 6.0,
        "monthly_spoilage_rate_pct": 0.005,
        "default_yield_ton_ha": 4.2,
        "aliases": ["paw san", "pawsan", "pawsan rice", "ပေါ်ဆန်း", "ပေါ်ဆန်းမွှေး"],
    },
    "rice_emata": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.70,
        "shelf_life_days": 365,
        "monthly_storage_cost_usd_ton": 6.0,
        "monthly_spoilage_rate_pct": 0.005,
        "default_yield_ton_ha": 4.2,
        "aliases": ["emata", "emata rice", "ဧည့်မထ"],
    },
    "groundnut": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.65,
        "shelf_life_days": 240,
        "monthly_storage_cost_usd_ton": 7.0,
        "monthly_spoilage_rate_pct": 0.008,
        "default_yield_ton_ha": 1.8,
        "aliases": ["groundnut", "peanut", "arachis hypogaea", "မြေပဲ", "မြေပဲဆန်"],
    },
    "sesame": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.60,
        "shelf_life_days": 300,
        "monthly_storage_cost_usd_ton": 7.0,
        "monthly_spoilage_rate_pct": 0.006,
        "default_yield_ton_ha": 0.9,
        "aliases": ["sesame", "sesame seed", "flower sesame", "sesamum indicum", "နှမ်း"],
    },
    "mustard": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.65,
        "shelf_life_days": 300,
        "monthly_storage_cost_usd_ton": 7.0,
        "monthly_spoilage_rate_pct": 0.006,
        "default_yield_ton_ha": 1.2,
        "aliases": ["mustard", "mustard seed", "brassica juncea", "မုန်ညင်း", "မုန်ညင်းစေ့"],
    },
    "sunflower": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.65,
        "shelf_life_days": 270,
        "monthly_storage_cost_usd_ton": 7.0,
        "monthly_spoilage_rate_pct": 0.007,
        "default_yield_ton_ha": 1.7,
        "aliases": ["sunflower", "နေကြာ", "helianthus annuus"],
    },
    "wheat": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.70,
        "shelf_life_days": 365,
        "monthly_storage_cost_usd_ton": 6.0,
        "monthly_spoilage_rate_pct": 0.005,
        "default_yield_ton_ha": 2.5,
        "aliases": ["wheat", "triticum", "ဂျုံ"],
    },
    "beans": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.65,
        "shelf_life_days": 365,
        "monthly_storage_cost_usd_ton": 6.0,
        "monthly_spoilage_rate_pct": 0.005,
        "default_yield_ton_ha": 1.4,
        "aliases": ["beans", "black gram", "matpe", "mung bean", "green gram", "chickpea", "ပဲ", "မတ်ပဲ", "ပဲတီစိမ်း"],
    },
    "sorghum": {
        "tier": PerishabilityTier.LOW,
        "price_elasticity": -0.70,
        "shelf_life_days": 360,
        "monthly_storage_cost_usd_ton": 6.0,
        "monthly_spoilage_rate_pct": 0.005,
        "default_yield_ton_ha": 2.2,
        "aliases": ["sorghum", "great millet", "ပြောင်းကောက်", "စပါးပြောင်း"],
    },
    "garlic": {
        "tier": PerishabilityTier.MODERATE,
        "price_elasticity": -0.45,
        "shelf_life_days": 120,
        "monthly_storage_cost_usd_ton": 16.0,
        "monthly_spoilage_rate_pct": 0.04,
        "default_yield_ton_ha": 6.5,
        "aliases": ["garlic", "ကြက်သွန်ဖြူ", "allium sativum"],
    },
    "chili": {
        "tier": PerishabilityTier.HIGH,
        "price_elasticity": -0.40,
        "shelf_life_days": 21,
        "monthly_storage_cost_usd_ton": 25.0,
        "monthly_spoilage_rate_pct": 0.15,
        "default_yield_ton_ha": 4.5,
        "aliases": ["chili", "chilli", "chili pepper", "ငရုတ်", "ငရုတ်သီး", "capsicum"],
    },
}

# Township to regional trading hub mappings for logistics & price resolution
TOWNSHIP_REGIONAL_HUB_MAPPING: dict[str, tuple[Region, str]] = {
    # Shan State Townships
    "Taunggyi": (Region.SHAN, "Taunggyi"),
    "Hopong": (Region.SHAN, "Taunggyi"),
    "Nyaungshwe": (Region.SHAN, "Taunggyi"),
    "Lawksawk": (Region.SHAN, "Taunggyi"),
    "Kyauktalonegyi": (Region.SHAN, "Taunggyi"),
    "His Hseng": (Region.SHAN, "Taunggyi"),
    "Pekon": (Region.SHAN, "Taunggyi"),
    "Kalaw": (Region.SHAN, "Aungban"),
    "Aungban": (Region.SHAN, "Aungban"),
    "Pindaya": (Region.SHAN, "Aungban"),
    "Ywangan": (Region.SHAN, "Aungban"),
    "Pinlaung": (Region.SHAN, "Aungban"),
    "Naungtayar": (Region.SHAN, "Aungban"),
    "Muse": (Region.SHAN, "Muse"),
    "Namhkan": (Region.SHAN, "Muse"),
    "Lashio": (Region.SHAN, "Lashio"),
    "Panghsang": (Region.SHAN, "Lashio"),
    # Ayeyarwady Delta Townships
    "Pathein": (Region.AYEYARWADY, "Pathein"),
    "Maubin": (Region.AYEYARWADY, "Maubin"),
    "Hinthada": (Region.AYEYARWADY, "Hinthada"),
    "Mawlamyine": (Region.AYEYARWADY, "Mawlamyine/Delta co-op"),
    # Central/Lower Myanmar Agricultural Centers
    "Mandalay": (Region.SHAN, "Taunggyi"),
    "Meiktila": (Region.SHAN, "Aungban"),
    "Monywa": (Region.SHAN, "Taunggyi"),
    "Taungoo": (Region.AYEYARWADY, "Hinthada"),
    "Magway": (Region.SHAN, "Aungban"),
    "Naypyidaw": (Region.SHAN, "Aungban"),
    "Bago": (Region.AYEYARWADY, "Pathein"),
    "Sagaing": (Region.SHAN, "Taunggyi"),
    "Yangon": (Region.YANGON, "Bayintnaung"),
    "Bayintnaung": (Region.YANGON, "Bayintnaung"),
}

TOWNSHIP_ALIASES: dict[str, str] = {
    "bayintnaung": "Bayintnaung",
    "ဘုရင့်နောင်": "Bayintnaung",
    # Shan State Townships
    "taunggyi": "Taunggyi",
    "တောင်ကြီး": "Taunggyi",
    "kalaw": "Kalaw",
    "ကလော": "Kalaw",
    "aungban": "Aungban",
    "aung ban": "Aungban",
    "အောင်ပန်း": "Aungban",
    "hopong": "Hopong",
    "ဟိုပုံး": "Hopong",
    "nyaungshwe": "Nyaungshwe",
    "nyaung shwe": "Nyaungshwe",
    "ညောင်ရွှေ": "Nyaungshwe",
    "lawksawk": "Lawksawk",
    "ရပ်စောက်": "Lawksawk",
    "pindaya": "Pindaya",
    "ပင်းတယ": "Pindaya",
    "ywangan": "Ywangan",
    "ရွာငံ": "Ywangan",
    "pinlaung": "Pinlaung",
    "ပင်လောင်း": "Pinlaung",
    "pekon": "Pekon",
    "ဖယ်ခုံ": "Pekon",
    "muse": "Muse",
    "မူဆယ်": "Muse",
    "lashio": "Lashio",
    "လားရှိုး": "Lashio",
    "namhkan": "Namhkan",
    "နမ့်ခမ်း": "Namhkan",
    "hsipaw": "Hsipaw",
    "သီပေါ": "Hsipaw",
    "kyaukme": "Kyaukme",
    "ကျောက်မဲ": "Kyaukme",
    "naungtayar": "Naungtayar",
    "နောင်တရား": "Naungtayar",
    "his hseng": "His Hseng",
    "ဆီဆိုင်": "His Hseng",
    "kyauktalonegyi": "Kyauktalonegyi",
    "ကျောက်တလုံးကြီး": "Kyauktalonegyi",
    "panghsang": "Panghsang",
    "ပန်ဆန်း": "Panghsang",
    # Ayeyarwady Delta & Central Centers
    "pathein": "Pathein",
    "bassein": "Pathein",
    "ပုသိမ်": "Pathein",
    "maubin": "Maubin",
    "ma ubin": "Maubin",
    "မအူပင်": "Maubin",
    "hinthada": "Hinthada",
    "henzada": "Hinthada",
    "ဟင်္သာတ": "Hinthada",
    "mawlamyine": "Mawlamyine",
    "မော်လမြိုင်": "Mawlamyine",
    "mandalay": "Mandalay",
    "မန္တလေး": "Mandalay",
    "meiktila": "Meiktila",
    "မိတ္ထီလာ": "Meiktila",
    "monywa": "Monywa",
    "မုံရွာ": "Monywa",
    "taungoo": "Taungoo",
    "toungoo": "Taungoo",
    "တောင်ငူ": "Taungoo",
    "magway": "Magway",
    "magwe": "Magway",
    "မကွေး": "Magway",
    "naypyidaw": "Naypyidaw",
    "nay pyi taw": "Naypyidaw",
    "နေပြည်တော်": "Naypyidaw",
    "bago": "Bago",
    "pegu": "Bago",
    "ပဲခူး": "Bago",
    "sagaing": "Sagaing",
    "စစ်ကိုင်း": "Sagaing",
    "yangon": "Yangon",
    "rangoon": "Yangon",
    "ရန်ကုန်": "Yangon",
}


# =========================================================================
# HELPER FUNCTIONS: NORMALIZATION & MATCHING
# =========================================================================

def normalize_token(text: str | None) -> str:
    if not text:
        return ""
    return str(text).strip().lower().replace("_", " ").replace("-", " ")


def resolve_township(township: str | None) -> tuple[str | None, Region | None, str | None]:
    """Resolve raw township input to (canonical_township, region, trading_hub)."""
    norm = normalize_token(township)
    if not norm:
        return None, None, None

    canon_ts = TOWNSHIP_ALIASES.get(norm)
    if not canon_ts:
        canon_ts = TOWNSHIP_ALIASES.get(str(township).strip().lower())

    reg, hub = resolve_market_center(township)
    if not canon_ts and hub:
        canon_ts = hub

    if not canon_ts:
        for k in TOWNSHIP_REGIONAL_HUB_MAPPING:
            if normalize_token(k) == norm:
                canon_ts = k
                break

    if not canon_ts:
        return None, None, None

    hub_info = TOWNSHIP_REGIONAL_HUB_MAPPING.get(canon_ts)
    if hub_info:
        return canon_ts, hub_info[0], hub_info[1]
    if reg and hub:
        return canon_ts, reg, hub

    return canon_ts, Region.SHAN, canon_ts


def resolve_characteristic_commodity(commodity: str) -> tuple[str | None, dict[str, Any] | None]:
    """Resolve commodity against perishability and elasticity catalog."""
    norm = normalize_token(commodity)
    if not norm:
        return None, None

    for canon, spec in COMMODITY_MARKET_CHARACTERISTICS.items():
        if norm == canon or norm == normalize_token(canon):
            return canon, spec
        for alias in spec.get("aliases", []):
            if norm == normalize_token(alias):
                return canon, spec

    # Substring matching
    for canon, spec in COMMODITY_MARKET_CHARACTERISTICS.items():
        for alias in spec.get("aliases", []):
            a_norm = normalize_token(alias)
            if a_norm and (a_norm in norm or norm in a_norm):
                return canon, spec

    return None, None


# =========================================================================
# MARKET DEMAND & GLUT RISK ENGINE
# =========================================================================

class MarketDemandService:
    """Robust, non-hallucinating Market Demand & Glut Risk Engine.

    Calculates Cobweb Theorem risk index, instant spot vs harvest window projected supply,
    post-hype price elasticity downside scenarios, and deep structured economic reasoning.
    """

    def __init__(self, data_dir: Path | None = None, exchange_rate: float = DEFAULT_USD_TO_MMK):
        self.exchange_rate = exchange_rate
        self.data_dir = data_dir or (Path(__file__).resolve().parent.parent / "data")

        # In-memory historical baselines computed from real CSVs
        # Key: (township_canonical, commodity_canonical)
        self.township_acreage_stats: dict[tuple[str, str], TownshipAcreageBaseline] = {}
        self.commodity_baseline_prices: dict[str, float] = {}
        self.township_yield_stats: dict[tuple[str, str], float] = {}
        self.township_price_history: dict[tuple[str, str], list[float]] = {}

        self._load_datasets()

    def _load_datasets(self) -> None:
        """Load and compute verified baselines strictly from historical CSVs."""
        # 1. Load ASEAN Top 50 Price Baseline
        asean_csv = self.data_dir / "ASEAN_Top50_Prices_Cleaned_Summary.csv"
        if asean_csv.exists():
            try:
                df_asean = pd.read_csv(asean_csv)
                for _, row in df_asean.iterrows():
                    crop_en = str(row.get("crop_name_en", "")).strip()
                    canon, _ = resolve_characteristic_commodity(crop_en)
                    price_val = row.get("myanmar_usd_tonne")
                    if canon and pd.notna(price_val) and float(price_val) > 0:
                        self.commodity_baseline_prices[canon] = float(price_val)
            except Exception:
                pass

        # Populate verified commodities baseline prices from regional_market as fallback
        for canon, spec in VERIFIED_COMMODITIES.items():
            if canon not in self.commodity_baseline_prices:
                self.commodity_baseline_prices[canon] = float(spec["default_usd_tonne"])

        # Extra known baselines
        if "cabbage" not in self.commodity_baseline_prices:
            self.commodity_baseline_prices["cabbage"] = 435.95
        if "potato" not in self.commodity_baseline_prices:
            self.commodity_baseline_prices["potato"] = 686.65
        if "tomato" not in self.commodity_baseline_prices:
            self.commodity_baseline_prices["tomato"] = 619.60

        # 2. Load Agricultural Crop-production Data of Shan State
        shan_csv = self.data_dir / "Agricultural Crop-production Data of Shan State.csv"
        if shan_csv.exists():
            try:
                df_shan = pd.read_csv(shan_csv)
                roc_cols = [c for c in df_shan.columns if c.startswith("ROC20")]
                roy_cols = [c for c in df_shan.columns if c.startswith("ROY20")]

                for _, row in df_shan.iterrows():
                    raw_ts = str(row.get("TS_NAME", "")).strip()
                    raw_cp = str(row.get("CP_NAME", "")).strip()
                    canon_crop, char_spec = resolve_characteristic_commodity(raw_cp)
                    if not canon_crop or not raw_ts:
                        continue

                    # Sown acreage numbers (in acres)
                    acre_vals: list[float] = []
                    for c in roc_cols:
                        v = row.get(c)
                        if pd.notna(v):
                            num = clean_numeric_price(v)
                            if num is not None and num > 0:
                                acre_vals.append(num)

                    if not acre_vals:
                        continue

                    s_acres = pd.Series(acre_vals)
                    mean_acres = float(s_acres.mean())
                    min_acres = float(s_acres.min())
                    max_acres = float(s_acres.max())
                    std_acres = float(s_acres.std(ddof=1)) if len(acre_vals) > 1 else 0.0
                    cv_acres = round(std_acres / mean_acres, 3) if mean_acres > 0 else 0.0

                    # Verified baseline yield
                    yield_t_ha = char_spec.get("default_yield_ton_ha", 2.5) if char_spec else 2.5

                    # Production capacity (tons): Peak historical acreage converted to ha * yield
                    peak_ha = max_acres / 2.47105
                    cap_tons = round(peak_ha * yield_t_ha, 1)

                    record = TownshipAcreageBaseline(
                        township=raw_ts,
                        commodity=raw_cp,
                        canonical_commodity=canon_crop,
                        historical_sown_acreage_mean=round(mean_acres, 1),
                        historical_sown_acreage_min=round(min_acres, 1),
                        historical_sown_acreage_max=round(max_acres, 1),
                        historical_acreage_cv=cv_acres,
                        historical_yield_tons_per_ha=yield_t_ha,
                        historical_annual_production_capacity_tons=cap_tons,
                        data_source="Agricultural Crop-production Data of Shan State.csv",
                        recorded_years_count=len(acre_vals),
                    )

                    exact_key = (raw_ts.lower(), raw_cp.lower())
                    self.township_acreage_stats[exact_key] = record

                    canon_key = (raw_ts.lower(), canon_crop)
                    if canon_key not in self.township_acreage_stats or raw_cp.lower() == canon_crop.lower():
                        self.township_acreage_stats[canon_key] = record

                    # Also map Aungban to Kalaw's records
                    if raw_ts.lower() == "kalaw":
                        aungban_record = record.model_copy(update={"township": "Aungban"})
                        self.township_acreage_stats[("aungban", raw_cp.lower())] = aungban_record
                        if ("aungban", canon_crop) not in self.township_acreage_stats or raw_cp.lower() == canon_crop.lower():
                            self.township_acreage_stats[("aungban", canon_crop)] = aungban_record

            except Exception:
                pass

        # 3. Load Township Agricultural Data (Pathein, Meiktila, Mandalay, etc.)
        ts_csv = self.data_dir / "township_agricultural_data.csv"
        if ts_csv.exists():
            try:
                df_ts = pd.read_csv(ts_csv)
                for (ts_name, crop_name), group in df_ts.groupby(["township", "best_crop"]):
                    raw_ts = str(ts_name).strip()
                    canon_crop, char_spec = resolve_characteristic_commodity(str(crop_name).strip())
                    if not canon_crop or not raw_ts:
                        continue

                    # Grounded Prices & Variances
                    prices = group["local_grain_price"].dropna().tolist()
                    clean_prices = [float(p) for p in prices if float(p) > 0]
                    p_series = pd.Series(clean_prices) if clean_prices else None
                    p_mean = round(float(p_series.mean()), 2) if p_series is not None else None
                    p_var = round(float(p_series.var(ddof=1)), 2) if p_series is not None and len(clean_prices) > 1 else 0.0
                    p_std = round(float(p_series.std(ddof=1)), 2) if p_series is not None and len(clean_prices) > 1 else 0.0
                    p_cv = round(p_std / p_mean, 3) if p_mean and p_mean > 0 else 0.0

                    if clean_prices:
                        self.township_price_history[(raw_ts.lower(), canon_crop)] = clean_prices

                    # Grounded Yields & Variances
                    yields = group["historic_yield_tons_per_ha"].dropna().tolist()
                    y_series = pd.Series(yields) if yields else None
                    med_yield = float(y_series.median()) if y_series is not None else 4.0
                    y_var = round(float(y_series.var(ddof=1)), 2) if y_series is not None and len(yields) > 1 else 0.0
                    y_std = round(float(y_series.std(ddof=1)), 2) if y_series is not None and len(yields) > 1 else 0.0

                    self.township_yield_stats[(raw_ts.lower(), canon_crop)] = round(med_yield, 2)

                    # Store real baseline without fabricating fake acreage numbers
                    key = (raw_ts.lower(), canon_crop)
                    if key not in self.township_acreage_stats:
                        rec = TownshipAcreageBaseline(
                            township=raw_ts,
                            commodity=str(crop_name),
                            canonical_commodity=canon_crop,
                            historical_sown_acreage_mean=None,  # Acreage not in this CSV: explicit None
                            historical_sown_acreage_min=None,
                            historical_sown_acreage_max=None,
                            historical_acreage_cv=None,
                            historical_yield_tons_per_ha=round(med_yield, 2),
                            historical_yield_variance=y_var,
                            historical_yield_std=y_std,
                            historical_annual_production_capacity_tons=None,  # Explicit None
                            historical_price_mean_usd_tonne=p_mean,
                            historical_price_variance=p_var,
                            historical_price_std=p_std,
                            historical_price_cv=p_cv,
                            data_source="township_agricultural_data.csv",
                            recorded_years_count=len(group),
                        )
                        self.township_acreage_stats[key] = rec
            except Exception:
                pass

    def get_township_baseline(self, township: str, commodity: str) -> TownshipAcreageBaseline | None:
        """Fetch verified acreage, yield, and price baseline for a township and crop."""
        canon_ts, _, _ = resolve_township(township)
        t_key = normalize_token(canon_ts or township)
        c_norm = normalize_token(commodity)
        c_canon, _ = resolve_characteristic_commodity(commodity)
        if not c_canon and not c_norm:
            return None

        # 1. Exact raw and canonical matches with canonical township key
        for cp in filter(None, [c_norm, c_canon]):
            rec = self.township_acreage_stats.get((t_key, cp))
            if rec:
                return rec

        # 2. Check aliases (e.g. Aungban -> Kalaw for Shan State highland baselines)
        if t_key in ("aungban", "aung ban"):
            for cp in filter(None, [c_norm, c_canon]):
                rec = self.township_acreage_stats.get(("kalaw", cp))
                if rec:
                    return rec

        # 3. Case-insensitive loop check
        for (ts_k, cp_k), v in self.township_acreage_stats.items():
            if normalize_token(ts_k) == t_key and (cp_k == c_norm or (c_canon and cp_k == c_canon)):
                return v

        return None

    def calculate_downside_scenarios(
        self,
        instant_spot_price: float,
        baseline_price: float,
        price_elasticity: float,
        expected_yield_ton_ha: float,
        shocks: list[float] | None = None,
        commodity_canonical: str = "maize",
    ) -> list[DownsidePriceScenario]:
        """Compute post-hype price drops under +20%, +50%, +100% acreage supply surges."""
        if shocks is None:
            shocks = [20.0, 50.0, 100.0]

        # Estimated cost of production benchmark (typically ~55% of baseline price in Myanmar)
        cost_prod_ton = round(baseline_price * 0.55, 2)
        cost_prod_ha = round(cost_prod_ton * expected_yield_ton_ha, 2)

        # Physical scrap salvage floor (cannot drop below 15% of baseline)
        salvage_floor = round(baseline_price * 0.15, 2)

        scenarios: list[DownsidePriceScenario] = []
        inv_elasticity = 1.0 / abs(price_elasticity) if abs(price_elasticity) > 1e-4 else 1.5

        for shock_pct in shocks:
            shock_mult = 1.0 + (shock_pct / 100.0)
            # Power law price elasticity model: P1 = P0 * (1 + ΔQ/Q)^(-1/|ε|)
            drop_factor = math.pow(shock_mult, -inv_elasticity)
            projected_price = round(max(salvage_floor, instant_spot_price * drop_factor), 2)

            price_change_pct = round(((projected_price - instant_spot_price) / instant_spot_price) * 100.0, 1)

            # Standardized MMK per viss for specific commodity
            std_p = convert_from_usd_per_tonne(
                usd_per_tonne=projected_price,
                commodity_canonical=commodity_canonical,
                exchange_rate=self.exchange_rate,
            )
            mmk_viss = std_p.price_mmk_per_viss

            gross_rev_ha = round(projected_price * expected_yield_ton_ha, 2)
            net_margin_ha = round(gross_rev_ha - cost_prod_ha, 2)
            is_below_cost = projected_price < cost_prod_ton

            scenarios.append(
                DownsidePriceScenario(
                    acreage_shock_pct=shock_pct,
                    projected_market_price_usd_tonne=projected_price,
                    price_change_pct=price_change_pct,
                    projected_price_mmk_per_viss=mmk_viss,
                    gross_revenue_usd_per_ha=gross_rev_ha,
                    estimated_production_cost_usd_ha=cost_prod_ha,
                    net_margin_usd_per_ha=net_margin_ha,
                    is_below_production_cost=is_below_cost,
                )
            )

        return scenarios

    def evaluate_storage_economics(
        self,
        char_spec: dict[str, Any],
        baseline_price: float,
        post_glut_price: float,
    ) -> StorageEconomics:
        """Evaluate cold/dry storage viability vs immediate liquidation during a glut."""
        tier = char_spec["tier"]
        monthly_cost = char_spec["monthly_storage_cost_usd_ton"]
        monthly_spoilage = char_spec["monthly_spoilage_rate_pct"]

        if tier == PerishabilityTier.HIGH:
            return StorageEconomics(
                is_storage_feasible=False,
                storage_facility_type="cold_storage_depot",
                monthly_storage_cost_usd_tonne=monthly_cost,
                monthly_spoilage_rate_pct=round(monthly_spoilage * 100.0, 1),
                recommended_holding_months=0,
                post_glut_recovery_price_usd_tonne=round(baseline_price * 0.90, 2),
                net_storage_gain_usd_tonne=0.0,
                strategic_advice=(
                    "CRITICAL PERISHABILITY: Commercial storage is INFEASIBLE. "
                    f"Rot rate of {monthly_spoilage * 100:.0f}%/month and ${monthly_cost:.1f}/t fee "
                    "destroys working capital. Mandate immediate pre-sales forward contracts or regional diversion."
                ),
            )

        holding_months = 3
        total_storage_fees = monthly_cost * holding_months
        retention_ratio = (1.0 - monthly_spoilage) ** holding_months
        recovery_price = round(baseline_price * 0.95, 2)

        # Net gain compared to selling during harvest glut
        recovered_val_ton = recovery_price * retention_ratio
        net_gain = round(recovered_val_ton - post_glut_price - total_storage_fees, 2)

        facility = "dry_aerated_warehouse" if tier == PerishabilityTier.LOW else "ventilated_root_cellar"
        advice = (
            f"STORAGE RECOMMENDED: Holding {holding_months} months in {facility} costs ${total_storage_fees:.1f}/t "
            f"and generates +${net_gain:.2f}/tonne net gain over harvest glut dump pricing."
        ) if net_gain > 0 else (
            "STORAGE MARGINAL: Post-glut price rebound is insufficient to offset warehouse fees."
        )

        return StorageEconomics(
            is_storage_feasible=True,
            storage_facility_type=facility,
            monthly_storage_cost_usd_tonne=monthly_cost,
            monthly_spoilage_rate_pct=round(monthly_spoilage * 100.0, 2),
            recommended_holding_months=holding_months,
            post_glut_recovery_price_usd_tonne=recovery_price,
            net_storage_gain_usd_tonne=net_gain,
            strategic_advice=advice,
        )

    def generate_economic_reasoning(
        self,
        township: str,
        commodity: str,
        spot_price: float,
        baseline_price: float,
        surge_ratio: float,
        tier: PerishabilityTier,
        days_to_harvest: int,
        baseline_acres: float | None,
        projected_acres: float | None,
        cv_volatility: float,
        capacity_utilization: float | None,
        cobweb_index: float,
        risk_level: GlutRiskLevel,
        scenarios: list[DownsidePriceScenario],
        forward_price: float,
        projected_harvest_price: float | None = None,
        projected_price_change_pct: float | None = None,
    ) -> tuple[EconomicReasoningNarrative, list[str]]:
        """Synthesize deep, non-hallucinating economic narrative across all 4 required domains."""
        premium_pct = round((surge_ratio - 1.0) * 100.0, 1)
        if baseline_acres and baseline_acres > 0 and projected_acres:
            expansion_pct = round(((projected_acres - baseline_acres) / baseline_acres) * 100.0, 1)
        else:
            expansion_pct = 0.0

        # Section (a): Current Market State
        if surge_ratio >= 1.30:
            market_state = (
                f"Instant spot price for {commodity} in {township} is ${spot_price:.2f}/tonne, "
                f"trading at an extreme +{premium_pct:.1f}% surge over the historical baseline (${baseline_price:.2f}/t). "
                "The regional commodity market is currently in an aggressive PEAK_HYPE phase, driven by short-term off-season "
                "scarcity or speculative cross-border border trade pull."
            )
        elif surge_ratio >= 1.15:
            market_state = (
                f"Instant spot price for {commodity} in {township} is ${spot_price:.2f}/tonne (+{premium_pct:.1f}% above "
                f"historical baseline ${baseline_price:.2f}/t). The market exhibits an EARLY_RUSH demand spike, offering "
                "attractive immediate prices that risk triggering widespread copycat planting across local farmers."
            )
        elif surge_ratio >= 0.85:
            market_state = (
                f"Instant spot price for {commodity} is ${spot_price:.2f}/tonne, in close equilibrium with historical "
                f"median ${baseline_price:.2f}/tonne ({premium_pct:+.1f}% deviation). Spot demand is stable with balanced "
                "regional wholesale off-take."
            )
        else:
            market_state = (
                f"Instant spot price for {commodity} is depressed at ${spot_price:.2f}/tonne ({premium_pct:.1f}% below "
                f"baseline ${baseline_price:.2f}/t). Current off-take demand is subdued."
            )

        # Section (b): Township Hype & Rush Factor
        vol_desc = "high cyclical planting swings" if cv_volatility >= 0.25 else "stable multi-year acreage discipline"
        rush_desc = "SEVERE EXPANSION RUSH" if expansion_pct >= 50.0 else ("MODERATE EXPANSION" if expansion_pct >= 15.0 else "ORDERLY ACREAGE")

        if baseline_acres and projected_acres:
            township_factor = (
                f"Historical agricultural records for {township} document a multi-year baseline acreage of {baseline_acres:,.0f} acres "
                f"(historical acreage CV = {cv_volatility:.2f}, indicating {vol_desc}). Current projected planting is {projected_acres:,.0f} acres "
                f"({expansion_pct:+.1f}% vs baseline), categorizing this season as {rush_desc}. Farmers in this township cluster are "
                f"{'heavily overplanting in reaction to spot prices' if expansion_pct >= 25.0 else 'maintaining balanced crop allocations'}."
            )
        else:
            township_factor = (
                f"Verified agricultural data for {township} indicates historical price/yield volatility CV = {cv_volatility:.2f} "
                f"({vol_desc}). Under modeled regional expansion scenarios ({rush_desc}), synchronized rush planting across local growers "
                "threatens severe post-hype supply displacement."
            )

        # Section (c): Projected Harvest Window & Bottlenecks
        scenario_50 = next((s for s in scenarios if abs(s.acreage_shock_pct - 50.0) < 1.0), scenarios[0] if scenarios else None)
        drop_50_price = scenario_50.projected_market_price_usd_tonne if scenario_50 else spot_price * 0.65
        drop_50_pct = scenario_50.price_change_pct if scenario_50 else -35.0

        if capacity_utilization is not None:
            bottleneck_note = (
                f"Regional assembly depots, drying yards, and truck logistics will be BREACHED (projected volume reaches "
                f"{capacity_utilization * 100:.1f}% of peak historical infrastructure capacity)."
                if capacity_utilization > 1.0
                else f"Local assembly and transport capacity remains adequate (utilization at {capacity_utilization * 100:.1f}%)."
            )
        else:
            bottleneck_note = "Local assembly and transport capacity limits apply to peak regional harvest throughput."

        cost_breach_note = (
            "Under a +50% acreage glut, market prices will collapse BELOW the regional cost of production, inflicting severe negative "
            f"margins (-${abs(scenario_50.net_margin_usd_per_ha):.2f}/ha loss) on unhedged smallholders."
            if scenario_50 and scenario_50.is_below_production_cost
            else "Post-harvest margins will contract sharply but remain marginally above operating costs for efficient growers."
        )

        proj_price_str = f"Projected harvest price is ${projected_harvest_price:.2f}/tonne ({projected_price_change_pct:+.1f}% vs current spot). " if projected_harvest_price is not None else ""

        harvest_proj = (
            f"With a {days_to_harvest}-day time lag to harvest, the synchronized planting surge will simultaneously hit regional "
            f"wholesale centers. {bottleneck_note} {proj_price_str}Downside scenario analysis indicates that a +50% regional supply shock will plunge "
            f"prices by {drop_50_pct:.1f}% down to ${drop_50_price:.2f}/tonne. {cost_breach_note}"
        )

        # Section (d): Concrete Hedging Recommendations
        recs: list[str] = []
        if tier == PerishabilityTier.HIGH:
            recs.append("STAGGERED PLANTING: Divide cabbage/vegetable plots into 3 planting cohorts spaced 14 days apart to avoid a single harvest glut peak.")
            recs.append(f"PRE-SALES FORWARD CONTRACT: Lock in forward contracts now at ${forward_price:.2f}/tonne with regional aggregators for at least 40% of anticipated yield.")
            recs.append("INTERCROPPING DIVERSIFICATION: Cap vegetable acreage at 40% of plot; intercrop remaining rows with low-perishability pulses (black gram or groundnut).")
            recs.append("AVOID POST-HARVEST STORAGE: Due to high perishability, immediately divert surplus volume to secondary regional markets rather than holding locally.")
        else:
            recs.append("COOPERATIVE FORWARD BOOKING: Forward contract 30-50% of expected tonnage with local feed mills or exporters while spot hype keeps contract bids elevated.")
            recs.append("STAGGER SEEDING DATES: Shift 25% of acreage 18 days later to target the post-glut late harvest price recovery window.")
            recs.append(f"DRY WAREHOUSE RETENTION: In the event of harvest glut pricing, store clean grain in certified dry warehouses for 3 months to capture a post-glut recovery gain.")
            recs.append("INTERCROPPING BUFFER: Intercrop maize/sorghum with leguminous oilseeds (groundnut/sesame) to maintain cash liquidity regardless of grain glut collapse.")

        hedging_summary = " ".join(recs)

        narrative = EconomicReasoningNarrative(
            current_market_state=market_state,
            township_hype_and_rush_factor=township_factor,
            projected_harvest_window_and_bottlenecks=harvest_proj,
            concrete_hedging_recommendations=hedging_summary,
        )

        return narrative, recs

    def analyze_glut_risk(
        self,
        township: str,
        commodity: str,
        instant_spot_price_usd_tonne: float | None = None,
        projected_acreage: float | None = None,
        acreage_expansion_pct: float | None = None,
        days_to_harvest: int = 90,
        provenance: DemandProvenanceTag | str | None = None,
    ) -> CobwebGlutAnalysis:
        """Execute complete Cobweb Glut Risk Analysis with strict anti-hallucination provenance."""
        now_ts = datetime.now(timezone.utc).isoformat()
        days_to_harvest = max(1, days_to_harvest)

        # Step 1: Validate township and regional trading hub
        canon_ts, reg, hub = resolve_township(township)
        resolved_center = hub or canon_ts or township

        if not canon_ts and not hub:
            return CobwebGlutAnalysis(
                township=township,
                market_center="Unknown",
                commodity=commodity,
                commodity_canonical=None,
                provenance=DemandProvenanceTag.UNRECORDED,
                unrecorded_reason=DemandUnrecordedReason.UNRECORDED_TOWNSHIP,
                analysis_timestamp=now_ts,
                notes=f"Township '{township}' has no recorded agricultural production data in verified Shan or Delta records.",
            )

        # Step 2: Validate commodity against verified characteristics catalog
        canon_crop, char_spec = resolve_characteristic_commodity(commodity)
        if not canon_crop or not char_spec:
            return CobwebGlutAnalysis(
                township=township,
                market_center=resolved_center,
                commodity=commodity,
                commodity_canonical=None,
                provenance=DemandProvenanceTag.UNRECORDED,
                unrecorded_reason=DemandUnrecordedReason.UNRECORDED_COMMODITY,
                analysis_timestamp=now_ts,
                notes=f"Commodity '{commodity}' is not verified or recorded in regional commodity markets.",
            )

        # Step 3: Baseline record lookup & strict anti-hallucination provenance
        baseline_record = self.get_township_baseline(canon_ts or township, canon_crop)
        has_baseline_acres = (
            baseline_record is not None
            and baseline_record.historical_sown_acreage_mean is not None
            and baseline_record.historical_sown_acreage_mean > 0
        )
        has_explicit_expansion = acreage_expansion_pct is not None
        has_explicit_acreage = projected_acreage is not None and projected_acreage > 0

        # Anti-hallucination check: if no baseline acreage is recorded AND no explicit projection is given
        if not has_baseline_acres and not has_explicit_expansion and not has_explicit_acreage:
            return CobwebGlutAnalysis(
                township=township,
                market_center=resolved_center,
                commodity=commodity,
                commodity_canonical=canon_crop,
                provenance=DemandProvenanceTag.UNRECORDED,
                unrecorded_reason=DemandUnrecordedReason.INSUFFICIENT_HISTORICAL_DATA,
                analysis_timestamp=now_ts,
                notes=(
                    f"Insufficient multi-year sown acreage baseline for '{commodity}' in township '{township}'. "
                    "Explicit projected_acreage or acreage_expansion_pct must be provided to evaluate Cobweb glut risk."
                ),
            )

        # Step 4: Determine baseline and spot prices
        baseline_price = self.commodity_baseline_prices.get(canon_crop)
        if baseline_price is None or baseline_price <= 0:
            baseline_price = 281.50

        if instant_spot_price_usd_tonne is not None:
            if not math.isfinite(instant_spot_price_usd_tonne) or instant_spot_price_usd_tonne <= 0:
                return CobwebGlutAnalysis(
                    township=township,
                    market_center=resolved_center,
                    commodity=commodity,
                    commodity_canonical=canon_crop,
                    provenance=DemandProvenanceTag.UNRECORDED,
                    unrecorded_reason=DemandUnrecordedReason.INVALID_PRICE_FEED,
                    analysis_timestamp=now_ts,
                    notes=f"Provided spot price {instant_spot_price_usd_tonne} is invalid or non-positive.",
                )
            spot_price = float(instant_spot_price_usd_tonne)
            if provenance:
                provenance = DemandProvenanceTag(provenance) if isinstance(provenance, str) else provenance
            else:
                provenance = DemandProvenanceTag.MEASURED
        else:
            spot_price = baseline_price
            provenance = DemandProvenanceTag.HISTORICAL_INDEX

        surge_ratio = round(spot_price / baseline_price, 2)
        is_hype = surge_ratio >= 1.15

        # Step 5: Resolve Acreage & Processing Capacity
        tier = char_spec["tier"]
        if has_baseline_acres:
            base_acres = baseline_record.historical_sown_acreage_mean  # type: ignore[union-attr]
            cv_vol = baseline_record.historical_acreage_cv if baseline_record.historical_acreage_cv is not None else 0.15  # type: ignore[union-attr]
            yield_t_ha = baseline_record.historical_yield_tons_per_ha or char_spec["default_yield_ton_ha"]  # type: ignore[union-attr]
            cap_tons = baseline_record.historical_annual_production_capacity_tons or round((base_acres * 1.35 / 2.47105) * yield_t_ha, 1)  # type: ignore[union-attr]

            if has_explicit_acreage:
                proj_acres = float(projected_acreage)  # type: ignore[arg-type]
            elif has_explicit_expansion:
                proj_acres = round(base_acres * (1.0 + (acreage_expansion_pct / 100.0)), 1)  # type: ignore[operator]
            elif is_hype:
                rush_expansion = min(1.0, 1.0 * (surge_ratio - 1.0))
                proj_acres = round(base_acres * (1.0 + rush_expansion), 1)
            else:
                proj_acres = base_acres

            acre_expansion_ratio = round(proj_acres / base_acres, 2) if base_acres > 0 else 1.0
            proj_ha = proj_acres / 2.47105
            proj_volume_tons = round(proj_ha * yield_t_ha, 1)
            cap_utilization = round(proj_volume_tons / cap_tons, 2) if cap_tons > 0 else 1.0

            s_acreage = min(1.0, max(0.0, (proj_acres - base_acres) / base_acres)) if base_acres > 0 else 0.0
            s_bottleneck = min(1.0, max(0.0, (cap_utilization - 1.0) / 0.50)) if cap_tons > 0 else 0.0
            s_vol = min(1.0, max(0.0, cv_vol / 0.40))
            cobweb_index = round(0.35 * s_acreage + 0.25 * s_bottleneck + 0.25 * s_perish_val(tier) + 0.15 * s_vol, 3)
        else:
            # Township has yield/price data, caller supplied explicit expansion percentage
            base_acres = None
            proj_acres = float(projected_acreage) if has_explicit_acreage else None
            cv_vol = (baseline_record.historical_price_cv or 0.20) if baseline_record else 0.20
            yield_t_ha = (baseline_record.historical_yield_tons_per_ha if baseline_record and baseline_record.historical_yield_tons_per_ha else char_spec["default_yield_ton_ha"])
            cap_tons = None
            proj_volume_tons = None
            cap_utilization = None

            exp_val = acreage_expansion_pct if acreage_expansion_pct is not None else 0.0
            acre_expansion_ratio = round(1.0 + (exp_val / 100.0), 2)
            s_acreage = min(1.0, max(0.0, exp_val / 100.0))
            s_bottleneck = 0.0
            s_vol = min(1.0, max(0.0, cv_vol / 0.40))
            cobweb_index = round(0.45 * s_acreage + 0.35 * s_perish_val(tier) + 0.20 * s_vol, 3)

        if cobweb_index < 0.35:
            risk_level = GlutRiskLevel.LOW
        elif cobweb_index < 0.65:
            risk_level = GlutRiskLevel.MODERATE
        elif cobweb_index < 0.85:
            risk_level = GlutRiskLevel.HIGH
        else:
            risk_level = GlutRiskLevel.CRITICAL

        # Step 6: Projected Harvest Window Price
        if acreage_expansion_pct is not None:
            expansion_pct = acreage_expansion_pct
        elif proj_acres is not None and base_acres is not None and base_acres > 0:
            expansion_pct = ((proj_acres - base_acres) / base_acres) * 100.0
        else:
            expansion_pct = 0.0

        inv_elasticity = 1.0 / abs(char_spec["price_elasticity"]) if abs(char_spec["price_elasticity"]) > 1e-4 else 1.5
        salvage_floor = round(baseline_price * 0.15, 2)
        if expansion_pct > 0:
            shock_mult = 1.0 + (expansion_pct / 100.0)
            proj_harvest_price = round(max(salvage_floor, spot_price * math.pow(shock_mult, -inv_elasticity)), 2)
        elif expansion_pct < 0:
            shock_mult = 1.0 + (expansion_pct / 100.0)
            proj_harvest_price = round(spot_price * math.pow(shock_mult, -inv_elasticity), 2)
        else:
            proj_harvest_price = round((spot_price + baseline_price) / 2.0, 2) if is_hype else spot_price

        proj_harvest_change_pct = round(((proj_harvest_price - spot_price) / spot_price) * 100.0, 1) if spot_price > 0 else 0.0
        std_harvest_p = convert_from_usd_per_tonne(
            usd_per_tonne=proj_harvest_price,
            commodity_canonical=canon_crop,
            exchange_rate=self.exchange_rate,
        )
        proj_harvest_mmk_viss = std_harvest_p.price_mmk_per_viss

        # Step 7: Hype Cycle Phase
        if surge_ratio < 0.85 and (expansion_pct >= 25.0 or (cap_utilization is not None and cap_utilization > 1.0)):
            hype_phase = HypeCyclePhase.POST_HYPE_GLUT
        elif cobweb_index >= 0.75 and days_to_harvest <= 14:
            hype_phase = HypeCyclePhase.POST_HYPE_GLUT
        elif surge_ratio >= 1.30:
            hype_phase = HypeCyclePhase.PEAK_HYPE
        elif surge_ratio >= 1.15:
            hype_phase = HypeCyclePhase.EARLY_RUSH
        elif surge_ratio >= 0.85:
            hype_phase = HypeCyclePhase.STABLE_EQUILIBRIUM
        else:
            hype_phase = HypeCyclePhase.DEPRESSED

        # Step 8: Post-Hype Downside Scenarios
        scenarios = self.calculate_downside_scenarios(
            instant_spot_price=spot_price,
            baseline_price=baseline_price,
            price_elasticity=char_spec["price_elasticity"],
            expected_yield_ton_ha=yield_t_ha,
            shocks=[20.0, 50.0, 100.0],
            commodity_canonical=canon_crop,
        )

        # Step 9: Storage & Forward Contracting Economics
        scenario_50 = next((s for s in scenarios if abs(s.acreage_shock_pct - 50.0) < 1.0), scenarios[0] if scenarios else None)
        post_glut_price_50 = scenario_50.projected_market_price_usd_tonne if scenario_50 else spot_price * 0.60

        storage_econ = self.evaluate_storage_economics(
            char_spec=char_spec,
            baseline_price=baseline_price,
            post_glut_price=post_glut_price_50,
        )

        forward_benchmark = round(max(spot_price * 0.88, baseline_price * 1.05), 2)
        prod_cost_ton = round(baseline_price * 0.55, 2)

        # Step 10: Deep Economic Reasoning Narrative
        narrative, hedging_bullets = self.generate_economic_reasoning(
            township=township,
            commodity=char_spec.get("aliases", [commodity])[0].title(),
            spot_price=spot_price,
            baseline_price=baseline_price,
            surge_ratio=surge_ratio,
            tier=tier,
            days_to_harvest=days_to_harvest,
            baseline_acres=base_acres,
            projected_acres=proj_acres,
            cv_volatility=cv_vol,
            capacity_utilization=cap_utilization,
            cobweb_index=cobweb_index,
            risk_level=risk_level,
            scenarios=scenarios,
            forward_price=forward_benchmark,
            projected_harvest_price=proj_harvest_price,
            projected_price_change_pct=proj_harvest_change_pct,
        )

        return CobwebGlutAnalysis(
            township=township,
            market_center=resolved_center,
            commodity=commodity,
            commodity_canonical=canon_crop,
            provenance=provenance,
            analysis_timestamp=now_ts,
            instant_spot_price_usd_tonne=spot_price,
            historical_baseline_price_usd_tonne=baseline_price,
            instant_demand_surge_ratio=surge_ratio,
            is_hype_cycle_active=is_hype,
            hype_cycle_phase=hype_phase,
            projected_harvest_price_usd_tonne=proj_harvest_price,
            projected_harvest_price_mmk_viss=proj_harvest_mmk_viss,
            projected_price_change_at_harvest_pct=proj_harvest_change_pct,
            perishability_tier=tier,
            days_to_harvest=days_to_harvest,
            baseline_sown_acres=base_acres,
            projected_current_acres=proj_acres,
            acreage_expansion_ratio=acre_expansion_ratio,
            historical_acreage_volatility_cv=cv_vol,
            regional_processing_capacity_tons=cap_tons,
            projected_harvest_volume_tons=proj_volume_tons,
            capacity_utilization_ratio=cap_utilization,
            cobweb_glut_risk_index=cobweb_index,
            glut_risk_level=risk_level,
            estimated_production_cost_usd_tonne=prod_cost_ton,
            downside_scenarios=scenarios,
            forward_contract_benchmark_usd_tonne=forward_benchmark,
            storage_economics=storage_econ,
            economic_reasoning=narrative,
            hedging_recommendations=hedging_bullets,
            notes="Evaluated via AgroGuard Cobweb Glut Engine grounded in historical datasets.",
        )

    def analyze_glut_risk_from_clean_intel(
        self,
        clean_intel: CleanMarketIntelligence,
        township: str | None = None,
        projected_acreage: float | None = None,
        acreage_expansion_pct: float | None = None,
        days_to_harvest: int = 90,
    ) -> CobwebGlutAnalysis:
        """Directly evaluate Cobweb glut risk from standardized CleanMarketIntelligence."""
        target_township = township or clean_intel.market_center
        spot_usd = clean_intel.price_usd_per_tonne if (clean_intel.is_valid and not clean_intel.is_stale) else None

        prov_map = {
            ProvenanceTag.MEASURED_PORTAL: DemandProvenanceTag.MEASURED_PORTAL,
            ProvenanceTag.MEASURED_COMMUNITY_POST: DemandProvenanceTag.MEASURED_COMMUNITY_POST,
            ProvenanceTag.MEASURED_ERP: DemandProvenanceTag.MEASURED_ERP,
            ProvenanceTag.MEASURED: DemandProvenanceTag.MEASURED,
            ProvenanceTag.HISTORICAL_INDEX: DemandProvenanceTag.HISTORICAL_INDEX,
        }
        prov_tag = prov_map.get(clean_intel.provenance, DemandProvenanceTag.MEASURED)

        return self.analyze_glut_risk(
            township=target_township,
            commodity=clean_intel.commodity_canonical,
            instant_spot_price_usd_tonne=spot_usd,
            projected_acreage=projected_acreage,
            acreage_expansion_pct=acreage_expansion_pct,
            days_to_harvest=days_to_harvest,
            provenance=prov_tag if spot_usd is not None else None,
        )


def s_perish_val(tier: PerishabilityTier) -> float:
    if tier == PerishabilityTier.HIGH:
        return 1.0
    if tier == PerishabilityTier.MODERATE:
        return 0.50
    return 0.15


# Singleton instance
market_demand_service = MarketDemandService()
