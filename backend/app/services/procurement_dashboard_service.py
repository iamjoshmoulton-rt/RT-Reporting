"""Procurement Dashboard service — replicates the Odoo 17 Procurement Spreadsheet Dashboard.

7 KPIs + 6 tables. Queries run against PurchaseOrder + PurchaseOrderLine with
joins to res_partner (vendor), res_users → res_partner (buyer), product → template → category.
"""

import asyncio
import logging
from datetime import date

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.procurement import PurchaseOrder, PurchaseOrderLine
from app.odoo_models.partners import (
    ResPartner, ProductTemplate, ProductProduct, ProductCategory,
    ResUsers,
)
from app.services.tz import local_date
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

CACHE_TTL = 900


def _cache_key(prefix: str, date_from: date, date_to: date, **kwargs) -> str:
    extra = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None)
    return f"proc_dash:{prefix}:{date_from}:{date_to}:{extra}"


async def _get_cached(key: str):
    return await cache_get(key)


async def _set_cached(key: str, value):
    await cache_set(key, value, CACHE_TTL)


# ── Helpers ───────────────────────────────────────────────────────────

def _product_name():
    return ProductTemplate.name["en_US"].as_string()


def _confirmed_po():
    """PO state in ('purchase', 'done')."""
    return [PurchaseOrder.state.in_(["purchase", "done"])]


def _base_filters(**kw):
    """Optional filters applied to PO queries."""
    f = []
    if kw.get("vendor_id"):
        f.append(PurchaseOrder.partner_id == kw["vendor_id"])
    if kw.get("buyer_id"):
        f.append(PurchaseOrder.user_id == kw["buyer_id"])
    return f


# ── KPIs ──────────────────────────────────────────────────────────────

