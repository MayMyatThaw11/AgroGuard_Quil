"""Regional Market Scraper and Data Ingestion Service for Shan & Ayeyarwady Prices.

Enforces zero-hallucination validation, verified regional centers, deterministic Myanmar
traditional unit conversions (viss, basket, tin, bag, kg), and data autocleaning with
outlier rejection (IQR / Z-score quarantine).

Integration with Agent Qill's economic evaluations and the 3x ROI Solvency Gate.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from datetime import datetime, timezone, timedelta
from enum import Enum
from pathlib import Path
from typing import Any
import pandas as pd
from pydantic import BaseModel, Field


# =========================================================================
# ENUMS & CONSTANTS
# =========================================================================

class ProvenanceTag(str, Enum):
    MEASURED = "MEASURED"
    MEASURED_PORTAL = "MEASURED_PORTAL"
    MEASURED_COMMUNITY_POST = "MEASURED_COMMUNITY_POST"
    MEASURED_ERP = "MEASURED_ERP"
    HISTORICAL_INDEX = "HISTORICAL_INDEX"
    UNQUOTED = "UNQUOTED"


class ValidationStamp(str, Enum):
    VALIDATED_CORRIDOR = "VALIDATED_CORRIDOR"
    QUARANTINED_OUTLIER = "QUARANTINED_OUTLIER"
    HISTORICAL_BASELINE = "HISTORICAL_BASELINE"
    UNVERIFIED_UNQUOTED = "UNVERIFIED_UNQUOTED"


class UnquotedReason(str, Enum):
    STALE_FEED = "stale_feed"
    UNQUOTED_MARKET = "unquoted_market"
    OUTLIER_REJECTED = "outlier_rejected"
    UNSUPPORTED_COMMODITY = "unsupported_commodity"
    UNSUPPORTED_CENTER = "unsupported_center"
    CORRUPTED_ENTRY = "corrupted_entry"
    MISSING_FEED_DATA = "missing_feed_data"


class Region(str, Enum):
    SHAN = "Shan"
    AYEYARWADY = "Ayeyarwady"
    YANGON = "Yangon"


class CommodityCategory(str, Enum):
    HIGHLAND_CROP = "highland_crop"
    LOWLAND_PADDY = "lowland_paddy"
    BRACKISH_AQUACULTURE = "brackish_aquaculture"
    PULSES_BEANS = "pulses_beans"
    OILSEEDS = "oilseeds"
    PERISHABLE_VEGETABLES = "perishable_vegetables"


# Conversion constants
DEFAULT_USD_TO_MMK: float = 4500.0
KG_PER_VISS: float = 1.63293  # 1 viss (peiktha) = 1.63293 kg (~3.6 lb)
KG_PER_TONNE: float = 1000.0
KG_PER_BAG_STANDARD: float = 50.0  # Standard commercial Myanmar bag (50 kg)

# Crop-specific basket (tin) weights in kg:
# Sources: Myanmar Department of Agriculture & Central Statistical Organization
CROP_BASKET_WEIGHT_KG: dict[str, float] = {
    "rice_pawsan": 20.87,  # Standard paddy basket (46 lbs = 20.865 kg)
    "rice_emata": 20.87,   # Standard paddy basket (46 lbs)
    "maize": 24.49,        # Standard maize basket (54 lbs = 24.494 kg)
    "groundnut": 11.34,    # Pod/unshelled groundnut basket (25 lbs = 11.34 kg)
    "sesame": 24.49,       # Standard sesame basket (54 lbs = 15 viss = 24.49 kg)
    "mustard": 32.66,      # Standard mustard basket (72 lbs = 32.658 kg)
    "wheat": 32.66,        # Standard wheat basket (72 lbs = 32.658 kg)
    "black_gram": 32.66,   # Standard pulse basket (72 lbs = 32.658 kg = 20 viss)
    "green_gram": 32.66,   # Standard pulse basket (72 lbs = 32.658 kg = 20 viss)
    "pigeon_pea": 32.66,   # Standard pulse basket (72 lbs = 32.658 kg = 20 viss)
    "chickpea": 31.30,     # Chickpea basket (69 lbs = 31.3 kg)
    "onion": 24.49,
    "potato": 24.49,
    "garlic": 24.49,
    "chili": 24.49,
    "cabbage": 20.87,
    "tomato": 20.87,
}
DEFAULT_BASKET_WEIGHT_KG: float = 20.87

# Verified Regional Centers
VERIFIED_REGIONAL_CENTERS: dict[Region, dict[str, dict[str, Any]]] = {
    Region.SHAN: {
        "Taunggyi": {
            "name": "Taunggyi",
            "lat": 20.784,
            "lon": 97.034,
            "description": "State Capital & Central Highland Commodity Exchange",
            "supported_categories": [
                CommodityCategory.HIGHLAND_CROP,
                CommodityCategory.PERISHABLE_VEGETABLES,
                CommodityCategory.PULSES_BEANS,
            ],
            "aliases": ["taunggyi", "တောင်ကြီး"],
        },
        "Muse": {
            "name": "Muse",
            "lat": 23.996,
            "lon": 97.904,
            "description": "Northern Cross-Border Trade Gate (Myanmar-China trade artery)",
            "supported_categories": [
                CommodityCategory.HIGHLAND_CROP,
                CommodityCategory.PERISHABLE_VEGETABLES,
                CommodityCategory.PULSES_BEANS,
            ],
            "aliases": ["muse", "မူဆယ်"],
        },
        "Aungban": {
            "name": "Aungban",
            "lat": 20.662,
            "lon": 96.634,
            "description": "Southern Shan Agricultural Wholesale Hub & Railhead assembly point",
            "supported_categories": [
                CommodityCategory.HIGHLAND_CROP,
                CommodityCategory.PERISHABLE_VEGETABLES,
                CommodityCategory.PULSES_BEANS,
            ],
            "aliases": ["aungban", "aung ban", "အောင်ပန်း"],
        },
        "Lashio": {
            "name": "Lashio",
            "lat": 22.934,
            "lon": 97.751,
            "description": "Northern Shan Trade & Logistics Assembly Center",
            "supported_categories": [
                CommodityCategory.HIGHLAND_CROP,
                CommodityCategory.PERISHABLE_VEGETABLES,
                CommodityCategory.PULSES_BEANS,
            ],
            "aliases": ["lashio", "လားရှိုး"],
        },
    },
    Region.AYEYARWADY: {
        "Maubin": {
            "name": "Maubin",
            "lat": 16.732,
            "lon": 95.654,
            "description": "Delta Cooperative Milling & Lower Ayeyarwady Rice Hub",
            "supported_categories": [
                CommodityCategory.LOWLAND_PADDY,
                CommodityCategory.BRACKISH_AQUACULTURE,
                CommodityCategory.PULSES_BEANS,
            ],
            "aliases": ["maubin", "ma ubin", "မအူပင်"],
        },
        "Hinthada": {
            "name": "Hinthada",
            "lat": 17.651,
            "lon": 95.462,
            "description": "Upper Delta Riverine Grain Depot & Pulse Hub",
            "supported_categories": [
                CommodityCategory.LOWLAND_PADDY,
                CommodityCategory.BRACKISH_AQUACULTURE,
                CommodityCategory.PULSES_BEANS,
            ],
            "aliases": ["hinthada", "henzada", "ဟင်္သာတ"],
        },
        "Pathein": {
            "name": "Pathein",
            "lat": 16.783,
            "lon": 94.733,
            "description": "Ayeyarwady Capital, Deepwater Port & Milling Hub",
            "supported_categories": [
                CommodityCategory.LOWLAND_PADDY,
                CommodityCategory.BRACKISH_AQUACULTURE,
                CommodityCategory.PULSES_BEANS,
            ],
            "aliases": ["pathein", "bassein", "ပုသိမ်"],
        },
        "Mawlamyine/Delta co-op": {
            "name": "Mawlamyine/Delta co-op",
            "lat": 16.491,
            "lon": 97.628,
            "description": "Coastal Delta Marine Products & Brackish Aquaculture Exchange",
            "supported_categories": [
                CommodityCategory.LOWLAND_PADDY,
                CommodityCategory.BRACKISH_AQUACULTURE,
                CommodityCategory.PULSES_BEANS,
            ],
            "aliases": [
                "mawlamyine/delta co-op",
                "mawlamyine",
                "delta coop",
                "delta co op",
                "delta cooperative",
                "mawlamyine coop",
                "မော်လမြိုင်",
                "ဒယ်တာ",
                "ဒယ်တာသမဝါယမ",
            ],
        },
    },
    Region.YANGON: {
        "Bayintnaung": {
            "name": "Bayintnaung",
            "lat": 16.850,
            "lon": 96.115,
            "description": "Bayintnaung Wholesale Commodity Exchange Center (National Primary Commodity Hub)",
            "supported_categories": [
                CommodityCategory.HIGHLAND_CROP,
                CommodityCategory.LOWLAND_PADDY,
                CommodityCategory.PULSES_BEANS,
                CommodityCategory.OILSEEDS,
                CommodityCategory.PERISHABLE_VEGETABLES,
                CommodityCategory.BRACKISH_AQUACULTURE,
            ],
            "aliases": [
                "bayintnaung",
                "bayint naung",
                "ဘုရင့်နောင်",
                "ဘုရင့်နောင်ကုန်စည်ဒိုင်",
                "bayintnaung wholesale",
                "bayintnaung exchange",
                "bayint naung commodity exchange",
                "bayint naung wholesale center",
            ],
        },
        "Yangon": {
            "name": "Yangon",
            "lat": 16.840,
            "lon": 96.173,
            "description": "Yangon Regional Wholesale Market Center & Export Port",
            "supported_categories": [
                CommodityCategory.HIGHLAND_CROP,
                CommodityCategory.LOWLAND_PADDY,
                CommodityCategory.PULSES_BEANS,
                CommodityCategory.OILSEEDS,
                CommodityCategory.PERISHABLE_VEGETABLES,
                CommodityCategory.BRACKISH_AQUACULTURE,
            ],
            "aliases": [
                "yangon",
                "ရန်ကုန်",
                "yangon wholesale",
                "yangon exchange",
                "yangon market",
                "yangon trading hub",
                "yangon port",
            ],
        },
    },
}

# Verified Commodities Specification
VERIFIED_COMMODITIES: dict[str, dict[str, Any]] = {
    # Shan Highland Crops
    "maize": {
        "canonical": "maize",
        "display_name": "Maize (Corn)",
        "scientific_name": "Zea mays",
        "category": CommodityCategory.HIGHLAND_CROP,
        "region": Region.SHAN,
        "default_usd_tonne": 281.5,
        "price_corridor_usd_tonne": (150.0, 500.0),
        "aliases": ["corn", "zea mays", "zea maize", "maize", "maize grain", "corn grain", "ပြောင်း", "ပြောင်းဖူး"],
    },
    "groundnut": {
        "canonical": "groundnut",
        "display_name": "Groundnut (Peanut)",
        "scientific_name": "Arachis hypogaea",
        "category": CommodityCategory.HIGHLAND_CROP,
        "region": Region.SHAN,
        "default_usd_tonne": 1164.92,
        "price_corridor_usd_tonne": (600.0, 1800.0),
        "aliases": ["groundnut", "peanut", "arachis hypogaea", "မြေပဲ", "မြေပဲဆန်"],
    },
    "sesame": {
        "canonical": "sesame",
        "display_name": "Sesame Seed",
        "scientific_name": "Sesamum indicum",
        "category": CommodityCategory.HIGHLAND_CROP,
        "region": Region.SHAN,
        "default_usd_tonne": 2088.8,
        "price_corridor_usd_tonne": (1200.0, 3200.0),
        "aliases": ["sesame", "sesame seed", "sesamum indicum", "နှမ်း", "flower sesame"],
    },
    "mustard": {
        "canonical": "mustard",
        "display_name": "Mustard Seed",
        "scientific_name": "Brassica juncea",
        "category": CommodityCategory.HIGHLAND_CROP,
        "region": Region.SHAN,
        "default_usd_tonne": 790.0,
        "price_corridor_usd_tonne": (450.0, 1200.0),
        "aliases": ["mustard", "mustard seed", "brassica juncea", "မုန်ညင်း", "မုန်ညင်းစေ့"],
    },
    "wheat": {
        "canonical": "wheat",
        "display_name": "Wheat Grain",
        "scientific_name": "Triticum aestivum",
        "category": CommodityCategory.HIGHLAND_CROP,
        "region": Region.SHAN,
        "default_usd_tonne": 360.0,
        "price_corridor_usd_tonne": (200.0, 600.0),
        "aliases": ["wheat", "wheat durum", "triticum", "ဂျုံ"],
    },
    # Ayeyarwady Lowland Paddy Rice
    "rice_pawsan": {
        "canonical": "rice_pawsan",
        "display_name": "Paw San Rice (Paddy / Export)",
        "scientific_name": "Oryza sativa (Pawsan)",
        "category": CommodityCategory.LOWLAND_PADDY,
        "region": Region.AYEYARWADY,
        "default_usd_tonne": 480.0,
        "price_corridor_usd_tonne": (300.0, 850.0),
        "aliases": ["paw san", "pawsan", "paw san rice", "pawsan rice", "paw san baygyar", "ပေါ်ဆန်း", "ပေါ်ဆန်းမွှေး", "pawsan bay gyar"],
    },
    "rice_emata": {
        "canonical": "rice_emata",
        "display_name": "Emata Rice (Commercial Paddy)",
        "scientific_name": "Oryza sativa (Emata)",
        "category": CommodityCategory.LOWLAND_PADDY,
        "region": Region.AYEYARWADY,
        "default_usd_tonne": 340.0,
        "price_corridor_usd_tonne": (200.0, 550.0),
        "aliases": ["emata", "emata rice", "ဧည့်မထ", "rice", "paddy", "rice (paddy)", "summer paddy", "rain paddy"],
    },
    # Ayeyarwady Brackish Aquaculture
    "black_tiger_shrimp": {
        "canonical": "black_tiger_shrimp",
        "display_name": "Black Tiger Shrimp (Penaeus monodon)",
        "scientific_name": "Penaeus monodon",
        "category": CommodityCategory.BRACKISH_AQUACULTURE,
        "region": Region.AYEYARWADY,
        "default_usd_tonne": 9500.0,
        "price_corridor_usd_tonne": (5000.0, 16000.0),
        "aliases": ["black tiger shrimp", "tiger shrimp", "black tiger", "penaeus monodon", "ပုစွန်ကျား"],
    },
    "giant_freshwater_prawn": {
        "canonical": "giant_freshwater_prawn",
        "display_name": "Giant Freshwater Prawn (Macrobrachium rosenbergii)",
        "scientific_name": "Macrobrachium rosenbergii",
        "category": CommodityCategory.BRACKISH_AQUACULTURE,
        "region": Region.AYEYARWADY,
        "default_usd_tonne": 7200.0,
        "price_corridor_usd_tonne": (4000.0, 12000.0),
        "aliases": ["giant freshwater prawn", "freshwater prawn", "prawn", "prawns", "macrobrachium rosenbergii", "ပုစွန်ထုပ်", "ပုစွန်ဘော့ချိတ်"],
    },
    # Pulses & Beans (Yangon / Bayintnaung Primary Exchange)
    "black_gram": {
        "canonical": "black_gram",
        "display_name": "Black Gram / Matpe (Vigna mungo)",
        "scientific_name": "Vigna mungo",
        "category": CommodityCategory.PULSES_BEANS,
        "region": Region.YANGON,
        "default_usd_tonne": 880.0,
        "price_corridor_usd_tonne": (450.0, 1800.0),
        "aliases": ["black gram", "matpe", "mat pe", "မတ်ပဲ", "မတ်ပဲ (faq)", "မတ်ပဲ (rc)", "blackgram", "vigna mungo"],
    },
    "green_gram": {
        "canonical": "green_gram",
        "display_name": "Green Gram / Mung Bean (Vigna radiata)",
        "scientific_name": "Vigna radiata",
        "category": CommodityCategory.PULSES_BEANS,
        "region": Region.YANGON,
        "default_usd_tonne": 820.0,
        "price_corridor_usd_tonne": (400.0, 1600.0),
        "aliases": ["green gram", "mung bean", "moong", "ပဲတီစိမ်း", "ပဲတီစိမ်း (ရွှေဝါ)", "ပဲတီစိမ်း (ခရမ်းရွှေဝါ)", "greengram", "vigna radiata"],
    },
    "pigeon_pea": {
        "canonical": "pigeon_pea",
        "display_name": "Pigeon Pea / Toor Whole (Cajanus cajan)",
        "scientific_name": "Cajanus cajan",
        "category": CommodityCategory.PULSES_BEANS,
        "region": Region.YANGON,
        "default_usd_tonne": 1050.0,
        "price_corridor_usd_tonne": (500.0, 2200.0),
        "aliases": ["pigeon pea", "toor", "red gram", "ပဲစင်းငုံ", "ပဲစင်းငုံနီ", "pigeonpea", "cajanus cajan"],
    },
    "chickpea": {
        "canonical": "chickpea",
        "display_name": "Chickpea / Bengal Gram (Cicer arietinum)",
        "scientific_name": "Cicer arietinum",
        "category": CommodityCategory.PULSES_BEANS,
        "region": Region.YANGON,
        "default_usd_tonne": 850.0,
        "price_corridor_usd_tonne": (400.0, 1800.0),
        "aliases": ["chickpea", "gram", "bengal gram", "ကုလားပဲ", "ကုလားပဲဖြူ", "cicer arietinum"],
    },
    # Vegetables & Tubers
    "onion": {
        "canonical": "onion",
        "display_name": "Onion (Allium cepa)",
        "scientific_name": "Allium cepa",
        "category": CommodityCategory.PERISHABLE_VEGETABLES,
        "region": Region.YANGON,
        "default_usd_tonne": 550.0,
        "price_corridor_usd_tonne": (180.0, 1600.0),
        "aliases": ["onion", "onions", "ကြက်သွန်နီ", "ကြက်သွန်", "allium cepa"],
    },
    "potato": {
        "canonical": "potato",
        "display_name": "Potato (Solanum tuberosum)",
        "scientific_name": "Solanum tuberosum",
        "category": CommodityCategory.PERISHABLE_VEGETABLES,
        "region": Region.SHAN,
        "default_usd_tonne": 520.0,
        "price_corridor_usd_tonne": (180.0, 1500.0),
        "aliases": ["potato", "potatoes", "အာလူး", "solanum tuberosum"],
    },
    "garlic": {
        "canonical": "garlic",
        "display_name": "Garlic (Allium sativum)",
        "scientific_name": "Allium sativum",
        "category": CommodityCategory.PERISHABLE_VEGETABLES,
        "region": Region.SHAN,
        "default_usd_tonne": 1450.0,
        "price_corridor_usd_tonne": (500.0, 3500.0),
        "aliases": ["garlic", "ကြက်သွန်ဖြူ", "allium sativum"],
    },
    "chili": {
        "canonical": "chili",
        "display_name": "Chili Pepper (Capsicum spp.)",
        "scientific_name": "Capsicum annuum",
        "category": CommodityCategory.PERISHABLE_VEGETABLES,
        "region": Region.YANGON,
        "default_usd_tonne": 1800.0,
        "price_corridor_usd_tonne": (600.0, 5000.0),
        "aliases": ["chili", "chilli", "dry chili", "ငရုတ်", "ငရုတ်သီး", "capsicum"],
    },
    "cabbage": {
        "canonical": "cabbage",
        "display_name": "Cabbage (Brassica oleracea)",
        "scientific_name": "Brassica oleracea",
        "category": CommodityCategory.PERISHABLE_VEGETABLES,
        "region": Region.SHAN,
        "default_usd_tonne": 350.0,
        "price_corridor_usd_tonne": (100.0, 1200.0),
        "aliases": ["cabbage", "ဂေါ်ဖီ", "ဂေါ်ဖီထုပ်", "brassica oleracea"],
    },
    "tomato": {
        "canonical": "tomato",
        "display_name": "Tomato (Solanum lycopersicum)",
        "scientific_name": "Solanum lycopersicum",
        "category": CommodityCategory.PERISHABLE_VEGETABLES,
        "region": Region.SHAN,
        "default_usd_tonne": 380.0,
        "price_corridor_usd_tonne": (100.0, 1400.0),
        "aliases": ["tomato", "tomatoes", "ခရမ်းချဉ်", "ခရမ်းချဉ်သီး", "solanum lycopersicum"],
    },
}


# =========================================================================
# MODELS & SCHEMAS
# =========================================================================

class StandardizedPrice(BaseModel):
    price_usd_per_tonne: float
    price_usd_per_kg: float
    price_mmk_per_kg: float
    price_mmk_per_viss: float
    price_mmk_per_basket: float
    price_mmk_per_bag: float
    basket_weight_kg: float
    bag_weight_kg: float = KG_PER_BAG_STANDARD
    exchange_rate_mmk_usd: float = DEFAULT_USD_TO_MMK


class CleanMarketIntelligence(BaseModel):
    """Standardized clean market intelligence artifact ready for direct Claude / Agent Qill consumption."""
    commodity_canonical: str = Field(..., description="Canonical commodity ID (e.g. 'rice_pawsan', 'maize', 'black_gram')")
    commodity_name: str = Field(..., description="Display commodity name (e.g. 'Paw San Rice (Paddy / Export)')")
    category: str = Field(..., description="Commodity category")
    market_center: str = Field(..., description="Verified regional center (e.g. 'Bayintnaung', 'Taunggyi', 'Pathein')")
    region: str = Field(..., description="Verified state or division (e.g. 'Yangon', 'Shan', 'Ayeyarwady')")
    price_mmk_per_kg: float | None = Field(None, description="Standardized price in MMK/kg")
    price_mmk_per_viss: float | None = Field(None, description="Standardized price in MMK/viss (1.63293 kg)")
    price_usd_per_tonne: float | None = Field(None, description="Standardized price in USD/metric tonne")
    price_mmk_per_basket: float | None = Field(None, description="Standardized price in MMK per crop-specific basket")
    price_mmk_per_bag: float | None = Field(None, description="Standardized price in MMK per standard 50kg bag")
    quote_date: str = Field(..., description="ISO 8601 quote date/time")
    freshness_duration_hours: float = Field(..., description="Elapsed hours since quote publication")
    stale_threshold_days: int = Field(7, description="Threshold in days after which feed quote is considered stale")
    is_stale: bool = Field(False, description="True if age exceeds stale_threshold_days")
    provenance: ProvenanceTag = Field(..., description="Data provenance classification")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Confidence score from 0.0 to 1.0")
    validation_stamp: ValidationStamp = Field(..., description="Statistical validation stamp")
    is_valid: bool = Field(True, description="True if quote passed validation")
    rejection_reason: str | None = Field(None, description="Reason if quarantined or rejected")
    economic_summary: str = Field(
        ...,
        description="Zero-markup structured economic summary text directly consumable by Claude or Agent Qill",
    )
    raw_source: str = Field("", description="Source name or connector")

    def to_llm_fact(self) -> str:
        return self.economic_summary


class MarketQuote(BaseModel):
    quote_id: str
    region: Region | None = None
    market_center: str
    commodity_raw: str
    commodity_canonical: str | None = None
    category: CommodityCategory | None = None
    provenance: ProvenanceTag
    quote_timestamp: str | None = None
    raw_price: float | None = None
    raw_unit: str | None = None
    raw_currency: str | None = None
    standardized: StandardizedPrice | None = None
    is_valid: bool = True
    unquoted_reason: UnquotedReason | None = None
    source: str = "regional_exchange"
    notes: str = ""
    validation_stamp: ValidationStamp = ValidationStamp.VALIDATED_CORRIDOR
    confidence_score: float = 1.0

    @property
    def price_usd_per_tonne(self) -> float | None:
        return self.standardized.price_usd_per_tonne if self.standardized else None

    @property
    def price_mmk_per_kg(self) -> float | None:
        return self.standardized.price_mmk_per_kg if self.standardized else None

    @property
    def price_mmk_per_viss(self) -> float | None:
        return self.standardized.price_mmk_per_viss if self.standardized else None

    @property
    def price_mmk_per_basket(self) -> float | None:
        return self.standardized.price_mmk_per_basket if self.standardized else None

    @property
    def price_mmk_per_bag(self) -> float | None:
        return self.standardized.price_mmk_per_bag if self.standardized else None

    def to_api_dict(self) -> dict[str, Any]:
        """Serialize quote to dictionary with explicit null fields when UNQUOTED."""
        d = self.model_dump()
        d["price_usd_per_tonne"] = self.price_usd_per_tonne
        d["price_mmk_per_kg"] = self.price_mmk_per_kg
        d["price_mmk_per_viss"] = self.price_mmk_per_viss
        d["price_mmk_per_basket"] = self.price_mmk_per_basket
        d["price_mmk_per_bag"] = self.price_mmk_per_bag
        d["validation_stamp"] = self.validation_stamp.value
        d["confidence_score"] = self.confidence_score
        return d

    def to_clean_intelligence(self, stale_threshold_days: int = 7) -> CleanMarketIntelligence:
        """Transform raw quote into clean, zero-hallucination artifact for Claude / Agent Qill."""
        now = datetime.now(timezone.utc)
        freshness_hours = 0.0
        is_stale = False
        if self.quote_timestamp:
            try:
                q_dt = datetime.fromisoformat(self.quote_timestamp.replace("Z", "+00:00"))
                delta = (now - q_dt).total_seconds()
                freshness_hours = max(0.0, round(delta / 3600.0, 1))
                is_stale = freshness_hours > (stale_threshold_days * 24.0)
            except Exception:
                freshness_hours = 0.0

        canon = self.commodity_canonical or self.commodity_raw
        spec = VERIFIED_COMMODITIES.get(canon, {})
        display_name = spec.get("display_name", self.commodity_raw.title())
        cat_val = self.category.value if self.category else (spec.get("category").value if spec.get("category") else "general")
        reg_val = self.region.value if self.region else "Unspecified"

        if self.is_valid and self.standardized:
            p_usd = self.standardized.price_usd_per_tonne
            p_viss = self.standardized.price_mmk_per_viss
            p_kg = self.standardized.price_mmk_per_kg
            fresh_label = "FRESH" if not is_stale else "STALE"
            economic_summary = (
                f"VERIFIED SPOT INTEL: {display_name} at {self.market_center} ({reg_val}) is trading at "
                f"{p_viss:,.0f} MMK/viss ({p_kg:,.0f} MMK/kg | ${p_usd:,.2f}/MT). "
                f"Source: {self.source} [{self.provenance.value}] with confidence {self.confidence_score:.2f}. "
                f"Status: {self.validation_stamp.value} (statistically verified within regional price corridor). "
                f"Quote age: {freshness_hours:.1f} hours ({fresh_label}). "
                f"Validated fact for 3x ROI solvency and glut risk evaluation."
            )
        elif self.unquoted_reason == UnquotedReason.OUTLIER_REJECTED:
            economic_summary = (
                f"QUARANTINED OUTLIER INTEL: {display_name} at {self.market_center} ({reg_val}) price quote rejected. "
                f"Status: {self.validation_stamp.value}. Reason: {self.notes or 'Outlier corridor breach'}. "
                f"Untrusted price cannot be used for economic solvency or glut modeling."
            )
        else:
            reason_str = self.unquoted_reason.value if self.unquoted_reason else "unquoted"
            economic_summary = (
                f"UNQUOTED INTEL: Market center '{self.market_center}' cannot quote '{self.commodity_raw}'. "
                f"Reason: {reason_str}. External input purchases must be frozen under 3x ROI gate."
            )

        return CleanMarketIntelligence(
            commodity_canonical=canon,
            commodity_name=display_name,
            category=cat_val,
            market_center=self.market_center,
            region=reg_val,
            price_mmk_per_kg=self.standardized.price_mmk_per_kg if self.standardized else None,
            price_mmk_per_viss=self.standardized.price_mmk_per_viss if self.standardized else None,
            price_usd_per_tonne=self.standardized.price_usd_per_tonne if self.standardized else None,
            price_mmk_per_basket=self.standardized.price_mmk_per_basket if self.standardized else None,
            price_mmk_per_bag=self.standardized.price_mmk_per_bag if self.standardized else None,
            quote_date=self.quote_timestamp or now.isoformat(),
            freshness_duration_hours=freshness_hours,
            stale_threshold_days=stale_threshold_days,
            is_stale=is_stale,
            provenance=self.provenance,
            confidence_score=self.confidence_score,
            validation_stamp=self.validation_stamp,
            is_valid=self.is_valid,
            rejection_reason=self.unquoted_reason.value if self.unquoted_reason else (self.notes if not self.is_valid else None),
            economic_summary=economic_summary,
            raw_source=self.source,
        )


class OutlierQuarantineRecord(BaseModel):
    quarantine_id: str
    raw_entry: dict[str, Any]
    reason: str
    tested_usd_per_tonne: float | None = None
    baseline_median_usd: float | None = None
    lower_bound_usd: float | None = None
    upper_bound_usd: float | None = None
    z_score: float | None = None
    quarantine_timestamp: str


class QillSolvencyAssessment(BaseModel):
    market_center: str
    commodity: str
    provenance: ProvenanceTag
    spot_price_usd_ton: float | None
    expected_yield_ton_ha: float
    crop_economic_value_usd_ha: float
    at_risk_revenue_usd_ha: float
    remaining_budget_usd_ha: float
    proposed_spend_usd_ha: float
    max_viable_spend_usd_ha: float
    bcr_ratio: float | None = None
    is_solvency_approved: bool
    veto_triggered: bool
    veto_reason: str | None = None
    qill_recommendation: str


# =========================================================================
# HELPER FUNCTIONS: NORMALIZATION & CANONICAL MATCHING
# =========================================================================

BURMESE_DIGITS = str.maketrans("၀၁၂၃၄၅၆၇၈၉", "0123456789")


def clean_numeric_price(val: Any) -> float | None:
    """Robustly sanitize string or numeric prices, translating Burmese digits and stripping formatting."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val) if math.isfinite(val) else None
    if isinstance(val, str):
        cleaned = (
            val.strip()
            .translate(BURMESE_DIGITS)
            .replace(",", "")
            .replace("$", "")
            .replace("MMK", "")
            .replace("USD", "")
            .replace("ks", "")
            .replace("ကျပ်", "")
            .strip()
        )
        try:
            parsed = float(cleaned)
            return parsed if math.isfinite(parsed) else None
        except ValueError:
            return None
    return None


