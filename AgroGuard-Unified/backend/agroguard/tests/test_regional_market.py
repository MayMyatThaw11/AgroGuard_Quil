"""Unit and Integration Tests for Regional Market Scraper (Shan & Ayeyarwady).

Covers:
1. Normal parsing, canonical resolution, and Myanmar traditional unit conversion.
2. Outlier detection, statistical IQR/Z-score screening, and quarantine logging.
3. Provenance assignment (MEASURED, HISTORICAL_INDEX, UNQUOTED) and anti-hallucination.
4. Integration with Agent Qill's 3x ROI solvency gate and council context enrichment.
"""

import pytest
from datetime import datetime, timezone, timedelta
from app.services.regional_market import (
    RegionalMarketService,
    ProvenanceTag,
    UnquotedReason,
    Region,
    CommodityCategory,
    convert_to_usd_per_tonne,
    convert_from_usd_per_tonne,
    resolve_market_center,
    resolve_commodity,
    clean_numeric_price,
    standardize_unit_token,
    standardize_currency_token,
    OutlierDetector,
    DEFAULT_USD_TO_MMK,
    KG_PER_VISS,
    CROP_BASKET_WEIGHT_KG,
)
from app.services.council.agents.market import MarketAgent


@pytest.fixture
def market_service():
    """Provides a fresh, isolated RegionalMarketService instance for tests."""
    svc = RegionalMarketService()
    svc.clear_cache()
    return svc


# =========================================================================
# 1. NORMAL PARSING & CONVERSION TESTS
# =========================================================================

def test_resolve_market_centers():
    """Verify canonical resolution of Shan and Ayeyarwady trading centers and aliases."""
    # Shan State Centers
    assert resolve_market_center("Taunggyi") == (Region.SHAN, "Taunggyi")
    assert resolve_market_center("taunggyi") == (Region.SHAN, "Taunggyi")
    assert resolve_market_center("Muse") == (Region.SHAN, "Muse")
    assert resolve_market_center("Aungban") == (Region.SHAN, "Aungban")
    assert resolve_market_center("Aung Ban") == (Region.SHAN, "Aungban")
    assert resolve_market_center("Lashio") == (Region.SHAN, "Lashio")

    # Ayeyarwady Delta Centers
    assert resolve_market_center("Maubin") == (Region.AYEYARWADY, "Maubin")
    assert resolve_market_center("Ma-ubin") == (Region.AYEYARWADY, "Maubin")
    assert resolve_market_center("Hinthada") == (Region.AYEYARWADY, "Hinthada")
    assert resolve_market_center("Henzada") == (Region.AYEYARWADY, "Hinthada")
    assert resolve_market_center("Pathein") == (Region.AYEYARWADY, "Pathein")
    assert resolve_market_center("Bassein") == (Region.AYEYARWADY, "Pathein")
    assert resolve_market_center("Mawlamyine/Delta co-op") == (Region.AYEYARWADY, "Mawlamyine/Delta co-op")
    assert resolve_market_center("Delta co-op") == (Region.AYEYARWADY, "Mawlamyine/Delta co-op")
    assert resolve_market_center("Mawlamyine") == (Region.AYEYARWADY, "Mawlamyine/Delta co-op")

    # Unknown center
    assert resolve_market_center("Atlantis") == (None, None)


