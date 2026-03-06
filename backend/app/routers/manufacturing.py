from datetime import date
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import manufacturing_service

router = APIRouter(prefix="/api/manufacturing", tags=["Manufacturing"])


@router.get("/summary")
async def manufacturing_summary(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("manufacturing.summary")),
):
    return await manufacturing_service.get_manufacturing_summary(db, date_from, date_to)


@router.get("/by-period")
async def production_by_period(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    compare_to: str | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("manufacturing.production_chart")),
):
    current = await manufacturing_service.get_production_by_period(db, date_from, date_to, group_by)
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
            comparison = await manufacturing_service.get_production_by_period(db, comp_from, comp_to, group_by)

    return {"current": current, "comparison": comparison}


@router.get("/top-products")
async def top_products_manufactured(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(10),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("manufacturing.top_products")),
):
    return await manufacturing_service.get_top_products_manufactured(db, date_from, date_to, limit)


@router.get("/orders")
async def manufacturing_orders(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    state: str | None = Query(None),
    offset: int = Query(0),
    limit: int = Query(50),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("manufacturing.order_table")),
):
    return await manufacturing_service.get_manufacturing_orders(db, date_from, date_to, state, offset, limit, search)


@router.get("/orders/{order_id}")
async def manufacturing_order_detail(
    order_id: int,
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("manufacturing.order_table")),
):
    result = await manufacturing_service.get_manufacturing_order_detail(db, order_id)
    if not result:
        raise HTTPException(status_code=404, detail="Manufacturing order not found")
    return result
