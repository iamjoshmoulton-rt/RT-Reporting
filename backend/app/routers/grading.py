"""Grading dashboard endpoints — Total Stocked & Processed Stock views."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import grading_service

router = APIRouter(prefix="/api/inventory/grading", tags=["Grading"])

VALID_VIEWS = {"total-stocked", "processed-stock"}


def _validate_view(view: str) -> str:
    if view not in VALID_VIEWS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Invalid view: {view}")
    return view


@router.get("/{view}/overview")
async def grading_overview(
    view: str,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.grading")),
):
    """Combined endpoint: summary + grades + daily_grades + categories in one request."""
    _validate_view(view)
    return await grading_service.get_grading_overview(db, view, date_from, date_to)


@router.get("/{view}/summary")
async def grading_summary(
    view: str,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.grading")),
):
    _validate_view(view)
    return await grading_service.get_grading_summary(db, view, date_from, date_to)


@router.get("/{view}/grades")
async def grade_breakdown(
    view: str,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.grading")),
):
    _validate_view(view)
    return await grading_service.get_grade_breakdown(db, view, date_from, date_to)


@router.get("/{view}/daily-grades")
async def daily_grade_data(
    view: str,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.grading")),
):
    _validate_view(view)
    return await grading_service.get_daily_grade_data(db, view, date_from, date_to)


@router.get("/{view}/categories")
async def category_totals(
    view: str,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.grading")),
):
    _validate_view(view)
    return await grading_service.get_category_totals(db, view, date_from, date_to)


@router.get("/{view}/items")
async def grading_items(
    view: str,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    search: str | None = Query(None),
    grade: str | None = Query(None),
    category: str | None = Query(None),
    cost_min: float | None = Query(None),
    cost_max: float | None = Query(None),
    offset: int = Query(0),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.grading")),
):
    _validate_view(view)
    return await grading_service.get_grading_items(
        db, view, date_from, date_to, search, grade, category,
        cost_min, cost_max, offset, limit,
    )
