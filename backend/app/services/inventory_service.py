from datetime import date
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.inventory import StockQuant, StockMove, StockLocation, StockWarehouse
from app.odoo_models.partners import ProductTemplate, ProductProduct
from app.services.tz import local_date


def _product_name():
    """Extract English product name from JSONB name field."""
    return ProductTemplate.name["en_US"].as_string()


async def get_inventory_summary(db: AsyncSession):
    internal_locations = select(StockLocation.id).where(StockLocation.usage == "internal")

    result = await db.execute(
        select(
            func.count(func.distinct(StockQuant.product_id)).label("unique_products"),
            func.coalesce(func.sum(StockQuant.quantity), 0).label("total_qty"),
            func.coalesce(func.sum(StockQuant.reserved_quantity), 0).label("total_reserved"),
        ).where(StockQuant.location_id.in_(internal_locations))
    )
    row = result.one()
    return {
        "unique_products": row.unique_products,
        "total_quantity": float(row.total_qty),
        "total_reserved": float(row.total_reserved),
        "available_quantity": float(row.total_qty) - float(row.total_reserved),
    }


async def get_stock_levels(
    db: AsyncSession,
    location_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
    search: str | None = None,
):
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
    total = (await db.execute(count_q)).scalar()

    result = await db.execute(
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
    items = [
        {
            "product_id": row.product_id,
            "product_name": row.product_name,
            "internal_ref": row.internal_ref,
            "on_hand": float(row.on_hand),
            "reserved": float(row.reserved),
            "available": float(row.available),
        }
        for row in result.all()
    ]
    return {"total": total, "items": items}


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
    if date_from:
        filters.append(local_date(StockMove.date) >= date_from)
    if date_to:
        filters.append(local_date(StockMove.date) <= date_to)
    if product_id:
        filters.append(StockMove.product_id == product_id)

    count_q = select(func.count(StockMove.id)).where(*filters)
    total = (await db.execute(count_q)).scalar()

    src = select(StockLocation.name).where(StockLocation.id == StockMove.location_id).correlate(StockMove).scalar_subquery()
    dest = select(StockLocation.name).where(StockLocation.id == StockMove.location_dest_id).correlate(StockMove).scalar_subquery()

    result = await db.execute(
        select(
            StockMove.id,
            StockMove.reference,
            StockMove.product_id,
            _product_name().label("product_name"),
            StockMove.quantity,
            StockMove.date,
            StockMove.origin,
            src.label("source_location"),
            dest.label("dest_location"),
        )
        .join(ProductProduct, StockMove.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*filters)
        .order_by(StockMove.date.desc())
        .offset(offset)
        .limit(limit)
    )
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
        for row in result.all()
    ]
    return {"total": total, "moves": moves}


async def get_product_detail(
    db: AsyncSession,
    product_id: int,
    offset: int = 0,
    limit: int = 20,
):
    """Product detail: info, stock by location, recent movements."""
    # Product info
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

    # Get all product.product variants for this template
    variant_ids_q = select(ProductProduct.id).where(
        ProductProduct.product_tmpl_id == product_id
    )

    # Aggregate stock totals
    internal_locations = select(StockLocation.id).where(StockLocation.usage == "internal")
    stock_agg_result = await db.execute(
        select(
            func.coalesce(func.sum(StockQuant.quantity), 0).label("on_hand"),
            func.coalesce(func.sum(StockQuant.reserved_quantity), 0).label("reserved"),
        ).where(
            StockQuant.product_id.in_(variant_ids_q),
            StockQuant.location_id.in_(internal_locations),
        )
    )
    stock_agg = stock_agg_result.one()

    # Stock by location
    stock_by_loc_result = await db.execute(
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
    locations = [
        {
            "location": row.location_name,
            "on_hand": float(row.on_hand),
            "reserved": float(row.reserved),
            "available": float(row.on_hand) - float(row.reserved),
        }
        for row in stock_by_loc_result.all()
    ]

    # Recent stock movements (paginated)
    move_filters = [
        StockMove.product_id.in_(variant_ids_q),
        StockMove.state == "done",
    ]
    move_count = (await db.execute(
        select(func.count(StockMove.id)).where(*move_filters)
    )).scalar()

    src = select(StockLocation.name).where(StockLocation.id == StockMove.location_id).correlate(StockMove).scalar_subquery()
    dest = select(StockLocation.name).where(StockLocation.id == StockMove.location_dest_id).correlate(StockMove).scalar_subquery()

    moves_result = await db.execute(
        select(
            StockMove.id, StockMove.reference,
            StockMove.quantity, StockMove.date,
            StockMove.origin,
            src.label("source_location"),
            dest.label("dest_location"),
        )
        .where(*move_filters)
        .order_by(StockMove.date.desc())
        .offset(offset)
        .limit(limit)
    )
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
        for r in moves_result.all()
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
    return [
        {
            "warehouse_id": row.warehouse_id,
            "warehouse_name": row.warehouse_name,
            "total_quantity": float(row.total_qty),
            "product_count": row.product_count,
        }
        for row in result.all()
    ]
