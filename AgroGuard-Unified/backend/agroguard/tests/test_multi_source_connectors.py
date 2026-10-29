"""Unit and Integration Tests for Multi-Source Market Scrapers, Clean Market Intelligence, and Vault Storage.

Covers:
1. WebPortalConnector:
   - Official commodity association bulletins (Bayintnaung Wholesale Center, MPBMA, DOA).
   - HTML table bulletins with Burmese and English column headers.
   - Plaintext bulletin parsing.
   - Provenance tagging with MEASURED_PORTAL and 0.95 confidence score.
   - Statistical outlier quarantine for price shocks breaching physical corridors.
2. SocialCommunityConnector:
   - Facebook Yangon Wholesale Group posts with Burmese script and digits (e.g. ၂၀၆၉, ၅၄၀၀).
   - Sanitization of seller phone numbers (e.g. 09..., +959..., ၀၉...) to avoid spurious prices.
   - Telegram agricultural broadcasts and regional trader channels.
   - Auto-detection of market centers (Bayintnaung, Taunggyi, Pathein).
   - Provenance tagging with MEASURED_COMMUNITY_POST and 0.85 confidence score.
3. BusinessSoftwareConnector:
   - Odoo ERP purchase order webhooks.
   - ERPNext Item Price and Purchase Invoice webhooks.
   - Agricultural cooperative CSV trade receipts.
   - Accounting JSON transaction receipts.
   - Auto-detecting multi-format dispatcher (ingest_erp_payload).
   - Provenance tagging with MEASURED_ERP and 0.98 confidence score.
4. CleanMarketIntelligence Schema & LLM Facts:
   - Complete schema transformation (MMK/kg, MMK/viss, USD/tonne, freshness duration).
   - Zero-markup high-density economic summary for Claude / Agent Qill consumption.
   - Staleness detection based on configurable thresholds.
   - Quarantined outlier and unquoted market intelligence rendering.
5. Vault Export & Storage:
   - export_clean_feed_json and load_clean_market_feed round-trip testing.
   - export_clean_vault_markdown with YAML frontmatter and structured headers.
6. MarketDemandService Integration:
   - analyze_glut_risk_from_clean_intel with MEASURED_PORTAL, MEASURED_COMMUNITY_POST, and MEASURED_ERP.
   - Outlier safety and fallback protection.
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
import pytest

from app.services.regional_market import (
    RegionalMarketService,
    ProvenanceTag,
    ValidationStamp,
    UnquotedReason,
    Region,
    CommodityCategory,
    CleanMarketIntelligence,
    MarketQuote,
    WebPortalConnector,
    SocialCommunityConnector,
    BusinessSoftwareConnector,
)
from app.services.market_demand import (
    MarketDemandService,
    DemandProvenanceTag,
    GlutRiskLevel,
    market_demand_service,
)


@pytest.fixture
def market_service():
    """Provides a fresh, isolated RegionalMarketService instance for tests."""
    svc = RegionalMarketService()
    svc.clear_cache()
    return svc


# =========================================================================
# 1. WEB PORTAL CONNECTOR TESTS
# =========================================================================

def test_web_portal_html_table_parsing_bayintnaung(market_service):
    """Verify HTML bulletin table parsing for Bayintnaung pulses with Burmese headers."""
    html_content = """
    <html>
    <head><title>Bayintnaung Wholesale Center Daily Bulletin</title></head>
    <body>
        <h1>ဘုရင့်နောင် ကုန်စည်ဒိုင် နေ့စဉ်ပေါက်ဈေး (၂၀၂၆-၁၀-၂၈)</h1>
        <table class="market-table">
            <thead>
                <tr>
                    <th>သီးနှံအမည်</th>
                    <th>ပေါက်ဈေး</th>
                    <th>ယူနစ်</th>
                    <th>ငွေကြေး</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>မတ်ပဲ (FAQ)</td>
                    <td>5,400</td>
                    <td>ပိဿာ</td>
                    <td>ကျပ်</td>
                </tr>
                <tr>
                    <td>ပဲတီစိမ်း (ရွှေဝါ)</td>
                    <td>5,000</td>
                    <td>ပိဿာ</td>
                    <td>ကျပ်</td>
                </tr>
                <tr>
                    <td>ပဲစင်းငုံနီ</td>
                    <td>6,500</td>
                    <td>ပိဿာ</td>
                    <td>ကျပ်</td>
                </tr>
            </tbody>
        </table>
    </body>
    </html>
    """
    quotes = market_service.ingest_portal_bulletin(
        content=html_content,
        portal_name="Bayintnaung Wholesale Center",
        default_center="Bayintnaung",
        bulletin_date="2026-10-28T09:00:00Z",
    )

    assert len(quotes) == 3

    # 1. Black Gram / Matpe
    q_matpe = next(q for q in quotes if q.commodity_canonical == "black_gram")
    assert q_matpe.market_center == "Bayintnaung"
    assert q_matpe.region == Region.YANGON
    assert q_matpe.provenance == ProvenanceTag.MEASURED_PORTAL
    assert q_matpe.confidence_score == 0.95
    assert q_matpe.validation_stamp == ValidationStamp.VALIDATED_CORRIDOR
    assert q_matpe.is_valid is True
    assert q_matpe.price_mmk_per_viss == pytest.approx(5400.0, abs=0.5)
    assert q_matpe.price_usd_per_tonne is not None
    # 5400 MMK/viss / 1.63293 kg/viss = 3307 MMK/kg -> ~ $734.9 / MT
    assert 720.0 <= q_matpe.price_usd_per_tonne <= 750.0

    # 2. Green Gram / Mung Bean
    q_mung = next(q for q in quotes if q.commodity_canonical == "green_gram")
    assert q_mung.market_center == "Bayintnaung"
    assert q_mung.provenance == ProvenanceTag.MEASURED_PORTAL
    assert q_mung.price_mmk_per_viss == pytest.approx(5000.0, abs=0.5)
    assert 670.0 <= q_mung.price_usd_per_tonne <= 700.0

    # 3. Pigeon Pea
    q_toor = next(q for q in quotes if q.commodity_canonical == "pigeon_pea")
    assert q_toor.market_center == "Bayintnaung"
    assert q_toor.provenance == ProvenanceTag.MEASURED_PORTAL
    assert q_toor.price_mmk_per_viss == pytest.approx(6500.0, abs=0.5)
    assert 870.0 <= q_toor.price_usd_per_tonne <= 900.0


def test_web_portal_english_html_table(market_service):
    """Verify HTML bulletin parsing with English headers and inline market centers."""
    html_content = """
    <table>
        <tr>
            <th>Commodity</th>
            <th>Market</th>
            <th>Price</th>
            <th>Unit</th>
            <th>Currency</th>
        </tr>
        <tr>
            <td>Maize</td>
            <td>Taunggyi</td>
            <td>2,069</td>
            <td>viss</td>
            <td>MMK</td>
        </tr>
        <tr>
            <td>Paw San Rice</td>
            <td>Pathein</td>
            <td>3,500</td>
            <td>viss</td>
            <td>MMK</td>
        </tr>
    </table>
    """
    quotes = market_service.ingest_portal_bulletin(
        content=html_content,
        portal_name="National Agricultural Exchange Bulletin",
        default_center="Bayintnaung",
    )

    assert len(quotes) == 2

    q_maize = next(q for q in quotes if q.commodity_canonical == "maize")
    assert q_maize.market_center == "Taunggyi"
    assert q_maize.region == Region.SHAN
    assert q_maize.provenance == ProvenanceTag.MEASURED_PORTAL
    assert q_maize.price_mmk_per_viss == pytest.approx(2069.0, abs=0.5)

    q_rice = next(q for q in quotes if q.commodity_canonical == "rice_pawsan")
    assert q_rice.market_center == "Pathein"
    assert q_rice.region == Region.AYEYARWADY
    assert q_rice.provenance == ProvenanceTag.MEASURED_PORTAL
    assert q_rice.price_mmk_per_viss == pytest.approx(3500.0, abs=0.5)


def test_web_portal_text_bulletin_parsing(market_service):
    """Verify plaintext association bulletins parsing (MPBMA / DOA)."""
    bulletin_text = """
    Myanmar Pulses & Beans Merchants Association (MPBMA)
    Daily Trade Bulletin - Bayintnaung Wholesale Center
    Date: 2026-10-27
    Matpe (FAQ): 5400 MMK/viss
    Green Gram (Special): 5000 MMK/viss
    Chickpea: 5200 MMK/viss
    """
    quotes = market_service.ingest_portal_bulletin(
        content=bulletin_text,
        portal_name="MPBMA Official Bulletin",
        default_center="Bayintnaung",
    )

    assert len(quotes) >= 3
    for q in quotes:
        assert q.provenance == ProvenanceTag.MEASURED_PORTAL
        assert q.confidence_score == 0.95
        assert q.is_valid is True
        assert q.market_center == "Bayintnaung"


def test_web_portal_outlier_quarantine(market_service):
    """Verify portal quote with absurd shock price is quarantined with QUARANTINED_OUTLIER."""
    html_content = """
    <table>
        <tr>
            <th>သီးနှံအမည်</th>
            <th>ပေါက်ဈေး</th>
            <th>ယူနစ်</th>
            <th>ငွေကြေး</th>
        </tr>
        <tr>
            <td>မတ်ပဲ (FAQ)</td>
            <td>54,000</td>
            <td>ပိဿာ</td>
            <td>ကျပ်</td>
        </tr>
    </table>
    """
    quotes = market_service.ingest_portal_bulletin(
        content=html_content,
        portal_name="Corrupt Feed Test",
        default_center="Bayintnaung",
    )

    assert len(quotes) == 1
    q = quotes[0]
    assert q.is_valid is False
    assert q.unquoted_reason == UnquotedReason.OUTLIER_REJECTED
    assert q.validation_stamp == ValidationStamp.QUARANTINED_OUTLIER
    assert q.confidence_score == 0.0

    # Ensure recorded in quarantine log
    q_log = market_service.get_quarantine_log()
    assert len(q_log) >= 1
    assert "corridor breach" in q_log[-1].reason.lower() or "outlier" in q_log[-1].reason.lower()


# =========================================================================
# 2. SOCIAL COMMUNITY CONNECTOR TESTS (FB YANGON, TELEGRAM)
# =========================================================================

def test_social_community_facebook_post_parsing(market_service):
    """Verify Facebook Yangon trader post parsing with Burmese digits and phone sanitization."""
    # Post contains Burmese digits, price, and seller phone numbers that must NOT be confused with price!
    fb_post = (
        "ရန်ကုန် ဘုရင့်နောင် ကုန်စည်ဒိုင် မတ်ပဲ ၁ ပိဿာ ၅၄၀၀ ကျပ် ဖြင့် အရောင်းအဝယ်ဖြစ်နေပါသည်။ "
        "အိတ် ၅၀၀ အသင့်ရှိသည်။ ဆက်သွယ်ရန် ၀၉၄၅၀၀၁၂၃၄၅ ၊ 09-791234567"
    )
    quotes = market_service.ingest_community_post(
        post_text=fb_post,
        channel="Facebook Yangon Wholesale Traders Group",
        default_center="Bayintnaung",
    )

    assert len(quotes) == 1
    q = quotes[0]
    assert q.market_center == "Bayintnaung"
    assert q.commodity_canonical == "black_gram"
    assert q.provenance == ProvenanceTag.MEASURED_COMMUNITY_POST
    assert q.confidence_score == 0.85
    assert q.price_mmk_per_viss == pytest.approx(5400.0, abs=0.5)
    assert q.is_valid is True
    assert q.validation_stamp == ValidationStamp.VALIDATED_CORRIDOR


def test_social_community_telegram_broadcast(market_service):
    """Verify Telegram agricultural broadcast parsing with English text and Burmese digits."""
    tg_post = (
        "Taunggyi Corn & Grain Traders Broadcast:\n"
        "Maize spot rate today is 2,069 MMK per viss.\n"
        "Warehouse inquiries: Tel 09-987654321, 200 bags left."
    )
    quotes = market_service.ingest_community_post(
        post_text=tg_post,
        channel="Telegram Shan Agri Broadcast",
        default_center="Taunggyi",
    )

    assert len(quotes) == 1
    q = quotes[0]
    assert q.market_center == "Taunggyi"
    assert q.commodity_canonical == "maize"
    assert q.provenance == ProvenanceTag.MEASURED_COMMUNITY_POST
    assert q.confidence_score == 0.85
    assert q.price_mmk_per_viss == pytest.approx(2069.0, abs=0.5)
    assert q.is_valid is True


def test_social_community_feed_batch_ingestion(market_service):
    """Verify batch ingestion of multiple social posts across Yangon, Shan, and Delta."""
    posts = [
        {
            "text": "ဘုရင့်နောင် ပေါက်ဈေး: ပဲတီစိမ်း ၅၀၀၀ ကျပ်/ပိဿာ ဖုန်း ၀၉၂၅၀၀၀၀၀၀၀",
            "channel": "Facebook Pulses Hub",
            "center": "Bayintnaung",
        },
        {
            "text": "Pathein wholesale update: Paw San rice 3500 MMK/viss, call 09-12345678",
            "channel": "Viber Delta Agri Traders",
            "center": "Pathein",
        },
    ]
    quotes = market_service.ingest_social_feed(posts)
    assert len(quotes) == 2

    q_mung = next(q for q in quotes if q.commodity_canonical == "green_gram")
    assert q_mung.price_mmk_per_viss == pytest.approx(5000.0, abs=0.5)
    assert q_mung.provenance == ProvenanceTag.MEASURED_COMMUNITY_POST

    q_rice = next(q for q in quotes if q.commodity_canonical == "rice_pawsan")
    assert q_rice.price_mmk_per_viss == pytest.approx(3500.0, abs=0.5)
    assert q_rice.provenance == ProvenanceTag.MEASURED_COMMUNITY_POST


# =========================================================================
# 3. BUSINESS SOFTWARE & ERP CONNECTOR TESTS
# =========================================================================

def test_odoo_webhook_ingestion(market_service):
    """Verify Odoo ERP purchase order webhook ingestion with multi-line items."""
    odoo_payload = {
        "warehouse": "Pathein Central Rice Mill",
        "currency_id": "MMK",
        "date_order": "2026-10-25T10:00:00Z",
        "company_id": "Delta Agro Cooperative Ltd",
        "order_lines": [
            {"product_name": "Paw San Rice", "price_unit": 3800.0, "product_uom": "viss"},
            {"product_name": "Emata Rice", "price_unit": 2700.0, "product_uom": "viss"},
        ],
    }
    quotes = market_service.ingest_odoo_webhook(odoo_payload, default_center="Pathein")
    assert len(quotes) == 2

    for q in quotes:
        assert q.provenance == ProvenanceTag.MEASURED_ERP
        assert q.confidence_score == 0.98
        assert q.market_center == "Pathein"
        assert q.is_valid is True
        assert q.validation_stamp == ValidationStamp.VALIDATED_CORRIDOR

    q_pawsan = next(q for q in quotes if q.commodity_canonical == "rice_pawsan")
    assert q_pawsan.price_mmk_per_viss == pytest.approx(3800.0, abs=0.5)

    q_emata = next(q for q in quotes if q.commodity_canonical == "rice_emata")
    assert q_emata.price_mmk_per_viss == pytest.approx(2700.0, abs=0.5)


def test_erpnext_item_price_and_invoice_webhooks(market_service):
    """Verify ERPNext Item Price and Purchase Invoice webhook handlers."""
    # 1. Item Price Webhook
    erpnext_price_payload = {
        "doctype": "Item Price",
        "market_center": "Taunggyi",
        "item_name": "Maize Grain",
        "price_list_rate": 2069.0,
        "uom": "viss",
        "currency": "MMK",
        "price_list": "Standard Buying",
    }
    quotes1 = market_service.ingest_erpnext_webhook(erpnext_price_payload, default_center="Taunggyi")
    assert len(quotes1) == 1
    assert quotes1[0].provenance == ProvenanceTag.MEASURED_ERP
    assert quotes1[0].commodity_canonical == "maize"
    assert quotes1[0].price_mmk_per_viss == pytest.approx(2069.0, abs=0.5)

    # 2. Purchase Invoice Webhook
    erpnext_invoice_payload = {
        "doctype": "Purchase Invoice",
        "market_center": "Bayintnaung",
        "currency": "MMK",
        "items": [
            {"item_name": "Black Gram / Matpe", "rate": 5400.0, "uom": "viss"},
            {"item_name": "Pigeon Pea", "rate": 6500.0, "uom": "viss"},
        ],
    }
    quotes2 = market_service.ingest_erpnext_webhook(erpnext_invoice_payload, default_center="Bayintnaung")
    assert len(quotes2) == 2
    assert quotes2[0].provenance == ProvenanceTag.MEASURED_ERP
    assert quotes2[1].provenance == ProvenanceTag.MEASURED_ERP


def test_cooperative_trade_receipts_csv(market_service):
    """Verify parsing of agricultural cooperative CSV transaction receipts."""
    csv_data = (
        "date,location,commodity,price,unit,currency,coop_name\n"
        "2026-10-28,Bayintnaung,Matpe,5400,viss,MMK,Delta Bean Cooperative\n"
        "2026-10-28,Taunggyi,Sesame,9400,kg,MMK,Shan Farmers Alliance\n"
    )
    quotes = market_service.ingest_trade_receipts_csv(csv_data)
    assert len(quotes) == 2

    q_matpe = next(q for q in quotes if q.commodity_canonical == "black_gram")
    assert q_matpe.market_center == "Bayintnaung"
    assert q_matpe.price_mmk_per_viss == pytest.approx(5400.0, abs=0.5)
    assert q_matpe.provenance == ProvenanceTag.MEASURED_ERP

    q_sesame = next(q for q in quotes if q.commodity_canonical == "sesame")
    assert q_sesame.market_center == "Taunggyi"
    assert q_sesame.price_mmk_per_kg == pytest.approx(9400.0, abs=0.5)
    assert q_sesame.provenance == ProvenanceTag.MEASURED_ERP


def test_cooperative_trade_receipts_json(market_service):
    """Verify parsing of agricultural cooperative JSON transaction receipts."""
    json_data = [
        {
            "center": "Bayintnaung",
            "commodity": "Green Gram",
            "price": 5000,
            "unit": "viss",
            "currency": "MMK",
            "partner": "Yangon Grain Exporters",
        }
    ]
    quotes = market_service.ingest_trade_receipts_json(json_data)
    assert len(quotes) == 1
    assert quotes[0].commodity_canonical == "green_gram"
    assert quotes[0].price_mmk_per_viss == pytest.approx(5000.0, abs=0.5)
    assert quotes[0].provenance == ProvenanceTag.MEASURED_ERP


def test_generic_erp_payload_auto_detection(market_service):
    """Verify ingest_erp_payload auto-detects JSON list, Odoo dict, ERPNext dict, and CSV string."""
    # List -> JSON
    q1 = market_service.ingest_erp_payload([{"center": "Taunggyi", "commodity": "Maize", "price": 2069, "unit": "viss"}])
    assert len(q1) == 1

    # ERPNext dict
    q2 = market_service.ingest_erp_payload({"doctype": "Item Price", "market_center": "Taunggyi", "item_name": "Maize", "price_list_rate": 2069, "uom": "viss"})
    assert len(q2) == 1

    # Odoo dict
    q3 = market_service.ingest_erp_payload({"warehouse": "Pathein", "order_lines": [{"product_name": "Paw San", "price_unit": 3500, "product_uom": "viss"}]})
    assert len(q3) == 1

    # CSV string
    q4 = market_service.ingest_erp_payload("location,commodity,price,unit\nBayintnaung,Matpe,5400,viss")
    assert len(q4) == 1


# =========================================================================
# 4. CLEAN MARKET INTELLIGENCE SCHEMA & LLM FACT GENERATION TESTS
# =========================================================================

def test_clean_market_intelligence_schema_and_facts(market_service):
    """Verify CleanMarketIntelligence generation and zero-markup LLM fact summary."""
    quote = market_service.ingest_raw_quote(
        market_center="Bayintnaung",
        commodity="Matpe",
        price=5400,
        unit="viss",
        currency="MMK",
        quote_timestamp=datetime.now(timezone.utc).isoformat(),
        source="Bayintnaung Wholesale Center Bulletin",
        provenance=ProvenanceTag.MEASURED_PORTAL,
        confidence_score=0.95,
    )

    clean_intel = market_service.clean_market_quote(quote)

    assert isinstance(clean_intel, CleanMarketIntelligence)
    assert clean_intel.commodity_canonical == "black_gram"
    assert "Black Gram" in clean_intel.commodity_name
    assert clean_intel.market_center == "Bayintnaung"
    assert clean_intel.region == "Yangon"
    assert clean_intel.price_mmk_per_viss == pytest.approx(5400.0, abs=0.5)
    assert clean_intel.price_mmk_per_kg is not None
    assert clean_intel.price_usd_per_tonne is not None
    assert clean_intel.freshness_duration_hours >= 0.0
    assert clean_intel.is_stale is False
    assert clean_intel.provenance == ProvenanceTag.MEASURED_PORTAL
    assert clean_intel.confidence_score == 0.95
    assert clean_intel.validation_stamp == ValidationStamp.VALIDATED_CORRIDOR
    assert clean_intel.is_valid is True

    # Test LLM fact generation
    fact = clean_intel.to_llm_fact()
    assert "VERIFIED SPOT INTEL:" in fact
    assert "Black Gram" in fact
    assert "Bayintnaung (Yangon)" in fact
    assert "5,400 MMK/viss" in fact
    assert "[MEASURED_PORTAL]" in fact
    assert "confidence 0.95" in fact
    assert "VALIDATED_CORRIDOR" in fact
    assert "3x ROI solvency" in fact


def test_clean_market_intelligence_staleness(market_service):
    """Verify stale feed detection when quote age exceeds threshold."""
    old_time = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    quote = market_service.ingest_raw_quote(
        market_center="Taunggyi",
        commodity="Maize",
        price=2069,
        unit="viss",
        currency="MMK",
        quote_timestamp=old_time,
        provenance=ProvenanceTag.MEASURED_COMMUNITY_POST,
        confidence_score=0.85,
    )

    clean_intel = market_service.clean_market_quote(quote, stale_threshold_days=7)
    assert clean_intel.is_stale is True
    assert clean_intel.freshness_duration_hours > 200.0
    assert "STALE" in clean_intel.economic_summary


def test_clean_market_intelligence_quarantined_outlier_fact(market_service):
    """Verify quarantined outlier quote generates clear refusal fact for LLM."""
    quote = market_service.ingest_raw_quote(
        market_center="Bayintnaung",
        commodity="Matpe",
        price=54000,  # 10x shock price
        unit="viss",
        currency="MMK",
        provenance=ProvenanceTag.MEASURED_PORTAL,
    )
    assert quote.is_valid is False

    clean_intel = market_service.clean_market_quote(quote)
    assert clean_intel.is_valid is False
    assert clean_intel.validation_stamp == ValidationStamp.QUARANTINED_OUTLIER

    fact = clean_intel.to_llm_fact()
    assert "QUARANTINED OUTLIER INTEL:" in fact
    assert "rejected" in fact
    assert "Untrusted price cannot be used" in fact


def test_clean_market_intelligence_unquoted_fact(market_service):
    """Verify unsupported commodity generates unquoted fact freezing cash spend."""
    quote = market_service.get_quote("Taunggyi", "Black Tiger Shrimp")
    clean_intel = market_service.clean_market_quote(quote)

    assert clean_intel.is_valid is False
    assert clean_intel.provenance == ProvenanceTag.UNQUOTED
    fact = clean_intel.to_llm_fact()
    assert "UNQUOTED INTEL:" in fact
    assert "External input purchases must be frozen under 3x ROI gate." in fact


# =========================================================================
# 5. VAULT CACHE EXPORT & LOAD TESTS (JSON & MARKDOWN)
# =========================================================================

def test_export_and_load_clean_feed_json(market_service, tmp_path):
    """Verify export_clean_feed_json creates valid structured JSON and load_clean_market_feed reloads it."""
    # Ingest several quotes
    market_service.ingest_raw_quote("Bayintnaung", "Matpe", 5400, "viss", "MMK", provenance=ProvenanceTag.MEASURED_PORTAL)
    market_service.ingest_raw_quote("Taunggyi", "Maize", 2069, "viss", "MMK", provenance=ProvenanceTag.MEASURED_ERP)
    market_service.ingest_raw_quote("Pathein", "Paw San", 3500, "viss", "MMK", provenance=ProvenanceTag.MEASURED_COMMUNITY_POST)

    json_file = tmp_path / "test_clean_feed.json"
    exported_path = market_service.export_clean_feed_json(filepath=json_file)
    assert exported_path.exists()

    # Verify JSON content
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["title"] == "AgroGuard Clean Market Intelligence Feed"
    assert data["total_quotes"] == 3
    assert data["valid_quotes"] == 3
    assert len(data["quotes"]) == 3

    # Load back using service method
    loaded = market_service.load_clean_market_feed(filepath=json_file)
    assert len(loaded) == 3
    for c in loaded:
        assert isinstance(c, CleanMarketIntelligence)
        assert c.is_valid is True
        assert c.price_usd_per_tonne is not None


def test_export_clean_vault_markdown(market_service, tmp_path):
    """Verify export_clean_vault_markdown creates Markdown with YAML frontmatter for instant prompt injection."""
    market_service.ingest_raw_quote("Bayintnaung", "Matpe", 5400, "viss", "MMK", provenance=ProvenanceTag.MEASURED_PORTAL)
    market_service.ingest_raw_quote("Taunggyi", "Maize", 2069, "viss", "MMK", provenance=ProvenanceTag.MEASURED_ERP)

    md_file = tmp_path / "test_clean_vault.md"
    exported_path = market_service.export_clean_vault_markdown(filepath=md_file)
    assert exported_path.exists()

    content = md_file.read_text(encoding="utf-8")
    # Verify YAML frontmatter
    assert content.startswith("---")
    assert "title: Clean Market Intelligence Vault" in content
    assert "total_quotes: 2" in content
    assert "valid_quotes: 2" in content
    assert "---\n\n# Verified Clean Market Facts" in content

    # Verify headings and quote details
    assert "## Bayintnaung" in content
    assert "## Taunggyi" in content
    assert "MEASURED_PORTAL" in content
    assert "MEASURED_ERP" in content


# =========================================================================
# 6. MARKET DEMAND & COBWEB GLUT INTEGRATION TESTS
# =========================================================================

def test_glut_risk_from_clean_intel_portal(market_service):
    """Verify end-to-end Cobweb Glut analysis from CleanMarketIntelligence with MEASURED_PORTAL."""
    quote = market_service.ingest_raw_quote(
        market_center="Bayintnaung",
        commodity="Matpe",
        price=5400,
        unit="viss",
        currency="MMK",
        provenance=ProvenanceTag.MEASURED_PORTAL,
        confidence_score=0.95,
    )
    clean_intel = market_service.clean_market_quote(quote)

    glut_eval = market_demand_service.analyze_glut_risk_from_clean_intel(
        clean_intel=clean_intel,
        township="Bayintnaung",
        acreage_expansion_pct=15.0,
        days_to_harvest=60,
    )

    assert glut_eval.provenance == DemandProvenanceTag.MEASURED_PORTAL
    assert glut_eval.commodity_canonical in ("black_gram", "beans")
    assert glut_eval.instant_spot_price_usd_tonne is not None
    assert 720.0 <= glut_eval.instant_spot_price_usd_tonne <= 750.0
    assert glut_eval.cobweb_glut_risk_index is not None
    assert 0.0 <= glut_eval.cobweb_glut_risk_index <= 1.0
    assert len(glut_eval.downside_scenarios) == 3
    assert glut_eval.economic_reasoning != ""


def test_glut_risk_from_clean_intel_community_post(market_service):
    """Verify Cobweb Glut analysis with MEASURED_COMMUNITY_POST provenance."""
    quote = market_service.ingest_raw_quote(
        market_center="Taunggyi",
        commodity="Maize",
        price=2069,
        unit="viss",
        currency="MMK",
        provenance=ProvenanceTag.MEASURED_COMMUNITY_POST,
        confidence_score=0.85,
    )
    clean_intel = market_service.clean_market_quote(quote)

    glut_eval = market_demand_service.analyze_glut_risk_from_clean_intel(
        clean_intel=clean_intel,
        township="Taunggyi",
        days_to_harvest=90,
    )

    assert glut_eval.provenance == DemandProvenanceTag.MEASURED_COMMUNITY_POST
    assert glut_eval.commodity_canonical == "maize"
    assert 280.0 <= glut_eval.instant_spot_price_usd_tonne <= 285.0
    assert glut_eval.baseline_sown_acres is not None
    assert 1400.0 <= glut_eval.baseline_sown_acres <= 1900.0


def test_glut_risk_from_clean_intel_erp(market_service):
    """Verify Cobweb Glut analysis with MEASURED_ERP provenance."""
    quote = market_service.ingest_raw_quote(
        market_center="Taunggyi",
        commodity="Maize",
        price=2069,
        unit="viss",
        currency="MMK",
        provenance=ProvenanceTag.MEASURED_ERP,
        confidence_score=0.98,
    )
    clean_intel = market_service.clean_market_quote(quote)

    glut_eval = market_demand_service.analyze_glut_risk_from_clean_intel(
        clean_intel=clean_intel,
        township="Taunggyi",
        days_to_harvest=45,
    )

    assert glut_eval.provenance == DemandProvenanceTag.MEASURED_ERP
    assert glut_eval.commodity_canonical == "maize"
    assert glut_eval.instant_spot_price_usd_tonne is not None
    assert 280.0 <= glut_eval.instant_spot_price_usd_tonne <= 285.0


def test_glut_risk_from_clean_intel_quarantined_fallback(market_service):
    """Verify invalid or quarantined clean intelligence safely triggers fallback baseline."""
    corrupt_quote = market_service.ingest_raw_quote(
        market_center="Taunggyi",
        commodity="Maize",
        price=50000,  # Corrupt price
        unit="viss",
        currency="MMK",
        provenance=ProvenanceTag.MEASURED_PORTAL,
    )
    assert corrupt_quote.is_valid is False

    clean_intel = market_service.clean_market_quote(corrupt_quote)
    assert clean_intel.is_valid is False

    # Analysis should not crash and should use historical baseline or fallback
    glut_eval = market_demand_service.analyze_glut_risk_from_clean_intel(
        clean_intel=clean_intel,
        township="Taunggyi",
        days_to_harvest=90,
    )

    # Corrupt spot price was ignored (clean_intel.price_usd_per_tonne is None when invalid)
    # The engine falls back to historical baseline price
    assert glut_eval.instant_spot_price_usd_tonne == glut_eval.historical_baseline_price_usd_tonne
    assert glut_eval.provenance == DemandProvenanceTag.HISTORICAL_INDEX
