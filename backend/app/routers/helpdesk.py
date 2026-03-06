from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.services.helpdesk_service import (
    get_helpdesk_summary,
    get_tickets_by_period,
    get_tickets_by_stage,
    get_helpdesk_tickets,
    get_ticket_detail,
)

router = APIRouter(prefix="/api/helpdesk", tags=["helpdesk"])


@router.get("/summary", dependencies=[Depends(require_permission("helpdesk.summary"))])
async def summary(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
):
    return await get_helpdesk_summary(db, date_from, date_to)


@router.get("/by-period", dependencies=[Depends(require_permission("helpdesk.tickets_chart"))])
async def by_period(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    compare_to: str | None = Query(None),
):
    current = await get_tickets_by_period(db, date_from, date_to, group_by)
    comparison = None
    if compare_to and date_from and date_to:
        delta = date_to - date_from
        if compare_to == "previous_period":
            comp_to = date_from - timedelta(days=1)
            comp_from = comp_to - delta
        else:  # previous_year
            comp_from = date_from.replace(year=date_from.year - 1)
            comp_to = date_to.replace(year=date_to.year - 1)
        comparison = await get_tickets_by_period(db, comp_from, comp_to, group_by)
    return {"current": current, "comparison": comparison}


@router.get("/by-stage", dependencies=[Depends(require_permission("helpdesk.by_stage"))])
async def by_stage(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
):
    return await get_tickets_by_stage(db, date_from, date_to)


@router.get("/tickets", dependencies=[Depends(require_permission("helpdesk.ticket_table"))])
async def tickets(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    stage_id: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
):
    return await get_helpdesk_tickets(db, date_from, date_to, stage_id, offset, limit, search)


@router.get("/tickets/{ticket_id}", dependencies=[Depends(require_permission("helpdesk.ticket_table"))])
async def ticket_detail(
    ticket_id: int,
    db: AsyncSession = Depends(get_odoo_db),
):
    result = await get_ticket_detail(db, ticket_id)
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return result
