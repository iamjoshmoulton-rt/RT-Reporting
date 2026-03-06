from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.services.crm_service import (
    get_crm_summary,
    get_pipeline_by_stage,
    get_leads_by_period,
    get_crm_leads,
    get_lead_detail,
)

router = APIRouter(prefix="/api/crm", tags=["crm"])


@router.get("/summary", dependencies=[Depends(require_permission("crm.summary"))])
async def summary(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
):
    return await get_crm_summary(db, date_from, date_to)


@router.get("/pipeline", dependencies=[Depends(require_permission("crm.pipeline"))])
async def pipeline(
    db: AsyncSession = Depends(get_odoo_db),
):
    return await get_pipeline_by_stage(db)


@router.get("/by-period", dependencies=[Depends(require_permission("crm.leads_chart"))])
async def by_period(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    compare_to: str | None = Query(None),
):
    current = await get_leads_by_period(db, date_from, date_to, group_by)
    comparison = None
    if compare_to and date_from and date_to:
        delta = date_to - date_from
        if compare_to == "previous_period":
            comp_to = date_from - timedelta(days=1)
            comp_from = comp_to - delta
        else:
            comp_from = date_from.replace(year=date_from.year - 1)
            comp_to = date_to.replace(year=date_to.year - 1)
        comparison = await get_leads_by_period(db, comp_from, comp_to, group_by)
    return {"current": current, "comparison": comparison}


@router.get("/leads", dependencies=[Depends(require_permission("crm.lead_table"))])
async def leads(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    stage_id: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
):
    return await get_crm_leads(db, date_from, date_to, stage_id, offset, limit, search)


@router.get("/leads/{lead_id}", dependencies=[Depends(require_permission("crm.lead_table"))])
async def lead_detail(
    lead_id: int,
    db: AsyncSession = Depends(get_odoo_db),
):
    result = await get_lead_detail(db, lead_id)
    if not result:
        raise HTTPException(status_code=404, detail="Lead not found")
    return result
