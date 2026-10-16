from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

ASEAN_COUNTRIES: dict[str, str] = {
    "BN": "Brunei Darussalam",
    "KH": "Cambodia",
    "ID": "Indonesia",
    "LA": "Lao PDR",
    "MY": "Malaysia",
    "MM": "Myanmar",
    "PH": "Philippines",
    "SG": "Singapore",
    "TH": "Thailand",
    "TL": "Timor-Leste",
    "VN": "Viet Nam",
}

CATEGORIES = (
    "paddy",
    "rice_shrimp",
    "rice_fish",
    "aquaculture",
    "poultry",
    "orchard",
    "vegetable",
    "upland",
)


@dataclass(frozen=True)
class CropProfile:
    id: str
    name: str
    category: str
    countries: tuple[str, ...]
    season_days: int
    kc: tuple[float, float, float] | None
    kc_source: str
    key_problems: tuple[str, ...]
    traditional_practices: tuple[str, ...]
    agents: tuple[str, ...]
    notes: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out["countries"] = list(self.countries)
        out["kc"] = list(self.kc) if self.kc else None
        out["verification"] = (
            "Problem lists and practices are commonly reported; local severity TO VERIFY."
        )
        return out


FAO56 = "FAO-56 Table 12 (ini, mid, end); local calibration TO VERIFY"
NO_KC = "Not applicable"

