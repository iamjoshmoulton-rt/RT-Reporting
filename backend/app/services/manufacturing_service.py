from datetime import date
from sqlalchemy import select, func, case, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.manufacturing import MrpProduction
from app.odoo_models.partners import ProductProduct, ProductTemplate
from app.services.tz import local_date, local_timestamp


def _product_name():
    """Extract English product name from JSONB name field."""
    return ProductTemplate.name["en_US"].as_string()


async def get_manufacturing_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    # Active MOs (not date-filtered — these are currently open)
    active_result = await db.execute(
        select(func.count(MrpProduction.id)).where(
            MrpProduction.state.in_(["confirmed", "progress", "to_close"])
        )
    )
    active_mos = active_result.scalar()

    # Period-filtered metrics
    period_filters = [MrpProduction.state == "done"]
    if date_from:
        period_filters.append(local_date(MrpProduction.date_finished) >= date_from)
    if date_to:
        period_filters.append(local_date(MrpProduction.date_finished) <= date_to)

    result = await db.execute(
        select(
            func.count(MrpProduction.id).label("completed"),
            func.coalesce(func.sum(MrpProduction.product_qty), 0).label("units_produced"),
            func.coalesce(
                func.avg(
                    func.extract("epoch", MrpProduction.date_finished)
                    - func.extract("epoch", MrpProduction.create_date)
                )
                / 86400,
                0,
            ).label("avg_cycle_days"),
        ).where(*period_filters)
    )
    row = result.one()
    return {
        "active_mos": active_mos,
        "completed": row.completed,
        "units_produced": float(row.units_produced),
        "avg_cycle_days": round(float(row.avg_cycle_days), 1),
    }


async def get_production_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    filters = [MrpProduction.state == "done"]
    if date_from:
        filters.append(local_date(MrpProduction.date_finished) >= date_from)
    if date_to:
        filters.append(local_date(MrpProduction.date_finished) <= date_to)

    local_dt_expr = local_timestamp(MrpProduction.date_finished)
    if group_by == "day":
        period = local_date(MrpProduction.date_finished)
    elif group_by == "week":
        period = func.date_trunc("week", local_dt_expr)
    elif group_by == "year":
        period = func.date_trunc("year", local_dt_expr)
    else:
        period = func.date_trunc("month", local_dt_expr)

    result = await db.execute(
        select(
            period.label("period"),
            func.count(MrpProduction.id).label("mo_count"),
            func.coalesce(func.sum(MrpProduction.product_qty), 0).label("units_produced"),
        )
        .where(*filters)
        .group_by(period)
        .order_by(period)
    )
    return [
        {
            "period": str(row.period),
            "mo_count": row.mo_count,
            "units_produced": float(row.units_produced),
        }
        for row in result.all()
    ]


async def get_top_products_manufactured(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 10,
):
    filters = [MrpProduction.state == "done"]
    if date_from:
        filters.append(local_date(MrpProduction.date_finished) >= date_from)
    if date_to:
        filters.append(local_date(MrpProduction.date_finished) <= date_to)

    result = await db.execute(
        select(
            _product_name().label("product_name"),
            func.count(MrpProduction.id).label("mo_count"),
            func.coalesce(func.sum(MrpProduction.product_qty), 0).label("units_produced"),
        )
        .join(ProductProduct, MrpProduction.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*filters)
        .group_by(_product_name())
        .order_by(func.sum(MrpProduction.product_qty).desc())
        .limit(limit)
    )
    return [
        {
            "product_name": row.product_name,
            "mo_count": row.mo_count,
            "units_produced": float(row.units_produced),
        }
        for row in result.all()
    ]