def test_resolve_commodities():
    """Verify resolution of highland and lowland crops with Burmese and English synonyms."""
    # Highland Shan Crops
    c1, s1 = resolve_commodity("Maize", Region.SHAN)
    assert c1 == "maize"
    assert s1["category"] == CommodityCategory.HIGHLAND_CROP

    c2, _ = resolve_commodity("Corn", Region.SHAN)
    assert c2 == "maize"

    c3, _ = resolve_commodity("Zea Mays", Region.SHAN)
    assert c3 == "maize"

    c4, _ = resolve_commodity("Peanut", Region.SHAN)
    assert c4 == "groundnut"

    c5, _ = resolve_commodity("နှမ်း", Region.SHAN)  # Sesame in Burmese
    assert c5 == "sesame"

    c6, _ = resolve_commodity("Mustard Seed", Region.SHAN)
    assert c6 == "mustard"

    c7, _ = resolve_commodity("Wheat", Region.SHAN)
    assert c7 == "wheat"

    # Ayeyarwady Delta Crops & Aquaculture
    p1, sp1 = resolve_commodity("Paw San", Region.AYEYARWADY)
    assert p1 == "rice_pawsan"
    assert sp1["category"] == CommodityCategory.LOWLAND_PADDY

    p2, _ = resolve_commodity("Paw San Baygyar", Region.AYEYARWADY)
    assert p2 == "rice_pawsan"

    p3, _ = resolve_commodity("Emata", Region.AYEYARWADY)
    assert p3 == "rice_emata"

    p4, sp4 = resolve_commodity("Black Tiger Shrimp", Region.AYEYARWADY)
    assert p4 == "black_tiger_shrimp"
    assert sp4["category"] == CommodityCategory.BRACKISH_AQUACULTURE

    p5, _ = resolve_commodity("Giant Freshwater Prawn", Region.AYEYARWADY)
    assert p5 == "giant_freshwater_prawn"


def test_unit_conversion_viss_to_usd_tonne():
    """Verify deterministic conversion from MMK/viss to USD/tonne matching ASEAN lookup."""
    # Maize quoted at 2,069 MMK/viss at 4500 MMK/USD
    # 2069 / 1.63293 = 1267.048 MMK/kg
    # 1267.048 / 4500 * 1000 = 281.566 USD/tonne (~281.5)
    usd_t = convert_to_usd_per_tonne(
        price=2069.0,
        unit="viss",
        currency="MMK",
        commodity_canonical="maize",
        exchange_rate=4500.0,
    )
    assert 281.0 <= usd_t <= 282.0

    # Expand back
    std = convert_from_usd_per_tonne(usd_t, "maize", exchange_rate=4500.0)
    assert round(std.price_mmk_per_viss) == 2069


def test_unit_conversion_crop_specific_baskets():
    """Verify basket (tin) conversions obey crop-specific weight specifications."""
    # 1 basket of Paddy Rice = 20.87 kg (46 lbs)
    # 1 basket of Maize = 24.49 kg (54 lbs)
    # 1 basket of Wheat = 32.66 kg (72 lbs)
    paddy_usd = convert_to_usd_per_tonne(10.0, "basket", "USD", "rice_pawsan")
    # $10 for 20.87 kg -> $10 / 20.87 * 1000 = $479.16/tonne
    assert 478.0 <= paddy_usd <= 481.0

    maize_usd = convert_to_usd_per_tonne(10.0, "basket", "USD", "maize")
    # $10 for 24.49 kg -> $10 / 24.49 * 1000 = $408.33/tonne
    assert 407.0 <= maize_usd <= 410.0

    wheat_usd = convert_to_usd_per_tonne(10.0, "basket", "USD", "wheat")
    # $10 for 32.66 kg -> $10 / 32.66 * 1000 = $306.18/tonne
    assert 305.0 <= wheat_usd <= 308.0


def test_unit_conversion_commercial_bags():
    """Verify standard 50kg commercial bag conversions."""
    # Paw San rice bag (50kg) at 108,000 MMK
    # 108,000 / 50 = 2160 MMK/kg -> / 4500 = 0.48 USD/kg -> $480.00/tonne
    usd_t = convert_to_usd_per_tonne(108000.0, "bag", "MMK", "rice_pawsan", exchange_rate=4500.0)
    assert usd_t == 480.0

    std = convert_from_usd_per_tonne(usd_t, "rice_pawsan", exchange_rate=4500.0)
    assert std.price_mmk_per_bag == 108000.0


