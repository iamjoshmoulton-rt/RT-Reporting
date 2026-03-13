"""Sales Dashboard service — replicates the Odoo 17 Sales Spreadsheet Dashboard.

Queries run against the Odoo read-replica (RDS). Results are cached in memory
with a 15-min TTL (same pattern as grading_service). The overview combo endpoint
runs all queries in parallel via asyncio.gather for fast page loads.
"""

import asyncio
import logging
import time
from datetime import date

from sqlalchemy import select, func, case, extract, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.sales import SaleOrder, SaleOrderLine
from app.odoo_models.accounting import AccountMove
from app.odoo_models.partners import (
    ResPartner, ProductTemplate, ProductProduct, ProductCategory,
    ResCountry, ResUsers, CrmTeam,
)
from app.services.tz import local_date
from app.database import OdooSessionLocal

logger = logging.getLogger(__name__)

# ── Response cache (TTL-based) ────────────────────────────────────────

_response_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 900  # 15 minutes


def _cache_key(prefix: str, date_from: date, date_to: date, **kwargs) -> str:
    extra = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None)
    return f"sales_dash:{prefix}:{date_from}:{date_to}:{extra}"


def _get_cached(key: str):
    entry = _response_cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _set_cached(key: str, value):
    _response_cache[key] = (time.time(), value)


# ── Helpers ───────────────────────────────────────────────────────────

def _product_name():
    return ProductTemplate.name["en_US"].as_string()


def _country_name():
    return ResCountry.name["en_US"].as_string()


def _team_name():
    return CrmTeam.name["en_US"].as_string()


def _confirmed_filters(date_from: date, date_to: date, **kw):
    """Base filters: confirmed sale orders within date range."""
    f = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        f.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        f.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("salesperson_id"):
        f.append(SaleOrder.user_id == kw["salesperson_id"])
    if kw.get("customer_id"):
        f.append(SaleOrder.partner_id == kw["customer_id"])
    if kw.get("channel_id"):
        f.append(SaleOrder.team_id == kw["channel_id"])
    return f


def _line_filters(date_from: date, date_to: date, **kw):
    """Join SaleOrderLine → SaleOrder with confirmed + date range + optional filters."""
    f = _confirmed_filters(date_from, date_to, **kw)
    if kw.get("product_id"):
        f.append(SaleOrderLine.product_id == kw["product_id"])
    if kw.get("category_id"):
        f.append(ProductTemplate.categ_id == kw["category_id"])
    return f


# ── Individual query functions ────────────────────────────────────────