def normalize_text(text: str | None) -> str:
    if not text:
        return ""
    return str(text).strip().lower().replace("_", " ").replace("-", " ")


def resolve_market_center(center: str) -> tuple[Region | None, str | None]:
    norm = normalize_text(center)
    if not norm:
        return None, None

    # Step 1: Direct exact match against canonical name or aliases
    for region, centers in VERIFIED_REGIONAL_CENTERS.items():
        for canonical_name, c_spec in centers.items():
            if norm == normalize_text(canonical_name):
                return region, canonical_name
            for alias in c_spec.get("aliases", []):
                if norm == normalize_text(alias):
                    return region, canonical_name

    # Step 2: Substring matching for phrases like "Taunggyi Wholesale Market" or "တောင်ကြီး ကုန်စည်ဒိုင်"
    for region, centers in VERIFIED_REGIONAL_CENTERS.items():
        for canonical_name, c_spec in centers.items():
            if normalize_text(canonical_name) in norm:
                return region, canonical_name
            for alias in c_spec.get("aliases", []):
                a_norm = normalize_text(alias)
                if a_norm and a_norm in norm:
                    return region, canonical_name

    return None, None


def resolve_commodity(commodity: str, region: Region | None = None) -> tuple[str | None, dict[str, Any] | None]:
    norm = normalize_text(commodity)
    if not norm:
        return None, None

    # Step 1: Direct exact match within region
    for canonical, spec in VERIFIED_COMMODITIES.items():
        if region is not None and spec["region"] != region:
            continue
        if norm == canonical or norm == normalize_text(canonical):
            return canonical, spec
        for alias in spec["aliases"]:
            if norm == normalize_text(alias):
                return canonical, spec

    # Step 2: Direct exact match across all regions
    if region is not None:
        for canonical, spec in VERIFIED_COMMODITIES.items():
            if norm == canonical or norm == normalize_text(canonical) or any(norm == normalize_text(alias) for alias in spec["aliases"]):
                return canonical, spec

    # Step 3: Substring / Token matching within region
    for canonical, spec in VERIFIED_COMMODITIES.items():
        if region is not None and spec["region"] != region:
            continue
        c_norm = normalize_text(canonical)
        if c_norm and (c_norm in norm or norm in c_norm):
            return canonical, spec
        for alias in spec["aliases"]:
            a_norm = normalize_text(alias)
            if a_norm and (a_norm in norm or norm in a_norm):
                return canonical, spec

    # Step 4: Substring / Token matching across all regions
    for canonical, spec in VERIFIED_COMMODITIES.items():
        c_norm = normalize_text(canonical)
        if c_norm and (c_norm in norm or norm in c_norm):
            return canonical, spec
        for alias in spec["aliases"]:
            a_norm = normalize_text(alias)
            if a_norm and (a_norm in norm or norm in a_norm):
                return canonical, spec

    return None, None


