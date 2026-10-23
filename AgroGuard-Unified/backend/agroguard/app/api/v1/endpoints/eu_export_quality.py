from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.export_lot import ExportLot
from app.db.session import get_db_session
from app.schemas.eu_export_quality import (
    EUCriteriaImportValidateRequest,
    EUCriteriaImportValidateResponse,
    EUMemberStateEntry,
    EUReadinessResponse,
    EURequirementsResponse,
    FruitCatalogEntry,
)
from app.services.eu_criteria_importer import validate_rows
from app.services.eu_criteria_reference import get_requirements
from app.services.eu_export_readiness import evaluate_eu_readiness
from app.services.eu_fruit_catalog import get_fruit_catalog
from app.services.eu_member_states import EU_MEMBER_STATES, is_valid_member_state

router = APIRouter(tags=["export-quality-eu"])

_REQUIREMENTS_DISCLAIMER = (
    "Reference knowledge only, not evidence of anything about a specific lot. A row marked "
    "needs_review or unavailable has not been independently confirmed against its source_url "
    "and must never be treated as a legal pass/fail."
)


@router.get(
    "/export/fruits",
    response_model=list[FruitCatalogEntry],
    status_code=status.HTTP_200_OK,
    summary="List the fruit catalog reused read-only from Crop Suggestion's existing dataset",
)
async def list_fruits():
    return get_fruit_catalog()


@router.get(
    "/export/eu/member-states",
    response_model=list[EUMemberStateEntry],
    status_code=status.HTTP_200_OK,
    summary="The 27 current EU Member States -- never includes UK/Switzerland/Norway",
)
async def list_eu_member_states():
    return EU_MEMBER_STATES


@router.get(
    "/export/eu/requirements",
    response_model=EURequirementsResponse,
    status_code=status.HTTP_200_OK,
    summary="EU requirements applicable to one fruit/destination -- reference data, not a verdict",
)
async def get_eu_requirements(
    fruit: Annotated[str, Query()],
    member_state: Annotated[str | None, Query(alias="memberState")] = None,
):
    known_codes = {f.fruit_code for f in get_fruit_catalog()}
    if fruit not in known_codes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown fruit code")
    if not is_valid_member_state(member_state):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'{member_state}' is not one of the 27 current EU Member States",
        )

    requirements = get_requirements(fruit_code=fruit, destination_market="EU", member_state=member_state)
    return EURequirementsResponse(
        fruit_code=fruit,
        destination_market="EU",
        member_state=member_state,
        requirements=requirements,
        disclaimer=_REQUIREMENTS_DISCLAIMER,
    )


@router.get(
    "/export/lots/{lot_id}/eu-readiness",
    response_model=EUReadinessResponse,
    status_code=status.HTTP_200_OK,
    summary="EU readiness for one lot -- never APPROVED/CERTIFIED, see EUReadinessResponse.status",
)
async def get_eu_readiness(
    lot_id: int,
    fruit: Annotated[str, Query()],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    member_state: Annotated[str | None, Query(alias="memberState")] = None,
):
    known_codes = {f.fruit_code for f in get_fruit_catalog()}
    if fruit not in known_codes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown fruit code")
    if not is_valid_member_state(member_state):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"'{member_state}' is not one of the 27 current EU Member States",
        )

    result = await session.execute(
        select(ExportLot)
        .options(selectinload(ExportLot.lab_results), selectinload(ExportLot.certificates))
        .where(ExportLot.id == lot_id)
    )
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export lot not found")

    requirements = get_requirements(fruit_code=fruit, destination_market="EU", member_state=member_state)
    return evaluate_eu_readiness(
        lot=lot, fruit_code=fruit, destination_market="EU", member_state=member_state, criteria=requirements
    )


@router.post(
    "/export/eu/criteria/import/validate",
    response_model=EUCriteriaImportValidateResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate candidate EU criteria rows -- dry-run only, never writes the reference dataset or a database",
)
async def validate_eu_criteria_import(request: EUCriteriaImportValidateRequest):
    results = validate_rows(request.rows)
    accepted = sum(1 for r in results if r.accepted)
    return EUCriteriaImportValidateResponse(
        total_rows=len(results),
        accepted_count=accepted,
        rejected_count=len(results) - accepted,
        results=results,
        note=(
            "Validation only. No row was written to app/data/export_data/eu_fruit_criteria.csv or any database "
            "table. Accepted rows still require independent legal confirmation before being added "
            "to the shipped reference dataset by a human reviewer."
        ),
    )
