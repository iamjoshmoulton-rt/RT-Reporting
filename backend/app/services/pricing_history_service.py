"""Pricing History service — Invoice-based product pricing data.

Queries the Odoo read-replica for invoiced sale order lines grouped by
product variant, providing Units Sold, Total Revenue, ASP KPIs and a
Top Products breakdown.  Results are cached in Redis with a 15-min TTL.
"""

import asyncio
import logging
from datetime import date

from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.sales import SaleOrder, SaleOrderLine
from app.odoo_models.accounting import AccountMove
from app.odoo_models.partners import (
    ProductTemplate, ProductProduct, ProductCategory, CrmTeam,
)
from app.services.tz import local_date
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes


def _cache_key(prefix: str, date_from: date, date_to: date, **kwargs) -> str:
    extra = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None)
    return f"pricing:{prefix}:{date_from}:{date_to}:{extra}"


async def _get_cached(key: str):
    return await cache_get(key)


async def _set_cached(key: str, value):
    await cache_set(key, value, CACHE_TTL)


# ── Helpers ───────────────────────────────────────────────────────────

def _product_name():
    return ProductTemplate.name["en_US"].as_string()


def _team_name():
    return CrmTeam.name["en_US"].as_string()


# Categories to exclude for device-only metrics (match other dashboards)
_EXCLUDED_UNIT_CATEGORIES = [
    "Accessories", "Accessories (Products)", "Deliveries", "Headphones",
]


def _base_filters(date_from: date, date_to: date, **kw):
    """Base filters for invoiced sale order lines."""
    f = [
        SaleOrder.state.in_(["sale", "done"]),
        SaleOrder.invoice_status == "invoiced",
    ]
    if date_from:
        f.append(local_date(SaleOrder.date_order) >= date_from)
    if date_to:
        f.append(local_date(SaleOrder.date_order) <= date_to)
    if kw.get("channel_ids"):
        f.append(SaleOrder.team_id.in_(kw["channel_ids"]))
    if kw.get("category_ids"):
        f.append(ProductTemplate.categ_id.in_(kw["category_ids"]))
    return f


# ═══════════════════════════════════════════════════════════════════════
#  QUERY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════

async def _ph_kpis(db: AsyncSession, date_from: date, date_to: date, **kw):
    """KPIs: Units Sold, Total Revenue, ASP."""
    base = _base_filters(date_from, date_to, **kw)

    q = (
        select(
            func.coalesce(func.sum(SaleOrderLine.qty_invoiced), 0).label("units"),
            func.coalesce(func.sum(SaleOrderLine.price_subtotal), 0).label("revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*base, ~ProductCategory.complete_name.in_(_EXCLUDED_UNIT_CATEGORIES))
    )
    row = (await db.execute(q)).one()
    units = float(row.units)
    revenue = float(row.revenue)
    asp = (revenue / units) if units else 0

    return {
        "units_sold": round(units),
        "total_revenue": round(revenue, 2),
        "asp": round(asp, 2),
    }


async def _ph_top_products(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Top products by quantity — product variant with default_code, qty, revenue, ASP."""
    base = _base_filters(date_from, date_to, **kw)
    pname = _product_name()

    # Build display name: [default_code] product_name
    display_name = func.concat(
        "[", func.coalesce(ProductProduct.default_code, ""), "] ", pname,
    )

    q = (
        select(
            display_name.label("product"),
            func.sum(SaleOrderLine.qty_invoiced).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*base)
        .group_by(ProductProduct.id, display_name)
        .order_by(func.sum(SaleOrderLine.qty_invoiced).desc())
        .limit(100)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "product": r.product,
            "qty": round(float(r.qty or 0)),
            "revenue": round(float(r.revenue or 0), 2),
            "asp": round(float(r.revenue or 0) / float(r.qty) if float(r.qty or 0) else 0, 2),
        }
        for r in rows
    ]


async def _ph_by_channel(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by channel (crm.team)."""
    base = _base_filters(date_from, date_to, **kw)
    team_name = _team_name()

    q = (
        select(
            SaleOrder.team_id,
            team_name.label("channel"),
            func.sum(SaleOrderLine.qty_invoiced).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(CrmTeam, SaleOrder.team_id == CrmTeam.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*base)
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


async def _ph_by_category(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by product category."""
    base = _base_filters(date_from, date_to, **kw)

    q = (
        select(
            ProductCategory.complete_name.label("category"),
            func.sum(SaleOrderLine.qty_invoiced).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*base)
        .group_by(ProductCategory.complete_name)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "name": r.category,
            "qty": round(float(r.qty or 0)),
            "revenue": round(float(r.revenue or 0), 2),
            "asp": round(float(r.revenue or 0) / float(r.qty) if float(r.qty or 0) else 0, 2),
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════════
#  SHARED — Filter options (reuse channels + categories)
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

async def get_overview(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    channel_ids: list[int] | None = None,
    category_ids: list[int] | None = None,
):
    """Pricing History overview — all queries in parallel, cached."""
    kw = dict(channel_ids=channel_ids, category_ids=category_ids)
    ch_key = ",".join(map(str, channel_ids)) if channel_ids else ""
    cat_key = ",".join(map(str, category_ids)) if category_ids else ""
    ck = _cache_key("overview", date_from, date_to, ch=ch_key, cat=cat_key)
    cached = await _get_cached(ck)
    if cached:
        return cached

    async def _run(fn):
        async with OdooSessionLocal() as session:
            return await fn(session, date_from, date_to, **kw)

    results = await asyncio.gather(
        _run(_ph_kpis),
        _run(_ph_top_products),
        _run(_ph_by_channel),
        _run(_ph_by_category),
    )

    data = {
        "kpis": results[0],
        "top_products": results[1],
        "by_channel": results[2],
        "by_category": results[3],
    }
    await _set_cached(ck, data)
    return data


async def get_filter_options(db: AsyncSession):
    """Cached filter options."""
    ck = "pricing:filters"
    cached = await _get_cached(ck)
    if cached:
        return cached
    data = await _get_filter_options(db)
    await _set_cached(ck, data)
    return data