def find_commodity_in_text(text: str) -> tuple[str | None, dict[str, Any] | None]:
    """Find the best-matching verified commodity within a line or clause of text."""
    norm = normalize_text(text)
    if not norm:
        return None, None
    candidates: list[tuple[int, str, str, dict[str, Any]]] = []
    for canon, spec in VERIFIED_COMMODITIES.items():
        candidates.append((len(canon), canon, canon, spec))
        candidates.append((len(normalize_text(canon)), normalize_text(canon), canon, spec))
        for alias in spec.get("aliases", []):
            candidates.append((len(alias), alias, canon, spec))
            candidates.append((len(normalize_text(alias)), normalize_text(alias), canon, spec))
    candidates.sort(key=lambda x: x[0], reverse=True)
    for _, text_match, canon, spec in candidates:
        if normalize_text(text_match) in norm:
            return canon, spec
    return None, None


# =========================================================================
# DETERMINISTIC CONVERSION ENGINE
# =========================================================================

def standardize_unit_token(unit_raw: str | None) -> str:
    norm = normalize_text(unit_raw)
    if norm in ("kg", "kilo", "kilogram", "kilograms", "ကီလို"):
        return "kg"
    if norm in ("tonne", "ton", "tonnes", "tons", "mt", "t", "တန်"):
        return "tonne"
    if norm in ("viss", "peiktha", "ပိဿာ"):
        return "viss"
    if norm in ("basket", "baskets", "tin", "တင်း"):
        return "basket"
    if norm in ("bag", "bags", "အိတ်"):
        return "bag"
    if norm in ("pyi", "ပြည်"):
        return "pyi"
    return "unknown"


def standardize_currency_token(curr_raw: str | None) -> str:
    norm = normalize_text(curr_raw)
    if norm in ("mmk", "kyat", "kyats", "ks", "k", "ကျပ်"):
        return "MMK"
    if norm in ("usd", "dollar", "dollars", "$", "ဒေါ်လာ"):
        return "USD"
    return "unknown"


def convert_to_usd_per_tonne(
    price: float | int | str,
    unit: str,
    currency: str,
    commodity_canonical: str,
    exchange_rate: float = DEFAULT_USD_TO_MMK,
) -> float:
    """Deterministically convert any unit and currency quote to USD per tonne."""
    num_price = clean_numeric_price(price)
    if num_price is None or num_price <= 0:
        raise ValueError(f"Price must be strictly positive, got {price}")
    if exchange_rate <= 0:
        raise ValueError("Exchange rate must be positive")

    unit_std = standardize_unit_token(unit)
    curr_std = standardize_currency_token(currency)

    if unit_std == "unknown":
        raise ValueError(f"Unsupported unit: {unit}")
    if curr_std == "unknown":
        raise ValueError(f"Unsupported currency: {currency}")

    # Step 1: Normalize to price in specified currency per kilogram
    if unit_std == "kg":
        price_per_kg = num_price
    elif unit_std == "tonne":
        price_per_kg = num_price / KG_PER_TONNE
    elif unit_std == "viss":
        price_per_kg = num_price / KG_PER_VISS
    elif unit_std == "bag":
        price_per_kg = num_price / KG_PER_BAG_STANDARD
    elif unit_std == "basket":
        basket_kg = CROP_BASKET_WEIGHT_KG.get(commodity_canonical, DEFAULT_BASKET_WEIGHT_KG)
        price_per_kg = num_price / basket_kg
    elif unit_std == "pyi":
        basket_kg = CROP_BASKET_WEIGHT_KG.get(commodity_canonical, DEFAULT_BASKET_WEIGHT_KG)
        price_per_kg = num_price / (basket_kg / 16.0)
    else:
        raise ValueError(f"Unrecognized unit {unit}")

    # Step 2: Convert currency to USD
    if curr_std == "USD":
        usd_per_kg = price_per_kg
    elif curr_std == "MMK":
        usd_per_kg = price_per_kg / exchange_rate
    else:
        raise ValueError(f"Unrecognized currency {currency}")

    # Step 3: Scale to USD per metric tonne
    usd_per_tonne = usd_per_kg * KG_PER_TONNE
    return round(usd_per_tonne, 2)


def convert_from_usd_per_tonne(
    usd_per_tonne: float,
    commodity_canonical: str,
    exchange_rate: float = DEFAULT_USD_TO_MMK,
) -> StandardizedPrice:
    """Deterministically expand USD/tonne into all standard Myanmar and international units."""
    if usd_per_tonne <= 0:
        raise ValueError(f"USD per tonne must be positive, got {usd_per_tonne}")

    usd_kg = usd_per_tonne / KG_PER_TONNE
    mmk_kg = usd_kg * exchange_rate
    mmk_viss = mmk_kg * KG_PER_VISS

    basket_kg = CROP_BASKET_WEIGHT_KG.get(commodity_canonical, DEFAULT_BASKET_WEIGHT_KG)
    mmk_basket = mmk_kg * basket_kg
    mmk_bag = mmk_kg * KG_PER_BAG_STANDARD

    return StandardizedPrice(
        price_usd_per_tonne=round(usd_per_tonne, 2),
        price_usd_per_kg=round(usd_kg, 4),
        price_mmk_per_kg=round(mmk_kg, 2),
        price_mmk_per_viss=round(mmk_viss, 2),
        price_mmk_per_basket=round(mmk_basket, 2),
        price_mmk_per_bag=round(mmk_bag, 2),
        basket_weight_kg=round(basket_kg, 2),
        bag_weight_kg=KG_PER_BAG_STANDARD,
        exchange_rate_mmk_usd=exchange_rate,
    )


# =========================================================================
# DATA AUTOCLEANING & OUTLIER DETECTION ENGINE
# =========================================================================

