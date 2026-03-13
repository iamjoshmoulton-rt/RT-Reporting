"""E-Commerce Dashboard service — Invoice-based & Order-based views.

Queries run against the Odoo read-replica (RDS). Results are cached in Redis
with a 15-min TTL. The overview combo endpoints run all queries in parallel
via asyncio.gather for fast page loads.

Two dashboards:
 1. Invoice Data  — based on account_move (posted invoices/refunds)
 2. Order Data    — based on sale_order (confirmed orders)
"""

import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import select, func, case, and_, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.sales import SaleOrder, SaleOrderLine
from app.odoo_models.accounting import AccountMove, AccountMoveLine
from app.odoo_models.partners import (
    ResPartner, ProductTemplate, ProductProduct, ProductCategory,
    ResUsers, CrmTeam,
)
from app.services.tz import local_date
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes


def _cache_key(prefix: str, date_from: date, date_to: date, **kwargs) -> str:
    extra = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None)
    return f"ecom:{prefix}:{date_from}:{date_to}:{extra}"


async def _get_cached(key: str):
    return await cache_get(key)


async def _set_cached(key: str, value):
    await cache_set(key, value, CACHE_TTL)


# ── Helpers ───────────────────────────────────────────────────────────

def _product_name():
    return ProductTemplate.name["en_US"].as_string()


def _team_name():
    return CrmTeam.name["en_US"].as_string()


# Categories to exclude for device-only metrics (match Sales Dashboard)
_EXCLUDED_MARGIN_CATEGORIES = [
    "Accessories", "Accessories (Products)", "Deliveries", "Headphones",
]
_EXCLUDED_UNIT_CATEGORIES = [
    "Accessories", "Accessories (Products)", "Deliveries", "Headphones",
]


# ═══════════════════════════════════════════════════════════════════════
#  INVOICE-BASED DASHBOARD
# ═══════════════════════════════════════════════════════════════════════

def _invoice_filters(date_from: date, date_to: date, **kw):
    """Base filters for posted customer invoices/refunds."""
    f = [
        AccountMove.state == "posted",
        AccountMove.move_type.in_(["out_invoice", "out_refund"]),
    ]
    if date_from:
        f.append(AccountMove.invoice_date >= date_from)
    if date_to:
        f.append(AccountMove.invoice_date <= date_to)
    if kw.get("channel_ids"):
        f.append(SaleOrder.team_id.in_(kw["channel_ids"]))
    if kw.get("category_ids"):
        f.append(ProductTemplate.categ_id.in_(kw["category_ids"]))
    return f


