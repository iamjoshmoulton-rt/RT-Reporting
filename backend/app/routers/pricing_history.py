"""Pricing History endpoints — Invoice-based product pricing data."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import pricing_history_service

router = APIRouter(prefix="/api/pricing-history", tags=["Pricing History"])


@router.get("/overview")
async def pricing_history_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    channel_ids: list[int] | None = Query(None),
    category_ids: list[int] | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("pricing_history.view")),
):
    """Pricing History dashboard — KPIs, top products, channel & category breakdowns."""
    return await pricing_history_service.get_overview(
        db, date_from, date_to,
        channel_ids=channel_ids,
        category_ids=category_ids,
    )


@router.get("/filter-options")
async def pricing_history_filter_options(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("pricing_history.view")),
):
    """Dropdown values for channel and category multi-select filters."""
    return await pricing_history_service.get_filter_options(db)
