from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest

from agriquill import market, producers, store
from agriquill.config import get_settings

FARMER, COOP, STRANGER = "ag:1", "ag:9", "ag:5"
READY = (date.today() + timedelta(days=20)).isoformat()
CONSENT = {"by": "Shwe Taung Co-op", "read_aloud": True, "text_version": "v1"}


@pytest.fixture(autouse=True)
def isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    settings = get_settings()
    saved = settings.data_dir, settings.ledger_path
    store.close_all()
    settings.data_dir = str(tmp_path / "data")
    settings.ledger_path = str(tmp_path / "data" / "ledger.jsonl")
    market.clear_cache()
    monkeypatch.setattr(
        market.prices, "trend", lambda *a, **k: {"field": "price", "reason": "offline"}
    )
    yield
    store.close_all()
    settings.data_dir, settings.ledger_path = saved


def body(**extra):
    return {
        "kind": "household",
        "name": "Daw Hla's family",
        "lat": 17.1,
        "lon": 96.05,
        "township": "Hmawbi",
        "crops": [{"produce": "tomato", "area_ha": 1.2, "harvest_month": 3}],
        **extra,
    }


def test_self_create_sets_owner() -> None:
    record = producers.create(FARMER, None, body())
    assert record["owner"] == FARMER and record["manager"] is None
    assert len(record["claim_code"]) == 6


def test_coop_create_without_read_aloud_consent_422() -> None:
    with pytest.raises(ValueError):
        producers.create(COOP, "cooperative", body())
    with pytest.raises(ValueError):
        producers.create(COOP, "cooperative", body(consent={**CONSENT, "read_aloud": False}))
    record = producers.create(COOP, "cooperative", body(consent=CONSENT))
    assert record["owner"] is None and record["manager"] == COOP


def test_non_coop_buyer_cannot_register_for_others() -> None:
    with pytest.raises(PermissionError):
        producers.create(COOP, "processor", body(consent=CONSENT))


def test_duplicate_within_50m_409_returns_public_name() -> None:
    producers.create(FARMER, None, body())
    with pytest.raises(producers.NearbyProfile) as hit:
        producers.create(STRANGER, None, body(name="Someone else", lat=17.1002, lon=96.0501))
    assert hit.value.profile["name"] == "Daw Hla's family"
    assert "owner" not in hit.value.profile


def test_farm_over_10_ha_rejected() -> None:
    with pytest.raises(ValueError):
        producers.create(
            FARMER, None, body(crops=[{"produce": "rice", "area_ha": 10.5, "harvest_month": 11}])
        )


def test_claim_wrong_code_locks_after_5() -> None:
    record = producers.create(COOP, "cooperative", body(consent=CONSENT))
    for _ in range(5):
        with pytest.raises(PermissionError):
            producers.claim(FARMER, record["id"], "WRONG1", "1234")
    with pytest.raises(PermissionError, match="locked"):
        producers.claim(FARMER, record["id"], record["claim_code"], "1234")


def test_claim_then_revoke_blocks_manager_403() -> None:
    record = producers.create(COOP, "cooperative", body(consent=CONSENT))
    producers.claim(FARMER, record["id"], record["claim_code"], "1234")
    profile = producers.get(record["id"])
    assert producers.can_act(FARMER, profile) and producers.can_act(COOP, profile)
    producers.revoke_manager(FARMER, record["id"])
    assert not producers.can_act(COOP, producers.get(record["id"]))
    with pytest.raises(PermissionError):
        producers.revoke_manager(COOP, record["id"])


def test_claim_without_account_returns_device_token_that_can_list() -> None:
    record = producers.create(COOP, "cooperative", body(consent=CONSENT))
    result = producers.claim(None, record["id"], record["claim_code"], "1234")
    device = producers.account_for_token(result["device_token"])
    assert device and device.startswith("dev:")
    listing = market.post_listing(
        device,
        {
            "produce": "tomato",
            "qty_kg": 300,
            "ready_on": READY,
            "town": "Hmawbi",
            "lat": 17.1,
            "lon": 96.05,
            "producer_id": record["id"],
        },
    )
    assert listing["producer_id"] == record["id"]
    other = producers.create(STRANGER, None, body(name="Other", lat=17.3, lon=96.3))
    with pytest.raises(PermissionError):
        market.post_listing(
            device,
            {
                "produce": "tomato",
                "qty_kg": 300,
                "ready_on": READY,
                "town": "Hmawbi",
                "lat": 17.1,
                "lon": 96.05,
                "producer_id": other["id"],
            },
        )
    assert producers.account_for_token("not-a-token") is None


def test_listing_by_unrelated_account_403() -> None:
    record = producers.create(FARMER, None, body())
    with pytest.raises(PermissionError):
        market.post_listing(
            STRANGER,
            {
                "produce": "tomato",
                "qty_kg": 300,
                "ready_on": READY,
                "town": "Hmawbi",
                "lat": 17.1,
                "lon": 96.05,
                "producer_id": record["id"],
            },
        )


