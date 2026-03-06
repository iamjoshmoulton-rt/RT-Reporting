from datetime import date, datetime, timedelta
from sqlalchemy import select, func, case, extract, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import aliased

from app.odoo_models.sales import SaleOrder, SaleOrderLine
from app.odoo_models.partners import ResPartner, ProductTemplate, ProductProduct
from app.odoo_models.inventory import StockPicking
from app.odoo_models.accounting import AccountMove
from app.services.tz import local_date, local_timestamp
from app.services import budget_service


def _product_name():
    """Extract English product name from JSONB name field."""
    return ProductTemplate.name["en_US"].as_string()


async def get_sales_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    filters = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(SaleOrder.date_order) <= date_to)

    result = await db.execute(
        select(
            func.count(SaleOrder.id).label("total_orders"),
            func.coalesce(func.sum(SaleOrder.amount_total), 0).label("total_revenue"),
            func.coalesce(func.sum(SaleOrder.amount_untaxed), 0).label("total_untaxed"),
            func.coalesce(func.sum(SaleOrder.amount_tax), 0).label("total_tax"),
            func.coalesce(func.avg(SaleOrder.amount_total), 0).label("avg_order_value"),
        ).where(*filters)
    )
    row = result.one()
    return {
        "total_orders": row.total_orders,
        "total_revenue": float(row.total_revenue),
        "total_untaxed": float(row.total_untaxed),
        "total_tax": float(row.total_tax),
        "avg_order_value": float(row.avg_order_value),
    }


async def get_sales_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    local_dt = local_date(SaleOrder.date_order)
    filters = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        filters.append(local_dt >= date_from)
    if date_to:
        filters.append(local_dt <= date_to)

    local_dt_expr = local_timestamp(SaleOrder.date_order)

    if group_by == "day":
        period = local_dt
    elif group_by == "week":
        period = func.date_trunc("week", local_dt_expr)
    elif group_by == "year":
        period = func.date_trunc("year", local_dt_expr)
    else:
        period = func.date_trunc("month", local_dt_expr)

    result = await db.execute(
        select(
            period.label("period"),
            func.count(SaleOrder.id).label("order_count"),
            func.coalesce(func.sum(SaleOrder.amount_total), 0).label("revenue"),
            func.coalesce(func.sum(SaleOrder.amount_untaxed), 0).label("untaxed"),
        )
        .where(*filters)
        .group_by(period)
        .order_by(period)
    )
    return [
        {
            "period": str(row.period),
            "order_count": row.order_count,
            "revenue": float(row.revenue),
            "untaxed": float(row.untaxed),
        }
        for row in result.all()
    ]


async def get_sales_by_customer(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 20,
):
    filters = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(SaleOrder.date_order) <= date_to)

    result = await db.execute(
        select(
            ResPartner.id.label("partner_id"),
            ResPartner.name.label("customer_name"),
            func.count(SaleOrder.id).label("order_count"),
            func.coalesce(func.sum(SaleOrder.amount_total), 0).label("total_revenue"),
        )
        .join(ResPartner, SaleOrder.partner_id == ResPartner.id)
        .where(*filters)
        .group_by(ResPartner.id, ResPartner.name)
        .order_by(func.sum(SaleOrder.amount_total).desc())
        .limit(limit)
    )
    return [
        {
            "partner_id": row.partner_id,
            "customer_name": row.customer_name,
            "order_count": row.order_count,
            "total_revenue": float(row.total_revenue),
        }
        for row in result.all()
    ]


