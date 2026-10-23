from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ExportLot(Base):
    """A real, farmer-recorded export lot. No readiness/standard logic lives
    here -- this table only ever holds what was actually entered. Expiry,
    "untested", and readiness status are all computed at read time from
    these rows plus their lab results/certificates, never stored as a
    precomputed verdict that could drift from the underlying records.
    """

    __tablename__ = "export_lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    field_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("fields.id", ondelete="CASCADE"), nullable=False, index=True
    )
    crop_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # A stable identifier from the fruit catalog (app/services/eu_fruit_catalog.py),
    # set only by the EU fruit-lot creation path -- never guessed or backfilled
    # from crop_name. When present, EU readiness matching trusts it directly
    # instead of falling back to the brittle free-text crop_name/variety
    # string match (see app/services/eu_fruit_catalog.py: crop_name_matches_fruit).
    # Legacy rows (including rows entered through the generic Phase 1/2 form)
    # are left None and keep using the string-match fallback, with its
    # existing mismatch warning.
    fruit_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    variety: Mapped[str | None] = mapped_column(String(100), nullable=True)
    harvest_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    harvest_moisture_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    storage_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    storage_started_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    milling_broken_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    milling_class: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
    )

    lab_results: Mapped[list["ExportLabResult"]] = relationship(
        back_populates="lot", cascade="all, delete-orphan", passive_deletes=True
    )
    certificates: Mapped[list["ExportCertificate"]] = relationship(
        back_populates="lot", cascade="all, delete-orphan", passive_deletes=True
    )
    quality_criteria: Mapped[list["ExportQualityCriterion"]] = relationship(
        back_populates="lot", cascade="all, delete-orphan", passive_deletes=True
    )


class ExportLabResult(Base):
    """A lab test result for one lot. Absence of a row for a given analyte
    must always be read as "untested", never as a pass -- enforced at the
    service layer (app/services/export_quality.py), not here.
    """

    __tablename__ = "export_lab_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("export_lots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    analyte: Mapped[str] = mapped_column(String(100), nullable=False)
    result_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    method: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lab_name: Mapped[str] = mapped_column(String(200), nullable=False)
    lab_accredited: Mapped[bool] = mapped_column(default=False, nullable=False)
    sample_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
    )

    lot: Mapped["ExportLot"] = relationship(back_populates="lab_results")


class ExportCertificate(Base):
    """A certificate/registration record for one lot. Expiry is derived at
    read time from `valid_to` vs. the current date -- never assumed and
    never left silently "valid" with no date on file.
    """

    __tablename__ = "export_certificates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("export_lots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    issuer: Mapped[str] = mapped_column(String(200), nullable=False)
    certificate_number: Mapped[str] = mapped_column(String(200), nullable=False)
    # Free-form historically, but left unset (None) this can never be read as
    # satisfying a specific requirement (e.g. a phytosanitary certificate) --
    # see app/services/eu_export_readiness.py. A certificate recorded before
    # this field existed, or one the farmer hasn't categorized, is honestly
    # "unspecified", not silently treated as whatever type happens to be needed.
    certificate_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
    )

    lot: Mapped["ExportLot"] = relationship(back_populates="certificates")


class ExportQualityCriterion(Base):
    """A single quality criterion recorded against one lot -- always a
    buyer/trader-supplied specification, never a regulatory standard: this
    repository has no governance workflow (no reviewer role, no approval
    process) to call anything a verified official standard. `verified` is
    a self-attested flag the person entering the criterion sets themselves
    (e.g. "this is the exact figure in the buyer's signed contract") --
    it is not independent verification, and the service layer never
    upgrades a criterion's status based on it alone; see
    app/services/export_quality.py: compute_quality_gaps.
    """

    __tablename__ = "export_quality_criteria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("export_lots.id", ondelete="CASCADE"), nullable=False, index=True
    )
    analyte: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str] = mapped_column(String(30), nullable=False)
    operator: Mapped[str] = mapped_column(String(10), nullable=False)  # <=, >=, <, >, ==, range
    threshold_value: Mapped[float] = mapped_column(Float, nullable=False)
    threshold_value_max: Mapped[float | None] = mapped_column(Float, nullable=True)  # only for operator="range"
    source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    verified: Mapped[bool] = mapped_column(default=False, nullable=False)
    verified_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(UTC),
    )

    lot: Mapped["ExportLot"] = relationship(back_populates="quality_criteria")