def test_batch_quote_ingestion(market_service):
    """Verify batch ingestion of diverse regional bulletins across Shan and Ayeyarwady."""
    bulletins = [
        {"center": "Taunggyi", "crop": "Maize", "price": 2069.0, "unit": "viss", "currency": "MMK"},
        {"center": "Muse", "crop": "Zea Mays", "price": 285.0, "unit": "tonne", "currency": "USD"},
        {"center": "Aungban", "crop": "Groundnut", "price": 8560.0, "unit": "viss", "currency": "MMK"},
        {"center": "Pathein", "crop": "Paw San", "price": 480.0, "unit": "tonne", "currency": "USD"},
        {"center": "Maubin", "crop": "Emata", "price": 340.0, "unit": "tonne", "currency": "USD"},
        {"center": "Mawlamyine/Delta co-op", "crop": "Black Tiger Shrimp", "price": 9500.0, "unit": "tonne", "currency": "USD"},
        {"center": "Mawlamyine", "crop": "Giant Freshwater Prawn", "price": 52900.0, "unit": "viss", "currency": "MMK"},
    ]

    res = market_service.ingest_quote_batch(bulletins)
    assert res["total_submitted"] == 7
    assert res["accepted_count"] == 7
    assert res["rejected_count"] == 0

    # Verify Taunggyi Maize
    q_tgi = market_service.get_quote("Taunggyi", "Maize", live_only=True)
    assert q_tgi.provenance == ProvenanceTag.MEASURED
    assert q_tgi.standardized is not None
    assert 280.0 <= q_tgi.standardized.price_usd_per_tonne <= 283.0

    # Verify Delta Shrimp
    q_shrimp = market_service.get_quote("Mawlamyine/Delta co-op", "Black Tiger Shrimp", live_only=True)
    assert q_shrimp.provenance == ProvenanceTag.MEASURED
    assert q_shrimp.standardized.price_usd_per_tonne == 9500.0
    assert q_shrimp.standardized.price_usd_per_kg == 9.5


# =========================================================================
# 2. OUTLIER DETECTION & DATA AUTOCLEANING TESTS
# =========================================================================

def test_outlier_corrupt_non_positive_values(market_service):
    """Verify non-positive and corrupt price inputs are quarantined immediately."""
    q_neg = market_service.ingest_raw_quote("Taunggyi", "Maize", -500.0, "viss", "MMK")
    assert q_neg.provenance == ProvenanceTag.UNQUOTED
    assert q_neg.unquoted_reason == UnquotedReason.CORRUPTED_ENTRY
    assert q_neg.standardized is None
    assert q_neg.raw_price is None

    q_zero = market_service.ingest_raw_quote("Taunggyi", "Maize", 0.0, "viss", "MMK")
    assert q_zero.provenance == ProvenanceTag.UNQUOTED
    assert q_zero.unquoted_reason == UnquotedReason.CORRUPTED_ENTRY

    q_none = market_service.ingest_raw_quote("Taunggyi", "Maize", None, "viss", "MMK")
    assert q_none.provenance == ProvenanceTag.UNQUOTED
    assert q_none.unquoted_reason == UnquotedReason.CORRUPTED_ENTRY

    assert len(market_service.quarantine_log) == 3


def test_outlier_extreme_price_shock_rejection(market_service):
    """Verify 10x-100x price shocks or corrupted digits are quarantined."""
    # Baseline Maize is ~281.5 USD/tonne.
    # An erroneous bulletin quoting $5,000 USD/tonne for maize
    q_shock = market_service.ingest_raw_quote("Taunggyi", "Maize", 5000.0, "tonne", "USD")
    assert q_shock.provenance == ProvenanceTag.UNQUOTED
    assert q_shock.unquoted_reason == UnquotedReason.OUTLIER_REJECTED
    assert q_shock.standardized is None
    assert q_shock.raw_price is None

    # Black Tiger Shrimp baseline is ~$9,500. A quote of $15/tonne is absurd
    q_shrimp_low = market_service.ingest_raw_quote("Mawlamyine/Delta co-op", "Black Tiger Shrimp", 15.0, "tonne", "USD")
    assert q_shrimp_low.provenance == ProvenanceTag.UNQUOTED
    assert q_shrimp_low.unquoted_reason == UnquotedReason.OUTLIER_REJECTED

    # Ensure quarantine records contain forensic audit diagnostics
    q_records = market_service.get_quarantine_log()
    assert len(q_records) >= 2
    assert any("Price Shock" in r.reason or "Corridor" in r.reason for r in q_records)


