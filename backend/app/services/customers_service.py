from datetime import date
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.partners import ResPartner
from app.odoo_models.sales import SaleOrder
from app.services.tz import local_date, local_timestamp


async def get_customers_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    """KPIs: total customers, active customers (with orders in period), total revenue, avg revenue per customer."""
    # Total customers with customer_rank > 0
    total_result = await db.execute(
        select(func.count(ResPartner.id)).where(
            ResPartner.customer_rank > 0,
            ResPartner.active.is_(True),
        )
    )
    total_customers = total_result.scalar()

    # Active customers = distinct partners with confirmed sale orders in period
    order_filters = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        order_filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        order_filters.append(local_date(SaleOrder.date_order) <= date_to)

    active_result = await db.execute(
        select(
            func.count(func.distinct(SaleOrder.partner_id)).label("active_customers"),
            func.coalesce(func.sum(SaleOrder.amount_total), 0).label("total_revenue"),
        ).where(*order_filters)
    )
    row = active_result.one()
    active_customers = row.active_customers
    total_revenue = float(row.total_revenue)
    avg_revenue = round(total_revenue / active_customers, 2) if active_customers else 0

    return {
        "total_customers": total_customers,
        "active_customers": active_customers,
        "total_revenue": total_revenue,
        "avg_revenue_per_customer": avg_revenue,
    }


async def get_top_customers(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 10,
):
    """Top customers ranked by total revenue."""
    filters = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        filters.append(local_date(SaleOrder.date_order) <= date_to)

    result = await db.execute(
        select(
            ResPartner.id.label("customer_id"),
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
            "customer_id": row.customer_id,
            "customer_name": row.customer_name,
            "order_count": row.order_count,
            "total_revenue": float(row.total_revenue),
        }
        for row in result.all()
    ]


async def get_customers_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    """New customers created per period."""
    filters = [
        ResPartner.customer_rank > 0,
        ResPartner.active.is_(True),
    ]
    if date_from:
        filters.append(local_date(ResPartner.create_date) >= date_from)
    if date_to:
        filters.append(local_date(ResPartner.create_date) <= date_to)

    local_dt_expr = local_timestamp(ResPartner.create_date)
    if group_by == "day":
        period = local_date(ResPartner.create_date)
    elif group_by == "week":
        period = func.date_trunc("week", local_dt_expr)
    elif group_by == "year":
        period = func.date_trunc("year", local_dt_expr)
    else:
        period = func.date_trunc("month", local_dt_expr)

    query = (
        select(
            period.label("period"),
            func.count(ResPartner.id).label("customer_count"),
        )
        .where(*filters)
        .group_by(period)
        .order_by(period)
    )

    result = await db.execute(query)
    return [
        {
            "period": str(row.period),
            "customer_count": row.customer_count,
        }
        for row in result.all()
    ]


async def get_customer_list(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
):
    """Paginated customer list with order count and total spend."""
    order_filters = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        order_filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        order_filters.append(local_date(SaleOrder.date_order) <= date_to)

    # Subquery for customer revenue stats
    stats_sq = (
        select(
            SaleOrder.partner_id,
            func.count(SaleOrder.id).label("order_count"),
            func.coalesce(func.sum(SaleOrder.amount_total), 0).label("total_spend"),
        )
        .where(*order_filters)
        .group_by(SaleOrder.partner_id)
        .subquery()
    )

    # Search filter (applied to both count and data queries)
    search_filters = []
    if search:
        term = f"%{search}%"
        search_filters.append(or_(
            ResPartner.name.ilike(term),
            ResPartner.email.ilike(term),
            ResPartner.phone.ilike(term),
            ResPartner.city.ilike(term),
        ))

    # Count total
    count_q = (
        select(func.count(ResPartner.id))
        .join(stats_sq, ResPartner.id == stats_sq.c.partner_id)
    )
    if search_filters:
        count_q = count_q.where(*search_filters)
    total = (await db.execute(count_q)).scalar()

    # Main query
    query = (
        select(
            ResPartner.id,
            ResPartner.name,
            ResPartner.email,
            ResPartner.phone,
            ResPartner.city,
            ResPartner.create_date,
            stats_sq.c.order_count,
            stats_sq.c.total_spend,
        )
        .join(stats_sq, ResPartner.id == stats_sq.c.partner_id)
    )
    if search_filters:
        query = query.where(*search_filters)
    query = query.order_by(stats_sq.c.total_spend.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    customers = [
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "phone": row.phone,
            "city": row.city,
            "create_date": str(row.create_date) if row.create_date else None,
            "order_count": row.order_count,
            "total_spend": float(row.total_spend),
        }
        for row in result.all()
    ]
    return {"total": total, "customers": customers}