class OutlierDetector:
    """Autocleaning outlier screener using IQR, MAD, corridor multiplier, and Z-score."""

    @staticmethod
    def evaluate_quote(
        usd_per_tonne: float,
        commodity_canonical: str,
        historical_sample: list[float] | None = None,
    ) -> tuple[bool, str, dict[str, Any]]:
        """Returns (is_outlier, reason, metrics)."""
        if not math.isfinite(usd_per_tonne) or usd_per_tonne <= 0:
            return True, "Corrupt or non-positive price value", {
                "tested_usd": usd_per_tonne,
                "rule": "NON_POSITIVE_VALUE",
            }

        spec = VERIFIED_COMMODITIES.get(commodity_canonical)
        if not spec:
            return True, f"Unknown commodity {commodity_canonical}", {"rule": "UNKNOWN_COMMODITY"}

        baseline_median = float(spec["default_usd_tonne"])
        min_corr, max_corr = spec["price_corridor_usd_tonne"]

        # Rule 1: Absolute physical corridor
        if usd_per_tonne < min_corr or usd_per_tonne > max_corr:
            return True, (
                f"Physical Corridor Breach: ${usd_per_tonne:.1f}/t is outside plausible "
                f"bounds (${min_corr:.1f} - ${max_corr:.1f}/t) for {commodity_canonical}"
            ), {
                "tested_usd": usd_per_tonne,
                "baseline_median": baseline_median,
                "corridor": (min_corr, max_corr),
                "rule": "PHYSICAL_CORRIDOR_BREACH",
            }

        # Rule 2: Extreme Shock vs Baseline Median (0.2x to 3.5x as in clean_price_dataset.py)
        low_bound = baseline_median * 0.20
        high_bound = baseline_median * 3.50
        if usd_per_tonne < low_bound or usd_per_tonne > high_bound:
            return True, (
                f"Price Shock Deviation: ${usd_per_tonne:.1f}/t deviates severely from "
                f"median ${baseline_median:.1f}/t (allowed corridor: ${low_bound:.1f} - ${high_bound:.1f}/t)"
            ), {
                "tested_usd": usd_per_tonne,
                "baseline_median": baseline_median,
                "bounds": (low_bound, high_bound),
                "rule": "PRICE_SHOCK_MULTIPLIER",
            }

        # Rule 3: IQR and Z-Score against historical sample if provided (at least 4 points)
        if historical_sample and len(historical_sample) >= 4:
            clean_sample = [float(x) for x in historical_sample if math.isfinite(x) and x > 0]
            if len(clean_sample) >= 4:
                s = pd.Series(clean_sample + [usd_per_tonne]).dropna()
                q1 = float(s.quantile(0.25))
                q3 = float(s.quantile(0.75))
                iqr = q3 - q1
                mean = float(s.mean())
                std = float(s.std(ddof=1)) if s.std(ddof=1) > 0 else 0.0

                # Statistical autocleaning guard: Tukey fences require non-zero dispersion to prevent false
                # outlier rejections on clustered / discrete benchmarks. If IQR is narrow or 0,
                # use effective IQR floor of 5% of median baseline.
                effective_iqr = max(iqr, 0.05 * baseline_median)
                iqr_low = q1 - 1.5 * effective_iqr
                iqr_high = q3 + 1.5 * effective_iqr

                z_score = abs(usd_per_tonne - mean) / std if std > 1e-4 else 0.0

                if usd_per_tonne < iqr_low or usd_per_tonne > iqr_high:
                    return True, (
                        f"IQR Outlier: ${usd_per_tonne:.1f}/t is outside IQR range "
                        f"[{iqr_low:.1f}, {iqr_high:.1f}] (Z-score: {z_score:.2f})"
                    ), {
                        "tested_usd": usd_per_tonne,
                        "iqr_bounds": (iqr_low, iqr_high),
                        "z_score": z_score,
                        "rule": "IQR_OUTLIER",
                    }

                if z_score > 3.0:
                    return True, f"Z-Score Outlier: Z-score {z_score:.2f} > 3.0", {
                        "tested_usd": usd_per_tonne,
                        "z_score": z_score,
                        "rule": "Z_SCORE_OUTLIER",
                    }

        return False, "Valid", {"tested_usd": usd_per_tonne, "baseline_median": baseline_median}


# =========================================================================
# MULTI-SOURCE INGESTION CONNECTORS
# =========================================================================

