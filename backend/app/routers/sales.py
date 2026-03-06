from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import sales_service

router = APIRouter(prefix="/api/sales", tags=["Sales"])


@router.get("/kpis")
async def sales_kpis(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    compare_to: str | None = Query(None, description="previous_period or previous_year; when set, KPI cards show vs comparison trend"),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.revenue_chart")),
):
    return await sales_service.get_sales_kpis(db, date_from, date_to, compare_to)


@router.get("/kpi-drilldown")
async def sales_kpi_drilldown(
    kpi: str = Query(..., description="One of: invoiced_revenue, invoiced_margin, margin_percent, units_sold, open_pipeline, open_pipeline_date, max_potential_revenue, avg_sell_price"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    offset: int = Query(0),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.revenue_chart")),
):
    if kpi not in sales_service.DRILLDOWN_KPI_TYPES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown KPI: {kpi}")
    return await sales_service.get_sales_kpi_drilldown(db, kpi, date_from, date_to, offset, limit)


@router.get("/summary")
async def sales_summary(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.revenue_chart")),
):
    return await sales_service.get_sales_summary(db, date_from, date_to)


@router.get("/by-period")
async def sales_by_period(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    compare_to: str | None = Query(None, description="previous_period or previous_year"),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.revenue_chart")),
):
    current = await sales_service.get_sales_by_period(db, date_from, date_to, group_by)
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
            comparison = await sales_service.get_sales_by_period(db, comp_from, comp_to, group_by)

    return {"current": current, "comparison": comparison}


@router.get("/by-customer")
async def sales_by_customer(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(20),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.by_customer")),
):
    return await sales_service.get_sales_by_customer(db, date_from, date_to, limit)


@router.get("/by-product")
async def sales_by_product(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(20),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.by_product")),
):
    return await sales_service.get_sales_by_product(db, date_from, date_to, limit)


@router.get("/orders")
async def sales_orders(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    state: str | None = Query(None),
    partner_id: int | None = Query(None),
    offset: int = Query(0),
    limit: int = Query(50),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.order_table")),
):
    return await sales_service.get_sales_orders(db, date_from, date_to, state, partner_id, offset, limit, search)


@router.get("/orders/{order_id}", dependencies=[Depends(require_permission("sales.order_table"))])
async def order_detail(
    order_id: int,
    db: AsyncSession = Depends(get_odoo_db),
):
    result = await sales_service.get_order_detail(db, order_id)
    if result is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Order not found")
    return result
