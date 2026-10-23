from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import current_user, require_service_key
from app.db.models.payment import Payment
from app.db.models.simulated_farm import SimulatedFarm
from app.db.models.subscription import Subscription
from app.db.models.user import User
from app.db.session import get_db_session
from app.schemas.billing import (
    CheckoutRequest,
    CheckoutResponse,
    ConsumeFarmResponse,
    EntitlementsResponse,
    FarmRequest,
)
from app.services import entitlements as service

router = APIRouter(tags=["billing"])

PRO_PRICE_CENTS = 900
PRO_CURRENCY = "USD"
SUCCESS_CARD = "4242424242424242"
DECLINED_CARD = "4000000000000002"


def _to_response(value: service.Entitlements) -> EntitlementsResponse:
    return EntitlementsResponse(
        plan=value.plan,
        status=value.status,
        farms_used=value.farms_used,
        farms_limit=value.farms_limit,
        farms_left=value.farms_left,
        current_period_end=value.current_period_end,
    )


def _luhn_ok(number: str) -> bool:
    total = 0
    for index, digit in enumerate(reversed(number)):
        value = int(digit)
        if index % 2 == 1:
            value = value * 2 - 9 if value > 4 else value * 2
        total += value
    return total % 10 == 0


def _require_mock_billing() -> None:
    if get_settings().billing_mode != "mock":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Billing is not enabled.")


@router.get("/me/entitlements", response_model=EntitlementsResponse)
async def my_entitlements(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> EntitlementsResponse:
    return _to_response(await service.get_entitlements(session, user.id))


@router.post("/billing/mock-checkout", response_model=CheckoutResponse)
async def mock_checkout(
    payload: CheckoutRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> CheckoutResponse:
    _require_mock_billing()
    number = "".join(ch for ch in payload.card_number if ch not in " -")
    if not number.isdigit() or not 12 <= len(number) <= 19 or not _luhn_ok(number):
        raise HTTPException(status_code=422, detail="Card number is not valid.")
    if not payload.cvc.isdigit():
        raise HTTPException(status_code=422, detail="CVC is not valid.")
    now = datetime.now(UTC)
    if (payload.exp_year, payload.exp_month) < (now.year, now.month):
        raise HTTPException(status_code=422, detail="Card has expired.")
    if number not in (SUCCESS_CARD, DECLINED_CARD):
        raise HTTPException(status_code=422, detail="Only the test cards can be used in this demo.")
    last4 = number[-4:]
    declined = number == DECLINED_CARD
    payment = Payment(
        user_id=user.id,
        amount_cents=PRO_PRICE_CENTS,
        currency=PRO_CURRENCY,
        status="declined" if declined else "succeeded",
        card_last4=last4,
        failure_reason="card_declined" if declined else None,
    )
    session.add(payment)
    if declined:
        await session.commit()
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Card declined.")
    period_end = now + timedelta(days=get_settings().pro_period_days)
    subscription = await session.get(Subscription, user.id)
    if subscription is None:
        session.add(
            Subscription(
                user_id=user.id, plan="pro", status="active", current_period_end=period_end
            )
        )
    else:
        subscription.plan = "pro"
        subscription.status = "active"
        subscription.current_period_end = period_end
        subscription.updated_at = now
    await session.commit()
    return CheckoutResponse(
        payment_id=payment.id,
        status=payment.status,
        card_last4=last4,
        entitlements=_to_response(await service.get_entitlements(session, user.id)),
    )


@router.post("/billing/cancel", response_model=EntitlementsResponse)
async def cancel(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> EntitlementsResponse:
    _require_mock_billing()
    subscription = await session.get(Subscription, user.id)
    if subscription is not None:
        subscription.plan = "free"
        subscription.status = "active"
        subscription.current_period_end = None
        subscription.updated_at = datetime.now(UTC)
        await session.commit()
    return _to_response(await service.get_entitlements(session, user.id))


@router.post("/internal/entitlements/consume-farm", response_model=ConsumeFarmResponse)
async def consume_farm(
    payload: FarmRequest,
    _: Annotated[None, Depends(require_service_key)],
    session: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> ConsumeFarmResponse:
    if await session.get(User, payload.user_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown user.")
    allowed, value = await service.consume_farm(session, payload.user_id, payload.parcel_id)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "farm_limit_reached",
                "farms_used": value.farms_used,
                "farms_limit": value.farms_limit,
            },
        )
    return ConsumeFarmResponse(allowed=True, entitlements=_to_response(value))


@router.post("/internal/entitlements/release-farm", response_model=EntitlementsResponse)
async def release_farm(
    payload: FarmRequest,
    _: Annotated[None, Depends(require_service_key)],
    session: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> EntitlementsResponse:
    return _to_response(await service.release_farm(session, payload.user_id, payload.parcel_id))


@router.post("/admin/demo/reset", response_model=EntitlementsResponse)
async def demo_reset(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> EntitlementsResponse:
    if get_settings().environment == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    await session.execute(delete(SimulatedFarm).where(SimulatedFarm.user_id == user.id))
    await session.execute(delete(Payment).where(Payment.user_id == user.id))
    subscription = await session.get(Subscription, user.id)
    if subscription is not None:
        pro = user.email == "pro@demo.com"
        subscription.plan = "pro" if pro else "free"
        subscription.status = "active"
        subscription.current_period_end = datetime.now(UTC) + timedelta(days=365) if pro else None
    await session.commit()
    return _to_response(await service.get_entitlements(session, user.id))