class WebPortalConnector:
    """Unified ingestion connector for official commodity association and government portals.

    Scrapes / parses official commodity association bulletins:
    - Bayintnaung Wholesale Center (National Primary Commodity Hub)
    - Myanmar Pulses, Beans & Sesame Seeds Merchants Association (MPBMA)
    - Department of Agriculture (DOA) daily agricultural price bulletins
    """

    def __init__(self, service: RegionalMarketService):
        self.service = service

    def parse_portal_bulletin(
        self,
        content: str,
        portal_name: str = "Bayintnaung Wholesale Center",
        default_center: str = "Bayintnaung",
        bulletin_date: str | datetime | None = None,
    ) -> list[MarketQuote]:
        """Parses HTML tables or structured text bulletins from official portals."""
        if not content or not content.strip():
            return []

        # Detect HTML table
        if "<table" in content.lower() or "<tr" in content.lower():
            return self._parse_html_table(content, portal_name, default_center, bulletin_date)
        return self._parse_text_bulletin(content, portal_name, default_center, bulletin_date)

    def _parse_html_table(
        self,
        html_content: str,
        portal_name: str,
        default_center: str,
        bulletin_date: str | datetime | None,
    ) -> list[MarketQuote]:
        extracted_date = self._extract_date(html_content, bulletin_date)
        _, header_center = resolve_market_center(html_content[:500])
        current_center = header_center or default_center

        quotes: list[MarketQuote] = []
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html_content, re.IGNORECASE | re.DOTALL)
        if not rows:
            return []

        col_map: dict[str, int] = {}
        for row in rows:
            th_cells = re.findall(r"<th[^>]*>(.*?)</th>", row, re.IGNORECASE | re.DOTALL)
            if th_cells:
                for idx, th in enumerate(th_cells):
                    th_text = re.sub(r"<[^>]+>", "", th).strip().lower()
                    if any(k in th_text for k in ("commodity", "crop", "item", "သီးနှံ", "အမည်")):
                        col_map["commodity"] = idx
                    elif any(k in th_text for k in ("price", "rate", "ပေါက်ဈေး", "ဈေးနှုန်း")):
                        col_map["price"] = idx
                    elif any(k in th_text for k in ("unit", "uom", "ယူနစ်")):
                        col_map["unit"] = idx
                    elif any(k in th_text for k in ("currency", "ငွေကြေး")):
                        col_map["currency"] = idx
                    elif any(k in th_text for k in ("center", "market", "စခန်း", "ဒိုင်")):
                        col_map["center"] = idx

        for row in rows:
            td_cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.IGNORECASE | re.DOTALL)
            if not td_cells or len(td_cells) < 2:
                continue

            cleaned_cells = [re.sub(r"<[^>]+>", "", cell).replace("&nbsp;", " ").strip() for cell in td_cells]

            row_commodity = None
            row_price = None
            row_unit = "kg"
            row_currency = "MMK"
            row_center = current_center

            if col_map and "commodity" in col_map and "price" in col_map:
                c_idx = col_map["commodity"]
                p_idx = col_map["price"]
                if c_idx < len(cleaned_cells) and p_idx < len(cleaned_cells):
                    row_commodity = cleaned_cells[c_idx]
                    row_price = clean_numeric_price(cleaned_cells[p_idx])
                    if "unit" in col_map and col_map["unit"] < len(cleaned_cells):
                        row_unit = cleaned_cells[col_map["unit"]]
                    if "currency" in col_map and col_map["currency"] < len(cleaned_cells):
                        row_currency = cleaned_cells[col_map["currency"]]
                    if "center" in col_map and col_map["center"] < len(cleaned_cells):
                        _, matched_c = resolve_market_center(cleaned_cells[col_map["center"]])
                        if matched_c:
                            row_center = matched_c
            else:
                for cell in cleaned_cells:
                    canon, _ = find_commodity_in_text(cell)
                    if canon and not row_commodity:
                        row_commodity = cell
                    p_val = clean_numeric_price(cell)
                    if p_val is not None and p_val > 0 and row_price is None:
                        row_price = p_val
                    u_tok = standardize_unit_token(cell)
                    if u_tok != "unknown":
                        row_unit = cell
                    c_tok = standardize_currency_token(cell)
                    if c_tok != "unknown":
                        row_currency = cell
                    _, center_cand = resolve_market_center(cell)
                    if center_cand:
                        row_center = center_cand

            if row_commodity and row_price is not None:
                q = self.service.ingest_raw_quote(
                    market_center=row_center,
                    commodity=row_commodity,
                    price=row_price,
                    unit=row_unit or "kg",
                    currency=row_currency or "MMK",
                    quote_timestamp=extracted_date,
                    source=portal_name,
                    provenance=ProvenanceTag.MEASURED_PORTAL,
                    confidence_score=0.95,
                )
                quotes.append(q)

        return quotes

    def _parse_text_bulletin(
        self,
        text_content: str,
        portal_name: str,
        default_center: str,
        bulletin_date: str | datetime | None,
    ) -> list[MarketQuote]:
        extracted_date = self._extract_date(text_content, bulletin_date)
        _, header_center = resolve_market_center(text_content[:300])
        current_center = header_center or default_center
        quotes: list[MarketQuote] = []

        for line in text_content.strip().splitlines():
            line_s = line.strip()
            if not line_s:
                continue

            reg, c_center = resolve_market_center(line_s)
            canon_in_line, _ = find_commodity_in_text(line_s)
            if c_center and not canon_in_line:
                current_center = c_center
                continue

            clauses = re.split(r"(?<!\d)[,;\|၊။](?!\d)", line_s)
            for clause in clauses:
                cl = clause.strip()
                if not cl:
                    continue

                _, spec_c = resolve_market_center(cl)
                target_center = spec_c or current_center

                canon_crop, _ = find_commodity_in_text(cl)
                if not canon_crop:
                    continue

                cl_trans = cl.translate(BURMESE_DIGITS)
                cl_clean = re.sub(r"(?:09|\+?959)[0-9\-\s]{7,11}", " ", cl_trans)
                m_curr = re.search(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:ကျပ်|ks|mmk|kyat|kyats|usd|\$|/-)", cl_clean, re.IGNORECASE)
                m_curr_pre = re.search(r"(?:\$|usd|mmk|ks)\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", cl_clean, re.IGNORECASE)
                if m_curr:
                    price_val = float(m_curr.group(1).replace(",", ""))
                elif m_curr_pre:
                    price_val = float(m_curr_pre.group(1).replace(",", ""))
                else:
                    cl_no_qty = re.sub(r"(?:^|\s)[0-9]{1,2}\s*(?:viss|peiktha|ပိဿာ|basket|tin|တင်း|bag|အိတ်|pyi|ပြည်|tonne|ton|တန်|kg|ကီလို)(?:\s|$)", " ", cl_clean, flags=re.IGNORECASE)
                    m_num = re.search(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", cl_no_qty)
                    if not m_num:
                        m_num = re.search(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", cl_clean)
                    if not m_num:
                        continue
                    price_val = float(m_num.group(1).replace(",", ""))

                unit_token = "kg"
                for u in ["viss", "peiktha", "ပိဿာ", "basket", "tin", "တင်း", "bag", "အိတ်", "pyi", "ပြည်", "tonne", "ton", "တန်", "kg", "ကီလို"]:
                    if u in cl_clean.lower():
                        unit_token = u
                        break

                curr_token = "MMK"
                for c in ["usd", "$", "dollar", "ဒေါ်လာ", "mmk", "kyat", "kyats", "ks", "ကျပ်"]:
                    if c in cl_clean.lower():
                        curr_token = "USD" if c in ("usd", "$", "dollar", "ဒေါ်လာ") else "MMK"
                        break

                q = self.service.ingest_raw_quote(
                    market_center=target_center,
                    commodity=canon_crop,
                    price=price_val,
                    unit=unit_token,
                    currency=curr_token,
                    quote_timestamp=extracted_date,
                    source=portal_name,
                    provenance=ProvenanceTag.MEASURED_PORTAL,
                    confidence_score=0.95,
                )
                quotes.append(q)

        return quotes

    def _extract_date(self, text: str, fallback_date: str | datetime | None = None) -> str:
        if isinstance(fallback_date, datetime):
            return fallback_date.isoformat()
        if isinstance(fallback_date, str) and fallback_date:
            return fallback_date

        text_trans = text.translate(BURMESE_DIGITS)
        m1 = re.search(r"\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b", text_trans)
        if m1:
            try:
                dt = datetime.strptime(m1.group(1).replace("/", "-"), "%Y-%m-%d")
                return dt.replace(tzinfo=timezone.utc).isoformat()
            except Exception:
                pass

        m2 = re.search(r"\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b", text_trans)
        if m2:
            try:
                parts = re.split(r"[-/]", m2.group(1))
                dt = datetime(int(parts[2]), int(parts[1]), int(parts[0]), tzinfo=timezone.utc)
                return dt.isoformat()
            except Exception:
                pass

        return datetime.now(timezone.utc).isoformat()


class SocialCommunityConnector:
    """Unified ingestion connector for community trade channels & social groups.

    Ingests unstructured posts from:
    - Facebook Yangon Wholesale Groups (e.g. Bayintnaung bean/pulse & rice traders)
    - Facebook Shan State Agriculture Exchange
    - Telegram Agri Broadcast Channels & Viber trader chats

    Uses robust NLP and regex extraction with phone number sanitization,
    Burmese number normalization, date extraction, and closed-world validation.
    """

    def __init__(self, service: RegionalMarketService):
        self.service = service

    def parse_community_post(
        self,
        post_text: str,
        channel: str = "Facebook Yangon Wholesale Traders",
        default_center: str = "Bayintnaung",
        default_date: str | datetime | None = None,
    ) -> list[MarketQuote]:
        if not post_text or not post_text.strip():
            return []

        extracted_date = self._extract_date(post_text, default_date)

        # Detect market center in text or channel
        _, post_center = resolve_market_center(post_text)
        if not post_center:
            ch_lower = channel.lower()
            if "yangon" in ch_lower or "ရန်ကုန်" in channel:
                post_center = "Bayintnaung"
            elif "shan" in ch_lower or "တောင်ကြီး" in channel:
                post_center = "Taunggyi"
            elif "delta" in ch_lower or "ayeyarwady" in ch_lower:
                post_center = "Pathein"
            else:
                post_center = default_center

        clean_text = self._sanitize_social_noise(post_text)
        quotes: list[MarketQuote] = []

        for line in clean_text.splitlines():
            line_s = line.strip()
            if not line_s:
                continue

            _, line_center = resolve_market_center(line_s)
            canon_in_line, _ = find_commodity_in_text(line_s)
            if line_center and not canon_in_line:
                post_center = line_center
                continue

            clauses = re.split(r"(?<!\d)[,;\|၊။\n](?!\d)", line_s)
            for clause in clauses:
                cl = clause.strip()
                if not cl:
                    continue

                canon_crop, _ = find_commodity_in_text(cl)
                if not canon_crop:
                    continue

                _, cl_center = resolve_market_center(cl)
                target_center = cl_center or post_center

                cl_trans = cl.translate(BURMESE_DIGITS)
                m_curr = re.search(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:ကျပ်|ks|mmk|kyat|kyats|usd|\$|/-)", cl_trans, re.IGNORECASE)
                m_curr_pre = re.search(r"(?:\$|usd|mmk|ks)\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", cl_trans, re.IGNORECASE)
                if m_curr:
                    price_val = float(m_curr.group(1).replace(",", ""))
                elif m_curr_pre:
                    price_val = float(m_curr_pre.group(1).replace(",", ""))
                else:
                    cl_no_qty = re.sub(r"(?:^|\s)[0-9]{1,2}\s*(?:viss|peiktha|ပိဿာ|basket|tin|တင်း|bag|အိတ်|pyi|ပြည်|tonne|ton|တန်|kg|ကီလို)(?:\s|$)", " ", cl_trans, flags=re.IGNORECASE)
                    m_num = re.search(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", cl_no_qty)
                    if not m_num:
                        m_num = re.search(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", cl_trans)
                    if not m_num:
                        continue
                    price_val = float(m_num.group(1).replace(",", ""))

                unit_token = "viss"
                for u in ["viss", "peiktha", "ပိဿာ", "basket", "tin", "တင်း", "bag", "အိတ်", "pyi", "ပြည်", "tonne", "ton", "တန်", "kg", "ကီလို"]:
                    if u in cl_trans.lower():
                        unit_token = u
                        break

                curr_token = "MMK"
                for c in ["usd", "$", "dollar", "ဒေါ်လာ", "mmk", "kyat", "kyats", "ks", "ကျပ်"]:
                    if c in cl_trans.lower():
                        curr_token = "USD" if c in ("usd", "$", "dollar", "ဒေါ်လာ") else "MMK"
                        break

                q = self.service.ingest_raw_quote(
                    market_center=target_center,
                    commodity=canon_crop,
                    price=price_val,
                    unit=unit_token,
                    currency=curr_token,
                    quote_timestamp=extracted_date,
                    source=channel,
                    provenance=ProvenanceTag.MEASURED_COMMUNITY_POST,
                    confidence_score=0.85,
                )
                quotes.append(q)

        return quotes

    def ingest_social_feed(
        self,
        posts: list[dict[str, Any]],
        channel: str = "Social Wholesale Channel",
    ) -> list[MarketQuote]:
        all_quotes: list[MarketQuote] = []
        for post in posts:
            text = post.get("text", post.get("content", ""))
            ts = post.get("timestamp", post.get("date"))
            ch = post.get("channel", channel)
            center = post.get("center", post.get("market_center", "Bayintnaung"))
            qs = self.parse_community_post(text, channel=ch, default_center=center, default_date=ts)
            all_quotes.extend(qs)
        return all_quotes

    def _sanitize_social_noise(self, text: str) -> str:
        # Strip phone numbers (09..., +959..., ph: 09..., ဖုန်း - ၀၉...) without relying on ASCII word boundaries
        t = re.sub(r"(?:ph|phone|ဖုန်း|tel)?\s*(?:[:\-\s])?\s*(?:09|\+?959|၀၉)[0-9၀-၉\-\s]{6,12}(?=[^\d၀-၉]|$)", " ", text, flags=re.IGNORECASE)
        # Strip stock counts (e.g. 500 bags available, အိတ် ၅၀၀ ရှိ)
        t = re.sub(r"[0-9၀-၉]+\s*(?:bags|tons|tonnes|အိတ်|တန်)\s*(?:available|left|ရှိ|လက်ကျန်)", " ", t, flags=re.IGNORECASE)
        return t

    def _extract_date(self, text: str, fallback_date: str | datetime | None = None) -> str:
        if isinstance(fallback_date, datetime):
            return fallback_date.isoformat()
        if isinstance(fallback_date, str) and fallback_date:
            return fallback_date

        text_lower = text.lower()
        if any(w in text_lower for w in ("ဒီနေ့", "today")):
            return datetime.now(timezone.utc).isoformat()
        if any(w in text_lower for w in ("မနေ့က", "yesterday")):
            return (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

        text_trans = text.translate(BURMESE_DIGITS)
        m1 = re.search(r"\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b", text_trans)
        if m1:
            try:
                dt = datetime.strptime(m1.group(1).replace("/", "-"), "%Y-%m-%d")
                return dt.replace(tzinfo=timezone.utc).isoformat()
            except Exception:
                pass

        m2 = re.search(r"\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b", text_trans)
        if m2:
            try:
                parts = re.split(r"[-/]", m2.group(1))
                dt = datetime(int(parts[2]), int(parts[1]), int(parts[0]), tzinfo=timezone.utc)
                return dt.isoformat()
            except Exception:
                pass

        return datetime.now(timezone.utc).isoformat()


class BusinessSoftwareConnector:
    """Unified ingestion connector for agribusiness software & ERP systems.

    Ingestion adapters for:
    - Odoo purchase.order / account.move webhooks
    - ERPNext Item Price / Purchase Invoice webhooks
    - Cooperative inventory management CSV trade receipts
    - Agricultural accounting JSON receipts
    """

    def __init__(self, service: RegionalMarketService):
        self.service = service

    def ingest_odoo_webhook(
        self,
        payload: dict[str, Any],
        default_center: str = "Pathein",
    ) -> list[MarketQuote]:
        center_raw = payload.get("warehouse") or payload.get("location") or payload.get("market_center") or default_center
        _, center = resolve_market_center(str(center_raw))
        target_center = center or default_center

        ts_str = payload.get("date_order") or payload.get("date") or payload.get("create_date") or datetime.now(timezone.utc).isoformat()
        curr_str = payload.get("currency_id") or payload.get("currency") or "MMK"

        lines = payload.get("order_lines") or payload.get("lines") or payload.get("invoice_lines") or []
        quotes: list[MarketQuote] = []
        for line in lines:
            prod_name = line.get("product_name") or line.get("name") or line.get("product_id", "")
            price_val = line.get("price_unit") or line.get("unit_price") or line.get("price")
            uom_val = line.get("product_uom") or line.get("uom") or line.get("unit", "kg")

            if prod_name and price_val is not None:
                q = self.service.ingest_raw_quote(
                    market_center=target_center,
                    commodity=str(prod_name),
                    price=price_val,
                    unit=str(uom_val),
                    currency=str(curr_str),
                    quote_timestamp=ts_str,
                    source=f"Odoo ERP Webhook ({payload.get('company_id', payload.get('company', 'Agribusiness'))})",
                    provenance=ProvenanceTag.MEASURED_ERP,
                    confidence_score=0.98,
                )
                quotes.append(q)

        return quotes

    def ingest_erpnext_webhook(
        self,
        payload: dict[str, Any],
        default_center: str = "Taunggyi",
    ) -> list[MarketQuote]:
        doctype = payload.get("doctype", "Item Price")
        quotes: list[MarketQuote] = []

        if doctype == "Item Price":
            center_raw = payload.get("market_center") or payload.get("price_list") or default_center
            _, center = resolve_market_center(str(center_raw))
            target_center = center or default_center
            item = payload.get("item_name") or payload.get("item_code") or ""
            price = payload.get("price_list_rate") or payload.get("rate")
            uom = payload.get("uom") or "viss"
            curr = payload.get("currency") or "MMK"
            ts = payload.get("valid_from") or payload.get("posting_date") or datetime.now(timezone.utc).isoformat()

            if item and price is not None:
                q = self.service.ingest_raw_quote(
                    market_center=target_center,
                    commodity=str(item),
                    price=price,
                    unit=str(uom),
                    currency=str(curr),
                    quote_timestamp=ts,
                    source=f"ERPNext Item Price ({payload.get('price_list', 'Standard')})",
                    provenance=ProvenanceTag.MEASURED_ERP,
                    confidence_score=0.98,
                )
                quotes.append(q)

        elif doctype in ("Purchase Invoice", "Purchase Receipt", "Stock Entry"):
            center_raw = payload.get("market_center") or payload.get("supplier") or default_center
            _, center = resolve_market_center(str(center_raw))
            target_center = center or default_center
            ts = payload.get("posting_date") or datetime.now(timezone.utc).isoformat()
            curr = payload.get("currency") or "MMK"
            items = payload.get("items", [])

            for itm in items:
                name = itm.get("item_name") or itm.get("item_code") or ""
                rate = itm.get("rate") or itm.get("price_list_rate")
                uom = itm.get("uom") or "kg"
                if name and rate is not None:
                    q = self.service.ingest_raw_quote(
                        market_center=target_center,
                        commodity=str(name),
                        price=rate,
                        unit=str(uom),
                        currency=str(curr),
                        quote_timestamp=ts,
                        source=f"ERPNext {doctype}",
                        provenance=ProvenanceTag.MEASURED_ERP,
                        confidence_score=0.98,
                    )
                    quotes.append(q)

        return quotes

    def ingest_trade_receipts_csv(
        self,
        csv_content: str | Path,
        default_center: str | None = None,
    ) -> list[MarketQuote]:
        if isinstance(csv_content, Path) or (isinstance(csv_content, str) and "\n" not in csv_content and Path(csv_content).exists()):
            with open(csv_content, "r", encoding="utf-8") as f:
                raw_text = f.read()
        else:
            raw_text = str(csv_content)

        reader = csv.DictReader(io.StringIO(raw_text.strip()))
        quotes: list[MarketQuote] = []
        for row in reader:
            center_val = (
                row.get("center")
                or row.get("market_center")
                or row.get("location")
                or row.get("township")
                or default_center
                or "Bayintnaung"
            )
            crop_val = (
                row.get("commodity")
                or row.get("crop")
                or row.get("item")
                or row.get("product")
                or row.get("product_name")
            )
            price_val = (
                row.get("price")
                or row.get("rate")
                or row.get("unit_price")
                or row.get("price_unit")
            )
            unit_val = row.get("unit") or row.get("uom") or "kg"
            curr_val = row.get("currency") or "MMK"
            date_val = row.get("date") or row.get("transaction_date") or row.get("timestamp") or datetime.now(timezone.utc).isoformat()
            source_val = row.get("coop_name") or row.get("source") or "Cooperative CSV Receipt"

            if crop_val and price_val is not None:
                q = self.service.ingest_raw_quote(
                    market_center=str(center_val),
                    commodity=str(crop_val),
                    price=price_val,
                    unit=str(unit_val),
                    currency=str(curr_val),
                    quote_timestamp=date_val,
                    source=str(source_val),
                    provenance=ProvenanceTag.MEASURED_ERP,
                    confidence_score=0.98,
                )
                quotes.append(q)

        return quotes

    def ingest_trade_receipts_json(
        self,
        receipts_data: list[dict[str, Any]],
        default_center: str | None = None,
    ) -> list[MarketQuote]:
        quotes: list[MarketQuote] = []
        for r in receipts_data:
            center_val = (
                r.get("center")
                or r.get("market_center")
                or r.get("location")
                or default_center
                or "Bayintnaung"
            )
            crop_val = r.get("commodity") or r.get("crop") or r.get("item") or r.get("product")
            price_val = r.get("price") or r.get("rate") or r.get("unit_price")
            unit_val = r.get("unit") or r.get("uom") or "kg"
            curr_val = r.get("currency") or "MMK"
            date_val = r.get("date") or r.get("timestamp") or datetime.now(timezone.utc).isoformat()
            source_val = r.get("source") or r.get("partner") or "Cooperative JSON Receipt"

            if crop_val and price_val is not None:
                q = self.service.ingest_raw_quote(
                    market_center=str(center_val),
                    commodity=str(crop_val),
                    price=price_val,
                    unit=str(unit_val),
                    currency=str(curr_val),
                    quote_timestamp=date_val,
                    source=str(source_val),
                    provenance=ProvenanceTag.MEASURED_ERP,
                    confidence_score=0.98,
                )
                quotes.append(q)

        return quotes

    def ingest_erp_payload(self, payload: Any, default_center: str | None = None) -> list[MarketQuote]:
        """Auto-detects payload format (Odoo, ERPNext, CSV string, or JSON list) and ingests."""
        if isinstance(payload, list):
            return self.ingest_trade_receipts_json(payload, default_center=default_center)
        if isinstance(payload, dict):
            if "doctype" in payload:
                return self.ingest_erpnext_webhook(payload, default_center=default_center or "Taunggyi")
            return self.ingest_odoo_webhook(payload, default_center=default_center or "Pathein")
        if isinstance(payload, (str, Path)):
            return self.ingest_trade_receipts_csv(payload, default_center=default_center)
        return []


# =========================================================================
# REGIONAL MARKET SCRAPER & INGESTION SERVICE
# =========================================================================

class RegionalMarketService:
    """Robust, non-hallucinating regional market scraper and data ingestion service."""

    def __init__(self, data_dir: Path | None = None, usd_to_mmk_rate: float = DEFAULT_USD_TO_MMK):
        self.usd_to_mmk = usd_to_mmk_rate
        self.data_dir = data_dir or (Path(__file__).resolve().parent.parent / "data")
        self.feed_cache: dict[tuple[str, str], MarketQuote] = {}
        self.historical_baselines: dict[tuple[str, str], float] = {}
        self.price_history: dict[tuple[str, str], list[float]] = {}
        self.regional_yield_stats: dict[tuple[str, str], float] = {}
        self.quarantine_log: list[OutlierQuarantineRecord] = []
        self.portal_connector = WebPortalConnector(self)
        self.community_connector = SocialCommunityConnector(self)
        self.erp_connector = BusinessSoftwareConnector(self)
        self._load_local_datasets()

    def _load_local_datasets(self) -> None:
        """Load baseline data from local CSV datasets if present."""
        # 1. ASEAN Crop Prices Lookup (Medians across crops)
        asean_lookup_csv = self.data_dir / "ASEAN_Crop_Prices_Lookup.csv"
        if asean_lookup_csv.exists():
            try:
                df = pd.read_csv(asean_lookup_csv)
                for _, row in df.iterrows():
                    crop_en = str(row.get("crop_name_en", "")).strip()
                    canon, _ = resolve_commodity(crop_en)
                    if canon and pd.notna(row.get("myanmar_usd_tonne")):
                        val = float(row["myanmar_usd_tonne"])
                        # Populate across all regional centers that support this crop
                        spec = VERIFIED_COMMODITIES.get(canon)
                        if spec:
                            reg = spec["region"]
                            for center in VERIFIED_REGIONAL_CENTERS.get(reg, {}):
                                self.historical_baselines[(center, canon)] = val
            except Exception:
                pass

        # 2. Agricultural Crop-production Data of Shan State (Taunggyi, Muse, Lashio, Kalaw/Aungban)
        shan_prod_csv = self.data_dir / "Agricultural Crop-production Data of Shan State.csv"
        if shan_prod_csv.exists():
            try:
                df_shan = pd.read_csv(shan_prod_csv)
                yield_cols = [c for c in df_shan.columns if c.startswith("R20")]
                ts_map = {"Taunggyi": "Taunggyi", "Muse": "Muse", "Lashio": "Lashio", "Kalaw": "Aungban"}
                for _, row in df_shan.iterrows():
                    ts = str(row.get("TS_NAME", "")).strip()
                    center_name = ts_map.get(ts)
                    if not center_name:
                        continue
                    cp = str(row.get("CP_NAME", "")).strip()
                    canon_crop, _ = resolve_commodity(cp, Region.SHAN)
                    if not canon_crop:
                        continue
                    y_vals = [float(row[c]) for c in yield_cols if pd.notna(row[c]) and float(row[c]) > 0]
                    if y_vals:
                        med_yield_baskets = float(pd.Series(y_vals).median())
                        basket_kg = CROP_BASKET_WEIGHT_KG.get(canon_crop, DEFAULT_BASKET_WEIGHT_KG)
                        yield_ton_ha = round((med_yield_baskets * basket_kg * 2.47105) / 1000.0, 2)
                        self.regional_yield_stats[(center_name, canon_crop)] = yield_ton_ha
            except Exception:
                pass

        # 3. Township Agricultural Data (Pathein historical price series and yields)
        township_csv = self.data_dir / "township_agricultural_data.csv"
        if township_csv.exists():
            try:
                df_ts = pd.read_csv(township_csv)
                temp_yields: dict[tuple[str, str], list[float]] = {}
                for _, row in df_ts.iterrows():
                    ts = str(row.get("township", "")).strip()
                    _, c_center = resolve_market_center(ts)
                    if not c_center:
                        continue
                    crop_name = str(row.get("best_crop", "")).strip()
                    canon_crop, _ = resolve_commodity(crop_name)
                    if not canon_crop:
                        continue

                    # Load price history
                    p_val = row.get("local_grain_price")
                    if pd.notna(p_val) and float(p_val) > 0:
                        hist = self.price_history.setdefault((c_center, canon_crop), [])
                        if len(hist) < 50:
                            hist.append(float(p_val))
                        if canon_crop == "rice_emata":
                            pawsan_hist = self.price_history.setdefault((c_center, "rice_pawsan"), [])
                            if len(pawsan_hist) < 50:
                                pawsan_hist.append(float(p_val))

                    # Collect yield statistics
                    y_val = row.get("historic_yield_tons_per_ha")
                    if pd.notna(y_val) and float(y_val) > 0:
                        temp_yields.setdefault((c_center, canon_crop), []).append(float(y_val))
                        if canon_crop == "rice_emata":
                            temp_yields.setdefault((c_center, "rice_pawsan"), []).append(float(y_val))

                for k, y_list in temp_yields.items():
                    if y_list:
                        self.regional_yield_stats[k] = round(float(pd.Series(y_list).median()), 2)
            except Exception:
                pass

        # Populate defaults for any missing pairs
        for reg, centers in VERIFIED_REGIONAL_CENTERS.items():
            for center, c_spec in centers.items():
                for canon, com_spec in VERIFIED_COMMODITIES.items():
                    if com_spec["category"] in c_spec["supported_categories"]:
                        key = (center, canon)
                        if key not in self.historical_baselines:
                            self.historical_baselines[key] = float(com_spec["default_usd_tonne"])

    def clear_cache(self) -> None:
        self.feed_cache.clear()
        self.quarantine_log.clear()

    def get_quarantine_log(self) -> list[OutlierQuarantineRecord]:
        return list(self.quarantine_log)

    def ingest_raw_quote(
        self,
        market_center: str,
        commodity: str,
        price: float | int | str | None,
        unit: str,
        currency: str,
        quote_timestamp: str | datetime | None = None,
        source: str = "bulletin_scraper",
        historical_sample: list[float] | None = None,
        provenance: ProvenanceTag = ProvenanceTag.MEASURED,
        confidence_score: float | None = None,
    ) -> MarketQuote:
        """Ingest a single raw quote, perform anti-hallucination validation and autocleaning."""
        region, canonical_center = resolve_market_center(market_center)
        if not canonical_center or not region:
            return MarketQuote(
                quote_id=f"ERR-{market_center}-{commodity}",
                market_center=market_center,
                commodity_raw=commodity,
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.UNSUPPORTED_CENTER,
                source=source,
                notes=f"Market center '{market_center}' is not a verified trading center.",
                validation_stamp=ValidationStamp.UNVERIFIED_UNQUOTED,
                confidence_score=0.0,
            )

        canonical_commodity, com_spec = resolve_commodity(commodity, region)
        if not canonical_commodity or not com_spec:
            return MarketQuote(
                quote_id=f"ERR-{canonical_center}-{commodity}",
                region=region,
                market_center=canonical_center,
                commodity_raw=commodity,
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.UNSUPPORTED_COMMODITY,
                source=source,
                notes=f"Commodity '{commodity}' is not verified for regional center '{canonical_center}' ({region.value}).",
                validation_stamp=ValidationStamp.UNVERIFIED_UNQUOTED,
                confidence_score=0.0,
            )

        center_info = VERIFIED_REGIONAL_CENTERS[region][canonical_center]
        if com_spec["category"] not in center_info["supported_categories"]:
            return MarketQuote(
                quote_id=f"ERR-{canonical_center}-{canonical_commodity}",
                region=region,
                market_center=canonical_center,
                commodity_raw=commodity,
                commodity_canonical=canonical_commodity,
                category=com_spec["category"],
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.UNSUPPORTED_COMMODITY,
                source=source,
                notes=f"Category '{com_spec['category'].value}' not traded in center '{canonical_center}'.",
                validation_stamp=ValidationStamp.UNVERIFIED_UNQUOTED,
                confidence_score=0.0,
            )

        # Missing, non-numeric, or corrupt price checks
        num_price = clean_numeric_price(price)
        if num_price is None or not math.isfinite(num_price) or num_price <= 0:
            rec = OutlierQuarantineRecord(
                quarantine_id=f"Q-{canonical_center}-{canonical_commodity}-{len(self.quarantine_log) + 1}",
                raw_entry={"center": market_center, "commodity": commodity, "price": price, "unit": unit, "currency": currency},
                reason="Corrupt or non-positive price value",
                quarantine_timestamp=datetime.now(timezone.utc).isoformat(),
            )
            self.quarantine_log.append(rec)
            return MarketQuote(
                quote_id=f"CORRUPT-{canonical_center}-{canonical_commodity}",
                region=region,
                market_center=canonical_center,
                commodity_raw=commodity,
                commodity_canonical=canonical_commodity,
                category=com_spec["category"],
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.CORRUPTED_ENTRY,
                source=source,
                notes="Price value was missing, non-positive, or non-finite.",
                validation_stamp=ValidationStamp.QUARANTINED_OUTLIER,
                confidence_score=0.0,
            )

        # Standardize conversion
        try:
            usd_tonne = convert_to_usd_per_tonne(
                price=num_price,
                unit=unit,
                currency=currency,
                commodity_canonical=canonical_commodity,
                exchange_rate=self.usd_to_mmk,
            )
        except Exception as e:
            rec = OutlierQuarantineRecord(
                quarantine_id=f"Q-CONV-{len(self.quarantine_log) + 1}",
                raw_entry={"center": market_center, "commodity": commodity, "price": price, "unit": unit, "currency": currency},
                reason=f"Unit/Currency conversion failed: {str(e)}",
                quarantine_timestamp=datetime.now(timezone.utc).isoformat(),
            )
            self.quarantine_log.append(rec)
            return MarketQuote(
                quote_id=f"ERR-{canonical_center}-{canonical_commodity}",
                region=region,
                market_center=canonical_center,
                commodity_raw=commodity,
                commodity_canonical=canonical_commodity,
                category=com_spec["category"],
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.CORRUPTED_ENTRY,
                source=source,
                notes=f"Conversion error: {str(e)}",
                validation_stamp=ValidationStamp.QUARANTINED_OUTLIER,
                confidence_score=0.0,
            )

        # Outlier Detection against provided sample or rolling price history
        effective_sample = historical_sample
        if effective_sample is None:
            effective_sample = self.price_history.get((canonical_center, canonical_commodity))

        is_outlier, reason, metrics = OutlierDetector.evaluate_quote(
            usd_per_tonne=usd_tonne,
            commodity_canonical=canonical_commodity,
            historical_sample=effective_sample,
        )
        if is_outlier:
            rec = OutlierQuarantineRecord(
                quarantine_id=f"Q-OUT-{canonical_center}-{canonical_commodity}-{len(self.quarantine_log) + 1}",
                raw_entry={"center": market_center, "commodity": commodity, "price": price, "unit": unit, "currency": currency},
                reason=reason,
                tested_usd_per_tonne=usd_tonne,
                baseline_median_usd=metrics.get("baseline_median"),
                z_score=metrics.get("z_score"),
                quarantine_timestamp=datetime.now(timezone.utc).isoformat(),
            )
            self.quarantine_log.append(rec)
            return MarketQuote(
                quote_id=f"OUTLIER-{canonical_center}-{canonical_commodity}",
                region=region,
                market_center=canonical_center,
                commodity_raw=commodity,
                commodity_canonical=canonical_commodity,
                category=com_spec["category"],
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.OUTLIER_REJECTED,
                source=source,
                notes=f"Outlier rejected: {reason}",
                validation_stamp=ValidationStamp.QUARANTINED_OUTLIER,
                confidence_score=0.0,
            )

        # Parse timestamp
        if isinstance(quote_timestamp, datetime):
            ts_str = quote_timestamp.isoformat()
        elif isinstance(quote_timestamp, str):
            ts_str = quote_timestamp
        else:
            ts_str = datetime.now(timezone.utc).isoformat()

        std_price = convert_from_usd_per_tonne(
            usd_per_tonne=usd_tonne,
            commodity_canonical=canonical_commodity,
            exchange_rate=self.usd_to_mmk,
        )

        # Determine confidence score based on provenance if not provided
        if confidence_score is not None:
            c_score = max(0.0, min(1.0, float(confidence_score)))
        else:
            if provenance == ProvenanceTag.MEASURED_ERP:
                c_score = 0.98
            elif provenance == ProvenanceTag.MEASURED_PORTAL:
                c_score = 0.95
            elif provenance == ProvenanceTag.MEASURED_COMMUNITY_POST:
                c_score = 0.85
            elif provenance == ProvenanceTag.MEASURED:
                c_score = 0.90
            elif provenance == ProvenanceTag.HISTORICAL_INDEX:
                c_score = 0.70
            else:
                c_score = 0.0

        quote = MarketQuote(
            quote_id=f"QUOTE-{canonical_center[:3].upper()}-{canonical_commodity.upper()}-{int(datetime.now(timezone.utc).timestamp())}",
            region=region,
            market_center=canonical_center,
            commodity_raw=commodity,
            commodity_canonical=canonical_commodity,
            category=com_spec["category"],
            provenance=provenance,
            quote_timestamp=ts_str,
            raw_price=num_price,
            raw_unit=unit,
            raw_currency=currency,
            standardized=std_price,
            is_valid=True,
            validation_stamp=ValidationStamp.VALIDATED_CORRIDOR,
            confidence_score=c_score,
            source=source,
            notes="Directly scraped and validated against regional corridor.",
        )

        # Record into rolling price history (up to last 50 points)
        hist = self.price_history.setdefault((canonical_center, canonical_commodity), [])
        hist.append(usd_tonne)
        if len(hist) > 50:
            hist.pop(0)

        # Store in cache
        self.feed_cache[(canonical_center, canonical_commodity)] = quote
        return quote

    def ingest_quote_batch(self, quotes: list[dict[str, Any]]) -> dict[str, Any]:
        """Batch ingestion and data autocleaning with quarantine tracking."""
        accepted = []
        rejected = []
        for q in quotes:
            res = self.ingest_raw_quote(
                market_center=q.get("market_center", q.get("center", "")),
                commodity=q.get("commodity", q.get("crop", "")),
                price=q.get("price"),
                unit=q.get("unit", "kg"),
                currency=q.get("currency", "MMK"),
                quote_timestamp=q.get("quote_timestamp", q.get("timestamp")),
                source=q.get("source", "batch_bulletin"),
                provenance=q.get("provenance", ProvenanceTag.MEASURED),
                confidence_score=q.get("confidence_score"),
            )
            if res.is_valid and res.provenance.value.startswith("MEASURED"):
                accepted.append(res)
            else:
                rejected.append(res)

        return {
            "total_submitted": len(quotes),
            "accepted_count": len(accepted),
            "rejected_count": len(rejected),
            "quarantined_records": len(self.quarantine_log),
            "accepted_quotes": accepted,
            "rejected_quotes": rejected,
        }

    def scrape_regional_feed(self, source_data: list[dict[str, Any]] | None = None) -> list[MarketQuote]:
        """Scrape / ingest simulated or real local bulletin feeds."""
        if source_data is not None:
            batch_res = self.ingest_quote_batch(source_data)
            return batch_res["accepted_quotes"]
        return list(self.feed_cache.values())

    def scrape_bulletin_text(
        self,
        text: str,
        default_center: str | None = None,
        quote_timestamp: str | datetime | None = None,
        source: str = "bulletin_text_scraper",
    ) -> list[MarketQuote]:
        """Scrapes unstructured or semi-structured bulletin text in English or Burmese."""
        if not text:
            return []

        import re
        quotes: list[MarketQuote] = []
        current_center = default_center

        for line in text.strip().splitlines():
            line_str = line.strip()
            if not line_str:
                continue

            # Check if line sets a new market center header
            reg, c_center = resolve_market_center(line_str)
            canon_in_line, _ = find_commodity_in_text(line_str)
            if c_center and not canon_in_line:
                current_center = c_center
                continue

            # Clauses separated by commas, semicolons, pipes, or Burmese punctuation (၊, ။)
            # Use negative lookaround to prevent splitting commas inside formatted numbers (e.g. 108,000)
            clauses = re.split(r"(?<!\d)[,;\|၊။](?!\d)", line_str)
            for clause in clauses:
                clause_s = clause.strip()
                if not clause_s:
                    continue

                # Check if this clause explicitly names a center
                _, specific_center = resolve_market_center(clause_s)
                target_center = specific_center or current_center
                if not target_center:
                    continue

                # Find any commodity mentioned in the clause
                canon_crop, _ = find_commodity_in_text(clause_s)
                if not canon_crop:
                    continue

                # Extract price number (supporting commas and Burmese digits)
                clause_trans = clause_s.translate(BURMESE_DIGITS)
                m_num = re.search(r"([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)", clause_trans)
                if not m_num:
                    continue
                price_val = float(m_num.group(1).replace(",", ""))

                # Extract unit
                unit_token = "kg"
                for u in ["viss", "peiktha", "ပိဿာ", "basket", "tin", "တင်း", "bag", "အိတ်", "pyi", "ပြည်", "tonne", "ton", "တန်", "kg", "ကီလို"]:
                    if u in clause_trans.lower():
                        unit_token = u
                        break

                # Extract currency
                curr_token = "MMK"
                for c in ["usd", "$", "dollar", "ဒေါ်လာ", "mmk", "kyat", "kyats", "ks", "ကျပ်"]:
                    if c in clause_trans.lower():
                        curr_token = "USD" if c in ("usd", "$", "dollar", "ဒေါ်လာ") else "MMK"
                        break

                q = self.ingest_raw_quote(
                    market_center=target_center,
                    commodity=canon_crop,
                    price=price_val,
                    unit=unit_token,
                    currency=curr_token,
                    quote_timestamp=quote_timestamp,
                    source=source,
                )
                quotes.append(q)

        return quotes

    def get_quote(
        self,
        market_center: str,
        commodity: str,
        live_only: bool = False,
        max_age_days: int = 7,
    ) -> MarketQuote:
        """Fetch market quote with strict anti-hallucination and fallback rules."""
        region, canonical_center = resolve_market_center(market_center)
        if not canonical_center or not region:
            return MarketQuote(
                quote_id=f"UNQ-{market_center}-{commodity}",
                market_center=market_center,
                commodity_raw=commodity,
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.UNSUPPORTED_CENTER,
                notes=f"Market center '{market_center}' not recognized.",
                validation_stamp=ValidationStamp.UNVERIFIED_UNQUOTED,
                confidence_score=0.0,
            )

        canonical_commodity, com_spec = resolve_commodity(commodity, region)
        if not canonical_commodity or not com_spec:
            return MarketQuote(
                quote_id=f"UNQ-{canonical_center}-{commodity}",
                region=region,
                market_center=canonical_center,
                commodity_raw=commodity,
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.UNSUPPORTED_COMMODITY,
                notes=f"Commodity '{commodity}' not recognized for {canonical_center}.",
                validation_stamp=ValidationStamp.UNVERIFIED_UNQUOTED,
                confidence_score=0.0,
            )

        center_info = VERIFIED_REGIONAL_CENTERS[region][canonical_center]
        if com_spec["category"] not in center_info["supported_categories"]:
            return MarketQuote(
                quote_id=f"UNQ-{canonical_center}-{canonical_commodity}",
                region=region,
                market_center=canonical_center,
                commodity_raw=commodity,
                commodity_canonical=canonical_commodity,
                category=com_spec["category"],
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.UNSUPPORTED_COMMODITY,
                notes=f"Category '{com_spec['category'].value}' not traded in '{canonical_center}'.",
                validation_stamp=ValidationStamp.UNVERIFIED_UNQUOTED,
                confidence_score=0.0,
            )

        cache_key = (canonical_center, canonical_commodity)

        # 1. Check live feed cache
        if cache_key in self.feed_cache:
            live_quote = self.feed_cache[cache_key]
            # Check staleness
            is_stale = False
            if live_quote.quote_timestamp:
                try:
                    q_time = datetime.fromisoformat(live_quote.quote_timestamp.replace("Z", "+00:00"))
                    now = datetime.now(timezone.utc)
                    if (now - q_time).total_seconds() > (max_age_days * 86400):
                        is_stale = True
                except Exception:
                    is_stale = False

            if not is_stale and live_quote.is_valid:
                return live_quote

            if is_stale:
                if live_only:
                    return MarketQuote(
                        quote_id=f"STALE-{canonical_center}-{canonical_commodity}",
                        region=region,
                        market_center=canonical_center,
                        commodity_raw=commodity,
                        commodity_canonical=canonical_commodity,
                        category=com_spec["category"],
                        provenance=ProvenanceTag.UNQUOTED,
                        is_valid=False,
                        unquoted_reason=UnquotedReason.STALE_FEED,
                        notes=f"Live feed quote is older than {max_age_days} days.",
                        validation_stamp=ValidationStamp.UNVERIFIED_UNQUOTED,
                        confidence_score=0.0,
                    )

        # 2. If live_only requested and no fresh live quote exists
        if live_only:
            return MarketQuote(
                quote_id=f"UNQ-{canonical_center}-{canonical_commodity}",
                region=region,
                market_center=canonical_center,
                commodity_raw=commodity,
                commodity_canonical=canonical_commodity,
                category=com_spec["category"],
                provenance=ProvenanceTag.UNQUOTED,
                is_valid=False,
                unquoted_reason=UnquotedReason.UNQUOTED_MARKET,
                notes="No active live feed quote found (live_only=True).",
                validation_stamp=ValidationStamp.UNVERIFIED_UNQUOTED,
                confidence_score=0.0,
            )

        # 3. Fallback to verified HISTORICAL_INDEX
        baseline_usd = self.historical_baselines.get(cache_key)
        if baseline_usd is None:
            baseline_usd = float(com_spec["default_usd_tonne"])

        std_price = convert_from_usd_per_tonne(
            usd_per_tonne=baseline_usd,
            commodity_canonical=canonical_commodity,
            exchange_rate=self.usd_to_mmk,
        )

        return MarketQuote(
            quote_id=f"HIST-{canonical_center[:3].upper()}-{canonical_commodity.upper()}",
            region=region,
            market_center=canonical_center,
            commodity_raw=commodity,
            commodity_canonical=canonical_commodity,
            category=com_spec["category"],
            provenance=ProvenanceTag.HISTORICAL_INDEX,
            quote_timestamp=datetime.now(timezone.utc).isoformat(),
            raw_price=baseline_usd,
            raw_unit="tonne",
            raw_currency="USD",
            standardized=std_price,
            is_valid=True,
            validation_stamp=ValidationStamp.HISTORICAL_BASELINE,
            confidence_score=0.70,
            source="verified_historical_dataset",
            notes="Derived from verified FAOSTAT/ASEAN/Shan historical baseline index.",
        )

    def get_market_summary(self, region: Region | None = None) -> dict[str, Any]:
        """Summary of active quotes across verified regional centers."""
        out: dict[str, Any] = {}
        target_regions = [region] if region else [Region.SHAN, Region.AYEYARWADY, Region.YANGON]
        for reg in target_regions:
            reg_dict: dict[str, Any] = {}
            for center, c_spec in VERIFIED_REGIONAL_CENTERS[reg].items():
                center_quotes = []
                for canon, com_spec in VERIFIED_COMMODITIES.items():
                    if com_spec["category"] in c_spec["supported_categories"]:
                        quote = self.get_quote(center, canon, live_only=False)
                        center_quotes.append(quote.model_dump())
                reg_dict[center] = center_quotes
            out[reg.value] = reg_dict
        return out

    # =====================================================================
    # INTEGRATION WITH AGENT QILL (ECONOMIC SOLVENCY & 3x ROI GATE)
    # =====================================================================

    def evaluate_qill_solvency(
        self,
        quote: MarketQuote,
        expected_yield_ton_ha: float,
        remaining_budget_usd_ha: float,
        proposed_spend_usd_ha: float,
        projected_loss_pct: float = 0.25,
    ) -> QillSolvencyAssessment:
        """Grounds Agent Qill's 3x ROI Solvency Gate in verified regional market quotes."""
        # 1. Anti-hallucination check: If quote is UNQUOTED, refuse speculative spend
        if quote.provenance == ProvenanceTag.UNQUOTED or not quote.standardized:
            if proposed_spend_usd_ha > 0:
                return QillSolvencyAssessment(
                    market_center=quote.market_center,
                    commodity=quote.commodity_canonical or quote.commodity_raw,
                    provenance=ProvenanceTag.UNQUOTED,
                    spot_price_usd_ton=None,
                    expected_yield_ton_ha=expected_yield_ton_ha,
                    crop_economic_value_usd_ha=0.0,
                    at_risk_revenue_usd_ha=0.0,
                    remaining_budget_usd_ha=remaining_budget_usd_ha,
                    proposed_spend_usd_ha=proposed_spend_usd_ha,
                    max_viable_spend_usd_ha=0.0,
                    bcr_ratio=None,
                    is_solvency_approved=False,
                    veto_triggered=True,
                    veto_reason=(
                        f"ECONOMIC_VETO: Market price for '{quote.commodity_raw}' in '{quote.market_center}' "
                        f"is UNQUOTED ({quote.unquoted_reason.value if quote.unquoted_reason else 'unknown'}). "
                        "Cannot verify 3x ROI solvency without grounded market pricing."
                    ),
                    qill_recommendation="Zero-cash cultural mitigation only (NONE_CULTURAL_ONLY). Freeze external input purchases.",
                )
            else:
                return QillSolvencyAssessment(
                    market_center=quote.market_center,
                    commodity=quote.commodity_canonical or quote.commodity_raw,
                    provenance=ProvenanceTag.UNQUOTED,
                    spot_price_usd_ton=None,
                    expected_yield_ton_ha=expected_yield_ton_ha,
                    crop_economic_value_usd_ha=0.0,
                    at_risk_revenue_usd_ha=0.0,
                    remaining_budget_usd_ha=remaining_budget_usd_ha,
                    proposed_spend_usd_ha=0.0,
                    max_viable_spend_usd_ha=0.0,
                    bcr_ratio=999.0,
                    is_solvency_approved=True,
                    veto_triggered=False,
                    veto_reason=None,
                    qill_recommendation="Approved for zero-cash cultural mitigation (NONE_CULTURAL_ONLY). External input spend remains frozen ($0.00).",
                )

        spot_price = quote.standardized.price_usd_per_tonne
        gross_value = round(expected_yield_ton_ha * spot_price, 2)
        at_risk_revenue = round(gross_value * projected_loss_pct, 2)

        # 3x Single-Season ROI rule: max spend is min(budget, at_risk_revenue / 3.0)
        roi_ceiling_spend = round(at_risk_revenue / 3.0, 2)
        max_viable_spend = round(min(remaining_budget_usd_ha, roi_ceiling_spend), 2)

        # Benefit-to-Cost ratio (BCR)
        bcr = round(at_risk_revenue / proposed_spend_usd_ha, 2) if proposed_spend_usd_ha > 0 else 999.0

        if proposed_spend_usd_ha > max_viable_spend:
            if proposed_spend_usd_ha > remaining_budget_usd_ha:
                reason = (
                    f"ECONOMIC_VETO: Proposed spend ${proposed_spend_usd_ha:.2f}/ha exceeds "
                    f"remaining working budget of ${remaining_budget_usd_ha:.2f}/ha."
                )
            else:
                reason = (
                    f"ECONOMIC_VETO: Proposed spend ${proposed_spend_usd_ha:.2f}/ha violates the 3x ROI ceiling. "
                    f"Max viable spend is ${max_viable_spend:.2f}/ha (At-risk revenue: ${at_risk_revenue:.2f}/ha, BCR: {bcr:.1f}x < 3.0x)."
                )
            return QillSolvencyAssessment(
                market_center=quote.market_center,
                commodity=quote.commodity_canonical or quote.commodity_raw,
                provenance=quote.provenance,
                spot_price_usd_ton=spot_price,
                expected_yield_ton_ha=expected_yield_ton_ha,
                crop_economic_value_usd_ha=gross_value,
                at_risk_revenue_usd_ha=at_risk_revenue,
                remaining_budget_usd_ha=remaining_budget_usd_ha,
                proposed_spend_usd_ha=proposed_spend_usd_ha,
                max_viable_spend_usd_ha=max_viable_spend,
                bcr_ratio=bcr,
                is_solvency_approved=False,
                veto_triggered=True,
                veto_reason=reason,
                qill_recommendation=f"Downscale intervention to micro-zone treatment under ${max_viable_spend:.2f}/ha or use cultural controls.",
            )

        return QillSolvencyAssessment(
            market_center=quote.market_center,
            commodity=quote.commodity_canonical or quote.commodity_raw,
            provenance=quote.provenance,
            spot_price_usd_ton=spot_price,
            expected_yield_ton_ha=expected_yield_ton_ha,
            crop_economic_value_usd_ha=gross_value,
            at_risk_revenue_usd_ha=at_risk_revenue,
            remaining_budget_usd_ha=remaining_budget_usd_ha,
            proposed_spend_usd_ha=proposed_spend_usd_ha,
            max_viable_spend_usd_ha=max_viable_spend,
            bcr_ratio=bcr,
            is_solvency_approved=True,
            veto_triggered=False,
            veto_reason=None,
            qill_recommendation=f"Approved. Delivers verified {bcr:.1f}x ROI multiple within seasonal harvest window.",
        )

    def enrich_council_context(
        self,
        context: dict[str, Any],
        market_center: str | None = None,
        commodity: str | None = None,
        live_only: bool = False,
    ) -> dict[str, Any]:
        """Enriches raw council context with verified regional market quotes and solvency bounds."""
        enriched = dict(context)

        center = market_center or enriched.get("market_center") or enriched.get("township") or "Pathein"
        crop = commodity or enriched.get("crop") or "rice"
        reg, canon_center = resolve_market_center(center)
        canon_crop, _ = resolve_commodity(crop, reg)

        default_yield = self.regional_yield_stats.get(
            (canon_center or center, canon_crop or crop),
            4.2 if "rice" in str(crop).lower() else 2.5
        )
        yield_ton = float(enriched.get("expected_yield_tons_ha", enriched.get("target_yield_ton_per_ha", default_yield)))
        budget = float(enriched.get("remaining_budget_usd_per_ha", 50.0))
        days = int(enriched.get("days_to_harvest", 6))
        rain_48h = float(enriched.get("rain_forecast_48h_mm", 0.0))

        quote = self.get_quote(market_center=center, commodity=crop, live_only=live_only)

        enriched["market_center"] = quote.market_center
        enriched["market_provenance"] = quote.provenance.value

        if quote.standardized and quote.is_valid:
            spot = quote.standardized.price_usd_per_tonne
            gross_val = round(yield_ton * spot, 2)
            loss_pct = 0.35 if days <= 7 and rain_48h >= 20.0 else 0.25
            at_risk = round(gross_val * loss_pct, 2)
            max_spend = round(min(budget, at_risk / 3.0), 2)

            enriched["spot_price_usd_ton"] = spot
            enriched["price_mmk_per_viss"] = quote.standardized.price_mmk_per_viss
            enriched["price_mmk_per_basket"] = quote.standardized.price_mmk_per_basket
            enriched["crop_economic_value_usd_ha"] = gross_val
            enriched["at_risk_revenue_usd_ha"] = at_risk
            enriched["max_viable_spend_usd_ha"] = max_spend
            enriched["regional_quote"] = quote.to_api_dict()
        else:
            enriched["spot_price_usd_ton"] = None
            enriched["crop_economic_value_usd_ha"] = 0.0
            enriched["at_risk_revenue_usd_ha"] = 0.0
            enriched["max_viable_spend_usd_ha"] = 0.0
            enriched["unquoted_reason"] = quote.unquoted_reason.value if quote.unquoted_reason else "unquoted"
            enriched["regional_quote"] = quote.to_api_dict()

        # Enrich with Cobweb Glut Risk assessment if township/center is available
        township_lookup = str(enriched.get("township") or center or "")
        if township_lookup and crop:
            try:
                from app.services.market_demand import market_demand_service
                spot_for_demand = quote.standardized.price_usd_per_tonne if (quote.standardized and quote.is_valid) else None
                glut_eval = market_demand_service.analyze_glut_risk(
                    township=township_lookup,
                    commodity=crop,
                    instant_spot_price_usd_tonne=spot_for_demand,
                    days_to_harvest=days,
                )
                if glut_eval.cobweb_glut_risk_index is not None:
                    enriched["cobweb_glut_risk_index"] = glut_eval.cobweb_glut_risk_index
                    enriched["glut_risk_level"] = glut_eval.glut_risk_level.value if glut_eval.glut_risk_level else None
                    enriched["is_hype_cycle_active"] = glut_eval.is_hype_cycle_active
                    enriched["projected_harvest_price_usd_tonne"] = glut_eval.projected_harvest_price_usd_tonne
                    enriched["cobweb_glut_analysis"] = glut_eval.to_api_dict()
            except Exception:
                pass

        return enriched

    def analyze_market_demand(
        self,
        township: str,
        commodity: str,
        instant_spot_price_usd_tonne: float | None = None,
        projected_acreage: float | None = None,
        acreage_expansion_pct: float | None = None,
        days_to_harvest: int = 90,
    ) -> Any:
        """Evaluate Cobweb Theorem boom-and-bust cycle and post-hype glut risk."""
        from app.services.market_demand import market_demand_service
        return market_demand_service.analyze_glut_risk(
            township=township,
            commodity=commodity,
            instant_spot_price_usd_tonne=instant_spot_price_usd_tonne,
            projected_acreage=projected_acreage,
            acreage_expansion_pct=acreage_expansion_pct,
            days_to_harvest=days_to_harvest,
        )

    # =====================================================================
    # MULTI-SOURCE INGESTION CONVENIENCE HANDLERS
    # =====================================================================

    def ingest_portal_bulletin(
        self,
        content: str,
        portal_name: str = "Bayintnaung Wholesale Center",
        default_center: str = "Bayintnaung",
        bulletin_date: str | datetime | None = None,
    ) -> list[MarketQuote]:
        """Ingests official commodity association portal bulletins (Bayintnaung, MPBMA, DOA)."""
        return self.portal_connector.parse_portal_bulletin(
            content=content,
            portal_name=portal_name,
            default_center=default_center,
            bulletin_date=bulletin_date,
        )

    def ingest_community_post(
        self,
        post_text: str,
        channel: str = "Facebook Yangon Wholesale Traders",
        default_center: str = "Bayintnaung",
        default_date: str | datetime | None = None,
    ) -> list[MarketQuote]:
        """Ingests raw social posts from Facebook trader groups, Telegram broadcasts, and Viber chats."""
        return self.community_connector.parse_community_post(
            post_text=post_text,
            channel=channel,
            default_center=default_center,
            default_date=default_date,
        )

    def ingest_social_feed(
        self,
        posts: list[dict[str, Any]],
        channel: str = "Social Wholesale Channel",
    ) -> list[MarketQuote]:
        """Ingests a list of community social posts."""
        return self.community_connector.ingest_social_feed(posts, channel=channel)

    def ingest_erp_payload(
        self,
        payload: Any,
        default_center: str | None = None,
    ) -> list[MarketQuote]:
        """Auto-detects payload format (Odoo, ERPNext, CSV string, or JSON list) and ingests."""
        return self.erp_connector.ingest_erp_payload(payload, default_center=default_center)

    def ingest_odoo_webhook(
        self,
        payload: dict[str, Any],
        default_center: str = "Pathein",
    ) -> list[MarketQuote]:
        """Ingests purchase orders and inventory updates from Odoo ERP webhooks."""
        return self.erp_connector.ingest_odoo_webhook(payload, default_center=default_center)

    def ingest_erpnext_webhook(
        self,
        payload: dict[str, Any],
        default_center: str = "Taunggyi",
    ) -> list[MarketQuote]:
        """Ingests item prices and invoices from ERPNext webhooks."""
        return self.erp_connector.ingest_erpnext_webhook(payload, default_center=default_center)

    def ingest_trade_receipts_csv(
        self,
        csv_content: str | Path,
        default_center: str | None = None,
    ) -> list[MarketQuote]:
        """Ingests agricultural cooperative inventory and transaction receipts from CSV."""
        return self.erp_connector.ingest_trade_receipts_csv(csv_content, default_center=default_center)

    def ingest_trade_receipts_json(
        self,
        receipts_data: list[dict[str, Any]],
        default_center: str | None = None,
    ) -> list[MarketQuote]:
        """Ingests agricultural cooperative transaction receipts from JSON."""
        return self.erp_connector.ingest_trade_receipts_json(receipts_data, default_center=default_center)

    # =====================================================================
    # DATA AUTOCLEANING & CLAUDE / AGENT QILL INTELLIGENCE VAULT
    # =====================================================================

    def clean_market_quote(
        self,
        quote: MarketQuote,
        stale_threshold_days: int = 7,
    ) -> CleanMarketIntelligence:
        """Transforms a MarketQuote into a standardized clean intelligence artifact."""
        return quote.to_clean_intelligence(stale_threshold_days=stale_threshold_days)

    def clean_quote_batch(
        self,
        quotes: list[MarketQuote],
        stale_threshold_days: int = 7,
    ) -> list[CleanMarketIntelligence]:
        """Transforms a batch of MarketQuotes into standardized clean intelligence artifacts."""
        return [q.to_clean_intelligence(stale_threshold_days=stale_threshold_days) for q in quotes]

    def export_clean_feed_json(
        self,
        quotes: list[MarketQuote] | list[CleanMarketIntelligence] | None = None,
        filepath: Path | str | None = None,
        stale_threshold_days: int = 7,
    ) -> Path:
        """Saves clean facts to structured JSON vault file for Claude / Agent Qill consumption."""
        if quotes is None:
            raw_list = list(self.feed_cache.values())
            clean_list = [q.to_clean_intelligence(stale_threshold_days) for q in raw_list]
        elif quotes and isinstance(quotes[0], MarketQuote):
            clean_list = [q.to_clean_intelligence(stale_threshold_days) for q in quotes]  # type: ignore
        else:
            clean_list = quotes  # type: ignore

        target_path = Path(filepath) if filepath else (self.data_dir / "clean_market_feed.json")
        target_path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "title": "AgroGuard Clean Market Intelligence Feed",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "total_quotes": len(clean_list),
            "valid_quotes": sum(1 for c in clean_list if c.is_valid),
            "quotes": [c.model_dump() for c in clean_list],
        }

        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

        return target_path

    def export_clean_vault_markdown(
        self,
        quotes: list[MarketQuote] | list[CleanMarketIntelligence] | None = None,
        filepath: Path | str | None = None,
        stale_threshold_days: int = 7,
    ) -> Path:
        """Saves clean facts as Markdown with YAML frontmatter for instant LLM prompt injection."""
        if quotes is None:
            raw_list = list(self.feed_cache.values())
            clean_list = [q.to_clean_intelligence(stale_threshold_days) for q in raw_list]
        elif quotes and isinstance(quotes[0], MarketQuote):
            clean_list = [q.to_clean_intelligence(stale_threshold_days) for q in quotes]  # type: ignore
        else:
            clean_list = quotes  # type: ignore

        target_path = Path(filepath) if filepath else (self.data_dir / "clean_market_feed.md")
        target_path.parent.mkdir(parents=True, exist_ok=True)

        now_str = datetime.now(timezone.utc).isoformat()
        total = len(clean_list)
        valid = sum(1 for c in clean_list if c.is_valid)

        md_lines = [
            "---",
            "title: Clean Market Intelligence Vault",
            f"exported_at: {now_str}",
            f"total_quotes: {total}",
            f"valid_quotes: {valid}",
            "---",
            "",
            "# Verified Clean Market Facts for Claude & Agent Qill",
            "",
        ]

        by_center: dict[str, list[CleanMarketIntelligence]] = {}
        for c in clean_list:
            by_center.setdefault(c.market_center, []).append(c)

        for center, c_quotes in by_center.items():
            md_lines.append(f"## {center}")
            for q in c_quotes:
                status_icon = "✅" if q.is_valid else "⚠️"
                p_str = f"${q.price_usd_per_tonne:.2f}/MT ({q.price_mmk_per_viss:,.0f} MMK/viss)" if q.price_usd_per_tonne else "UNQUOTED"
                md_lines.append(f"- {status_icon} **{q.commodity_name}**: {p_str}")
                md_lines.append(f"  - Summary: {q.economic_summary}")
                md_lines.append(f"  - Provenance: `{q.provenance.value}` | Confidence: {q.confidence_score:.2f} | Stamp: `{q.validation_stamp.value}`")
            md_lines.append("")

        with open(target_path, "w", encoding="utf-8") as f:
            f.write("\n".join(md_lines))

        return target_path

    def load_clean_market_feed(
        self,
        filepath: Path | str | None = None,
    ) -> list[CleanMarketIntelligence]:
        """Loads clean facts directly from structured JSON vault file."""
        target_path = Path(filepath) if filepath else (self.data_dir / "clean_market_feed.json")
        if not target_path.exists():
            return []

        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        raw_quotes = data.get("quotes", [])
        return [CleanMarketIntelligence.model_validate(q) for q in raw_quotes]

    def get_clean_intelligence(
        self,
        market_center: str,
        commodity: str,
        live_only: bool = False,
        max_age_days: int = 7,
    ) -> CleanMarketIntelligence:
        """Retrieves and cleans market intelligence for a specific market center and commodity."""
        quote = self.get_quote(
            market_center=market_center,
            commodity=commodity,
            live_only=live_only,
            max_age_days=max_age_days,
        )
        return quote.to_clean_intelligence(stale_threshold_days=max_age_days)


# Default singleton service instance
regional_market_service = RegionalMarketService()