async def get_sales_by_product(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 20,
):
    filters = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(SaleOrder.date_order) <= date_to)

    result = await db.execute(
        select(
            ProductTemplate.id.label("product_id"),
            _product_name().label("product_name"),
            func.coalesce(func.sum(SaleOrderLine.product_uom_qty), 0).label("qty_sold"),
            func.coalesce(func.sum(SaleOrderLine.price_subtotal), 0).label("total_revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*filters)
        .group_by(ProductTemplate.id, _product_name())
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
        .limit(limit)
    )
    return [
        {
            "product_id": row.product_id,
            "product_name": row.product_name,
            "qty_sold": float(row.qty_sold),
            "total_revenue": float(row.total_revenue),
        }
        for row in result.all()
    ]


async def get_sales_orders(
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
        filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(SaleOrder.date_order) <= date_to)
    if state:
        filters.append(SaleOrder.state == state)
    if partner_id:
        filters.append(SaleOrder.partner_id == partner_id)
    if search:
        term = f"%{search}%"
        filters.append(or_(
            SaleOrder.name.ilike(term),
            ResPartner.name.ilike(term),
        ))

    count_q = select(func.count(SaleOrder.id))
    if search:
        count_q = count_q.join(ResPartner, SaleOrder.partner_id == ResPartner.id, isouter=True)
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            SaleOrder.id,
            SaleOrder.name,
            SaleOrder.state,
            SaleOrder.date_order,
            SaleOrder.amount_total,
            SaleOrder.amount_untaxed,
            SaleOrder.invoice_status,
            ResPartner.name.label("customer_name"),
        )
        .join(ResPartner, SaleOrder.partner_id == ResPartner.id, isouter=True)
    )
    if filters:
        query = query.where(*filters)
    query = query.order_by(SaleOrder.date_order.desc()).offset(offset).limit(limit)

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
            "customer_name": row.customer_name,
        }
        for row in result.all()
    ]
    return {"total": total, "orders": orders}


DRILLDOWN_KPI_TYPES = {
    "invoiced_revenue", "invoiced_margin", "margin_percent",
    "units_sold", "open_pipeline", "open_pipeline_date",
    "max_potential_revenue", "avg_sell_price",
}