def test_outlier_iqr_and_zscore_screening():
    """Verify statistical IQR and Z-score outlier filters on historical sample sets."""
    historical_maize = [270.0, 275.0, 280.0, 282.0, 285.0, 290.0]

    # Normal observation inside IQR:
    is_out, reason, _ = OutlierDetector.evaluate_quote(283.0, "maize", historical_maize)
    assert is_out is False

    # Outlier: $480.0 is within 3.5x corridor, but clearly an IQR/Z-score shock relative to stable series
    is_out_shock, reason_shock, metrics = OutlierDetector.evaluate_quote(480.0, "maize", historical_maize)
    assert is_out_shock is True
    assert "IQR Outlier" in reason_shock or "Z-Score" in reason_shock or "Corridor" in reason_shock


def test_batch_autocleaning_separates_clean_and_corrupt(market_service):
    """Verify batch ingestion cleanses corrupt records while preserving valid ones."""
    mixed_batch = [
        {"center": "Taunggyi", "crop": "Maize", "price": 281.5, "unit": "tonne", "currency": "USD"},
        {"center": "Taunggyi", "crop": "Maize", "price": -99.0, "unit": "tonne", "currency": "USD"},  # Corrupt
        {"center": "Taunggyi", "crop": "Maize", "price": 99999.0, "unit": "tonne", "currency": "USD"},  # Outlier
        {"center": "Pathein", "crop": "Paw San", "price": 480.0, "unit": "tonne", "currency": "USD"},  # Valid
    ]
    res = market_service.ingest_quote_batch(mixed_batch)
    assert res["accepted_count"] == 2
    assert res["rejected_count"] == 2
    assert len(market_service.quarantine_log) == 2


# =========================================================================
# 3. PROVENANCE ASSIGNMENT & ANTI-HALLUCINATION TESTS
# =========================================================================

def test_provenance_measured_for_fresh_live_quote(market_service):
    """Freshly scraped quote has MEASURED provenance."""
    market_service.ingest_raw_quote("Aungban", "Sesame", 2088.0, "tonne", "USD")
    q = market_service.get_quote("Aungban", "Sesame", live_only=True)
    assert q.provenance == ProvenanceTag.MEASURED
    assert q.standardized is not None


def test_provenance_historical_index_fallback(market_service):
    """When no live quote exists, default mode returns verified HISTORICAL_INDEX."""
    q = market_service.get_quote("Taunggyi", "Wheat", live_only=False)
    assert q.provenance == ProvenanceTag.HISTORICAL_INDEX
    assert q.standardized is not None
    assert 350.0 <= q.standardized.price_usd_per_tonne <= 370.0


def test_provenance_unquoted_when_live_only_and_feed_absent(market_service):
    """Under live_only=True, missing feed produces explicit UNQUOTED with no price fabrication."""
    q = market_service.get_quote("Taunggyi", "Wheat", live_only=True)
    assert q.provenance == ProvenanceTag.UNQUOTED
    assert q.unquoted_reason == UnquotedReason.UNQUOTED_MARKET
    assert q.standardized is None
    assert q.raw_price is None


def test_provenance_unquoted_when_feed_stale(market_service):
    """Under live_only=True, quote older than max_age_days returns STALE_FEED."""
    stale_date = (datetime.now(timezone.utc) - timedelta(days=12)).isoformat()
    market_service.ingest_raw_quote("Pathein", "Paw San", 480.0, "tonne", "USD", quote_timestamp=stale_date)

    # In live_only mode: stale feed must not be passed off as current
    q_live = market_service.get_quote("Pathein", "Paw San", live_only=True, max_age_days=7)
    assert q_live.provenance == ProvenanceTag.UNQUOTED
    assert q_live.unquoted_reason == UnquotedReason.STALE_FEED
    assert q_live.standardized is None

    # In fallback mode: gracefully falls back to HISTORICAL_INDEX
    q_hist = market_service.get_quote("Pathein", "Paw San", live_only=False)
    assert q_hist.provenance == ProvenanceTag.HISTORICAL_INDEX