def test_public_view_has_no_owner_or_exact_point() -> None:
    record = producers.create(FARMER, None, body(lat=17.12345, lon=96.05678))
    view = producers.public_view(producers.get(record["id"]))
    assert set(view) == {
        "id",
        "name",
        "kind",
        "members",
        "crops",
        "public_lat",
        "public_lon",
        "township",
    }
    assert view["public_lat"] == 17.12 and view["public_lon"] == 96.06


def test_group_listing_total_equals_contributions() -> None:
    group = producers.create(
        FARMER, None, body(kind="group", members=[{"name": "U Ba"}, {"name": "Daw Mya"}])
    )
    payload = {
        "produce": "tomato",
        "qty_kg": 700,
        "ready_on": READY,
        "town": "Hmawbi",
        "lat": 17.1,
        "lon": 96.05,
        "producer_id": group["id"],
    }
    with pytest.raises(ValueError):
        market.post_listing(
            FARMER,
            {
                **payload,
                "contributions": [
                    {"member": "U Ba", "qty_kg": 300},
                    {"member": "Daw Mya", "qty_kg": 300},
                ],
            },
        )
    ok = market.post_listing(
        FARMER,
        {
            **payload,
            "contributions": [
                {"member": "U Ba", "qty_kg": 400},
                {"member": "Daw Mya", "qty_kg": 300},
            ],
        },
    )
    assert ok["qty_kg"] == 700


def test_on_behalf_listing_written_to_ledger() -> None:
    record = producers.create(COOP, "cooperative", body(consent=CONSENT))
    market.post_listing(
        COOP,
        {
            "produce": "tomato",
            "qty_kg": 300,
            "ready_on": READY,
            "town": "Hmawbi",
            "lat": 17.1,
            "lon": 96.05,
            "producer_id": record["id"],
        },
    )
    kinds = [e["kind"] for e in producers.activity(COOP, record["id"])]
    assert kinds == ["producer_created", "listing_posted"]
    with pytest.raises(PermissionError):
        producers.activity(STRANGER, record["id"])


def test_join_group_adds_member() -> None:
    group = producers.create(FARMER, None, body(kind="group", members=[{"name": "U Ba"}]))
    updated = producers.add_member(FARMER, group["id"], {"name": "Daw Mya", "area_ha": 0.8})
    assert [m["name"] for m in updated["members"]] == ["U Ba", "Daw Mya"]


def test_private_view_says_whether_a_pin_guards_the_profile() -> None:
    plain = producers.create(FARMER, None, body())
    guarded = producers.create(FARMER, None, body(lat=17.3, lon=96.2, pin="4321"))
    assert plain["has_pin"] is False and guarded["has_pin"] is True
    assert "pin_hash" not in guarded


def test_verify_pin_checks_the_pin_and_locks_after_five_wrong() -> None:
    record = producers.create(FARMER, None, body(pin="4321"))
    assert producers.verify_pin(FARMER, record["id"], "4321")["id"] == record["id"]
    with pytest.raises(PermissionError):
        producers.verify_pin(STRANGER, record["id"], "4321")
    for _ in range(5):
        with pytest.raises(PermissionError):
            producers.verify_pin(FARMER, record["id"], "0000")
    with pytest.raises(PermissionError):
        producers.verify_pin(FARMER, record["id"], "4321")


def _site(i: int) -> dict:
    return body(
        name=f"Farm {i}",
        lat=17.0 + i * 0.01,
        lon=96.0,
        crops=[{"produce": "tomato", "area_ha": 10.0, "harvest_month": 3}],
    )


def test_coop_plan_ha_limit_blocks_over_100(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(producers.entitlements, "ha_limit", lambda account: 100)
    for i in range(10):
        producers.create(COOP, "cooperative", _site(i) | {"consent": CONSENT})
    assert producers.plan_usage(COOP) == {"ha_used": 100.0, "ha_limit": 100}
    with pytest.raises(producers.PlanLimit) as hit:
        producers.create(
            COOP,
            "cooperative",
            body(
                name="Over",
                lat=17.5,
                lon=96.0,
                crops=[{"produce": "tomato", "area_ha": 6.0, "harvest_month": 3}],
                consent=CONSENT,
            ),
        )
    assert "covers 100 ha" in str(hit.value) and "manage 100 ha" in str(hit.value)


def test_coop_without_a_plan_has_no_limit_and_farmers_are_never_checked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(producers.entitlements, "ha_limit", lambda account: None)
    assert producers.plan_usage(COOP) == {"ha_used": 0.0, "ha_limit": None}
    producers.create(COOP, "cooperative", _site(0) | {"consent": CONSENT})

    def boom(account: str) -> int:
        raise AssertionError("farmers must not be checked against a plan")

    monkeypatch.setattr(producers.entitlements, "ha_limit", boom)
    producers.create(FARMER, None, _site(1))