async def _get_kpis(db: AsyncSession, date_from: date, date_to: date, **kw):
    """8 KPIs matching the Odoo sales dashboard."""
    cf = _confirmed_filters(date_from, date_to, **kw)

    # Invoiced revenue from account_move (posted out_invoices minus out_refunds)
    # This matches Odoo's spreadsheet dashboard which uses net invoice amounts
    inv_f = cf + [SaleOrder.invoice_status == "invoiced"]
    am_filters = [
        AccountMove.state == "posted",
        AccountMove.move_type.in_(["out_invoice", "out_refund"]),
    ]
    if date_from:
        am_filters.append(AccountMove.invoice_date >= date_from)
    if date_to:
        am_filters.append(AccountMove.invoice_date <= date_to)
    if kw.get("salesperson_id"):
        am_filters.append(AccountMove.invoice_user_id == kw["salesperson_id"])
    revenue_q = select(
        func.coalesce(func.sum(
            case(
                (AccountMove.move_type == "out_invoice", AccountMove.amount_untaxed),
                (AccountMove.move_type == "out_refund", -AccountMove.amount_untaxed),
                else_=0,
            )
        ), 0).label("invoiced_revenue"),
    ).where(*am_filters)
    invoiced_revenue = float((await db.execute(revenue_q)).scalar_one())

    # Line-level margin for invoiced orders, device categories only
    # Excludes non-device categories to approximate Odoo's "Device margin reported on P&L"
    _EXCLUDED_MARGIN_CATEGORIES = ["Accessories", "Accessories (Products)", "Deliveries", "Headphones"]
    margin_q = (
        select(func.coalesce(func.sum(SaleOrderLine.margin), 0))
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*inv_f, ~ProductCategory.complete_name.in_(_EXCLUDED_MARGIN_CATEGORIES))
    )
    invoiced_margin = float((await db.execute(margin_q)).scalar_one())
    margin_pct = (invoiced_margin / invoiced_revenue * 100) if invoiced_revenue else 0

    # Units sold (invoiced qty on invoiced orders, device categories only — matches Odoo)
    # Odoo's "Units Sold Tile" excludes non-device categories by exact complete_name
    _EXCLUDED_UNIT_CATEGORIES = ["Accessories", "Accessories (Products)", "Deliveries", "Headphones"]
    lf = cf.copy() + [SaleOrder.invoice_status == "invoiced"]
    qty_q = (
        select(func.coalesce(func.sum(SaleOrderLine.qty_invoiced), 0))
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*lf, ~ProductCategory.complete_name.in_(_EXCLUDED_UNIT_CATEGORIES))
    )
    units_sold = float((await db.execute(qty_q)).scalar_one())
    avg_sell = (invoiced_revenue / units_sold) if units_sold else 0

    # Open pipeline (confirmed, not fully invoiced)
    pipe_f = cf + [SaleOrder.invoice_status != "invoiced"]
    open_pipeline = float((await db.execute(
        select(func.coalesce(func.sum(SaleOrder.amount_total), 0)).where(*pipe_f)
    )).scalar_one())

    # Open pipeline by delivery/commitment date
    del_f = [SaleOrder.state.in_(["sale", "done"]), SaleOrder.invoice_status != "invoiced"]
    if date_from:
        del_f.append(local_date(SaleOrder.commitment_date) >= date_from)
    if date_to:
        del_f.append(local_date(SaleOrder.commitment_date) <= date_to)
    if kw.get("salesperson_id"):
        del_f.append(SaleOrder.user_id == kw["salesperson_id"])
    if kw.get("channel_id"):
        del_f.append(SaleOrder.team_id == kw["channel_id"])
    open_pipeline_date = float((await db.execute(
        select(func.coalesce(func.sum(SaleOrder.amount_total), 0)).where(*del_f)
    )).scalar_one())

    max_potential = invoiced_revenue + open_pipeline_date

    return {
        "invoiced_revenue": round(invoiced_revenue, 2),
        "invoiced_margin": round(invoiced_margin, 2),
        "margin_percent": round(margin_pct, 1),
        "units_sold": round(units_sold),
        "open_pipeline": round(open_pipeline, 2),
        "open_pipeline_date": round(open_pipeline_date, 2),
        "max_potential_revenue": round(max_potential, 2),
        "avg_sell_price": round(avg_sell, 2),
    }


