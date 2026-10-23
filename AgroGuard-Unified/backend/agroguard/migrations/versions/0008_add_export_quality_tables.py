"""add export_lots, export_lab_results, export_certificates tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-22
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "export_lots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("field_id", sa.Integer(), nullable=False),
        sa.Column("crop_name", sa.String(100), nullable=False),
        sa.Column("variety", sa.String(100), nullable=True),
        sa.Column("harvest_date", sa.Date(), nullable=True),
        sa.Column("harvest_moisture_pct", sa.Float(), nullable=True),
        sa.Column("storage_type", sa.String(100), nullable=True),
        sa.Column("storage_started_at", sa.Date(), nullable=True),
        sa.Column("milling_broken_pct", sa.Float(), nullable=True),
        sa.Column("milling_class", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["field_id"], ["fields.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_export_lots_field_id", "export_lots", ["field_id"])

    op.create_table(
        "export_lab_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("analyte", sa.String(100), nullable=False),
        sa.Column("result_value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(30), nullable=True),
        sa.Column("method", sa.String(200), nullable=True),
        sa.Column("lab_name", sa.String(200), nullable=False),
        sa.Column("lab_accredited", sa.Boolean(), nullable=False),
        sa.Column("sample_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["lot_id"], ["export_lots.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_export_lab_results_lot_id", "export_lab_results", ["lot_id"])

    op.create_table(
        "export_certificates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("issuer", sa.String(200), nullable=False),
        sa.Column("certificate_number", sa.String(200), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["lot_id"], ["export_lots.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_export_certificates_lot_id", "export_certificates", ["lot_id"])


def downgrade() -> None:
    op.drop_table("export_certificates")
    op.drop_table("export_lab_results")
    op.drop_table("export_lots")
