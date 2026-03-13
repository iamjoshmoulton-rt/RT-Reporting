"""Sales Margin Dashboard endpoints — Invoice-based margin analysis."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import sales_margin_service

router = APIRouter(prefix="/api/sales-margin", tags=["Sales Margin"])


@router.get("/overview")
async def sales_margin_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("sales_margin.view")),
):
    """Sales Margin dashboard — KPIs, salesperson breakdown, transaction list."""
    return await sales_margin_service.get_overview(db, date_from, date_to)