async def _inv_kpis(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Invoice KPIs: P&L Revenue, Margin, Units, ASP, Revenue Pace, Revenue w/o RMA."""
    # Net invoiced revenue (invoices - refunds)
    am_f = [
        AccountMove.state == "posted",
        AccountMove.move_type.in_(["out_invoice", "out_refund"]),
    ]
    if date_from:
        am_f.append(AccountMove.invoice_date >= date_from)
    if date_to:
        am_f.append(AccountMove.invoice_date <= date_to)

    revenue_q = select(
        func.coalesce(func.sum(
            case(
                (AccountMove.move_type == "out_invoice", AccountMove.amount_untaxed),
                (AccountMove.move_type == "out_refund", -AccountMove.amount_untaxed),
                else_=0,
            )
        ), 0).label("net_revenue"),
    ).where(*am_f)
    net_revenue = float((await db.execute(revenue_q)).scalar_one())

    # Revenue from invoices only (no refunds/RMA)
    inv_only_f = [
        AccountMove.state == "posted",
        AccountMove.move_type == "out_invoice",
    ]
    if date_from:
        inv_only_f.append(AccountMove.invoice_date >= date_from)
    if date_to:
        inv_only_f.append(AccountMove.invoice_date <= date_to)
    rev_no_rma_q = select(
        func.coalesce(func.sum(AccountMove.amount_untaxed), 0)
    ).where(*inv_only_f)
    revenue_no_rma = float((await db.execute(rev_no_rma_q)).scalar_one())

    # Device margin from sale_order_line on invoiced orders
    so_f = [
        SaleOrder.state.in_(["sale", "done"]),
        SaleOrder.invoice_status == "invoiced",
    ]
    if date_from:
        so_f.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        so_f.append(local_date(SaleOrder.date_order) <= date_to)

    margin_q = (
        select(func.coalesce(func.sum(SaleOrderLine.margin), 0))
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*so_f, ~ProductCategory.complete_name.in_(_EXCLUDED_MARGIN_CATEGORIES))
    )
    device_margin = float((await db.execute(margin_q)).scalar_one())
    margin_pct = (device_margin / net_revenue * 100) if net_revenue else 0

    # Units sold (device categories only)
    qty_q = (
        select(func.coalesce(func.sum(SaleOrderLine.qty_invoiced), 0))
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*so_f, ~ProductCategory.complete_name.in_(_EXCLUDED_UNIT_CATEGORIES))
    )
    units_sold = float((await db.execute(qty_q)).scalar_one())
    asp = (net_revenue / units_sold) if units_sold else 0

    # Revenue pace — project current month's revenue to full month
    if date_from and date_to:
        days_elapsed = (date_to - date_from).days + 1
        today = date.today()
        if date_from.month == today.month and date_from.year == today.year:
            import calendar
            days_in_month = calendar.monthrange(today.year, today.month)[1]
            revenue_pace = (net_revenue / days_elapsed * days_in_month) if days_elapsed > 0 else 0
        else:
            revenue_pace = net_revenue
    else:
        revenue_pace = net_revenue

    # Previous period for comparison (same duration, immediately prior)
    days_range = (date_to - date_from).days + 1 if date_from and date_to else 30
    prev_from = date_from - timedelta(days=days_range) if date_from else None
    prev_to = date_from - timedelta(days=1) if date_from else None
    prev_revenue = 0
    if prev_from and prev_to:
        prev_f = [
            AccountMove.state == "posted",
            AccountMove.move_type.in_(["out_invoice", "out_refund"]),
            AccountMove.invoice_date >= prev_from,
            AccountMove.invoice_date <= prev_to,
        ]
        prev_q = select(
            func.coalesce(func.sum(
                case(
                    (AccountMove.move_type == "out_invoice", AccountMove.amount_untaxed),
                    (AccountMove.move_type == "out_refund", -AccountMove.amount_untaxed),
                    else_=0,
                )
            ), 0)
        ).where(*prev_f)
        prev_revenue = float((await db.execute(prev_q)).scalar_one())

    revenue_change_pct = ((net_revenue - prev_revenue) / prev_revenue * 100) if prev_revenue else 0

    # Previous period revenue w/o RMA
    prev_rev_no_rma = 0
    if prev_from and prev_to:
        prev_nr_f = [
            AccountMove.state == "posted",
            AccountMove.move_type == "out_invoice",
            AccountMove.invoice_date >= prev_from,
            AccountMove.invoice_date <= prev_to,
        ]
        prev_nr_q = select(func.coalesce(func.sum(AccountMove.amount_untaxed), 0)).where(*prev_nr_f)
        prev_rev_no_rma = float((await db.execute(prev_nr_q)).scalar_one())
    rev_no_rma_change_pct = ((revenue_no_rma - prev_rev_no_rma) / prev_rev_no_rma * 100) if prev_rev_no_rma else 0

    return {
        "invoiced_revenue": round(net_revenue, 2),
        "revenue_change_pct": round(revenue_change_pct, 1),
        "inv_revenue_margin_pct": round(margin_pct, 1),
        "device_margin": round(device_margin, 2),
        "units_sold": round(units_sold),
        "asp": round(asp, 2),
        "revenue_pace": round(revenue_pace, 2),
        "revenue_no_rma": round(revenue_no_rma, 2),
        "rev_no_rma_change_pct": round(rev_no_rma_change_pct, 1),
    }


async def _inv_comparison_stats(db: AsyncSession, date_from: date, date_to: date, **kw):
    """3-month comparison: Revenue, Device Margin, Device Margin %."""
    today = date.today()
    months = []
    for i in range(3):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        m_from = date(y, m, 1)
        import calendar
        m_to = date(y, m, calendar.monthrange(y, m)[1])
        months.append((m_from, m_to, f"{m_from.strftime('%m/%Y')}"))

    results = []
    for m_from, m_to, label in months:
        am_f = [
            AccountMove.state == "posted",
            AccountMove.move_type.in_(["out_invoice", "out_refund"]),
            AccountMove.invoice_date >= m_from,
            AccountMove.invoice_date <= m_to,
        ]
        rev_q = select(func.coalesce(func.sum(
            case(
                (AccountMove.move_type == "out_invoice", AccountMove.amount_untaxed),
                (AccountMove.move_type == "out_refund", -AccountMove.amount_untaxed),
                else_=0,
            )
        ), 0)).where(*am_f)
        revenue = float((await db.execute(rev_q)).scalar_one())

        # Device margin
        so_f = [
            SaleOrder.state.in_(["sale", "done"]),
            SaleOrder.invoice_status == "invoiced",
            local_date(SaleOrder.date_order) >= m_from,
            local_date(SaleOrder.date_order) <= m_to,
        ]
        margin_q = (
            select(func.coalesce(func.sum(SaleOrderLine.margin), 0))
            .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
            .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
            .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
            .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
            .where(*so_f, ~ProductCategory.complete_name.in_(_EXCLUDED_MARGIN_CATEGORIES))
        )
        margin = float((await db.execute(margin_q)).scalar_one())
        margin_pct = (margin / revenue * 100) if revenue else 0

        results.append({
            "month": label,
            "revenue": round(revenue, 2),
            "device_margin": round(margin, 2),
            "device_margin_pct": round(margin_pct, 1),
        })

    return results


async def _inv_weekly_invoiced(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Weekly invoiced revenue line chart."""
    f = [
        AccountMove.state == "posted",
        AccountMove.move_type == "out_invoice",
    ]
    if date_from:
        f.append(AccountMove.invoice_date >= date_from)
    if date_to:
        f.append(AccountMove.invoice_date <= date_to)
    week_expr = func.date_trunc("week", AccountMove.invoice_date)
    q = (
        select(
            week_expr.label("week"),
            func.sum(AccountMove.amount_untaxed).label("revenue"),
        )
        .where(*f)
        .group_by(week_expr)
        .order_by(week_expr)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "week": r.week.strftime("W%V %Y") if r.week else None,
            "revenue": round(float(r.revenue or 0), 2),
        }
        for r in rows
    ]


