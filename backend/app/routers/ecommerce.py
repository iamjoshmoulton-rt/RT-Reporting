"""E-Commerce Dashboard endpoints — Invoice-based & Order-based views."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import ecommerce_service

router = APIRouter(prefix="/api/ecommerce", tags=["E-Commerce"])


@router.get("/invoice/overview")
async def ecommerce_invoice_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    channel_ids: list[int] | None = Query(None),
    category_ids: list[int] | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("ecommerce.invoice_view")),
):
    """Invoice-based E-Commerce dashboard — KPIs, comparison stats, charts & tables."""
    return await ecommerce_service.get_invoice_overview(
        db, date_from, date_to,
        channel_ids=channel_ids,
        category_ids=category_ids,
    )


@router.get("/order/overview")
async def ecommerce_order_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    channel_ids: list[int] | None = Query(None),
    category_ids: list[int] | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("ecommerce.order_view")),
):
    """Order-based E-Commerce dashboard — KPIs, channels, products & categories."""
    return await ecommerce_service.get_order_overview(
        db, date_from, date_to,
        channel_ids=channel_ids,
        category_ids=category_ids,
    )


@router.get("/filter-options")
async def ecommerce_filter_options(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("ecommerce.invoice_view")),
):
    """Dropdown values for channel and category multi-select filters."""
    return await ecommerce_service.get_filter_options(db)