async def get_sales_kpi_drilldown(
    db: AsyncSession,
    kpi: str,
    date_from: date | None = None,
    date_to: date | None = None,
    offset: int = 0,
    limit: int = 50,
):
    """Return the rows behind a specific KPI card."""
    confirmed = [SaleOrder.state.in_(["sale", "done"])]
    date_filters = []
    if date_from:
        date_filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        date_filters.append(local_date(SaleOrder.date_order) <= date_to)

    if kpi == "units_sold":
        filters = confirmed + date_filters
        count_q = (
            select(func.count(SaleOrderLine.id))
            .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
            .where(*filters)
        )
        total = (await db.execute(count_q)).scalar()
        query = (
            select(
                SaleOrder.name.label("order_name"),
                _product_name().label("product_name"),
                SaleOrderLine.product_uom_qty.label("qty"),
                SaleOrderLine.price_unit,
                SaleOrderLine.price_subtotal.label("subtotal"),
                SaleOrderLine.margin,
                SaleOrder.date_order,
                ResPartner.name.label("customer_name"),
            )
            .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
            .join(ResPartner, SaleOrder.partner_id == ResPartner.id, isouter=True)
            .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id, isouter=True)
            .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id, isouter=True)
            .where(*filters)
            .order_by(SaleOrder.date_order.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await db.execute(query)
        rows = [
            {
                "order_name": r.order_name,
                "product_name": r.product_name,
                "qty": float(r.qty) if r.qty else 0,
                "price_unit": float(r.price_unit) if r.price_unit else 0,
                "subtotal": float(r.subtotal) if r.subtotal else 0,
                "margin": float(r.margin) if r.margin else 0,
                "date_order": str(r.date_order) if r.date_order else None,
                "customer_name": r.customer_name,
            }
            for r in result.all()
        ]
        return {"total": total, "type": "lines", "rows": rows}

    # Order-level KPIs
    if kpi in ("invoiced_revenue", "invoiced_margin", "margin_percent", "avg_sell_price"):
        filters = confirmed + date_filters + [SaleOrder.invoice_status == "invoiced"]
    elif kpi == "open_pipeline":
        filters = confirmed + date_filters + [SaleOrder.invoice_status != "invoiced"]
    elif kpi == "open_pipeline_date":
        filters = [SaleOrder.state.in_(["sale", "done"]), SaleOrder.invoice_status != "invoiced"]
        if date_from:
            filters.append(local_date(SaleOrder.commitment_date) >= date_from)
        if date_to:
            filters.append(local_date(SaleOrder.commitment_date) <= date_to)
    elif kpi == "max_potential_revenue":
        filters = confirmed + date_filters
    else:
        filters = confirmed + date_filters

    count_q = select(func.count(SaleOrder.id)).where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            SaleOrder.id,
            SaleOrder.name,
            SaleOrder.state,
            SaleOrder.date_order,
            SaleOrder.commitment_date,
            SaleOrder.amount_total,
            SaleOrder.amount_untaxed,
            SaleOrder.margin,
            SaleOrder.invoice_status,
            ResPartner.name.label("customer_name"),
        )
        .join(ResPartner, SaleOrder.partner_id == ResPartner.id, isouter=True)
        .where(*filters)
        .order_by(SaleOrder.date_order.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    rows = [
        {
            "id": r.id,
            "name": r.name,
            "state": r.state,
            "date_order": str(r.date_order) if r.date_order else None,
            "commitment_date": str(r.commitment_date) if r.commitment_date else None,
            "amount_total": float(r.amount_total) if r.amount_total else 0,
            "amount_untaxed": float(r.amount_untaxed) if r.amount_untaxed else 0,
            "margin": float(r.margin) if r.margin else 0,
            "invoice_status": r.invoice_status,
            "customer_name": r.customer_name,
        }
        for r in result.all()
    ]
    return {"total": total, "type": "orders", "rows": rows}


async def get_order_detail(
    db: AsyncSession,
    order_id: int,
):
    """Full order detail with line items, addresses, invoices, and deliveries."""
    ShippingPartner = aliased(ResPartner)
    InvoicePartner = aliased(ResPartner)

    order_result = await db.execute(
        select(
            SaleOrder.id, SaleOrder.name, SaleOrder.state,
            SaleOrder.date_order, SaleOrder.commitment_date,
            SaleOrder.amount_untaxed, SaleOrder.amount_tax,
            SaleOrder.amount_total, SaleOrder.margin,
            SaleOrder.invoice_status, SaleOrder.note,
            SaleOrder.create_date, SaleOrder.write_date,
            # Customer
            ResPartner.id.label("customer_id"),
            ResPartner.name.label("customer_name"),
            ResPartner.email.label("customer_email"),
            ResPartner.phone.label("customer_phone"),
            ResPartner.mobile.label("customer_mobile"),
            ResPartner.street.label("customer_street"),
            ResPartner.city.label("customer_city"),
            ResPartner.zip.label("customer_zip"),
            ResPartner.vat.label("customer_vat"),
            ResPartner.website.label("customer_website"),
            # Shipping address
            ShippingPartner.name.label("shipping_name"),
            ShippingPartner.street.label("shipping_street"),
            ShippingPartner.city.label("shipping_city"),
            ShippingPartner.zip.label("shipping_zip"),
            ShippingPartner.phone.label("shipping_phone"),
            # Invoice address
            InvoicePartner.name.label("invoice_name"),
            InvoicePartner.street.label("invoice_street"),
            InvoicePartner.city.label("invoice_city"),
            InvoicePartner.zip.label("invoice_zip"),
        )
        .join(ResPartner, SaleOrder.partner_id == ResPartner.id, isouter=True)
        .join(ShippingPartner, SaleOrder.partner_shipping_id == ShippingPartner.id, isouter=True)
        .join(InvoicePartner, SaleOrder.partner_invoice_id == InvoicePartner.id, isouter=True)
        .where(SaleOrder.id == order_id)
    )
    order = order_result.one_or_none()
    if not order:
        return None

    # --- Order lines ---
    lines_result = await db.execute(
        select(
            SaleOrderLine.id,
            SaleOrderLine.name.label("description"),
            SaleOrderLine.product_uom_qty,
            SaleOrderLine.qty_delivered,
            SaleOrderLine.qty_invoiced,
            SaleOrderLine.price_unit,
            SaleOrderLine.discount,
            SaleOrderLine.price_subtotal,
            SaleOrderLine.price_total,
            SaleOrderLine.margin,
            _product_name().label("product_name"),
            ProductTemplate.default_code.label("internal_ref"),
        )
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id, isouter=True)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id, isouter=True)
        .where(SaleOrderLine.order_id == order_id)
        .order_by(SaleOrderLine.id)
    )
    lines = [
        {
            "id": r.id,
            "product_name": r.product_name,
            "internal_ref": r.internal_ref,
            "description": r.description,
            "qty_ordered": float(r.product_uom_qty) if r.product_uom_qty else 0,
            "qty_delivered": float(r.qty_delivered) if r.qty_delivered else 0,
            "qty_invoiced": float(r.qty_invoiced) if r.qty_invoiced else 0,
            "price_unit": float(r.price_unit) if r.price_unit else 0,
            "discount": float(r.discount) if r.discount else 0,
            "subtotal": float(r.price_subtotal) if r.price_subtotal else 0,
            "total": float(r.price_total) if r.price_total else 0,
            "margin": float(r.margin) if r.margin else 0,
        }
        for r in lines_result.all()
    ]

    # --- Related invoices (account.move where invoice_origin contains order name) ---
    # Odoo may store multiple order names comma-separated in invoice_origin
    invoices_result = await db.execute(
        select(
            AccountMove.id,
            AccountMove.name,
            AccountMove.state,
            AccountMove.invoice_date,
            AccountMove.amount_total,
            AccountMove.amount_residual,
            AccountMove.payment_state,
            AccountMove.move_type,
        )
        .where(
            AccountMove.invoice_origin.ilike(f"%{order.name}%"),
            AccountMove.move_type.in_(["out_invoice", "out_refund"]),
        )
        .order_by(AccountMove.invoice_date.desc())
    )
    invoices = [
        {
            "id": r.id,
            "name": r.name,
            "state": r.state,
            "date": str(r.invoice_date) if r.invoice_date else None,
            "amount_total": float(r.amount_total) if r.amount_total else 0,
            "amount_due": float(r.amount_residual) if r.amount_residual else 0,
            "payment_state": r.payment_state,
            "type": "invoice" if r.move_type == "out_invoice" else "credit_note",
        }
        for r in invoices_result.all()
    ]

    # --- Related deliveries (stock.picking where origin matches order name) ---
    deliveries_result = await db.execute(
        select(
            StockPicking.id,
            StockPicking.name,
            StockPicking.state,
            StockPicking.scheduled_date,
            StockPicking.date_done,
        )
        .where(StockPicking.origin == order.name)
        .order_by(StockPicking.scheduled_date.desc())
    )
    deliveries = [
        {
            "id": r.id,
            "name": r.name,
            "state": r.state,
            "scheduled_date": str(r.scheduled_date) if r.scheduled_date else None,
            "date_done": str(r.date_done) if r.date_done else None,
        }
        for r in deliveries_result.all()
    ]

    # --- Fulfillment summary from lines ---
    total_ordered = sum(l["qty_ordered"] for l in lines)
    total_delivered = sum(l["qty_delivered"] for l in lines)
    total_invoiced_qty = sum(l["qty_invoiced"] for l in lines)
    fulfillment_pct = (total_delivered / total_ordered * 100) if total_ordered > 0 else 0
    invoiced_pct = (total_invoiced_qty / total_ordered * 100) if total_ordered > 0 else 0

    def _addr(name, street, city, zipcode):
        parts = [p for p in [name, street, f"{city} {zipcode}".strip() if city or zipcode else None] if p]
        return ", ".join(parts) if parts else None

    return {
        "order": {
            "id": order.id,
            "name": order.name,
            "state": order.state,
            "date_order": str(order.date_order) if order.date_order else None,
            "commitment_date": str(order.commitment_date) if order.commitment_date else None,
            "amount_untaxed": float(order.amount_untaxed) if order.amount_untaxed else 0,
            "amount_tax": float(order.amount_tax) if order.amount_tax else 0,
            "amount_total": float(order.amount_total) if order.amount_total else 0,
            "margin": float(order.margin) if order.margin else 0,
            "margin_percent": round((float(order.margin) / float(order.amount_untaxed) * 100), 1) if order.amount_untaxed and order.amount_untaxed > 0 else 0,
            "invoice_status": order.invoice_status,
            "note": order.note,
            "create_date": str(order.create_date) if order.create_date else None,
            "write_date": str(order.write_date) if order.write_date else None,
        },
        "customer": {
            "id": order.customer_id,
            "name": order.customer_name,
            "email": order.customer_email,
            "phone": order.customer_phone,
            "mobile": order.customer_mobile,
            "street": order.customer_street,
            "city": order.customer_city,
            "zip": order.customer_zip,
            "vat": order.customer_vat,
            "website": order.customer_website,
        },
        "shipping_address": _addr(order.shipping_name, order.shipping_street, order.shipping_city, order.shipping_zip),
        "invoice_address": _addr(order.invoice_name, order.invoice_street, order.invoice_city, order.invoice_zip),
        "lines": lines,
        "invoices": invoices,
        "deliveries": deliveries,
        "fulfillment": {
            "total_ordered": total_ordered,
            "total_delivered": total_delivered,
            "total_invoiced": total_invoiced_qty,
            "delivery_percent": round(fulfillment_pct, 1),
            "invoice_percent": round(invoiced_pct, 1),
        },
    }


