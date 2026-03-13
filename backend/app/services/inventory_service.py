"""Inventory service with performance optimizations.

Optimizations:
1. UTC date range — filter on raw column (index-friendly) instead of local_date() wrapper
2. Response cache — 2-min TTL for summary and stock levels
3. Parallel queries — product detail runs independent queries concurrently
4. JOIN-based location names — replaces correlated scalar subqueries
"""

import asyncio
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.inventory import StockQuant, StockMove, StockLocation, StockWarehouse
from app.odoo_models.partners import ProductTemplate, ProductProduct
from app.services.tz import get_effective_timezone
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

CACHE_TTL = 120  # seconds


# ── UTC date range helper (index-friendly) ────────────────────────────
def _date_to_utc_range(d_from: date, d_to: date) -> tuple[datetime, datetime]:
    """Convert local dates to UTC datetime range for WHERE on raw UTC columns."""
    tz = get_effective_timezone()
    local_tz = ZoneInfo(tz)
    start_local = datetime(d_from.year, d_from.month, d_from.day, 0, 0, 0, tzinfo=local_tz)
    next_day = d_to + timedelta(days=1)
    end_local = datetime(next_day.year, next_day.month, next_day.day, 0, 0, 0, tzinfo=local_tz)
    utc = ZoneInfo("UTC")
    return (
        start_local.astimezone(utc).replace(tzinfo=None),
        end_local.astimezone(utc).replace(tzinfo=None),
    )


def _product_name():
    """Extract English product name from JSONB name field."""
    return ProductTemplate.name["en_US"].as_string()


async def get_inventory_summary(db: AsyncSession):
    cached = await cache_get("inv:summary")
    if cached:
        return cached

    internal_locations = select(StockLocation.id).where(StockLocation.usage == "internal")
    result = await db.execute(
        select(
            func.count(func.distinct(StockQuant.product_id)).label("unique_products"),
            func.coalesce(func.sum(StockQuant.quantity), 0).label("total_qty"),
            func.coalesce(func.sum(StockQuant.reserved_quantity), 0).label("total_reserved"),
        ).where(StockQuant.location_id.in_(internal_locations))
    )
    row = result.one()
    data = {
        "unique_products": row.unique_products,
        "total_quantity": float(row.total_qty),
        "total_reserved": float(row.total_reserved),
        "available_quantity": float(row.total_qty) - float(row.total_reserved),
    }
    await cache_set("inv:summary", data, CACHE_TTL)
    return data


async def get_stock_levels(
    db: AsyncSession,
    location_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
):
    cache_key = f"inv:stock_levels:{location_id}:{limit}:{offset}:{search}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    internal_locations = select(StockLocation.id).where(StockLocation.usage == "internal")

    filters = [StockQuant.location_id.in_(internal_locations)]
    if location_id:
        filters = [StockQuant.location_id == location_id]
    if search:
        term = f"%{search}%"
        filters.append(or_(
            _product_name().ilike(term),
            ProductTemplate.default_code.ilike(term),
        ))

    count_q = select(func.count(func.distinct(StockQuant.product_id)))
    if search:
        count_q = count_q.join(ProductProduct, StockQuant.product_id == ProductProduct.id).join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
    count_q = count_q.where(*filters)

    result_q = (
        select(
            ProductTemplate.id.label("product_id"),
            _product_name().label("product_name"),
            ProductTemplate.default_code.label("internal_ref"),
            func.coalesce(func.sum(StockQuant.quantity), 0).label("on_hand"),
            func.coalesce(func.sum(StockQuant.reserved_quantity), 0).label("reserved"),
            (func.coalesce(func.sum(StockQuant.quantity), 0) -
             func.coalesce(func.sum(StockQuant.reserved_quantity), 0)).label("available"),
        )
        .join(ProductProduct, StockQuant.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*filters)
        .group_by(ProductTemplate.id, _product_name(), ProductTemplate.default_code)
        .order_by(func.sum(StockQuant.quantity).desc())
        .offset(offset)
        .limit(limit)
    )

    # Run count + fetch in parallel with separate sessions
    async def run_count():
        async with OdooSessionLocal() as s:
            return (await s.execute(count_q)).scalar()

    async def run_fetch():
        async with OdooSessionLocal() as s:
            return (await s.execute(result_q)).all()

    total, rows = await asyncio.gather(run_count(), run_fetch())

    items = [
        {
            "product_id": row.product_id,
            "product_name": row.product_name,
            "internal_ref": row.internal_ref,
            "on_hand": float(row.on_hand),
            "reserved": float(row.reserved),
            "available": float(row.available),
        }
        for row in rows
    ]
    data = {"total": total, "items": items}
    await cache_set(cache_key, data, CACHE_TTL)
    return data


