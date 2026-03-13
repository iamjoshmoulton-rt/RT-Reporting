"""Accounting Dashboard endpoints — P&L-based revenue, margin, COGS analysis."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import accounting_dash_service

router = APIRouter(prefix="/api/accounting-dash", tags=["Accounting Dashboard"])


@router.get("/overview")
async def accounting_dash_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("accounting_dash.view")),
):
    """Accounting dashboard — KPIs, revenue trend, channel stats, rev share."""
    return await accounting_dash_service.get_overview(db, date_from, date_to)