async def _inv_by_channel(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by channel — joins invoice origin → sale_order → crm_team."""
    # Use sale_order line data for channel attribution
    cf = [
        SaleOrder.state.in_(["sale", "done"]),
        SaleOrder.invoice_status == "invoiced",
    ]
    if date_from:
        cf.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        cf.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("channel_ids"):
        cf.append(SaleOrder.team_id.in_(kw["channel_ids"]))

    team_name = _team_name()
    q = (
        select(
            SaleOrder.team_id,
            team_name.label("channel"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(CrmTeam, SaleOrder.team_id == CrmTeam.id)
        .where(*cf)
        .group_by(SaleOrder.team_id, team_name)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "name": r.channel,
            "qty": round(float(r.qty or 0)),
            "revenue": round(float(r.revenue or 0), 2),
            "asp": round(float(r.revenue or 0) / float(r.qty) if float(r.qty or 0) else 0, 2),
        }
        for r in rows
    ]


async def _inv_by_category(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by product category (invoice-based)."""
    cf = [
        SaleOrder.state.in_(["sale", "done"]),
        SaleOrder.invoice_status == "invoiced",
    ]
    if date_from:
        cf.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        cf.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("category_ids"):
        cf.append(ProductTemplate.categ_id.in_(kw["category_ids"]))

    q = (
        select(
            ProductCategory.complete_name.label("category"),
            func.sum(SaleOrderLine.qty_invoiced).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
            func.sum(SaleOrderLine.margin).label("margin"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*cf)
        .group_by(ProductCategory.complete_name)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "name": r.category,
            "qty": round(float(r.qty or 0)),
            "revenue": round(float(r.revenue or 0), 2),
            "margin": round(float(r.margin or 0), 2),
            "margin_pct": round(
                (float(r.margin or 0) / float(r.revenue) * 100) if float(r.revenue or 0) else 0, 1
            ),
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════════
#  ORDER-BASED DASHBOARD
# ═══════════════════════════════════════════════════════════════════════

def _order_filters(date_from: date, date_to: date, **kw):
    """Base filters for confirmed sale orders."""
    f = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        f.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        f.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("channel_ids"):
        f.append(SaleOrder.team_id.in_(kw["channel_ids"]))
    if kw.get("category_ids"):
        f.append(ProductTemplate.categ_id.in_(kw["category_ids"]))
    return f


async def _ord_kpis(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Order KPIs: Revenue, Order Count, Units Sold, ASP."""
    cf = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        cf.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        cf.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("channel_ids"):
        cf.append(SaleOrder.team_id.in_(kw["channel_ids"]))

    q = select(
        func.coalesce(func.sum(SaleOrder.amount_total), 0).label("revenue"),
        func.count(SaleOrder.id).label("order_count"),
    ).where(*cf)
    row = (await db.execute(q)).one()
    revenue = float(row.revenue)
    order_count = row.order_count

    # Units sold from order lines
    lf = cf.copy()
    if kw.get("category_ids"):
        lf.append(ProductTemplate.categ_id.in_(kw["category_ids"]))
    qty_q = (
        select(func.coalesce(func.sum(SaleOrderLine.product_uom_qty), 0))
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*lf)
    )
    units_sold = float((await db.execute(qty_q)).scalar_one())
    asp = (revenue / units_sold) if units_sold else 0

    return {
        "order_revenue": round(revenue, 2),
        "order_count": order_count,
        "units_sold": round(units_sold),
        "asp": round(asp, 2),
    }


async def _ord_by_channel(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Orders by channel with order count, qty, revenue, ASP."""
    cf = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        cf.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        cf.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("channel_ids"):
        cf.append(SaleOrder.team_id.in_(kw["channel_ids"]))

    team_name = _team_name()
    q = (
        select(
            SaleOrder.team_id,
            team_name.label("channel"),
            func.count(func.distinct(SaleOrder.id)).label("order_count"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
        )
        .join(SaleOrderLine, SaleOrderLine.order_id == SaleOrder.id)
        .join(CrmTeam, SaleOrder.team_id == CrmTeam.id)
        .where(*cf)
        .group_by(SaleOrder.team_id, team_name)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "name": r.channel,
            "order_count": r.order_count,
            "qty": round(float(r.qty or 0)),
            "revenue": round(float(r.revenue or 0), 2),
            "asp": round(float(r.revenue or 0) / float(r.qty) if float(r.qty or 0) else 0, 2),
        }
        for r in rows
    ]


async def _ord_by_product(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Top products by revenue."""
    cf = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        cf.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        cf.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("channel_ids"):
        cf.append(SaleOrder.team_id.in_(kw["channel_ids"]))
    if kw.get("category_ids"):
        cf.append(ProductTemplate.categ_id.in_(kw["category_ids"]))

    pname = _product_name()
    q = (
        select(
            ProductProduct.id.label("product_id"),
            pname.label("product"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*cf)
        .group_by(ProductProduct.id, pname)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
        .limit(20)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "name": r.product,
            "qty": round(float(r.qty or 0)),
            "revenue": round(float(r.revenue or 0), 2),
            "asp": round(float(r.revenue or 0) / float(r.qty) if float(r.qty or 0) else 0, 2),
        }
        for r in rows
    ]


async def _ord_by_category(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Orders by product category with order count, qty, revenue, ASP."""
    cf = [SaleOrder.state.in_(["sale", "done"])]
    if date_from:
        cf.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        cf.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("channel_ids"):
        cf.append(SaleOrder.team_id.in_(kw["channel_ids"]))
    if kw.get("category_ids"):
        cf.append(ProductTemplate.categ_id.in_(kw["category_ids"]))

    q = (
        select(
            ProductCategory.complete_name.label("category"),
            func.count(func.distinct(SaleOrder.id)).label("order_count"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*cf)
        .group_by(ProductCategory.complete_name)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "name": r.category,
            "order_count": r.order_count,
            "qty": round(float(r.qty or 0)),
            "revenue": round(float(r.revenue or 0), 2),
            "asp": round(float(r.revenue or 0) / float(r.qty) if float(r.qty or 0) else 0, 2),
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════════
#  SHARED — Filter options
# ═══════════════════════════════════════════════════════════════════════

async def _get_filter_options(db: AsyncSession):
    """Distinct channels and categories for filter dropdowns."""
    team_name = _team_name()
    ch_q = (
        select(CrmTeam.id, team_name.label("name"))
        .where(CrmTeam.active == True)
        .order_by(team_name)
    )
    ch_rows = (await db.execute(ch_q)).all()
    channels = [{"id": r.id, "name": r.name} for r in ch_rows]

    cat_q = (
        select(ProductCategory.id, ProductCategory.complete_name.label("name"))
        .order_by(ProductCategory.complete_name)
    )
    cat_rows = (await db.execute(cat_q)).all()
    categories = [{"id": r.id, "name": r.name} for r in cat_rows]

    return {"channels": channels, "categories": categories}


# ═══════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════

async def get_invoice_overview(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    channel_ids: list[int] | None = None,
    category_ids: list[int] | None = None,
):
    """Invoice dashboard — all queries in parallel, cached."""
    kw = dict(channel_ids=channel_ids, category_ids=category_ids)
    ch_key = ",".join(map(str, channel_ids)) if channel_ids else ""
    cat_key = ",".join(map(str, category_ids)) if category_ids else ""
    ck = _cache_key("inv_overview", date_from, date_to, ch=ch_key, cat=cat_key)
    cached = await _get_cached(ck)
    if cached:
        return cached

    async def _run(fn):
        async with OdooSessionLocal() as session:
            return await fn(session, date_from, date_to, **kw)

    results = await asyncio.gather(
        _run(_inv_kpis),
        _run(_inv_comparison_stats),
        _run(_inv_weekly_invoiced),
        _run(_inv_by_channel),
        _run(_inv_by_category),
    )

    data = {
        "kpis": results[0],
        "comparison_stats": results[1],
        "weekly_invoiced": results[2],
        "by_channel": results[3],
        "by_category": results[4],
    }
    await _set_cached(ck, data)
    return data


async def get_order_overview(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    channel_ids: list[int] | None = None,
    category_ids: list[int] | None = None,
):
    """Order dashboard — all queries in parallel, cached."""
    kw = dict(channel_ids=channel_ids, category_ids=category_ids)
    ch_key = ",".join(map(str, channel_ids)) if channel_ids else ""
    cat_key = ",".join(map(str, category_ids)) if category_ids else ""
    ck = _cache_key("ord_overview", date_from, date_to, ch=ch_key, cat=cat_key)
    cached = await _get_cached(ck)
    if cached:
        return cached

    async def _run(fn):
        async with OdooSessionLocal() as session:
            return await fn(session, date_from, date_to, **kw)

    results = await asyncio.gather(
        _run(_ord_kpis),
        _run(_ord_by_channel),
        _run(_ord_by_product),
        _run(_ord_by_category),
    )

    data = {
        "kpis": results[0],
        "by_channel": results[1],
        "by_product": results[2],
        "by_category": results[3],
    }
    await _set_cached(ck, data)
    return data


async def get_filter_options(db: AsyncSession):
    """Cached filter options."""
    ck = "ecom:filters"
    cached = await _get_cached(ck)
    if cached:
        return cached
    data = await _get_filter_options(db)
    await _set_cached(ck, data)
    return data
