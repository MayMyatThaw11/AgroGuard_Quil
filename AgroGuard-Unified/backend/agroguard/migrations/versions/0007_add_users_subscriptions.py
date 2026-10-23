"""add users, subscriptions, simulated farms and payments

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-23
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "subscriptions",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "simulated_farms",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("parcel_id", sa.String(200), nullable=False),
        sa.Column(
            "first_run_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "last_run_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("run_count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "parcel_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("card_last4", sa.String(4), nullable=False),
        sa.Column("failure_reason", sa.String(100), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_payments_user_id", "payments", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_payments_user_id", table_name="payments")
    op.drop_table("payments")
    op.drop_table("simulated_farms")
    op.drop_table("subscriptions")
    op.drop_table("users")
