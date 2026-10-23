from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models.simulated_farm import SimulatedFarm
from app.db.models.subscription import Subscription


@dataclass(frozen=True)
class Entitlements:
    plan: str
    status: str
    farms_used: int
    farms_limit: int | None
    current_period_end: datetime | None

    @property
    def farms_left(self) -> int | None:
        if self.farms_limit is None:
            return None
        return max(self.farms_limit - self.farms_used, 0)


def _is_pro(subscription: Subscription | None) -> bool:
    if subscription is None or subscription.plan != "pro" or subscription.status != "active":
        return False
    end = subscription.current_period_end
    return end is None or end > datetime.now(UTC)


async def farms_used(session: AsyncSession, user_id: int) -> int:
    result = await session.execute(
        select(func.count()).select_from(SimulatedFarm).where(SimulatedFarm.user_id == user_id)
    )
    return int(result.scalar_one())


async def get_entitlements(session: AsyncSession, user_id: int) -> Entitlements:
    subscription = await session.get(Subscription, user_id)
    pro = _is_pro(subscription)
    return Entitlements(
        plan="pro" if pro else "free",
        status=subscription.status if subscription else "active",
        farms_used=await farms_used(session, user_id),
        farms_limit=None if pro else get_settings().free_farm_limit,
        current_period_end=subscription.current_period_end if subscription else None,
    )


async def consume_farm(
    session: AsyncSession, user_id: int, parcel_id: str
) -> tuple[bool, Entitlements]:
    await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": user_id})
    subscription = await session.get(Subscription, user_id)
    limit = None if _is_pro(subscription) else get_settings().free_farm_limit
    existing = await session.get(SimulatedFarm, (user_id, parcel_id))
    if existing is None and limit is not None and await farms_used(session, user_id) >= limit:
        await session.rollback()
        return False, await get_entitlements(session, user_id)
    now = datetime.now(UTC)
    statement = insert(SimulatedFarm).values(
        user_id=user_id, parcel_id=parcel_id, first_run_at=now, last_run_at=now, run_count=1
    )
    statement = statement.on_conflict_do_update(
        index_elements=["user_id", "parcel_id"],
        set_={"last_run_at": now, "run_count": SimulatedFarm.run_count + 1},
    )
    await session.execute(statement)
    await session.commit()
    return True, await get_entitlements(session, user_id)


async def release_farm(session: AsyncSession, user_id: int, parcel_id: str) -> Entitlements:
    await session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": user_id})
    farm = await session.get(SimulatedFarm, (user_id, parcel_id))
    if farm is not None:
        if farm.run_count <= 1:
            await session.delete(farm)
        else:
            farm.run_count -= 1
        await session.commit()
    return await get_entitlements(session, user_id)