def test_anti_hallucination_geographic_and_commodity_mismatch(market_service):
    """Strictly reject mismatched commodity-region pairings and unsupported centers."""
    # Highland center cannot quote brackish aquaculture
    q_tgi_shrimp = market_service.get_quote("Taunggyi", "Black Tiger Shrimp")
    assert q_tgi_shrimp.provenance == ProvenanceTag.UNQUOTED
    assert q_tgi_shrimp.unquoted_reason == UnquotedReason.UNSUPPORTED_COMMODITY
    assert q_tgi_shrimp.standardized is None

    # Delta center cannot quote highland wheat
    q_maubin_wheat = market_service.get_quote("Maubin", "Wheat")
    assert q_maubin_wheat.provenance == ProvenanceTag.UNQUOTED
    assert q_maubin_wheat.unquoted_reason == UnquotedReason.UNSUPPORTED_COMMODITY
    assert q_maubin_wheat.standardized is None

    # Fake market center
    q_fake_center = market_service.get_quote("ElDorado", "Maize")
    assert q_fake_center.provenance == ProvenanceTag.UNQUOTED
    assert q_fake_center.unquoted_reason == UnquotedReason.UNSUPPORTED_CENTER
    assert q_fake_center.standardized is None

    # Fake commodity
    q_fake_crop = market_service.get_quote("Pathein", "Kryptonite")
    assert q_fake_crop.provenance == ProvenanceTag.UNQUOTED
    assert q_fake_crop.unquoted_reason == UnquotedReason.UNSUPPORTED_COMMODITY
    assert q_fake_crop.standardized is None


# =========================================================================
# 4. AGENT QILL ECONOMIC EVALUATIONS & SOLVENCY GATE TESTS
# =========================================================================

def test_qill_solvency_approved_within_3x_roi(market_service):
    """Qill approves targeted spend when BCR >= 3.0x and within budget."""
    # Pathein Paw San quote: $480/ton. Expected yield: 4.2 ton/ha.
    # Gross value: $2016.00/ha. At-risk revenue (25% loss): $504.00/ha.
    # 3x ROI Ceiling: $504 / 3.0 = $168.00/ha. Budget: $100/ha. Max viable spend = min(100, 168) = $100.
    quote = market_service.get_quote("Pathein", "Paw San")
    assessment = market_service.evaluate_qill_solvency(
        quote=quote,
        expected_yield_ton_ha=4.2,
        remaining_budget_usd_ha=100.0,
        proposed_spend_usd_ha=13.50,  # Bacillus micro-zone spot treatment
        projected_loss_pct=0.25,
    )
    assert assessment.is_solvency_approved is True
    assert assessment.veto_triggered is False
    assert assessment.bcr_ratio >= 3.0
    assert assessment.max_viable_spend_usd_ha == 100.0


def test_qill_solvency_veto_violates_3x_roi(market_service):
    """Qill triggers ECONOMIC_VETO when spend violates 3x ROI ceiling."""
    # Maize at Taunggyi: $281.50/ton. Expected yield: 2.0 ton/ha.
    # Gross value: $563.00/ha. At-risk revenue (25%): $140.75/ha.
    # 3x ROI Ceiling spend: $140.75 / 3.0 = $46.92/ha. Budget: $100/ha.
    quote = market_service.get_quote("Taunggyi", "Maize")
    assessment = market_service.evaluate_qill_solvency(
        quote=quote,
        expected_yield_ton_ha=2.0,
        remaining_budget_usd_ha=100.0,
        proposed_spend_usd_ha=58.00,  # Expensive blanket chemical ($58 > $46.92)
        projected_loss_pct=0.25,
    )
    assert assessment.is_solvency_approved is False
    assert assessment.veto_triggered is True
    assert "ECONOMIC_VETO" in assessment.veto_reason
    assert "3x ROI ceiling" in assessment.veto_reason


def test_qill_solvency_veto_on_unquoted_price(market_service):
    """Anti-hallucination: Qill refuses speculative spend on UNQUOTED market quote."""
    q_unq = market_service.get_quote("Taunggyi", "Black Tiger Shrimp")  # Mismatched commodity
    assessment = market_service.evaluate_qill_solvency(
        quote=q_unq,
        expected_yield_ton_ha=4.2,
        remaining_budget_usd_ha=100.0,
        proposed_spend_usd_ha=15.0,
    )
    assert assessment.is_solvency_approved is False
    assert assessment.veto_triggered is True
    assert assessment.max_viable_spend_usd_ha == 0.0
    assert "UNQUOTED" in assessment.veto_reason