async def suggest_customers(
    db: AsyncSession,
    query: str,
    limit: int = 8,
):
    """Fast typeahead suggestions for customer search."""
    term = f"%{query}%"
    result = await db.execute(
        select(
            ResPartner.id,
            ResPartner.name,
            ResPartner.email,
            ResPartner.city,
            ResPartner.phone,
        )
        .where(
            ResPartner.customer_rank > 0,
            ResPartner.active.is_(True),
            or_(
                ResPartner.name.ilike(term),
                ResPartner.email.ilike(term),
                ResPartner.phone.ilike(term),
                ResPartner.city.ilike(term),
            ),
        )
        .order_by(ResPartner.name)
        .limit(limit)
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "email": r.email,
            "city": r.city,
            "phone": r.phone,
        }
        for r in result.all()
    ]


async def get_customer_detail(
    db: AsyncSession,
    customer_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    offset: int = 0,
    limit: int = 20,
):
    """Full customer profile with revenue stats and paginated order history."""
    # Get customer info (select specific columns to avoid phantom computed fields)
    partner_result = await db.execute(
        select(
            ResPartner.id, ResPartner.name, ResPartner.email,
            ResPartner.phone, ResPartner.mobile,
            ResPartner.street, ResPartner.street2,
            ResPartner.city, ResPartner.zip,
            ResPartner.vat, ResPartner.website,
            ResPartner.is_company, ResPartner.create_date,
        ).where(ResPartner.id == customer_id)
    )
    partner = partner_result.one_or_none()
    if not partner:
        return None

    # Order filters
    order_filters = [
        SaleOrder.partner_id == customer_id,
        SaleOrder.state.in_(["sale", "done"]),
    ]
    if date_from:
        order_filters.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        order_filters.append(local_date(SaleOrder.date_order) <= date_to)

    # Aggregate stats
    stats_result = await db.execute(
        select(
            func.count(SaleOrder.id).label("total_orders"),
            func.coalesce(func.sum(SaleOrder.amount_total), 0).label("total_revenue"),
            func.coalesce(func.avg(SaleOrder.amount_total), 0).label("avg_order_value"),
        ).where(*order_filters)
    )
    stats = stats_result.one()

    # Total for pagination
    total_orders = stats.total_orders

    # Paginated order list
    orders_result = await db.execute(
        select(
            SaleOrder.id,
            SaleOrder.name,
            SaleOrder.state,
            SaleOrder.date_order,
            SaleOrder.amount_total,
            SaleOrder.amount_untaxed,
            SaleOrder.invoice_status,
        )
        .where(*order_filters)
        .order_by(SaleOrder.date_order.desc())
        .offset(offset)
        .limit(limit)
    )
    orders = [
        {
            "id": row.id,
            "name": row.name,
            "state": row.state,
            "date_order": str(row.date_order) if row.date_order else None,
            "amount_total": float(row.amount_total) if row.amount_total else 0,
            "amount_untaxed": float(row.amount_untaxed) if row.amount_untaxed else 0,
            "invoice_status": row.invoice_status,
        }
        for row in orders_result.all()
    ]

    return {
        "customer": {
            "id": partner.id,
            "name": partner.name,
            "email": partner.email,
            "phone": partner.phone,
            "mobile": partner.mobile,
            "street": partner.street,
            "street2": partner.street2,
            "city": partner.city,
            "zip": partner.zip,
            "vat": partner.vat,
            "website": partner.website,
            "is_company": partner.is_company,
            "create_date": str(partner.create_date) if partner.create_date else None,
        },
        "stats": {
            "total_orders": total_orders,
            "total_revenue": float(stats.total_revenue),
            "avg_order_value": round(float(stats.avg_order_value), 2),
        },
        "orders": {
            "total": total_orders,
            "items": orders,
        },
    }
