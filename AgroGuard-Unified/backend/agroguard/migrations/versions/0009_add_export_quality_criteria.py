"""add export_quality_criteria table (Export Quality Phase 2: gap analysis)

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "export_quality_criteria",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("analyte", sa.String(100), nullable=False),
        sa.Column("unit", sa.String(30), nullable=False),
        sa.Column("operator", sa.String(10), nullable=False),
        sa.Column("threshold_value", sa.Float(), nullable=False),
        sa.Column("threshold_value_max", sa.Float(), nullable=True),
        sa.Column("source_name", sa.String(200), nullable=False),
        sa.Column("source_date", sa.Date(), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.Column("verified_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["lot_id"], ["export_lots.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_export_quality_criteria_lot_id", "export_quality_criteria", ["lot_id"])


def downgrade() -> None:
    op.drop_table("export_quality_criteria")