async def get_sales_kpis(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    compare_to: str | None = None,
):
    """
    Returns the 8 KPIs mirroring the Odoo sales dashboard.
    compare_to: "previous_period", "previous_year", or "budget". When set, *_trend (and optionally *_budget) are computed.
    """
    confirmed = [SaleOrder.state.in_(["sale", "done"])]
    date_filters = []
    if date_from:
        date_filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        date_filters.append(local_date(SaleOrder.date_order) <= date_to)

    # --- Invoiced orders in date range ---
    invoiced_filters = confirmed + date_filters + [SaleOrder.invoice_status == "invoiced"]
    inv_result = await db.execute(
        select(
            func.coalesce(func.sum(SaleOrder.amount_total), 0).label("invoiced_revenue"),
            func.coalesce(func.sum(SaleOrder.margin), 0).label("invoiced_margin"),
        ).where(*invoiced_filters)
    )
    inv_row = inv_result.one()
    invoiced_revenue = float(inv_row.invoiced_revenue)
    invoiced_margin = float(inv_row.invoiced_margin)
    margin_percent = (invoiced_margin / invoiced_revenue * 100) if invoiced_revenue > 0 else 0

    # --- Units sold (from order lines on confirmed orders in date range) ---
    line_filters = confirmed + date_filters
    qty_result = await db.execute(
        select(
            func.coalesce(func.sum(SaleOrderLine.product_uom_qty), 0).label("units_sold"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .where(*line_filters)
    )
    units_sold = float(qty_result.scalar_one())

    avg_sell_price = (invoiced_revenue / units_sold) if units_sold > 0 else 0

    # --- Open pipeline (confirmed, not invoiced, order date in range) ---
    pipeline_filters = confirmed + date_filters + [SaleOrder.invoice_status != "invoiced"]
    pipe_result = await db.execute(
        select(
            func.coalesce(func.sum(SaleOrder.amount_total), 0),
        ).where(*pipeline_filters)
    )
    open_pipeline = float(pipe_result.scalar_one())

    # --- Open pipeline by delivery date (commitment_date in range, not invoiced) ---
    delivery_filters = [SaleOrder.state.in_(["sale", "done"]), SaleOrder.invoice_status != "invoiced"]
    if date_from:
        delivery_filters.append(local_date(SaleOrder.commitment_date) >= date_from)
    if date_to:
        delivery_filters.append(local_date(SaleOrder.commitment_date) <= date_to)
    pipe_date_result = await db.execute(
        select(
            func.coalesce(func.sum(SaleOrder.amount_total), 0),
        ).where(*delivery_filters)
    )
    open_pipeline_date = float(pipe_date_result.scalar_one())

    max_potential_revenue = invoiced_revenue + open_pipeline_date

    # --- Comparison period for trends (driven by compare_to) ---
    def _pct_trend(current: float, prev: float) -> float | None:
        if prev == 0:
            return None
        return ((current - prev) / prev) * 100

    invoiced_revenue_prev = 0.0
    invoiced_margin_prev = 0.0
    units_sold_prev = 0.0
    open_pipeline_prev = 0.0
    open_pipeline_date_prev = 0.0
    budget_by_kpi: dict[str, float] = {}

    if date_from and date_to and compare_to:
        if compare_to == "previous_period":
            delta = date_to - date_from
            prev_to = date_from - timedelta(days=1)
            prev_from = prev_to - delta
        elif compare_to == "previous_year":
            prev_from = date_from.replace(year=date_from.year - 1)
            prev_to = date_to.replace(year=date_to.year - 1)
        elif compare_to == "budget":
            budget_by_kpi = await budget_service.get_budget_for_period(db, date_from, date_to)
            prev_from = prev_to = None
        else:
            prev_from = prev_to = None

        if prev_from is not None and prev_to is not None:
            prev_date_filters = [
                local_date(SaleOrder.date_order) >= prev_from,
                local_date(SaleOrder.date_order) <= prev_to,
            ]

            # Invoiced revenue + margin (one query)
            prev_inv_filters = confirmed + prev_date_filters + [SaleOrder.invoice_status == "invoiced"]
            prev_inv_result = await db.execute(
                select(
                    func.coalesce(func.sum(SaleOrder.amount_total), 0).label("revenue"),
                    func.coalesce(func.sum(SaleOrder.margin), 0).label("margin"),
                ).where(*prev_inv_filters)
            )
            prev_inv = prev_inv_result.one()
            invoiced_revenue_prev = float(prev_inv.revenue)
            invoiced_margin_prev = float(prev_inv.margin)

            # Units sold
            prev_line_filters = confirmed + prev_date_filters
            prev_qty_result = await db.execute(
                select(
                    func.coalesce(func.sum(SaleOrderLine.product_uom_qty), 0).label("qty"),
                )
                .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
                .where(*prev_line_filters)
            )
            units_sold_prev = float(prev_qty_result.scalar_one())

            # Open pipeline (order date in prev range)
            prev_pipe_filters = confirmed + prev_date_filters + [SaleOrder.invoice_status != "invoiced"]
            prev_pipe_result = await db.execute(
                select(func.coalesce(func.sum(SaleOrder.amount_total), 0)).where(*prev_pipe_filters)
            )
            open_pipeline_prev = float(prev_pipe_result.scalar_one())

            # Open pipeline by date (commitment_date in prev range)
            prev_delivery_filters = [
                SaleOrder.state.in_(["sale", "done"]),
                SaleOrder.invoice_status != "invoiced",
                local_date(SaleOrder.commitment_date) >= prev_from,
                local_date(SaleOrder.commitment_date) <= prev_to,
            ]
            prev_pipe_date_result = await db.execute(
                select(func.coalesce(func.sum(SaleOrder.amount_total), 0)).where(*prev_delivery_filters)
            )
            open_pipeline_date_prev = float(prev_pipe_date_result.scalar_one())

    # Only compute trends when we have comparison data
    margin_percent_prev = (invoiced_margin_prev / invoiced_revenue_prev * 100) if invoiced_revenue_prev > 0 else 0
    max_potential_prev = invoiced_revenue_prev + open_pipeline_date_prev
    avg_sell_price_prev = (invoiced_revenue_prev / units_sold_prev) if units_sold_prev > 0 else 0

    if compare_to == "budget":
        revenue_trend = _pct_trend(invoiced_revenue, budget_by_kpi.get("invoiced_revenue", 0))
        margin_trend = _pct_trend(invoiced_margin, budget_by_kpi.get("invoiced_margin", 0))
        margin_pct_trend = _pct_trend(margin_percent, budget_by_kpi.get("margin_percent", 0))
        units_sold_trend = _pct_trend(units_sold, budget_by_kpi.get("units_sold", 0))
        open_pipeline_trend = _pct_trend(open_pipeline, budget_by_kpi.get("open_pipeline", 0))
        open_pipeline_date_trend = _pct_trend(open_pipeline_date, budget_by_kpi.get("open_pipeline_date", 0))
        max_potential_trend = _pct_trend(max_potential_revenue, budget_by_kpi.get("max_potential_revenue", 0))
        avg_sell_price_trend = _pct_trend(avg_sell_price, budget_by_kpi.get("avg_sell_price", 0))
    else:
        revenue_trend = _pct_trend(invoiced_revenue, invoiced_revenue_prev)
        margin_trend = _pct_trend(invoiced_margin, invoiced_margin_prev)
        margin_pct_trend = _pct_trend(margin_percent, margin_percent_prev)
        units_sold_trend = _pct_trend(units_sold, units_sold_prev)
        open_pipeline_trend = _pct_trend(open_pipeline, open_pipeline_prev)
        open_pipeline_date_trend = _pct_trend(open_pipeline_date, open_pipeline_date_prev)
        max_potential_trend = _pct_trend(max_potential_revenue, max_potential_prev)
        avg_sell_price_trend = _pct_trend(avg_sell_price, avg_sell_price_prev)

    out: dict = {
        "invoiced_revenue": invoiced_revenue,
        "invoiced_margin": invoiced_margin,
        "margin_percent": round(margin_percent, 2),
        "units_sold": units_sold,
        "open_pipeline": open_pipeline,
        "open_pipeline_date": open_pipeline_date,
        "max_potential_revenue": max_potential_revenue,
        "avg_sell_price": round(avg_sell_price, 2),
        "revenue_trend": round(revenue_trend, 2) if revenue_trend is not None else None,
        "invoiced_margin_trend": round(margin_trend, 2) if margin_trend is not None else None,
        "margin_percent_trend": round(margin_pct_trend, 2) if margin_pct_trend is not None else None,
        "units_sold_trend": round(units_sold_trend, 2) if units_sold_trend is not None else None,
        "open_pipeline_trend": round(open_pipeline_trend, 2) if open_pipeline_trend is not None else None,
        "open_pipeline_date_trend": round(open_pipeline_date_trend, 2) if open_pipeline_date_trend is not None else None,
        "max_potential_revenue_trend": round(max_potential_trend, 2) if max_potential_trend is not None else None,
        "avg_sell_price_trend": round(avg_sell_price_trend, 2) if avg_sell_price_trend is not None else None,
    }
    if compare_to == "budget":
        out["invoiced_revenue_budget"] = budget_by_kpi.get("invoiced_revenue")
        out["invoiced_margin_budget"] = budget_by_kpi.get("invoiced_margin")
        out["margin_percent_budget"] = budget_by_kpi.get("margin_percent")
        out["units_sold_budget"] = budget_by_kpi.get("units_sold")
        out["open_pipeline_budget"] = budget_by_kpi.get("open_pipeline")
        out["open_pipeline_date_budget"] = budget_by_kpi.get("open_pipeline_date")
        out["max_potential_revenue_budget"] = budget_by_kpi.get("max_potential_revenue")
        out["avg_sell_price_budget"] = budget_by_kpi.get("avg_sell_price")
    return out
