from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import accounting_service

router = APIRouter(prefix="/api/accounting", tags=["Accounting"])


@router.get("/summary")
async def accounting_summary(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("accounting.pl_statement")),
):
    return await accounting_service.get_accounting_summary(db, date_from, date_to)


@router.get("/revenue-by-period")
async def revenue_by_period(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    compare_to: str | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("accounting.pl_statement")),
):
    current = await accounting_service.get_revenue_by_period(db, date_from, date_to, group_by)
    comparison = None

    if compare_to and date_from and date_to:
        delta = date_to - date_from
        if compare_to == "previous_period":
            comp_to = date_from
            comp_from = date_from - delta
        elif compare_to == "previous_year":
            comp_from = date_from.replace(year=date_from.year - 1)
            comp_to = date_to.replace(year=date_to.year - 1)
        else:
            comp_from, comp_to = None, None

        if comp_from and comp_to:
            comparison = await accounting_service.get_revenue_by_period(db, comp_from, comp_to, group_by)

    return {"current": current, "comparison": comparison}


@router.get("/receivable-aging")
async def receivable_aging(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("accounting.receivable_aging")),
):
    return await accounting_service.get_receivable_aging(db)


@router.get("/payable-aging")
async def payable_aging(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("accounting.payable_aging")),
):
    return await accounting_service.get_payable_aging(db)


@router.get("/invoices")
async def invoices(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    move_type: str | None = Query(None),
    payment_state: str | None = Query(None),
    partner_id: int | None = Query(None),
    offset: int = Query(0),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("accounting.journal_entries")),
):
    return await accounting_service.get_invoices(
        db, date_from, date_to, move_type, payment_state, partner_id, offset, limit
    )
