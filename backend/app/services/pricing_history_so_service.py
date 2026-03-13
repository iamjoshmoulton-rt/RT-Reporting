"""Pricing History (SO Data) service — Sale Order based product pricing.

Queries the Odoo read-replica for confirmed sale order lines grouped by
product variant, excluding WhatNot channel.  Also provides ASP By Customer.
Results are cached in Redis with a 15-min TTL.
"""

import asyncio
import logging
from datetime import date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.sales import SaleOrder, SaleOrderLine
from app.odoo_models.partners import (
    ResPartner, ProductTemplate, ProductProduct, ProductCategory, CrmTeam,
)
from app.services.tz import local_date
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes

# WhatNot channel names to exclude from Top Products
_WHATNOT_CHANNELS = ["WhatNot", "Whatnot", "WhatNot MisFits"]


def _cache_key(prefix: str, date_from: date, date_to: date, **kwargs) -> str:
    extra = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None)
    return f"pricing_so:{prefix}:{date_from}:{date_to}:{extra}"


async def _get_cached(key: str):
    return await cache_get(key)


async def _set_cached(key: str, value):
    await cache_set(key, value, CACHE_TTL)


# ── Helpers ───────────────────────────────────────────────────────────

def _product_name():
    return ProductTemplate.name["en_US"].as_string()


def _team_name():
    return CrmTeam.name["en_US"].as_string()


def _base_filters(date_from: date, date_to: date, **kw):
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


# ═══════════════════════════════════════════════════════════════════════
#  QUERY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════

async def _so_top_products(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Top products by quantity — excludes WhatNot channel."""
    base = _base_filters(date_from, date_to, **kw)
    pname = _product_name()
    team_name = _team_name()

    display_name = func.concat(
        "[", func.coalesce(ProductProduct.default_code, ""), "] ", pname,
    )

    q = (
        select(
            display_name.label("product"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(CrmTeam, SaleOrder.team_id == CrmTeam.id)
        .where(*base, ~team_name.in_(_WHATNOT_CHANNELS))
        .group_by(ProductProduct.id, display_name)
        .order_by(func.sum(SaleOrderLine.product_uom_qty).desc())
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


async def _so_by_customer(db: AsyncSession, date_from: date, date_to: date, **kw):
    """ASP by customer — customer name, quantity, revenue."""
    base = _base_filters(date_from, date_to, **kw)

    q = (
        select(
            ResPartner.name.label("customer"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
            func.sum(SaleOrderLine.price_subtotal).label("revenue"),
        )
        .join(SaleOrder, SaleOrderLine.order_id == SaleOrder.id)
        .join(ResPartner, SaleOrder.partner_id == ResPartner.id)
        .join(ProductProduct, SaleOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*base)
        .group_by(ResPartner.id, ResPartner.name)
        .order_by(func.sum(SaleOrderLine.price_subtotal).desc())
        .limit(100)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "customer": r.customer,
            "qty": round(float(r.qty or 0)),
            "revenue": round(float(r.revenue or 0), 2),
            "asp": round(float(r.revenue or 0) / float(r.qty) if float(r.qty or 0) else 0, 2),
        }
        for r in rows
    ]


async def _so_by_channel(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Revenue by channel (crm.team)."""
    base = _base_filters(date_from, date_to, **kw)
    team_name = _team_name()

    q = (
        select(
            SaleOrder.team_id,
            team_name.label("channel"),
            func.sum(SaleOrderLine.product_uom_qty).label("qty"),
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

async def get_overview(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    channel_ids: list[int] | None = None,
    category_ids: list[int] | None = None,
):
    """Pricing History SO overview — all queries in parallel, cached."""
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
        _run(_so_top_products),
        _run(_so_by_customer),
        _run(_so_by_channel),
    )

    data = {
        "top_products": results[0],
        "by_customer": results[1],
        "by_channel": results[2],
    }
    await _set_cached(ck, data)
    return data


async def get_filter_options(db: AsyncSession):
    """Cached filter options."""
    ck = "pricing_so:filters"
    cached = await _get_cached(ck)
    if cached:
        return cached
    data = await _get_filter_options(db)
    await _set_cached(ck, data)
    return data
