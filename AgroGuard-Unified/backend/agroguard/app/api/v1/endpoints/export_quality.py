from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.assessment import Assessment
from app.db.models.export_lot import (
    ExportCertificate,
    ExportLabResult,
    ExportLot,
    ExportQualityCriterion,
)
from app.db.models.field import Field
from app.db.models.sensor_device import SensorDevice
from app.db.models.sensor_observation import SensorObservation
from app.db.session import get_db_session
from app.schemas.export_quality import (
    ExportCertificateCreateRequest,
    ExportCertificateResponse,
    ExportLabResultCreateRequest,
    ExportLabResultResponse,
    ExportLotCreateRequest,
    ExportLotDetailResponse,
    ExportLotResponse,
    ExportQualityCriterionCreateRequest,
    ExportQualityCriterionResponse,
    ExportQualityGapResponse,
    ExportReadinessResponse,
    ExportTraceabilityResponse,
)
from app.services.export_quality import (
    TRACEABILITY_WINDOW_DAYS,
    build_evidence_pack_csv,
    build_traceability_response,
    certificate_responses,
    compute_quality_gaps,
    compute_readiness,
)

router = APIRouter(tags=["export-quality"])

_DISCLAIMER = (
    "Buyer-specification comparisons only. Not a regulatory compliance verdict, certification, or export "
    "approval -- a designated human reviewer/certifier always makes that call."
)


async def _get_lot_with_evidence(session: AsyncSession, lot_id: int) -> ExportLot:
    result = await session.execute(
        select(ExportLot)
        .options(
            selectinload(ExportLot.lab_results),
            selectinload(ExportLot.certificates),
            selectinload(ExportLot.quality_criteria),
        )
        .where(ExportLot.id == lot_id)
    )
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")
    return lot


def _lot_detail_response(lot: ExportLot) -> ExportLotDetailResponse:
    return ExportLotDetailResponse(
        id=lot.id, field_id=lot.field_id, crop_name=lot.crop_name, fruit_code=lot.fruit_code, variety=lot.variety,
        harvest_date=lot.harvest_date, harvest_moisture_pct=lot.harvest_moisture_pct,
        storage_type=lot.storage_type, storage_started_at=lot.storage_started_at,
        milling_broken_pct=lot.milling_broken_pct, milling_class=lot.milling_class,
        notes=lot.notes, created_at=lot.created_at,
        lab_results=lot.lab_results, certificates=certificate_responses(lot.certificates),
    )