async def _get_kpis(db: AsyncSession, date_from: date, date_to: date, **kw):
    """7 KPIs matching the Odoo procurement dashboard."""
    po = PurchaseOrder.__table__
    pol = PurchaseOrderLine.__table__

    base = _confirmed_po() + _base_filters(**kw)

    # Landed = qty_received on POs ordered in date range, value from price_subtotal
    # Uses date_order (PO confirmation date) + price_subtotal (matches Odoo procurement dashboard)
    landed_f = base + [PurchaseOrder.date_order >= date_from, PurchaseOrder.date_order <= date_to]
    landed_q = (
        select(
            func.coalesce(func.sum(PurchaseOrderLine.qty_received), 0).label("landed_units"),
            func.coalesce(
                func.sum(PurchaseOrderLine.price_subtotal), 0
            ).label("landed_value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .where(*landed_f)
    )
    if kw.get("category_id"):
        landed_q = (
            landed_q
            .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
            .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
            .where(ProductTemplate.categ_id == kw["category_id"])
        )
    lr = (await db.execute(landed_q)).one()
    landed_units = float(lr.landed_units)
    landed_value = float(lr.landed_value)
    avg_price = (landed_value / landed_units) if landed_units else 0

    # Total incoming = remaining qty on open POs ordered in date range
    incoming_f = base + [
        PurchaseOrder.date_order >= date_from,
        PurchaseOrder.date_order <= date_to,
    ]
    incoming_q = (
        select(
            func.coalesce(
                func.sum(PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received), 0
            ).label("incoming_units"),
            func.coalesce(
                func.sum(
                    (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) * PurchaseOrderLine.price_unit
                ), 0
            ).label("incoming_value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .where(
            *incoming_f,
            (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) > 0,
        )
    )
    if kw.get("category_id"):
        incoming_q = (
            incoming_q
            .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
            .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
            .where(ProductTemplate.categ_id == kw["category_id"])
        )
    ir = (await db.execute(incoming_q)).one()
    incoming_units = float(ir.incoming_units)
    incoming_value = float(ir.incoming_value)

    # Incoming filtered by date_planned in range
    incoming_filtered_f = base + [
        PurchaseOrderLine.date_planned >= date_from,
        PurchaseOrderLine.date_planned <= date_to,
        (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) > 0,
    ]
    inc_filtered_q = (
        select(
            func.coalesce(
                func.sum(PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received), 0
            ).label("units"),
            func.coalesce(
                func.sum(
                    (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) * PurchaseOrderLine.price_unit
                ), 0
            ).label("value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .where(*incoming_filtered_f)
    )
    if kw.get("category_id"):
        inc_filtered_q = (
            inc_filtered_q
            .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
            .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
            .where(ProductTemplate.categ_id == kw["category_id"])
        )
    ifr = (await db.execute(inc_filtered_q)).one()
    incoming_filtered_units = float(ifr.units)
    incoming_filtered_value = float(ifr.value)

    # % Chrome landed
    chrome_f = landed_f.copy()
    chrome_q = (
        select(
            func.coalesce(func.sum(PurchaseOrderLine.qty_received), 0).label("chrome_units"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*chrome_f, ProductCategory.complete_name.ilike("%chromebook%"))
    )
    chrome_units = float((await db.execute(chrome_q)).scalar_one())
    chrome_pct = (chrome_units / landed_units * 100) if landed_units else 0

    return {
        "landed_units": round(landed_units),
        "landed_value": round(landed_value, 2),
        "incoming_units": round(incoming_units),
        "incoming_value": round(incoming_value, 2),
        "incoming_filtered_units": round(incoming_filtered_units),
        "incoming_filtered_value": round(incoming_filtered_value, 2),
        "avg_purchase_price": round(avg_price, 2),
        "chrome_landed_pct": round(chrome_pct, 1),
    }


# ── Tables ────────────────────────────────────────────────────────────

async def _get_landed_by_rep(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Landed items grouped by buyer (PO.user_id)."""
    f = _confirmed_po() + _base_filters(**kw) + [
        PurchaseOrder.date_order >= date_from,
        PurchaseOrder.date_order <= date_to,
    ]
    q = (
        select(
            PurchaseOrder.user_id,
            ResPartner.name.label("rep"),
            func.count(PurchaseOrderLine.id).label("line_count"),
            func.sum(PurchaseOrderLine.qty_received).label("received_qty"),
            func.sum(PurchaseOrderLine.product_qty).label("total_qty"),
            func.sum(PurchaseOrderLine.price_subtotal).label("total_value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ResUsers, PurchaseOrder.user_id == ResUsers.id)
        .join(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(*f)
        .group_by(PurchaseOrder.user_id, ResPartner.name)
        .order_by(func.sum(PurchaseOrderLine.price_subtotal).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.user_id, "name": r.rep, "line_count": r.line_count,
            "received_qty": round(float(r.received_qty or 0)),
            "total_qty": round(float(r.total_qty or 0)),
            "total_value": round(float(r.total_value or 0), 2),
        }
        for r in rows
    ]


async def _get_incoming_by_category(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Incoming items by product category (filtered by date_planned in range)."""
    f = _confirmed_po() + _base_filters(**kw) + [
        PurchaseOrderLine.date_planned >= date_from,
        PurchaseOrderLine.date_planned <= date_to,
        (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) > 0,
    ]
    q = (
        select(
            ProductCategory.id.label("category_id"),
            ProductCategory.complete_name.label("category"),
            func.count(PurchaseOrderLine.id).label("line_count"),
            func.sum(PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received).label("incoming_qty"),
            func.sum(
                (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) * PurchaseOrderLine.price_unit
            ).label("est_value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*f)
        .group_by(ProductCategory.id, ProductCategory.complete_name)
        .order_by(func.sum(
            (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) * PurchaseOrderLine.price_unit
        ).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.category_id, "name": r.category, "line_count": r.line_count,
            "incoming_qty": round(float(r.incoming_qty or 0)),
            "est_value": round(float(r.est_value or 0), 2),
        }
        for r in rows
    ]


async def _get_landed_by_product(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Landed items by product."""
    f = _confirmed_po() + _base_filters(**kw) + [
        PurchaseOrder.date_order >= date_from,
        PurchaseOrder.date_order <= date_to,
    ]
    pname = _product_name()
    q = (
        select(
            ProductProduct.id.label("product_id"),
            pname.label("product"),
            ProductProduct.default_code.label("sku"),
            func.sum(PurchaseOrderLine.product_qty).label("ordered_qty"),
            func.sum(PurchaseOrderLine.qty_received).label("received_qty"),
            func.sum(PurchaseOrderLine.price_subtotal).label("total_value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*f)
        .group_by(ProductProduct.id, pname, ProductProduct.default_code)
        .order_by(func.sum(PurchaseOrderLine.price_subtotal).desc())
        .limit(30)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.product_id, "name": r.product, "sku": r.sku,
            "ordered_qty": round(float(r.ordered_qty or 0)),
            "received_qty": round(float(r.received_qty or 0)),
            "total_value": round(float(r.total_value or 0), 2),
        }
        for r in rows
    ]


async def _get_landed_by_category(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Landed items by category."""
    f = _confirmed_po() + _base_filters(**kw) + [
        PurchaseOrder.date_order >= date_from,
        PurchaseOrder.date_order <= date_to,
    ]
    q = (
        select(
            ProductCategory.id.label("category_id"),
            ProductCategory.complete_name.label("category"),
            func.count(PurchaseOrderLine.id).label("line_count"),
            func.sum(PurchaseOrderLine.qty_received).label("received_qty"),
            func.sum(PurchaseOrderLine.product_qty).label("total_qty"),
            func.sum(PurchaseOrderLine.price_subtotal).label("total_value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .join(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*f)
        .group_by(ProductCategory.id, ProductCategory.complete_name)
        .order_by(func.sum(PurchaseOrderLine.price_subtotal).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.category_id, "name": r.category, "line_count": r.line_count,
            "received_qty": round(float(r.received_qty or 0)),
            "total_qty": round(float(r.total_qty or 0)),
            "total_value": round(float(r.total_value or 0), 2),
        }
        for r in rows
    ]


async def _get_incoming_by_rep(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Incoming items by buyer (filtered by date_planned in range)."""
    f = _confirmed_po() + _base_filters(**kw) + [
        PurchaseOrderLine.date_planned >= date_from,
        PurchaseOrderLine.date_planned <= date_to,
        (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) > 0,
    ]
    q = (
        select(
            PurchaseOrder.user_id,
            ResPartner.name.label("rep"),
            func.count(PurchaseOrderLine.id).label("line_count"),
            func.sum(PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received).label("incoming_qty"),
            func.sum(
                (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) * PurchaseOrderLine.price_unit
            ).label("est_value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ResUsers, PurchaseOrder.user_id == ResUsers.id)
        .join(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(*f)
        .group_by(PurchaseOrder.user_id, ResPartner.name)
        .order_by(func.sum(
            (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) * PurchaseOrderLine.price_unit
        ).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.user_id, "name": r.rep, "line_count": r.line_count,
            "incoming_qty": round(float(r.incoming_qty or 0)),
            "est_value": round(float(r.est_value or 0), 2),
        }
        for r in rows
    ]


async def _get_incoming_by_vendor(db: AsyncSession, date_from: date, date_to: date, **kw):
    """Incoming items by vendor (filtered by date_planned in range)."""
    f = _confirmed_po() + _base_filters(**kw) + [
        PurchaseOrderLine.date_planned >= date_from,
        PurchaseOrderLine.date_planned <= date_to,
        (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) > 0,
    ]
    q = (
        select(
            PurchaseOrder.partner_id,
            ResPartner.name.label("vendor"),
            func.count(PurchaseOrderLine.id).label("line_count"),
            func.sum(PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received).label("incoming_qty"),
            func.sum(
                (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) * PurchaseOrderLine.price_unit
            ).label("est_value"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ResPartner, PurchaseOrder.partner_id == ResPartner.id)
        .where(*f)
        .group_by(PurchaseOrder.partner_id, ResPartner.name)
        .order_by(func.sum(
            (PurchaseOrderLine.product_qty - PurchaseOrderLine.qty_received) * PurchaseOrderLine.price_unit
        ).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": r.partner_id, "name": r.vendor, "line_count": r.line_count,
            "incoming_qty": round(float(r.incoming_qty or 0)),
            "est_value": round(float(r.est_value or 0), 2),
        }
        for r in rows
    ]


async def _get_filter_options(db: AsyncSession):
    """Dropdown values for vendor, category, buyer filters."""

    async def _vendors():
        q = (
            select(ResPartner.id, ResPartner.name)
            .where(ResPartner.supplier_rank > 0, ResPartner.active == True)
            .order_by(ResPartner.name)
            .limit(200)
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

    async def _buyers():
        q = (
            select(ResUsers.id, ResPartner.name.label("name"))
            .join(ResPartner, ResUsers.partner_id == ResPartner.id)
            .where(ResUsers.active == True)
            .order_by(ResPartner.name)
        )
        rows = (await db.execute(q)).all()
        return [{"id": r.id, "name": r.name} for r in rows]

    # Run sequentially — single session can't handle concurrent queries
    v = await _vendors()
    c = await _categories()
    b = await _buyers()
    return {"vendors": v, "categories": c, "buyers": b}


# ── Public API ────────────────────────────────────────────────────────

async def get_procurement_dashboard_overview(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    vendor_id: int | None = None,
    category_id: int | None = None,
    buyer_id: int | None = None,
):
    """Combined overview — runs all queries in parallel, caches result."""
    kw = dict(vendor_id=vendor_id, category_id=category_id, buyer_id=buyer_id)
    ck = _cache_key("overview", date_from, date_to, **kw)
    cached = await _get_cached(ck)
    if cached:
        return cached

    async def _run(fn):
        async with OdooSessionLocal() as session:
            return await fn(session, date_from, date_to, **kw)

    results = await asyncio.gather(
        _run(_get_kpis),
        _run(_get_landed_by_rep),
        _run(_get_incoming_by_category),
        _run(_get_landed_by_product),
        _run(_get_landed_by_category),
        _run(_get_incoming_by_rep),
        _run(_get_incoming_by_vendor),
    )

    data = {
        "kpis": results[0],
        "landed_by_rep": results[1],
        "incoming_by_category": results[2],
        "landed_by_product": results[3],
        "landed_by_category": results[4],
        "incoming_by_rep": results[5],
        "incoming_by_vendor": results[6],
    }

    await _set_cached(ck, data)
    return data


async def get_filter_options(db: AsyncSession):
    ck = "proc_dash:filters"
    cached = await _get_cached(ck)
    if cached:
        return cached
    data = await _get_filter_options(db)
    await _set_cached(ck, data)
    return data