def test_enrich_council_context_end_to_end_with_market_agent(market_service):
    """Verify enriched context integrates seamlessly with MarketAgent's economic evaluation."""
    context = {
        "crop": "Paw San",
        "stage": "Ripening",
        "days_to_harvest": 6,
        "expected_yield_tons_ha": 4.2,
        "remaining_budget_usd_per_ha": 50.0,
        "market_center": "Maubin",
        "scenario_preset": "pre_harvest_rain",
        "rain_forecast_48h_mm": 25.0,
    }

    enriched = market_service.enrich_council_context(context)

    # 1. Grounded context verification
    assert enriched["spot_price_usd_ton"] == 480.0
    assert enriched["crop_economic_value_usd_ha"] == 2016.0  # 4.2 * 480
    assert enriched["market_provenance"] == ProvenanceTag.HISTORICAL_INDEX.value

    # 2. MarketAgent evaluation
    market_assessment = MarketAgent.evaluate(enriched)
    assert market_assessment.stance == "FUND"
    assert "Net financial advantage of early harvest" in market_assessment.unit_economics_impact
    # Dockage penalty: 35% of $2016 = $705.6. Dry weight loss: 4% of $2016 = $80.64. Net: +$625.0
    assert "$705.6" in market_assessment.core_argument
    assert "$625.0" in market_assessment.unit_economics_impact


def test_market_summary_returns_all_regional_centers(market_service):
    """Verify full regional market summary covers both Shan and Ayeyarwady centers."""
    summary = market_service.get_market_summary()
    assert "Shan" in summary
    assert "Ayeyarwady" in summary

    shan_centers = summary["Shan"]
    assert set(shan_centers.keys()) == {"Taunggyi", "Muse", "Aungban", "Lashio"}

    ayeyarwady_centers = summary["Ayeyarwady"]
    assert set(ayeyarwady_centers.keys()) == {"Maubin", "Hinthada", "Pathein", "Mawlamyine/Delta co-op"}


# =========================================================================
# 5. BURMESE SCRIPT, BULLETIN SCRAPER & DEEP EDGE CASES
# =========================================================================

def test_burmese_center_and_currency_resolution():
    """Verify resolution of Burmese script trading centers, currencies, and units."""
    # Shan trading centers in Burmese
    assert resolve_market_center("တောင်ကြီး") == (Region.SHAN, "Taunggyi")
    assert resolve_market_center("မူဆယ်") == (Region.SHAN, "Muse")
    assert resolve_market_center("အောင်ပန်း") == (Region.SHAN, "Aungban")
    assert resolve_market_center("လားရှိုး") == (Region.SHAN, "Lashio")

    # Ayeyarwady trading centers in Burmese
    assert resolve_market_center("မအူပင်") == (Region.AYEYARWADY, "Maubin")
    assert resolve_market_center("ဟင်္သာတ") == (Region.AYEYARWADY, "Hinthada")
    assert resolve_market_center("ပုသိမ်") == (Region.AYEYARWADY, "Pathein")
    assert resolve_market_center("မော်လမြိုင်") == (Region.AYEYARWADY, "Mawlamyine/Delta co-op")
    assert resolve_market_center("ဒယ်တာ") == (Region.AYEYARWADY, "Mawlamyine/Delta co-op")

    # Currency tokens in Burmese
    assert standardize_currency_token("ကျပ်") == "MMK"
    assert standardize_currency_token("ဒေါ်လာ") == "USD"

    # Unit tokens in Burmese
    assert standardize_unit_token("ပိဿာ") == "viss"
    assert standardize_unit_token("တင်း") == "basket"
    assert standardize_unit_token("အိတ်") == "bag"
    assert standardize_unit_token("ပြည်") == "pyi"
    assert standardize_unit_token("ကီလို") == "kg"
    assert standardize_unit_token("တန်") == "tonne"


def test_hinthada_supports_brackish_aquaculture(market_service):
    """Verify Hinthada (Ayeyarwady Delta) supports brackish aquaculture and lowland paddy."""
    q_prawn = market_service.get_quote("Hinthada", "Giant Freshwater Prawn")
    assert q_prawn.provenance == ProvenanceTag.HISTORICAL_INDEX
    assert q_prawn.is_valid is True
    assert q_prawn.standardized is not None
    assert q_prawn.standardized.price_usd_per_tonne == 7200.0

    q_shrimp = market_service.get_quote("Hinthada", "Black Tiger Shrimp")
    assert q_shrimp.provenance == ProvenanceTag.HISTORICAL_INDEX
    assert q_shrimp.is_valid is True
    assert q_shrimp.standardized.price_usd_per_tonne == 9500.0