CROPS: tuple[CropProfile, ...] = (
    CropProfile(
        id="rice_lowland",
        name="Lowland paddy rice",
        category="paddy",
        countries=tuple(ASEAN_COUNTRIES),
        season_days=120,
        kc=(1.05, 1.20, 0.90),
        kc_source=FAO56,
        key_problems=(
            "Dry-season water shortage",
            "Monsoon flooding and submergence",
            "Brown planthopper outbreaks",
            "Rice blast under prolonged leaf wetness",
            "Methane emissions from continuous flooding",
            "El Nino dry spells and heat",
            "Imported urea supply and price shocks",
        ),
        traditional_practices=(
            "Alternate wetting and drying with a field water tube",
            "Bund repair before transplanting",
            "Keep standing water around flowering",
            "Drain one to two weeks before harvest",
        ),
        agents=("water_steward", "crop_scout", "pest_watcher", "harvest_planner", "drone_pilot"),
    ),
    CropProfile(
        id="rice_shrimp",
        name="Rice-shrimp rotation",
        category="rice_shrimp",
        countries=("VN", "TH", "MM"),
        season_days=120,
        kc=(1.05, 1.20, 0.90),
        kc_source=FAO56 + " (rice phase only)",
        key_problems=(
            "Salinity carry-over into the rice phase",
            "Saline intrusion timing in the dry season",
            "Shrimp disease pressure in the brackish phase",
            "Land subsidence raising flood and salinity exposure",
        ),
        traditional_practices=(
            "Flush salt with early-season rain before transplanting",
            "Use salt-tolerant rice varieties",
            "Close sluices on saline high tides",
        ),
        agents=("water_steward", "crop_scout", "harvest_planner"),
        notes=("Salinity thresholds for the switch between phases are TO VERIFY.",),
    ),
    CropProfile(
        id="rice_fish",
        name="Rice-fish polyculture",
        category="rice_fish",
        countries=("ID", "PH", "LA", "KH", "VN", "MM", "TH"),
        season_days=120,
        kc=(1.05, 1.20, 0.90),
        kc_source=FAO56 + " (rice component)",
        key_problems=(
            "Fish refuge trench drying during AWD",
            "Pesticide toxicity to fish",
            "Predation and escape during floods",
        ),
        traditional_practices=(
            "Keep a deep refuge trench while the field dries",
            "Raise bunds and add screens before the monsoon",
            "Let fish graze weeds and insects instead of spraying",
        ),
        agents=("water_steward", "crop_scout", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="shrimp_pond",
        name="Shrimp pond (black tiger / whiteleg)",
        category="aquaculture",
        countries=("VN", "TH", "ID", "PH", "MY", "MM"),
        season_days=100,
        kc=None,
        kc_source=NO_KC,
        key_problems=(
            "Low dissolved oxygen at dawn",
            "White spot and EHP disease outbreaks",
            "Salinity and pH swings after heavy rain",
        ),
        traditional_practices=(
            "Run aerators before dawn",
            "Lime ponds after heavy rain",
            "Partial harvest when disease risk rises",
        ),
        agents=("water_steward", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="tilapia_pond",
        name="Tilapia pond",
        category="aquaculture",
        countries=("PH", "TH", "ID", "VN", "MY", "MM", "LA", "KH"),
        season_days=150,
        kc=None,
        kc_source=NO_KC,
        key_problems=("Low dissolved oxygen", "Heat stress in shallow ponds", "Feed cost"),
        traditional_practices=(
            "Stock at moderate density",
            "Fertilise ponds with manure for plankton",
        ),
        agents=("water_steward", "harvest_planner"),
    ),
    CropProfile(
        id="poultry_broiler",
        name="Broiler and duck coop",
        category="poultry",
        countries=tuple(ASEAN_COUNTRIES),
        season_days=42,
        kc=None,
        kc_source=NO_KC,
        key_problems=("Heat stress", "Avian influenza biosecurity", "Litter moisture and ammonia"),
        traditional_practices=(
            "Shade and ventilate coops in the afternoon",
            "Herd ducks through harvested paddies to clear snails",
        ),
        agents=("pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="durian",
        name="Durian",
        category="orchard",
        countries=("TH", "MY", "VN", "PH", "ID"),
        season_days=120,
        kc=None,
        kc_source="No FAO-56 entry; TO VERIFY",
        key_problems=(
            "Phytophthora root and stem rot",
            "Drought stress at flowering",
            "Fruit drop",
            "Export residue testing for cadmium and auramine O",
        ),
        traditional_practices=(
            "Withhold water briefly to trigger flowering",
            "Mulch and drain the root zone",
        ),
        agents=("water_steward", "crop_scout", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="mango",
        name="Mango",
        category="orchard",
        countries=("PH", "TH", "VN", "KH", "MM", "ID", "LA"),
        season_days=120,
        kc=None,
        kc_source="No FAO-56 entry; TO VERIFY",
        key_problems=("Anthracnose in wet weather", "Fruit fly damage", "Irregular flowering"),
        traditional_practices=("Bag fruit against flies", "Prune for airflow after harvest"),
        agents=("crop_scout", "pest_watcher", "harvest_planner", "drone_pilot"),
    ),
    CropProfile(
        id="banana",
        name="Banana",
        category="orchard",
        countries=("PH", "VN", "ID", "TH", "MY", "LA", "KH", "MM"),
        season_days=300,
        kc=(0.50, 1.10, 1.00),
        kc_source=FAO56 + " (first year)",
        key_problems=("Fusarium wilt TR4", "Wind damage in storms", "Sigatoka leaf spot"),
        traditional_practices=(
            "Quarantine tools and boots between blocks",
            "Prop plants before storms",
        ),
        agents=("water_steward", "crop_scout", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="dragon_fruit",
        name="Dragon fruit",
        category="orchard",
        countries=("VN", "TH", "MY", "ID", "PH"),
        season_days=50,
        kc=None,
        kc_source="No FAO-56 entry; TO VERIFY",
        key_problems=("Stem canker", "Off-season lighting cost"),
        traditional_practices=(
            "Night lighting to induce off-season flowering",
            "Remove infected stems",
        ),
        agents=("crop_scout", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="coffee_robusta",
        name="Robusta coffee",
        category="orchard",
        countries=("VN", "ID", "LA", "TH", "MM", "TL"),
        season_days=270,
        kc=(0.90, 0.95, 0.95),
        kc_source=FAO56 + " (bare ground cover)",
        key_problems=(
            "Dry-season water stress",
            "Coffee berry borer",
            "Groundwater depletion",
            "EUDR geolocation due diligence for EU exports",
        ),
        traditional_practices=("Shade trees and intercropping", "Basin irrigation after harvest"),
        agents=("water_steward", "crop_scout", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="cassava",
        name="Cassava",
        category="upland",
        countries=("TH", "VN", "KH", "LA", "ID", "PH", "MM"),
        season_days=300,
        kc=(0.30, 0.80, 0.30),
        kc_source=FAO56 + " (first year)",
        key_problems=("Cassava mosaic disease", "Mealybug", "Soil erosion on slopes"),
        traditional_practices=("Use clean planting stakes", "Contour ridges on slopes"),
        agents=("crop_scout", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="maize",
        name="Maize",
        category="upland",
        countries=("MM", "TH", "PH", "ID", "VN", "LA", "KH", "TL"),
        season_days=110,
        kc=(0.30, 1.20, 0.60),
        kc_source=FAO56 + " (grain)",
        key_problems=("Fall armyworm", "Drought at tasselling", "Aflatoxin after wet harvest"),
        traditional_practices=("Scout whorls at dawn", "Dry cobs fully before storage"),
        agents=("water_steward", "crop_scout", "pest_watcher", "harvest_planner", "drone_pilot"),
    ),
    CropProfile(
        id="chili",
        name="Chili pepper",
        category="vegetable",
        countries=("ID", "TH", "MM", "VN", "MY", "PH", "LA", "KH", "SG", "BN"),
        season_days=150,
        kc=(0.60, 1.05, 0.90),
        kc_source=FAO56 + " (sweet pepper proxy)",
        key_problems=("Anthracnose fruit rot", "Thrips and viruses", "Price volatility"),
        traditional_practices=("Raised beds with mulch", "Rotate away from solanaceous crops"),
        agents=("water_steward", "crop_scout", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="shallot",
        name="Shallot and onion",
        category="vegetable",
        countries=("ID", "MM", "PH", "TH", "VN"),
        season_days=70,
        kc=(0.70, 1.05, 0.75),
        kc_source=FAO56 + " (dry onion)",
        key_problems=("Beet armyworm", "Purple blotch in humid weather", "Post-harvest rot"),
        traditional_practices=("Cure bulbs in shade", "Hand-collect egg masses"),
        agents=("water_steward", "crop_scout", "pest_watcher", "harvest_planner"),
    ),
    CropProfile(
        id="leafy_greens",
        name="Leafy greens (kangkong, pak choi)",
        category="vegetable",
        countries=tuple(ASEAN_COUNTRIES),
        season_days=35,
        kc=(0.70, 1.00, 0.95),
        kc_source=FAO56 + " (lettuce proxy)",
        key_problems=("Heat bolting", "Flea beetles", "Short shelf life"),
        traditional_practices=("Stagger sowing weekly", "Net houses against heavy rain"),
        agents=("water_steward", "crop_scout", "harvest_planner"),
    ),
)

_BY_ID = {crop.id: crop for crop in CROPS}


def get_crop(crop_id: str) -> CropProfile:
    crop = _BY_ID.get(crop_id)
    if crop is None:
        raise KeyError(f"unknown crop {crop_id!r}")
    return crop


def catalog(country: str | None = None, category: str | None = None) -> list[dict[str, Any]]:
    if country is not None and country not in ASEAN_COUNTRIES:
        raise KeyError(f"unknown ASEAN country code {country!r}")
    if category is not None and category not in CATEGORIES:
        raise KeyError(f"unknown category {category!r}")
    return [
        crop.to_dict()
        for crop in CROPS
        if (country is None or country in crop.countries)
        and (category is None or crop.category == category)
    ]
