"""Trade-In Dashboard endpoints — Purchase order based trade-in data."""

from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import trade_in_service

router = APIRouter(prefix="/api/trade-in", tags=["Trade-In"])


@router.get("/overview")
async def trade_in_overview(
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("trade_in.view")),
):
    """Trade-In dashboard — KPIs, top vendors, top categories, incoming by vendor."""
    return await trade_in_service.get_overview(db, date_from, date_to)