async def _get_monthly_sales(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Monthly revenue bar chart data."""
    cf = _confirmed_filters(date_from, date_to, **kw) + [SaleOrder.invoice_status == "invoiced"]
    month_expr = func.date_trunc("month", SaleOrder.date_order)
    q = (
        select(
            month_expr.label("month"),
            func.sum(SaleOrder.amount_total).label("revenue"),
            func.sum(SaleOrder.margin).label("margin"),
            func.count(SaleOrder.id).label("orders"),
        )
        .where(*cf)
        .group_by(month_expr)
        .order_by(month_expr)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "month": r.month.strftime("%Y-%m") if r.month else None,
            "revenue": round(float(r.revenue or 0), 2),
            "margin": round(float(r.margin or 0), 2),
            "orders": r.orders,
        }
        for r in rows
    ]


async def _get_by_salesperson(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by salesperson — join SaleOrder → res_users → res_partner."""
    cf = _confirmed_filters(date_from, date_to, **kw) + [SaleOrder.invoice_status == "invoiced"]
    q = (
        select(
            SaleOrder.user_id,
            ResPartner.name.label("salesperson"),
            func.sum(SaleOrder.amount_total).label("revenue"),
            func.sum(SaleOrder.margin).label("margin"),
            func.count(SaleOrder.id).label("orders"),
        )
        .join(ResUsers, SaleOrder.user_id == ResUsers.id)
        .join(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(*cf)
        .group_by(SaleOrder.user_id, ResPartner.name)
        .order_by(func.sum(SaleOrder.amount_total).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.user_id,
            "name": r.salesperson,
            "revenue": round(float(r.revenue or 0), 2),
            "margin": round(float(r.margin or 0), 2),
            "orders": r.orders,
        }
        for r in rows
    ]


async def _get_by_channel(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by sales channel (crm_team)."""
    cf = _confirmed_filters(date_from, date_to, **kw) + [SaleOrder.invoice_status == "invoiced"]
    team_name = _team_name()
    q = (
        select(
            SaleOrder.team_id,
            team_name.label("channel"),
            func.sum(SaleOrder.amount_total).label("revenue"),
            func.sum(SaleOrder.margin).label("margin"),
            func.count(SaleOrder.id).label("orders"),
        )
        .join(CrmTeam, SaleOrder.team_id == CrmTeam.id)
        .where(*cf)
        .group_by(SaleOrder.team_id, team_name)
        .order_by(func.sum(SaleOrder.amount_total).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.team_id,
            "name": r.channel,
            "revenue": round(float(r.revenue or 0), 2),
            "margin": round(float(r.margin or 0), 2),
            "orders": r.orders,
        }
        for r in rows
    ]


async def _get_top_customers(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Top customers by revenue."""
    cf = _confirmed_filters(date_from, date_to, **kw) + [SaleOrder.invoice_status == "invoiced"]
    q = (
        select(
            SaleOrder.partner_id,
            ResPartner.name.label("customer"),
            func.sum(SaleOrder.amount_total).label("revenue"),
            func.sum(SaleOrder.margin).label("margin"),
            func.count(SaleOrder.id).label("orders"),
        )
        .join(ResPartner, SaleOrder.partner_id == ResPartner.id)
        .where(*cf)
        .group_by(SaleOrder.partner_id, ResPartner.name)
        .order_by(func.sum(SaleOrder.amount_total).desc())
        .limit(20)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.partner_id,
            "name": r.customer,
            "revenue": round(float(r.revenue or 0), 2),
            "margin": round(float(r.margin or 0), 2),
            "orders": r.orders,
        }
        for r in rows
    ]


async def _get_top_invoices(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Top posted invoices — AccountMove (out_invoice, posted)."""
    f = [
        AccountMove.move_type == "out_invoice",
        AccountMove.state == "posted",
    ]
    if date_from:
        f.append(AccountMove.invoice_date >= date_from)
    if date_to:
        f.append(AccountMove.invoice_date <= date_to)
    if kw.get("salesperson_id"):
        f.append(AccountMove.invoice_user_id == kw["salesperson_id"])
    if kw.get("customer_id"):
        f.append(AccountMove.partner_id == kw["customer_id"])

    # Join partner for customer name, res_users→res_partner for salesperson name
    SalespersonPartner = ResPartner.__table__.alias("sp_partner")
    q = (
        select(
            AccountMove.id,
            AccountMove.name.label("invoice_number"),
            AccountMove.invoice_date,
            AccountMove.amount_total,
            AccountMove.payment_state,
            ResPartner.name.label("customer"),
            SalespersonPartner.c.name.label("salesperson"),
        )
        .outerjoin(ResPartner, AccountMove.partner_id == ResPartner.id)
        .outerjoin(ResUsers, AccountMove.invoice_user_id == ResUsers.id)
        .outerjoin(SalespersonPartner, ResUsers.partner_id == SalespersonPartner.c.id)
        .where(*f)
        .order_by(AccountMove.amount_total.desc())
        .limit(20)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.id,
            "invoice_number": r.invoice_number,
            "date": r.invoice_date.isoformat() if r.invoice_date else None,
            "amount": round(float(r.amount_total or 0), 2),
            "payment_state": r.payment_state,
            "customer": r.customer,
            "salesperson": r.salesperson,
        }
        for r in rows
    ]


async def _get_by_country(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by customer country."""
    cf = _confirmed_filters(date_from, date_to, **kw) + [SaleOrder.invoice_status == "invoiced"]
    country_name = _country_name()
    q = (
        select(
            ResCountry.id.label("country_id"),
            country_name.label("country"),
            ResCountry.code.label("country_code"),
            func.sum(SaleOrder.amount_total).label("revenue"),
            func.count(SaleOrder.id).label("orders"),
        )
        .join(ResPartner, SaleOrder.partner_id == ResPartner.id)
        .join(ResCountry, ResPartner.country_id == ResCountry.id)
        .where(*cf)
        .group_by(ResCountry.id, country_name, ResCountry.code)
        .order_by(func.sum(SaleOrder.amount_total).desc())
        .limit(20)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.country_id,
            "name": r.country,
            "code": r.country_code,
            "revenue": round(float(r.revenue or 0), 2),
            "orders": r.orders,
        }
        for r in rows
    ]


async def _get_by_category(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by product category."""
    cf = _confirmed_filters(date_from, date_to, **kw)
    lf = cf.copy()
    if kw.get("category_id"):
        lf.append(ProductTemplate.categ_id == kw["category_id"])
    q = (
        select(
            ProductCategory.id.label("category_id"),
            ProductCategory.complete_name.label("category"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
            func.sum(SaleOrderLine.margin).label("margin"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*lf)
        .group_by(ProductCategory.id, ProductCategory.complete_name)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
        .limit(20)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.category_id,
            "name": r.category,
            "revenue": round(float(r.revenue or 0), 2),
            "margin": round(float(r.margin or 0), 2),
            "qty": round(float(r.qty or 0)),
        }
        for r in rows
    ]


async def _get_top_products(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Top products by revenue."""
    cf = _confirmed_filters(date_from, date_to, **kw)
    lf = cf.copy()
    if kw.get("product_id"):
        lf.append(SaleOrderLine.product_id == kw["product_id"])
    if kw.get("category_id"):
        lf.append(ProductTemplate.categ_id == kw["category_id"])
    pname = _product_name()
    q = (
        select(
            ProductProduct.id.label("product_id"),
            pname.label("product"),
            ProductProduct.default_code.label("sku"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
            func.sum(SaleOrderLine.margin).label("margin"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*lf)
        .group_by(ProductProduct.id, pname, ProductProduct.default_code)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
        .limit(20)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.product_id,
            "name": r.product,
            "sku": r.sku,
            "revenue": round(float(r.revenue or 0), 2),
            "margin": round(float(r.margin or 0), 2),
            "qty": round(float(r.qty or 0)),
        }
        for r in rows
    ]


async def _get_open_orders_by_rep(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Open (not invoiced) orders grouped by salesperson."""
    cf = _confirmed_filters(date_from, date_to, **kw) + [SaleOrder.invoice_status != "invoiced"]
    q = (
        select(
            SaleOrder.user_id,
            ResPartner.name.label("salesperson"),
            func.count(SaleOrder.id).label("orders"),
            func.sum(SaleOrder.amount_total).label("amount"),
        )
        .join(ResUsers, SaleOrder.user_id == ResUsers.id)
        .join(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(*cf)
        .group_by(SaleOrder.user_id, ResPartner.name)
        .order_by(func.sum(SaleOrder.amount_total).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.user_id,
            "name": r.salesperson,
            "orders": r.orders,
            "amount": round(float(r.amount or 0), 2),
        }
        for r in rows
    ]


async def _get_invoiced_by_week(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Invoiced revenue by week (AccountMove out_invoice, posted)."""
    f = [
        AccountMove.move_type == "out_invoice",
        AccountMove.state == "posted",
    ]
    if date_from:
        f.append(AccountMove.invoice_date >= date_from)
    if date_to:
        f.append(AccountMove.invoice_date <= date_to)
    if kw.get("salesperson_id"):
        f.append(AccountMove.invoice_user_id == kw["salesperson_id"])
    week_expr = func.date_trunc("week", AccountMove.invoice_date)
    q = (
        select(
            week_expr.label("week"),
            func.sum(AccountMove.amount_total).label("revenue"),
            func.count(AccountMove.id).label("invoices"),
        )
        .where(*f)
        .group_by(week_expr)
        .order_by(week_expr)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "week": r.week.strftime("%Y-%m-%d") if r.week else None,
            "revenue": round(float(r.revenue or 0), 2),
            "invoices": r.invoices,
        }
        for r in rows
    ]


async def _get_booked_by_week(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Booked (confirmed SO) revenue by week."""
    cf = _confirmed_filters(date_from, date_to, **kw)
    week_expr = func.date_trunc("week", SaleOrder.date_order)
    q = (
        select(
            week_expr.label("week"),
            func.sum(SaleOrder.amount_total).label("revenue"),
            func.count(SaleOrder.id).label("orders"),
        )
        .where(*cf)
        .group_by(week_expr)
        .order_by(week_expr)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "week": r.week.strftime("%Y-%m-%d") if r.week else None,
            "revenue": round(float(r.revenue or 0), 2),
            "orders": r.orders,
        }
        for r in rows
    ]


async def _get_margin_by_channel(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Margin breakdown by sales channel."""
    cf = _confirmed_filters(date_from, date_to, **kw) + [SaleOrder.invoice_status == "invoiced"]
    team_name = _team_name()
    q = (
        select(
            SaleOrder.team_id,
            team_name.label("channel"),
            func.sum(SaleOrder.amount_total).label("revenue"),
            func.sum(SaleOrder.margin).label("margin"),
        )
        .join(CrmTeam, SaleOrder.team_id == CrmTeam.id)
        .where(*cf)
        .group_by(SaleOrder.team_id, team_name)
        .order_by(func.sum(SaleOrder.amount_total).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.team_id,
            "name": r.channel,
            "revenue": round(float(r.revenue or 0), 2),
            "margin": round(float(r.margin or 0), 2),
            "margin_percent": round(
                (float(r.margin or 0) / float(r.revenue) * 100) if float(r.revenue or 0) else 0, 1
            ),
        }
        for r in rows
    ]


async def _get_filter_options(db: AsyncSession):
    """Distinct values for filter dropdowns."""

    async def _salespersons():
        q = (
            select(ResUsers.id, ResPartner.name.label("name"))
            .join(ResPartner, ResUsers.partner_id == ResPartner.id)
            .where(ResUsers.active == True)
            .distinct()
            .order_by(ResPartner.name)
        )
        rows = (await db.execute(q)).all()
        return [{"id": r.id, "name": r.name} for r in rows]

    async def _channels():
        q = (
            select(CrmTeam.id, _team_name().label("name"))
            .where(CrmTeam.active == True)
            .order_by(_team_name())
        )
        rows = (await db.execute(q)).all()
        return [{"id": r.id, "name": r.name} for r in rows]

    async def _categories():
        q = (
            select(ProductCategory.id, ProductCategory.complete_name.label("name"))
            .order_by(ProductCategory.complete_name)
        )
        rows = (await db.execute(q)).all()
        return [{"id": r.id, "name": r.name} for r in rows]

    async def _countries():
        q = (
            select(ResCountry.id, _country_name().label("name"), ResCountry.code)
            .order_by(_country_name())
        )
        rows = (await db.execute(q)).all()
        return [{"id": r.id, "name": r.name, "code": r.code} for r in rows]

    # Run sequentially — single session can't handle concurrent queries
    sp = await _salespersons()
    ch = await _channels()
    cat = await _categories()
    co = await _countries()
    return {
        "salespersons": sp,
        "channels": ch,
        "categories": cat,
        "countries": co,
    }


# ── Public API ────────────────────────────────────────────────────────

async def get_sales_dashboard_overview(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    salesperson_id: int | None = None,
    customer_id: int | None = None,
    channel_id: int | None = None,
    product_id: int | None = None,
    category_id: int | None = None,
    country_id: int | None = None,
):
    """Combined overview — runs all 13 queries in parallel, caches result."""
    kw = dict(
        salesperson_id=salesperson_id,
        customer_id=customer_id,
        channel_id=channel_id,
        product_id=product_id,
        category_id=category_id,
        country_id=country_id,
    )
    ck = _cache_key("overview", date_from, date_to, **kw)
    cached = _get_cached(ck)
    if cached:
        return cached

    # Each query gets its own session (required for asyncio.gather)
    async def _run(fn, **extra_kw):
        async with OdooSessionLocal() as session:
            return await fn(session, date_from, date_to, **{**kw, **extra_kw})

    results = await asyncio.gather(
        _run(_get_kpis),
        _run(_get_monthly_sales),
        _run(_get_by_salesperson),
        _run(_get_by_channel),
        _run(_get_top_customers),
        _run(_get_top_invoices),
        _run(_get_by_country),
        _run(_get_by_category),
        _run(_get_top_products),
        _run(_get_open_orders_by_rep),
        _run(_get_invoiced_by_week),
        _run(_get_booked_by_week),
        _run(_get_margin_by_channel),
    )

    data = {
        "kpis": results[0],
        "monthly_sales": results[1],
        "by_salesperson": results[2],
        "by_channel": results[3],
        "top_customers": results[4],
        "top_invoices": results[5],
        "by_country": results[6],
        "by_category": results[7],
        "top_products": results[8],
        "open_orders_by_rep": results[9],
        "invoiced_by_week": results[10],
        "booked_by_week": results[11],
        "margin_by_channel": results[12],
    }

    _set_cached(ck, data)
    return data


async def get_filter_options(db: AsyncSession):
    """Cached filter dropdown options."""
    ck = "sales_dash:filters"
    cached = _get_cached(ck)
    if cached:
        return cached
    data = await _get_filter_options(db)
    _set_cached(ck, data)
    return data
