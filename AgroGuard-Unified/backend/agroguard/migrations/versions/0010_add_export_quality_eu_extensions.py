"""add fruit_code to export_lots and certificate_type to export_certificates
(EU fruit export-readiness extension)

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-23
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Both columns are additive and nullable -- existing rows become
    # honestly "unspecified" (NULL), never guessed or backfilled.
    op.add_column("export_lots", sa.Column("fruit_code", sa.String(50), nullable=True))
    op.add_column("export_certificates", sa.Column("certificate_type", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("export_certificates", "certificate_type")
    op.drop_column("export_lots", "fruit_code")