@router.post(
    "/export/lots",
    response_model=ExportLotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a new export lot for a field",
)
async def create_export_lot(
    request: ExportLotCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    field = await session.get(Field, request.field_id)
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")

    fruit_code = request.fruit_code
    if fruit_code is not None:
        from app.services.eu_fruit_catalog import get_fruit_by_code
        if get_fruit_by_code(fruit_code) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown fruit_code")

    lot = ExportLot(
        field_id=request.field_id, crop_name=request.crop_name, fruit_code=fruit_code, variety=request.variety,
        harvest_date=request.harvest_date, harvest_moisture_pct=request.harvest_moisture_pct,
        storage_type=request.storage_type, storage_started_at=request.storage_started_at,
        milling_broken_pct=request.milling_broken_pct, milling_class=request.milling_class,
        notes=request.notes,
    )
    session.add(lot)
    await session.commit()
    await session.refresh(lot)
    return lot


@router.get(
    "/export/lots",
    response_model=list[ExportLotResponse],
    status_code=status.HTTP_200_OK,
    summary="List export lots, optionally filtered by field",
)
async def list_export_lots(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    field_id: Annotated[int | None, Query(alias="fieldId")] = None,
):
    query = select(ExportLot).order_by(ExportLot.created_at.desc())
    if field_id is not None:
        query = query.where(ExportLot.field_id == field_id)
    result = await session.execute(query)
    return result.scalars().all()


@router.get(
    "/export/lots/{lot_id}",
    response_model=ExportLotDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get one export lot with its lab results and certificates",
)
async def get_export_lot(lot_id: int, session: Annotated[AsyncSession, Depends(get_db_session)]):
    lot = await _get_lot_with_evidence(session, lot_id)
    return _lot_detail_response(lot)


@router.post(
    "/export/lots/{lot_id}/lab-results",
    response_model=ExportLabResultResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a lab result for an export lot",
)
async def create_lab_result(
    lot_id: int,
    request: ExportLabResultCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    lot = await session.get(ExportLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")

    lab_result = ExportLabResult(
        lot_id=lot_id, analyte=request.analyte, result_value=request.result_value, unit=request.unit,
        method=request.method, lab_name=request.lab_name, lab_accredited=request.lab_accredited,
        sample_date=request.sample_date, notes=request.notes,
    )
    session.add(lab_result)
    await session.commit()
    await session.refresh(lab_result)
    return lab_result


@router.get(
    "/export/lots/{lot_id}/lab-results",
    response_model=list[ExportLabResultResponse],
    status_code=status.HTTP_200_OK,
    summary="List lab results for an export lot",
)
async def list_lab_results(lot_id: int, session: Annotated[AsyncSession, Depends(get_db_session)]):
    lot = await session.get(ExportLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")
    result = await session.execute(
        select(ExportLabResult).where(ExportLabResult.lot_id == lot_id).order_by(ExportLabResult.created_at.desc())
    )
    return result.scalars().all()


@router.post(
    "/export/lots/{lot_id}/certificates",
    response_model=ExportCertificateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a certificate for an export lot",
)
async def create_certificate(
    lot_id: int,
    request: ExportCertificateCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    lot = await session.get(ExportLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")

    certificate = ExportCertificate(
        lot_id=lot_id, issuer=request.issuer, certificate_number=request.certificate_number,
        certificate_type=request.certificate_type,
        valid_from=request.valid_from, valid_to=request.valid_to, notes=request.notes,
    )
    session.add(certificate)
    await session.commit()
    await session.refresh(certificate)
    return certificate_responses([certificate])[0]


@router.get(
    "/export/lots/{lot_id}/certificates",
    response_model=list[ExportCertificateResponse],
    status_code=status.HTTP_200_OK,
    summary="List certificates for an export lot",
)
async def list_certificates(lot_id: int, session: Annotated[AsyncSession, Depends(get_db_session)]):
    lot = await session.get(ExportLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")
    result = await session.execute(
        select(ExportCertificate).where(ExportCertificate.lot_id == lot_id).order_by(ExportCertificate.created_at.desc())
    )
    return certificate_responses(result.scalars().all())


@router.get(
    "/export/lots/{lot_id}/readiness",
    response_model=ExportReadinessResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute export readiness for a lot from its actual records -- never APPROVED/CERTIFIED",
)
async def get_readiness(lot_id: int, session: Annotated[AsyncSession, Depends(get_db_session)]):
    lot = await _get_lot_with_evidence(session, lot_id)
    return compute_readiness(lot)


@router.get(
    "/export/lots/{lot_id}/evidence-pack",
    status_code=status.HTTP_200_OK,
    summary="Download a CSV evidence pack compiled from this lot's actual records",
)
async def get_evidence_pack(lot_id: int, session: Annotated[AsyncSession, Depends(get_db_session)]):
    lot = await _get_lot_with_evidence(session, lot_id)
    csv_text = build_evidence_pack_csv(lot)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="export-lot-{lot_id}-evidence-pack.csv"'},
    )


@router.get(
    "/export/lots/{lot_id}/traceability",
    response_model=ExportTraceabilityResponse,
    status_code=status.HTTP_200_OK,
    summary="Real field-level context for a lot -- never claimed as lot-specific proof",
)
async def get_traceability(lot_id: int, session: Annotated[AsyncSession, Depends(get_db_session)]):
    lot = await session.get(ExportLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")
    field = await session.get(Field, lot.field_id)
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field for this lot was not found")

    obs_query = (
        select(SensorObservation)
        .join(SensorDevice, SensorDevice.id == SensorObservation.device_id)
        .where(SensorDevice.field_id == field.id)
        .order_by(SensorObservation.recorded_at.desc())
        .limit(200)
    )
    assess_query = (
        select(Assessment)
        .where(Assessment.field_id == field.id)
        .order_by(Assessment.created_at.desc())
        .limit(200)
    )
    if lot.harvest_date is not None:
        window_start = lot.harvest_date - timedelta(days=TRACEABILITY_WINDOW_DAYS)
        window_end = lot.harvest_date + timedelta(days=TRACEABILITY_WINDOW_DAYS)
        obs_query = obs_query.where(
            SensorObservation.recorded_at >= window_start, SensorObservation.recorded_at <= window_end
        )
        assess_query = assess_query.where(
            Assessment.created_at >= window_start, Assessment.created_at <= window_end
        )
    else:
        obs_query = obs_query.limit(20)
        assess_query = assess_query.limit(20)

    observations = (await session.execute(obs_query)).scalars().all()
    assessments = (await session.execute(assess_query)).scalars().all()

    return build_traceability_response(lot, field, list(observations), list(assessments))


@router.post(
    "/export/lots/{lot_id}/criteria",
    response_model=ExportQualityCriterionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a buyer-specification quality criterion for a lot -- never a governed regulatory standard",
)
async def create_quality_criterion(
    lot_id: int,
    request: ExportQualityCriterionCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    lot = await session.get(ExportLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")
    if request.operator == "range" and request.threshold_value_max is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="operator 'range' requires thresholdValueMax",
        )

    criterion = ExportQualityCriterion(
        lot_id=lot_id, analyte=request.analyte, unit=request.unit, operator=request.operator,
        threshold_value=request.threshold_value, threshold_value_max=request.threshold_value_max,
        source_name=request.source_name, source_date=request.source_date,
        verified=request.verified, verified_note=request.verified_note,
    )
    session.add(criterion)
    await session.commit()
    await session.refresh(criterion)
    return criterion


@router.get(
    "/export/lots/{lot_id}/criteria",
    response_model=list[ExportQualityCriterionResponse],
    status_code=status.HTTP_200_OK,
    summary="List quality criteria recorded for a lot",
)
async def list_quality_criteria(lot_id: int, session: Annotated[AsyncSession, Depends(get_db_session)]):
    lot = await session.get(ExportLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")
    result = await session.execute(
        select(ExportQualityCriterion)
        .where(ExportQualityCriterion.lot_id == lot_id)
        .order_by(ExportQualityCriterion.created_at.desc())
    )
    return result.scalars().all()


@router.get(
    "/export/lots/{lot_id}/quality-gaps",
    response_model=ExportQualityGapResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare this lot's lab results against its recorded criteria -- never a compliance verdict",
)
async def get_quality_gaps(lot_id: int, session: Annotated[AsyncSession, Depends(get_db_session)]):
    lot = await _get_lot_with_evidence(session, lot_id)
    results = compute_quality_gaps(lot, lot.quality_criteria)
    return ExportQualityGapResponse(lot_id=lot_id, results=results, disclaimer=_DISCLAIMER)
