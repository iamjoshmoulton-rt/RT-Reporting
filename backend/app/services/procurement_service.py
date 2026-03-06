from datetime import date
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.procurement import PurchaseOrder, PurchaseOrderLine
from app.odoo_models.partners import ResPartner, ProductTemplate, ProductProduct
from app.services.tz import local_date, local_timestamp


async def get_procurement_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    filters = [PurchaseOrder.state.in_(["purchase", "done"])]
    if date_from:
        filters.append(local_date(PurchaseOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(PurchaseOrder.date_order) <= date_to)

    result = await db.execute(
        select(
            func.count(PurchaseOrder.id).label("total_orders"),
            func.coalesce(func.sum(PurchaseOrder.amount_total), 0).label("total_spend"),
            func.coalesce(func.sum(PurchaseOrder.amount_untaxed), 0).label("total_untaxed"),
            func.coalesce(func.avg(PurchaseOrder.amount_total), 0).label("avg_order_value"),
        ).where(*filters)
    )
    row = result.one()
    return {
        "total_orders": row.total_orders,
        "total_spend": float(row.total_spend),
        "total_untaxed": float(row.total_untaxed),
        "avg_order_value": float(row.avg_order_value),
    }


async def get_procurement_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    filters = [PurchaseOrder.state.in_(["purchase", "done"])]
    if date_from:
        filters.append(local_date(PurchaseOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(PurchaseOrder.date_order) <= date_to)

    local_dt_expr = local_timestamp(PurchaseOrder.date_order)
    if group_by == "day":
        period = local_date(PurchaseOrder.date_order)
    elif group_by == "week":
        period = func.date_trunc("week", local_dt_expr)
    elif group_by == "year":
        period = func.date_trunc("year", local_dt_expr)
    else:
        period = func.date_trunc("month", local_dt_expr)

    result = await db.execute(
        select(
            period.label("period"),
            func.count(PurchaseOrder.id).label("order_count"),
            func.coalesce(func.sum(PurchaseOrder.amount_total), 0).label("total_spend"),
        )
        .where(*filters)
        .group_by(period)
        .order_by(period)
    )
    return [
        {
            "period": str(row.period),
            "order_count": row.order_count,
            "total_spend": float(row.total_spend),
        }
        for row in result.all()
    ]


async def get_procurement_by_vendor(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 20,
):
    filters = [PurchaseOrder.state.in_(["purchase", "done"])]
    if date_from:
        filters.append(local_date(PurchaseOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(PurchaseOrder.date_order) <= date_to)

    result = await db.execute(
        select(
            ResPartner.id.label("vendor_id"),
            ResPartner.name.label("vendor_name"),
            func.count(PurchaseOrder.id).label("order_count"),
            func.coalesce(func.sum(PurchaseOrder.amount_total), 0).label("total_spend"),
        )
        .join(ResPartner, PurchaseOrder.partner_id == ResPartner.id)
        .where(*filters)
        .group_by(ResPartner.id, ResPartner.name)
        .order_by(func.sum(PurchaseOrder.amount_total).desc())
        .limit(limit)
    )
    return [
        {
            "vendor_id": row.vendor_id,
            "vendor_name": row.vendor_name,
            "order_count": row.order_count,
            "total_spend": float(row.total_spend),
        }
        for row in result.all()
    ]


async def get_purchase_orders(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    state: str | None = None,
    partner_id: int | None = None,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
):
    filters = []
    if date_from:
        filters.append(local_date(PurchaseOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(PurchaseOrder.date_order) <= date_to)
    if state:
        filters.append(PurchaseOrder.state == state)
    if partner_id:
        filters.append(PurchaseOrder.partner_id == partner_id)
    if search:
        term = f"%{search}%"
        filters.append(or_(
            PurchaseOrder.name.ilike(term),
            ResPartner.name.ilike(term),
        ))

    count_q = select(func.count(PurchaseOrder.id))
    if search:
        count_q = count_q.join(ResPartner, PurchaseOrder.partner_id == ResPartner.id, isouter=True)
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            PurchaseOrder.id,
            PurchaseOrder.name,
            PurchaseOrder.state,
            PurchaseOrder.date_order,
            PurchaseOrder.amount_total,
            PurchaseOrder.amount_untaxed,
            PurchaseOrder.invoice_status,
            ResPartner.name.label("vendor_name"),
        )
        .join(ResPartner, PurchaseOrder.partner_id == ResPartner.id, isouter=True)
    )
    if filters:
        query = query.where(*filters)
    query = query.order_by(PurchaseOrder.date_order.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    orders = [
        {
            "id": row.id,
            "name": row.name,
            "state": row.state,
            "date_order": str(row.date_order) if row.date_order else None,
            "amount_total": float(row.amount_total) if row.amount_total else 0,
            "amount_untaxed": float(row.amount_untaxed) if row.amount_untaxed else 0,
            "invoice_status": row.invoice_status,
            "vendor_name": row.vendor_name,
        }
        for row in result.all()
    ]
    return {"total": total, "orders": orders}


def _product_name():
    """Extract English product name from JSONB name field."""
    return ProductTemplate.name["en_US"].as_string()


async def get_purchase_order_detail(db: AsyncSession, order_id: int):
    """Purchase order detail: header + vendor info + line items."""
    result = await db.execute(
        select(
            PurchaseOrder.id, PurchaseOrder.name, PurchaseOrder.state,
            PurchaseOrder.date_order, PurchaseOrder.date_approve,
            PurchaseOrder.date_planned, PurchaseOrder.amount_untaxed,
            PurchaseOrder.amount_tax, PurchaseOrder.amount_total,
            PurchaseOrder.invoice_status, PurchaseOrder.notes,
            PurchaseOrder.create_date,
            ResPartner.id.label("vendor_id"),
            ResPartner.name.label("vendor_name"),
            ResPartner.email.label("vendor_email"),
            ResPartner.phone.label("vendor_phone"),
        )
        .join(ResPartner, PurchaseOrder.partner_id == ResPartner.id, isouter=True)
        .where(PurchaseOrder.id == order_id)
    )
    row = result.one_or_none()
    if not row:
        return None

    lines_result = await db.execute(
        select(
            PurchaseOrderLine.id,
            PurchaseOrderLine.product_qty, PurchaseOrderLine.qty_received,
            PurchaseOrderLine.qty_invoiced, PurchaseOrderLine.price_unit,
            PurchaseOrderLine.price_subtotal, PurchaseOrderLine.price_tax,
            PurchaseOrderLine.price_total, PurchaseOrderLine.name.label("description"),
            PurchaseOrderLine.date_planned,
            _product_name().label("product_name"),
            ProductTemplate.default_code.label("internal_ref"),
        )
        .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id, isouter=True)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id, isouter=True)
        .where(PurchaseOrderLine.order_id == order_id)
        .order_by(PurchaseOrderLine.id)
    )
    lines = [
        {
            "id": l.id, "product_name": l.product_name, "internal_ref": l.internal_ref,
            "description": l.description,
            "product_qty": float(l.product_qty) if l.product_qty else 0,
            "qty_received": float(l.qty_received) if l.qty_received else 0,
            "qty_invoiced": float(l.qty_invoiced) if l.qty_invoiced else 0,
            "price_unit": float(l.price_unit) if l.price_unit else 0,
            "price_subtotal": float(l.price_subtotal) if l.price_subtotal else 0,
            "price_tax": float(l.price_tax) if l.price_tax else 0,
            "price_total": float(l.price_total) if l.price_total else 0,
            "date_planned": str(l.date_planned) if l.date_planned else None,
        }
        for l in lines_result.all()
    ]

    return {
        "order": {
            "id": row.id, "name": row.name, "state": row.state,
            "date_order": str(row.date_order) if row.date_order else None,
            "date_approve": str(row.date_approve) if row.date_approve else None,
            "date_planned": str(row.date_planned) if row.date_planned else None,
            "amount_untaxed": float(row.amount_untaxed) if row.amount_untaxed else 0,
            "amount_tax": float(row.amount_tax) if row.amount_tax else 0,
            "amount_total": float(row.amount_total) if row.amount_total else 0,
            "invoice_status": row.invoice_status, "notes": row.notes,
            "create_date": str(row.create_date) if row.create_date else None,
        },
        "vendor": {
            "id": row.vendor_id, "name": row.vendor_name,
            "email": row.vendor_email, "phone": row.vendor_phone,
        },
        "lines": lines,
    }