def test_zero_variance_iqr_autocleaning_guard():
    """Verify that repeated benchmark values (IQR == 0) do not falsely quarantine minor normal price fluctuations."""
    # Degenerate historical sample with identical price quotes
    fixed_history = [280.0, 280.0, 280.0, 280.0]

    # A normal $281.0 price (+0.35% fluctuation) should NOT be rejected as an IQR outlier
    is_outlier, reason, metrics = OutlierDetector.evaluate_quote(281.0, "maize", fixed_history)
    assert is_outlier is False
    assert "Valid" in reason

    # A severe jump ($480.0, +71% shock) SHOULD still be rejected
    is_shock, shock_reason, _ = OutlierDetector.evaluate_quote(480.0, "maize", fixed_history)
    assert is_shock is True
    assert "IQR Outlier" in shock_reason or "Corridor" in shock_reason


def test_rolling_price_history_and_autocleaning_stream(market_service):
    """Verify sequential live quote ingestion updates rolling history and detects spikes without manual sample passing."""
    # Ingest 4 stable quotes for Taunggyi Maize
    market_service.ingest_raw_quote("Taunggyi", "Maize", 280.0, "tonne", "USD")
    market_service.ingest_raw_quote("Taunggyi", "Maize", 281.0, "tonne", "USD")
    market_service.ingest_raw_quote("Taunggyi", "Maize", 282.0, "tonne", "USD")
    market_service.ingest_raw_quote("Taunggyi", "Maize", 280.5, "tonne", "USD")

    # History should contain these 4 observations
    hist = market_service.price_history.get(("Taunggyi", "maize"))
    assert hist is not None
    assert len(hist) >= 4

    # 5th quote arrives at $440/tonne (a sudden 57% spike). Notice historical_sample is NOT passed!
    q_spike = market_service.ingest_raw_quote("Taunggyi", "Maize", 440.0, "tonne", "USD")
    assert q_spike.provenance == ProvenanceTag.UNQUOTED
    assert q_spike.unquoted_reason == UnquotedReason.OUTLIER_REJECTED
    assert any("Q-OUT-Taunggyi-maize" in r.quarantine_id for r in market_service.quarantine_log)


def test_scrape_bulletin_text_multi_center_multi_commodity(market_service):
    """Verify parsing and ingestion of raw multi-line market bulletin text."""
    bulletin = """
    Taunggyi Commodity Exchange (2026-10-28):
    - Maize: 2,069 MMK/viss
    - Groundnut: 8,560 MMK/viss
    - Mustard: 790 USD/tonne
    Pathein Port Depot:
    - Paw San: 108,000 MMK/bag
    - Emata: 340 USD/tonne
    Mawlamyine/Delta co-op:
    - Black Tiger Shrimp: 9,500 USD/tonne
    - Giant Freshwater Prawn: 7,200 USD/tonne
    """

    quotes = market_service.scrape_bulletin_text(bulletin)
    assert len(quotes) == 7
    assert all(q.is_valid for q in quotes)
    assert all(q.provenance == ProvenanceTag.MEASURED for q in quotes)

    # Verify live feed retrieval reflects the bulletin quotes
    q_tgi_maize = market_service.get_quote("Taunggyi", "Maize", live_only=True)
    assert 281.0 <= q_tgi_maize.standardized.price_usd_per_tonne <= 282.0

    q_pathein_pawsan = market_service.get_quote("Pathein", "Paw San", live_only=True)
    assert q_pathein_pawsan.standardized.price_usd_per_tonne == 480.0

    q_delta_prawn = market_service.get_quote("Mawlamyine/Delta co-op", "Giant Freshwater Prawn", live_only=True)
    assert q_delta_prawn.standardized.price_usd_per_tonne == 7200.0


