from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.services.quality_service import (
    get_quality_summary,
    get_checks_by_period,
    get_pass_fail_breakdown,
    get_quality_checks,
)

router = APIRouter(prefix="/api/quality", tags=["quality"])


@router.get("/summary", dependencies=[Depends(require_permission("quality.summary"))])
async def summary(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
):
    return await get_quality_summary(db, date_from, date_to)


@router.get("/by-period", dependencies=[Depends(require_permission("quality.checks_chart"))])
async def by_period(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    compare_to: str | None = Query(None),
):
    current = await get_checks_by_period(db, date_from, date_to, group_by)
    comparison = None
    if compare_to and date_from and date_to:
        delta = date_to - date_from
        if compare_to == "previous_period":
            comp_to = date_from - timedelta(days=1)
            comp_from = comp_to - delta
        else:
            comp_from = date_from.replace(year=date_from.year - 1)
            comp_to = date_to.replace(year=date_to.year - 1)
        comparison = await get_checks_by_period(db, comp_from, comp_to, group_by)
    return {"current": current, "comparison": comparison}


@router.get("/breakdown", dependencies=[Depends(require_permission("quality.breakdown"))])
async def breakdown(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
):
    return await get_pass_fail_breakdown(db, date_from, date_to)


@router.get("/checks", dependencies=[Depends(require_permission("quality.check_table"))])
async def checks(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    quality_state: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    return await get_quality_checks(db, date_from, date_to, quality_state, offset, limit)
