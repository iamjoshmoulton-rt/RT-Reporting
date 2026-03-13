"""Operations / Processing Dashboard service — PO pipeline stage analytics.

Queries the Odoo read-replica for confirmed purchase orders grouped by their
processing stage (purchase_order_stage).  Shows a PO Overview table with
running totals, KPIs (unprocessed totals), and a By-Category breakdown
for a stacked bar chart.  Results are cached in Redis (15-min TTL).
"""

import asyncio
import logging
from datetime import date

from sqlalchemy import select, func, case, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.procurement import (
    PurchaseOrder, PurchaseOrderLine, PurchaseOrderStage,
)
from app.odoo_models.partners import (
    ProductProduct, ProductTemplate, ProductCategory,
)
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes

# Stages considered "unprocessed" — everything before ETL/Putaway
_UNPROCESSED_STAGE_NAMES = {
    "Landed", "Being Counted", "Count Verified", "Holding",
    "Cleaning Staging", "Cleaning", "Triage Staging", "Triage",
    "Trade In Processing", "Grading Staging", "Grading",
}


def _cache_key(prefix: str) -> str:
    return f"ops_processing:{prefix}"


async def _get_cached(key: str):
    return await cache_get(key)


async def _set_cached(key: str, value):
    await cache_set(key, value, CACHE_TTL)


# ── Base filters ──────────────────────────────────────────────────────

def _base_po_filters():
    """Confirmed/done POs with a processing stage."""
    return [
        PurchaseOrder.state.in_(["purchase", "done"]),
        PurchaseOrder.po_stage_id.isnot(None),
        PurchaseOrderStage.category == "Processing",
    ]


# ═══════════════════════════════════════════════════════════════════════
#  QUERY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════

async def _po_overview(db: AsyncSession):
    """PO Overview — stage, po_count, qty, verified_count, $ total."""
    base = _base_po_filters()

    q = (
        select(
            PurchaseOrderStage.name.label("stage"),
            PurchaseOrderStage.sequence.label("seq"),
            func.count(func.distinct(PurchaseOrder.id)).label("po_count"),
            func.coalesce(func.sum(PurchaseOrderLine.product_qty), 0).label("qty"),
            func.coalesce(func.sum(PurchaseOrderLine.qty_received), 0).label("verified_count"),
            func.coalesce(func.sum(PurchaseOrderLine.price_subtotal), 0).label("total"),
        )
        .join(PurchaseOrderStage, PurchaseOrder.po_stage_id == PurchaseOrderStage.id)
        .join(PurchaseOrderLine, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .where(*base)
        .group_by(PurchaseOrderStage.id, PurchaseOrderStage.name, PurchaseOrderStage.sequence)
        .order_by(PurchaseOrderStage.sequence, PurchaseOrderStage.name)
    )
    rows = (await db.execute(q)).all()

    # Build table rows with running totals
    stages = []
    qty_running = 0
    vc_running = 0
    for r in rows:
        qty_val = round(float(r.qty))
        vc_val = round(float(r.verified_count))
        qty_running += qty_val
        vc_running += vc_val
        stages.append({
            "stage": r.stage,
            "sequence": r.seq,
            "po_count": int(r.po_count),
            "qty": qty_val,
            "verified_count": vc_val,
            "total": round(float(r.total), 2),
            "qty_running_total": qty_running,
            "vc_running_total": vc_running,
        })

    return stages


async def _by_category(db: AsyncSession):
    """By Category — qty per stage per product category for stacked bar chart."""
    base = _base_po_filters()

    q = (
        select(
            PurchaseOrderStage.name.label("stage"),
            PurchaseOrderStage.sequence.label("seq"),
            func.coalesce(ProductCategory.name, literal_column("'Other'")).label("category"),
            func.coalesce(func.sum(PurchaseOrderLine.product_qty), 0).label("qty"),
        )
        .join(PurchaseOrderStage, PurchaseOrder.po_stage_id == PurchaseOrderStage.id)
        .join(PurchaseOrderLine, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .join(ProductProduct, PurchaseOrderLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .outerjoin(ProductCategory, ProductTemplate.categ_id == ProductCategory.id)
        .where(*base)
        .group_by(
            PurchaseOrderStage.id, PurchaseOrderStage.name,
            PurchaseOrderStage.sequence, ProductCategory.name,
        )
        .order_by(PurchaseOrderStage.sequence, PurchaseOrderStage.name)
    )
    rows = (await db.execute(q)).all()

    # Collect all categories and build per-stage data
    all_categories: set[str] = set()
    stage_data: dict[str, dict[str, float]] = {}

    for r in rows:
        cat = r.category or "Other"
        all_categories.add(cat)
        key = r.stage
        if key not in stage_data:
            stage_data[key] = {"stage": r.stage, "sequence": r.seq}
        stage_data[key][cat] = round(float(r.qty))

    # Sort categories by total qty desc
    cat_totals = {}
    for sd in stage_data.values():
        for cat in all_categories:
            cat_totals[cat] = cat_totals.get(cat, 0) + sd.get(cat, 0)
    sorted_cats = sorted(all_categories, key=lambda c: cat_totals.get(c, 0), reverse=True)

    # Build ordered list
    chart_data = []
    for key in sorted(stage_data.keys(), key=lambda k: stage_data[k].get("sequence", 0)):
        entry = {"stage": stage_data[key]["stage"]}
        for cat in sorted_cats:
            entry[cat] = stage_data[key].get(cat, 0)
        chart_data.append(entry)

    return {"series": sorted_cats, "data": chart_data}


# ═══════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════

async def get_overview():
    """Operations Processing overview — all queries in parallel, cached."""
    ck = _cache_key("overview")
    cached = await _get_cached(ck)
    if cached:
        return cached

    async def _run_overview():
        async with OdooSessionLocal() as session:
            return await _po_overview(session)

    async def _run_categories():
        async with OdooSessionLocal() as session:
            return await _by_category(session)

    stages, by_category = await asyncio.gather(
        _run_overview(),
        _run_categories(),
    )

    # Compute KPIs from stage data
    unprocessed_qty = sum(
        s["qty"] for s in stages if s["stage"] in _UNPROCESSED_STAGE_NAMES
    )
    unprocessed_vc = sum(
        s["verified_count"] for s in stages if s["stage"] in _UNPROCESSED_STAGE_NAMES
    )

    data = {
        "kpis": {
            "unprocessed_total": unprocessed_qty,
            "unprocessed_vc_total": unprocessed_vc,
        },
        "stages": stages,
        "by_category": by_category,
    }
    await _set_cached(ck, data)
    return data
