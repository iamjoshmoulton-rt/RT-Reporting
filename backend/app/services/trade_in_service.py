"""Trade-In Dashboard service — Purchase order based trade-in data.

Queries the Odoo read-replica for confirmed purchase orders to show
landed units, incoming units, top vendors, top categories, and
incoming-by-vendor breakdowns.  Results are cached in Redis (15-min TTL).
"""

import asyncio
import logging
from datetime import date

from sqlalchemy import select, func, case, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.procurement import PurchaseOrder, PurchaseOrderLine
from app.odoo_models.partners import (
    ResPartner, ProductProduct, ProductTemplate, ProductCategory,
)
from app.services.tz import local_date
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes


def _cache_key(prefix: str, date_from: date, date_to: date) -> str:
    return f"trade_in:{prefix}:{date_from}:{date_to}"


async def _get_cached(key: str):
    return await cache_get(key)


async def _set_cached(key: str, value):
    await cache_set(key, value, CACHE_TTL)


# ── Helpers ───────────────────────────────────────────────────────────

def _base_filters(date_from: date, date_to: date):
    """Base filters: confirmed/done purchase orders."""
    f = [
        PurchaseOrder.state.in_(["purchase", "done"]),
    ]
    if date_from:
        f.append(local_date(PurchaseOrder.date_order) >= date_from)
    if date_to:
        f.append(local_date(PurchaseOrder.date_order) <= date_to)
    return f


# ═══════════════════════════════════════════════════════════════════════
#  QUERY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════

async def _ti_kpis(db: AsyncSession, date_from: date, date_to: date):
    """KPIs: Landed Units (received) and Incoming Units (ordered - received)."""
    base = _base_filters(date_from, date_to)

    q = (
        select(
            func.coalesce(func.sum(PurchaseOrderLine.qty_received), 0).label("landed"),
            func.coalesce(
                func.sum(PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received), 0
            ).label("incoming"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .where(*base)
    )
    row = (await db.execute(q)).one()
    return {
        "landed_units": round(float(row.landed)),
        "incoming_units": round(float(row.incoming)),
    }


async def _ti_top_vendors(db: AsyncSession, date_from: date, date_to: date):
    """Top Vendors — Partner, Qty Ordered, Qty Received, Total."""
    base = _base_filters(date_from, date_to)

    q = (
        select(
            ResPartner.name.label("partner"),
            func.sum(PurchaseOrderLine.product_qty).label("qty_ordered"),
            func.sum(PurchaseOrderLine.qty_received).label("qty_received"),
            func.sum(PurchaseOrderLine.price_subtotal).label("total"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ResPartner, PurchaseOrder.partner_id == ResPartner.id)
        .where(*base)
        .group_by(ResPartner.id, ResPartner.name)
        .order_by(func.sum(PurchaseOrderLine.product_qty).desc())
        .limit(50)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "partner": r.partner,
            "qty_ordered": round(float(r.qty_ordered or 0)),
            "qty_received": round(float(r.qty_received or 0)),
            "total": round(float(r.total or 0), 2),
        }
        for r in rows
    ]


async def _ti_top_categories(db: AsyncSession, date_from: date, date_to: date):
    """Top Categories — Category, Qty Received, Qty Ordered, Total."""
    base = _base_filters(date_from, date_to)

    q = (
        select(
            ProductCategory.complete_name.label("category"),
            func.sum(PurchaseOrderLine.qty_received).label("qty_received"),
            func.sum(PurchaseOrderLine.product_qty).label("qty_ordered"),
            func.sum(PurchaseOrderLine.price_subtotal).label("total"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*base)
        .group_by(ProductCategory.complete_name)
        .order_by(func.sum(PurchaseOrderLine.price_subtotal).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "category": r.category,
            "qty_received": round(float(r.qty_received or 0)),
            "qty_ordered": round(float(r.qty_ordered or 0)),
            "total": round(float(r.total or 0), 2),
        }
        for r in rows
    ]


async def _ti_incoming_by_vendor(db: AsyncSession, date_from: date, date_to: date):
    """Incoming By Vendor — PO lines not fully received, grouped by vendor."""
    base = _base_filters(date_from, date_to)

    q = (
        select(
            ResPartner.name.label("partner"),
            func.count(func.distinct(PurchaseOrder.id)).label("order_count"),
            func.sum(PurchaseOrderLine.product_qty).label("qty_ordered"),
            func.sum(PurchaseOrderLine.price_subtotal).label("total"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ResPartner, PurchaseOrder.partner_id == ResPartner.id)
        .where(
            *base,
            PurchaseOrderLine.product_qty > PurchaseOrderLine.qty_received,
        )
        .group_by(ResPartner.id, ResPartner.name)
        .order_by(func.sum(PurchaseOrderLine.product_qty).desc())
        .limit(50)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "partner": r.partner,
            "order_count": int(r.order_count or 0),
            "qty_ordered": round(float(r.qty_ordered or 0)),
            "total": round(float(r.total or 0), 2),
        }
        for r in rows
    ]


# ═══════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════

async def get_overview(
    db: AsyncSession,
    date_from: date,
    date_to: date,
):
    """Trade-In overview — all queries in parallel, cached."""
    ck = _cache_key("overview", date_from, date_to)
    cached = await _get_cached(ck)
    if cached:
        return cached

    async def _run(fn):
        async with OdooSessionLocal() as session:
            return await fn(session, date_from, date_to)

    results = await asyncio.gather(
        _run(_ti_kpis),
        _run(_ti_top_vendors),
        _run(_ti_top_categories),
        _run(_ti_incoming_by_vendor),
    )

    data = {
        "kpis": results[0],
        "top_vendors": results[1],
        "top_categories": results[2],
        "incoming_by_vendor": results[3],
    }
    await _set_cached(ck, data)
    return data
