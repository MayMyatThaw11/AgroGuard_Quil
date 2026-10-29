"""add account_type and buyer_kind to users

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-30
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("account_type", sa.String(20), nullable=False, server_default="farmer"))
    op.add_column("users", sa.Column("buyer_kind", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "buyer_kind")
    op.drop_column("users", "account_type")
