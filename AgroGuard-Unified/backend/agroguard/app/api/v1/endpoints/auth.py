from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import current_user, sign_token
from app.db.models.subscription import Subscription
from app.db.models.user import User
from app.db.session import get_db_session
from app.schemas.billing import DemoLoginRequest, MeResponse, TokenResponse

router = APIRouter(tags=["auth"])

DEMO_USERS = {
    "free@demo.com": ("Free Demo", "free"),
    "pro@demo.com": ("Pro Demo", "pro"),
}


@router.post("/auth/demo-login", response_model=TokenResponse)
async def demo_login(
    payload: DemoLoginRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)] = None,
) -> TokenResponse:
    if get_settings().environment == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")
    email = payload.email.strip().lower()
    if email not in DEMO_USERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use free@demo.com or pro@demo.com.",
        )
    display_name, plan = DEMO_USERS[email]
    await session.execute(
        insert(User)
        .values(email=email, display_name=display_name)
        .on_conflict_do_nothing(index_elements=["email"])
    )
    user = (await session.execute(select(User).where(User.email == email))).scalar_one()
    period_end = datetime.now(UTC) + timedelta(days=365) if plan == "pro" else None
    await session.execute(
        insert(Subscription)
        .values(user_id=user.id, plan=plan, status="active", current_period_end=period_end)
        .on_conflict_do_nothing(index_elements=["user_id"])
    )
    await session.commit()
    return TokenResponse(
        access_token=sign_token(user.id, user.display_name),
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
    )


@router.get("/me", response_model=MeResponse)
async def me(user: Annotated[User, Depends(current_user)]) -> MeResponse:
    return MeResponse(id=user.id, email=user.email, display_name=user.display_name)