async def get_manufacturing_orders(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    state: str | None = None,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
):
    filters = []
    if date_from:
        filters.append(local_date(MrpProduction.create_date) >= date_from)
    if date_to:
        filters.append(local_date(MrpProduction.create_date) <= date_to)
    if state:
        filters.append(MrpProduction.state == state)
    if search:
        term = f"%{search}%"
        filters.append(or_(
            MrpProduction.name.ilike(term),
            MrpProduction.origin.ilike(term),
            _product_name().ilike(term),
        ))

    count_q = select(func.count(MrpProduction.id))
    if search:
        count_q = count_q.join(ProductProduct, MrpProduction.product_id == ProductProduct.id, isouter=True).join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id, isouter=True)
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            MrpProduction.id,
            MrpProduction.name,
            MrpProduction.state,
            MrpProduction.priority,
            MrpProduction.product_qty,
            MrpProduction.origin,
            MrpProduction.date_start,
            MrpProduction.date_finished,
            MrpProduction.create_date,
            _product_name().label("product_name"),
        )
        .join(ProductProduct, MrpProduction.product_id == ProductProduct.id, isouter=True)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id, isouter=True)
    )
    if filters:
        query = query.where(*filters)
    query = query.order_by(MrpProduction.create_date.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    orders = [
        {
            "id": row.id,
            "name": row.name,
            "state": row.state,
            "priority": row.priority,
            "product_name": row.product_name,
            "product_qty": float(row.product_qty) if row.product_qty else 0,
            "origin": row.origin,
            "date_start": str(row.date_start) if row.date_start else None,
            "date_finished": str(row.date_finished) if row.date_finished else None,
            "create_date": str(row.create_date) if row.create_date else None,
        }
        for row in result.all()
    ]
    return {"total": total, "orders": orders}


async def get_manufacturing_order_detail(db: AsyncSession, order_id: int):
    """Manufacturing order detail: header + product info + BOM components."""
    from app.odoo_models.manufacturing import MrpBom, MrpBomLine
    from app.odoo_models.inventory import StockLocation

    src = select(StockLocation.complete_name).where(
        StockLocation.id == MrpProduction.location_src_id
    ).correlate(MrpProduction).scalar_subquery()
    dest = select(StockLocation.complete_name).where(
        StockLocation.id == MrpProduction.location_dest_id
    ).correlate(MrpProduction).scalar_subquery()

    result = await db.execute(
        select(
            MrpProduction.id, MrpProduction.name, MrpProduction.state,
            MrpProduction.priority, MrpProduction.product_qty,
            MrpProduction.qty_producing, MrpProduction.origin,
            MrpProduction.bom_id,
            MrpProduction.date_start, MrpProduction.date_finished,
            MrpProduction.date_deadline, MrpProduction.create_date,
            _product_name().label("product_name"),
            ProductTemplate.default_code.label("product_ref"),
            src.label("source_location"), dest.label("dest_location"),
        )
        .join(ProductProduct, MrpProduction.product_id == ProductProduct.id, isouter=True)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id, isouter=True)
        .where(MrpProduction.id == order_id)
    )
    row = result.one_or_none()
    if not row:
        return None

    # BOM components
    components = []
    if row.bom_id:
        comp_product_name = ProductTemplate.name["en_US"].as_string()
        comp_result = await db.execute(
            select(
                MrpBomLine.id,
                MrpBomLine.product_qty,
                comp_product_name.label("product_name"),
                ProductTemplate.default_code.label("internal_ref"),
            )
            .join(ProductProduct, MrpBomLine.product_id == ProductProduct.id, isouter=True)
            .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id, isouter=True)
            .where(MrpBomLine.bom_id == row.bom_id)
            .order_by(MrpBomLine.id)
        )
        components = [
            {
                "id": c.id, "product_name": c.product_name,
                "internal_ref": c.internal_ref,
                "product_qty": float(c.product_qty) if c.product_qty else 0,
            }
            for c in comp_result.all()
        ]

    return {
        "order": {
            "id": row.id, "name": row.name, "state": row.state,
            "priority": row.priority,
            "product_name": row.product_name, "product_ref": row.product_ref,
            "product_qty": float(row.product_qty) if row.product_qty else 0,
            "qty_producing": float(row.qty_producing) if row.qty_producing else 0,
            "origin": row.origin,
            "source_location": row.source_location,
            "dest_location": row.dest_location,
            "date_start": str(row.date_start) if row.date_start else None,
            "date_finished": str(row.date_finished) if row.date_finished else None,
            "date_deadline": str(row.date_deadline) if row.date_deadline else None,
            "create_date": str(row.create_date) if row.create_date else None,
        },
        "components": components,
    }
