from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SimulatedFarm(Base):
    __tablename__ = "simulated_farms"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    parcel_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    first_run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_run_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    run_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
