"""Sales Dashboard endpoints — replicate Odoo 17 Sales Spreadsheet Dashboard."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import sales_dashboard_service

router = APIRouter(prefix="/api/sales-dashboard", tags=["Sales Dashboard"])


@router.get("/overview")
async def sales_dashboard_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    salesperson_id: int | None = Query(None),
    customer_id: int | None = Query(None),
    channel_id: int | None = Query(None),
    product_id: int | None = Query(None),
    category_id: int | None = Query(None),
    country_id: int | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.revenue_chart")),
):
    """Full dashboard payload — all KPIs, charts, and tables in one request."""
    return await sales_dashboard_service.get_sales_dashboard_overview(
        db, date_from, date_to,
        salesperson_id=salesperson_id,
        customer_id=customer_id,
        channel_id=channel_id,
        product_id=product_id,
        category_id=category_id,
        country_id=country_id,
    )


@router.get("/filter-options")
async def sales_dashboard_filter_options(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales.revenue_chart")),
):
    """Dropdown values for salesperson, channel, category, country filters."""
    return await sales_dashboard_service.get_filter_options(db)
