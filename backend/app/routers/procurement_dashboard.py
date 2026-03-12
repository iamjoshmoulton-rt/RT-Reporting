"""Procurement Dashboard endpoints — replicate Odoo 17 Procurement Spreadsheet Dashboard."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import procurement_dashboard_service

router = APIRouter(prefix="/api/procurement-dashboard", tags=["Procurement Dashboard"])


@router.get("/overview")
async def procurement_dashboard_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    vendor_id: int | None = Query(None),
    category_id: int | None = Query(None),
    buyer_id: int | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("procurement.orders_chart")),
):
    """Full dashboard payload — KPIs + 6 tables in one request."""
    return await procurement_dashboard_service.get_procurement_dashboard_overview(
        db, date_from, date_to,
        vendor_id=vendor_id,
        category_id=category_id,
        buyer_id=buyer_id,
    )


@router.get("/filter-options")
async def procurement_dashboard_filter_options(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("procurement.orders_chart")),
):
    """Dropdown values for vendor, category, buyer filters."""
    return await procurement_dashboard_service.get_filter_options(db)
