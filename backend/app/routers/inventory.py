from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.services import inventory_service

router = APIRouter(prefix="/api/inventory", tags=["Inventory"])


@router.get("/summary")
async def inventory_summary(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.stock_levels")),
):
    return await inventory_service.get_inventory_summary(db)


@router.get("/stock-levels")
async def stock_levels(
    location_id: int | None = Query(None),
    offset: int = Query(0),
    limit: int = Query(100),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.stock_levels")),
):
    return await inventory_service.get_stock_levels(db, location_id, limit, offset, search)


@router.get("/movements")
async def stock_movements(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    product_id: int | None = Query(None),
    state: str = Query("done"),
    offset: int = Query(0),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.movements")),
):
    return await inventory_service.get_stock_movements(db, date_from, date_to, product_id, state, offset, limit)


@router.get("/by-warehouse")
async def stock_by_warehouse(
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("inventory.by_warehouse")),
):
    return await inventory_service.get_stock_by_warehouse(db)


@router.get("/products/{product_id}", dependencies=[Depends(require_permission("inventory.stock_levels"))])
async def product_detail(
    product_id: int,
    offset: int = Query(0),
    limit: int = Query(20),
    db: AsyncSession = Depends(get_odoo_db),
):
    result = await inventory_service.get_product_detail(db, product_id, offset, limit)
    if result is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Product not found")
    return result
