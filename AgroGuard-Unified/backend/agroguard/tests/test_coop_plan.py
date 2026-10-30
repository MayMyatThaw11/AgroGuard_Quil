from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.services import entitlements as service


class _Result:
    def scalar_one(self) -> int:
        return 0


class _Session:
    def __init__(self, subscription):
        self.subscription = subscription

    async def get(self, model, key):
        return self.subscription

    async def execute(self, statement):
        return _Result()


def _subscription(plan: str, days: int, status: str = "active"):
    return SimpleNamespace(
        plan=plan,
        status=status,
        current_period_end=datetime.now(UTC) + timedelta(days=days),
    )


def test_coop_plan_constants_match_the_demo_offer() -> None:
    assert service.COOP_PLAN == "coop_season"
    assert service.COOP_HA_LIMIT == 100
    assert service.COOP_PRICE_CENTS == 34900
    assert service.COOP_PERIOD_DAYS == 183


@pytest.mark.parametrize(("ha", "expected"), [(100, 3.49), (30, 11.63), (1, 349.0)])
def test_effective_price_per_ha(ha: int, expected: float) -> None:
    assert service.coop_price_per_ha(ha) == expected


def test_price_per_ha_rejects_zero_and_beyond_the_plan() -> None:
    with pytest.raises(ValueError):
        service.coop_price_per_ha(0)
    with pytest.raises(ValueError):
        service.coop_price_per_ha(service.COOP_HA_LIMIT + 1)


@pytest.mark.asyncio
async def test_active_coop_plan_carries_the_ha_limit() -> None:
    value = await service.get_entitlements(_Session(_subscription("coop_season", 100)), 7)
    assert value.plan == "coop_season" and value.ha_limit == 100 and value.farms_limit is None


@pytest.mark.asyncio
async def test_coop_plan_expires_after_its_period() -> None:
    value = await service.get_entitlements(_Session(_subscription("coop_season", -1)), 7)
    assert value.plan == "free" and value.ha_limit is None


@pytest.mark.asyncio
async def test_farmers_on_free_have_no_ha_limit_and_are_never_charged_for_a_coop_plan() -> None:
    value = await service.get_entitlements(_Session(None), 7)
    assert value.plan == "free" and value.ha_limit is None
    assert service.COOP_PLAN not in {"free", "pro"}
