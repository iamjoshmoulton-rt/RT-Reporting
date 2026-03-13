"""Pricing History (SO Data) endpoints — Sale Order based product pricing."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import pricing_history_so_service

router = APIRouter(prefix="/api/pricing-history-so", tags=["Pricing History SO"])


@router.get("/overview")
async def pricing_history_so_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    channel_ids: list[int] | None = Query(None),
    category_ids: list[int] | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("pricing_history_so.view")),
):
    """SO-based Pricing History — top products (excl. WhatNot), ASP by customer, channels."""
    return await pricing_history_so_service.get_overview(
        db, date_from, date_to,
        channel_ids=channel_ids,
        category_ids=category_ids,
    )


@router.get("/filter-options")
async def pricing_history_so_filter_options(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("pricing_history_so.view")),
):
    """Dropdown values for channel and category multi-select filters."""
    return await pricing_history_so_service.get_filter_options(db)