async def get_stock_movements(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    product_id: int | None = None,
    state: str = "done",
    offset: int = 0,
    limit: int = 50,
):
    filters = [StockMove.state == state]

    # Use UTC range for index-friendly filtering (instead of local_date wrapper)
    if date_from and date_to:
        utc_start, utc_end = _date_to_utc_range(date_from, date_to)
        filters.append(StockMove.date >= utc_start)
        filters.append(StockMove.date < utc_end)
    elif date_from:
        utc_start, _ = _date_to_utc_range(date_from, date_from)
        filters.append(StockMove.date >= utc_start)
    elif date_to:
        _, utc_end = _date_to_utc_range(date_to, date_to)
        filters.append(StockMove.date < utc_end)

    if product_id:
        filters.append(StockMove.product_id == product_id)

    # Use JOINs for location names instead of correlated subqueries
    src_loc = StockLocation.__table__.alias("src_loc")
    dst_loc = StockLocation.__table__.alias("dst_loc")

    count_q = select(func.count(StockMove.id)).where(*filters)

    data_q = (
        select(
            StockMove.id,
            StockMove.reference,
            StockMove.product_id,
            _product_name().label("product_name"),
            StockMove.quantity,
            StockMove.date,
            StockMove.origin,
            src_loc.c.name.label("source_location"),
            dst_loc.c.name.label("dest_location"),
        )
        .join(ProductProduct, StockMove.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(src_loc, StockMove.location_id == src_loc.c.id, isouter=True)
        .join(dst_loc, StockMove.location_dest_id == dst_loc.c.id, isouter=True)
        .where(*filters)
        .order_by(StockMove.date.desc())
        .offset(offset)
        .limit(limit)
    )

    # Parallel count + fetch
    async def run_count():
        async with OdooSessionLocal() as s:
            return (await s.execute(count_q)).scalar()

    async def run_fetch():
        async with OdooSessionLocal() as s:
            return (await s.execute(data_q)).all()

    total, rows = await asyncio.gather(run_count(), run_fetch())

    moves = [
        {
            "id": row.id,
            "reference": row.reference,
            "product_id": row.product_id,
            "product_name": row.product_name,
            "quantity": float(row.quantity) if row.quantity else 0,
            "date": str(row.date) if row.date else None,
            "origin": row.origin,
            "source_location": row.source_location,
            "dest_location": row.dest_location,
        }
        for row in rows
    ]
    return {"total": total, "moves": moves}


async def get_product_detail(
    db: AsyncSession,
    product_id: int,
    offset: int = 0,
    limit: int = 20,
):
    """Product detail: info, stock by location, recent movements — queries run in parallel."""
    # Product info (must run first to verify product exists)
    prod_result = await db.execute(
        select(
            ProductTemplate.id, _product_name().label("name"),
            ProductTemplate.default_code, ProductTemplate.type,
            ProductTemplate.list_price,
            ProductTemplate.active, ProductTemplate.create_date,
        ).where(ProductTemplate.id == product_id)
    )
    product = prod_result.one_or_none()
    if not product:
        return None

    variant_ids_q = select(ProductProduct.id).where(ProductProduct.product_tmpl_id == product_id)
    internal_locations = select(StockLocation.id).where(StockLocation.usage == "internal")
    move_filters = [StockMove.product_id.in_(variant_ids_q), StockMove.state == "done"]

    # Location name JOINs for movements
    src_loc = StockLocation.__table__.alias("src_loc")
    dst_loc = StockLocation.__table__.alias("dst_loc")

    # Run all 4 independent queries in parallel
    async def get_stock_agg():
        async with OdooSessionLocal() as s:
            r = await s.execute(
                select(
                    func.coalesce(func.sum(StockQuant.quantity), 0).label("on_hand"),
                    func.coalesce(func.sum(StockQuant.reserved_quantity), 0).label("reserved"),
                ).where(
                    StockQuant.product_id.in_(variant_ids_q),
                    StockQuant.location_id.in_(internal_locations),
                )
            )
            return r.one()

    async def get_stock_by_loc():
        async with OdooSessionLocal() as s:
            r = await s.execute(
                select(
                    StockLocation.complete_name.label("location_name"),
                    func.coalesce(func.sum(StockQuant.quantity), 0).label("on_hand"),
                    func.coalesce(func.sum(StockQuant.reserved_quantity), 0).label("reserved"),
                )
                .join(StockLocation, StockQuant.location_id == StockLocation.id)
                .where(
                    StockQuant.product_id.in_(variant_ids_q),
                    StockLocation.usage == "internal",
                )
                .group_by(StockLocation.id, StockLocation.complete_name)
                .having(func.sum(StockQuant.quantity) != 0)
                .order_by(func.sum(StockQuant.quantity).desc())
            )
            return r.all()

    async def get_move_count():
        async with OdooSessionLocal() as s:
            return (await s.execute(select(func.count(StockMove.id)).where(*move_filters))).scalar()

    async def get_moves():
        async with OdooSessionLocal() as s:
            r = await s.execute(
                select(
                    StockMove.id, StockMove.reference,
                    StockMove.quantity, StockMove.date,
                    StockMove.origin,
                    src_loc.c.name.label("source_location"),
                    dst_loc.c.name.label("dest_location"),
                )
                .join(src_loc, StockMove.location_id == src_loc.c.id, isouter=True)
                .join(dst_loc, StockMove.location_dest_id == dst_loc.c.id, isouter=True)
                .where(*move_filters)
                .order_by(StockMove.date.desc())
                .offset(offset)
                .limit(limit)
            )
            return r.all()

    stock_agg, loc_rows, move_count, move_rows = await asyncio.gather(
        get_stock_agg(), get_stock_by_loc(), get_move_count(), get_moves()
    )

    locations = [
        {
            "location": row.location_name,
            "on_hand": float(row.on_hand),
            "reserved": float(row.reserved),
            "available": float(row.on_hand) - float(row.reserved),
        }
        for row in loc_rows
    ]

    moves = [
        {
            "id": r.id,
            "reference": r.reference,
            "quantity": float(r.quantity) if r.quantity else 0,
            "date": str(r.date) if r.date else None,
            "origin": r.origin,
            "source_location": r.source_location,
            "dest_location": r.dest_location,
        }
        for r in move_rows
    ]

    return {
        "product": {
            "id": product.id,
            "name": product.name,
            "default_code": product.default_code,
            "type": product.type,
            "list_price": float(product.list_price) if product.list_price else 0,
            "active": product.active,
            "create_date": str(product.create_date) if product.create_date else None,
        },
        "stock": {
            "on_hand": float(stock_agg.on_hand),
            "reserved": float(stock_agg.reserved),
            "available": float(stock_agg.on_hand) - float(stock_agg.reserved),
        },
        "locations": locations,
        "movements": {
            "total": move_count,
            "items": moves,
        },
    }


async def get_stock_by_warehouse(db: AsyncSession):
    cached = await cache_get("inv:stock_by_warehouse")
    if cached:
        return cached

    result = await db.execute(
        select(
            StockWarehouse.id.label("warehouse_id"),
            StockWarehouse.name.label("warehouse_name"),
            func.coalesce(func.sum(StockQuant.quantity), 0).label("total_qty"),
            func.count(func.distinct(StockQuant.product_id)).label("product_count"),
        )
        .join(StockLocation, StockWarehouse.lot_stock_id == StockLocation.id)
        .join(StockQuant, StockQuant.location_id == StockLocation.id, isouter=True)
        .group_by(StockWarehouse.id, StockWarehouse.name)
        .order_by(StockWarehouse.name)
    )
    data = [
        {
            "warehouse_id": row.warehouse_id,
            "warehouse_name": row.warehouse_name,
            "total_quantity": float(row.total_qty),
            "product_count": row.product_count,
        }
        for row in result.all()
    ]
    await cache_set("inv:stock_by_warehouse", data, CACHE_TTL)
    return data
