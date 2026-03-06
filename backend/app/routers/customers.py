from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.services.customers_service import (
    get_customers_summary,
    get_top_customers,
    get_customers_by_period,
    get_customer_list,
    get_customer_detail,
    suggest_customers,
)

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("/summary", dependencies=[Depends(require_permission("customers.summary"))])
async def summary(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
):
    return await get_customers_summary(db, date_from, date_to)


@router.get("/top", dependencies=[Depends(require_permission("customers.top_customers"))])
async def top(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
):
    return await get_top_customers(db, date_from, date_to, limit)


@router.get("/by-period", dependencies=[Depends(require_permission("customers.customers_chart"))])
async def by_period(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    compare_to: str | None = Query(None),
):
    current = await get_customers_by_period(db, date_from, date_to, group_by)
    comparison = None
    if compare_to and date_from and date_to:
        delta = date_to - date_from
        if compare_to == "previous_period":
            comp_to = date_from - timedelta(days=1)
            comp_from = comp_to - delta
        else:
            comp_from = date_from.replace(year=date_from.year - 1)
            comp_to = date_to.replace(year=date_to.year - 1)
        comparison = await get_customers_by_period(db, comp_from, comp_to, group_by)
    return {"current": current, "comparison": comparison}


@router.get("/suggest", dependencies=[Depends(require_permission("customers.customer_table"))])
async def suggest(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_odoo_db),
):
    return await suggest_customers(db, q, limit)


@router.get("/list", dependencies=[Depends(require_permission("customers.customer_table"))])
async def customer_list(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
):
    return await get_customer_list(db, date_from, date_to, offset, limit, search)


@router.get("/{customer_id}", dependencies=[Depends(require_permission("customers.customer_table"))])
async def customer_detail(
    customer_id: int,
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
):
    result = await get_customer_detail(db, customer_id, date_from, date_to, offset, limit)
    if result is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Customer not found")
    return result
