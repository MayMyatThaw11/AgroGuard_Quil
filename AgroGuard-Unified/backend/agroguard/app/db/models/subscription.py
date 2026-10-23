from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    plan: Mapped[str] = mapped_column(String(20), default="free", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