def test_scrape_bulletin_text_burmese(market_service):
    """Verify parsing of Burmese language bulletin text with Burmese numerals."""
    burmese_bulletin = "တောင်ကြီး ကုန်စည်ဒိုင်: ပြောင်း ၂၀၆၉ ကျပ်/ပိဿာ၊ နှမ်း ၉၄၀၀ ကျပ်/ကီလို"
    quotes = market_service.scrape_bulletin_text(burmese_bulletin)
    assert len(quotes) >= 1

    # Verify Taunggyi Maize quote was ingested
    q_maize = market_service.get_quote("တောင်ကြီး", "ပြောင်း", live_only=True)
    assert q_maize.provenance == ProvenanceTag.MEASURED
    assert q_maize.standardized is not None
    assert 281.0 <= q_maize.standardized.price_usd_per_tonne <= 282.0


def test_unquoted_explicit_null_and_api_dict(market_service):
    """Verify explicit null / None values are returned on UNQUOTED quotes."""
    q_unq = market_service.get_quote("Taunggyi", "Black Tiger Shrimp")  # Mismatched commodity
    assert q_unq.provenance == ProvenanceTag.UNQUOTED
    assert q_unq.price_usd_per_tonne is None
    assert q_unq.price_mmk_per_viss is None
    assert q_unq.price_mmk_per_basket is None

    api_dict = q_unq.to_api_dict()
    assert api_dict["price_usd_per_tonne"] is None
    assert api_dict["price_mmk_per_viss"] is None
    assert api_dict["provenance"] == "UNQUOTED"
    assert api_dict["unquoted_reason"] == "unsupported_commodity"


def test_qill_solvency_cultural_mitigation_on_unquoted(market_service):
    """Verify Agent Qill approves zero-cash cultural mitigation ($0) on UNQUOTED quotes while vetoing cash spend."""
    q_unq = market_service.get_quote("Taunggyi", "Black Tiger Shrimp")

    # Positive cash spend should be VETOED
    veto_assessment = market_service.evaluate_qill_solvency(
        quote=q_unq,
        expected_yield_ton_ha=4.2,
        remaining_budget_usd_ha=100.0,
        proposed_spend_usd_ha=20.0,
    )
    assert veto_assessment.is_solvency_approved is False
    assert veto_assessment.veto_triggered is True
    assert "ECONOMIC_VETO" in veto_assessment.veto_reason

    # Zero-cash cultural mitigation ($0.0) should be APPROVED
    cultural_assessment = market_service.evaluate_qill_solvency(
        quote=q_unq,
        expected_yield_ton_ha=4.2,
        remaining_budget_usd_ha=100.0,
        proposed_spend_usd_ha=0.0,
    )
    assert cultural_assessment.is_solvency_approved is True
    assert cultural_assessment.veto_triggered is False
    assert cultural_assessment.proposed_spend_usd_ha == 0.0
    assert "Approved for zero-cash cultural mitigation" in cultural_assessment.qill_recommendation


def test_local_datasets_yield_and_price_baselines(market_service):
    """Verify local CSV datasets (Shan State, Township, ASEAN) were ingested during initialization."""
    # 1. Shan State yields loaded
    assert len(market_service.regional_yield_stats) > 0
    tgi_maize_yield = market_service.regional_yield_stats.get(("Taunggyi", "maize"))
    assert tgi_maize_yield is not None
    assert 2.0 <= tgi_maize_yield <= 5.5

    # 2. Pathein historical price and yield data loaded
    pathein_rice_yield = market_service.regional_yield_stats.get(("Pathein", "rice_pawsan"))
    assert pathein_rice_yield is not None
    assert 3.5 <= pathein_rice_yield <= 5.5

    pathein_rice_hist = market_service.price_history.get(("Pathein", "rice_pawsan"))
    assert pathein_rice_hist is not None
    assert len(pathein_rice_hist) > 0


def test_clean_numeric_price_various_formats():
    """Verify clean_numeric_price handles strings with formatting, commas, currency symbols, and Burmese digits."""
    assert clean_numeric_price(2069) == 2069.0
    assert clean_numeric_price("2,069") == 2069.0
    assert clean_numeric_price("108,000 MMK") == 108000.0
    assert clean_numeric_price("$480.50") == 480.50
    assert clean_numeric_price("၂၀၆၉") == 2069.0
    assert clean_numeric_price(None) is None
    assert clean_numeric_price(-50.0) == -50.0
    assert clean_numeric_price("invalid_text") is None
