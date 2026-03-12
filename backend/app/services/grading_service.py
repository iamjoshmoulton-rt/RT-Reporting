"""Device grading analytics — queries Odoo stock_move_line with production domain filters.

Performance optimizations:
1. Location ID cache — pre-resolve stock_location IDs, avoid JOINs
2. UTC date range — filter on raw column (index-friendly) instead of function wrapper
3. Combined overview — 4 queries in parallel via asyncio.gather
4. Response cache — 15-min TTL for overview results (data is from read replica anyway)
5. Parallel count+fetch for items endpoint
6. Background pre-warm — populate cache for common date ranges on startup
7. Plain UTC date for daily grouping — avoids expensive AT TIME ZONE per row
"""

import asyncio
import logging
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import select, func, case, literal_column, and_, or_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.inventory import StockMoveLine, StockLocation
from app.odoo_models.partners import ProductProduct, ProductTemplate
from app.services.tz import get_effective_timezone
from app.database import OdooSessionLocal

logger = logging.getLogger(__name__)


VALID_GRADES = ["A", "B", "C", "D", "F", "New (In Box)", "New (Open Box)"]

GRADE_KEYS = {
    "A": "A", "B": "B", "C": "C", "D": "D", "F": "F",
    "New (In Box)": "new_in_box", "New (Open Box)": "new_open_box",
}

# ── Location ID cache ─────────────────────────────────────────────────

_location_cache: dict[str, list[int]] = {}


async def _ensure_location_ids(db: AsyncSession):
    """Populate location ID cache if empty."""
    global _location_cache
    if _location_cache:
        return

    loc = StockLocation.__table__

    src_q = select(loc.c.id).where(loc.c.complete_name.ilike("%Production%"))
    src_rows = (await db.execute(src_q)).scalars().all()

    dst_q = select(loc.c.id).where(
        or_(loc.c.complete_name.ilike("%WhatNot%"), loc.c.complete_name.ilike("WH%")),
        ~loc.c.complete_name.ilike("%WH/Output%"),
    )
    dst_rows = (await db.execute(dst_q)).scalars().all()

    _location_cache["src"] = list(src_rows)
    _location_cache["dst"] = list(dst_rows)


# ── Response cache (TTL-based) ────────────────────────────────────────

_response_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 900  # 15 minutes — read-replica data is inherently stale


def _cache_key(prefix: str, view: str, date_from: date, date_to: date) -> str:
    return f"{prefix}:{view}:{date_from}:{date_to}"


def _get_cached(key: str):
    entry = _response_cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _set_cached(key: str, value):
    _response_cache[key] = (time.time(), value)


# ── UTC date range helper ─────────────────────────────────────────────

def _date_to_utc_range(d_from: date, d_to: date) -> tuple[datetime, datetime]:
    """Convert local date range to UTC datetime range for index-friendly WHERE."""
    tz = get_effective_timezone()
    local_tz = ZoneInfo(tz)

    start_local = datetime(d_from.year, d_from.month, d_from.day, 0, 0, 0, tzinfo=local_tz)
    next_day = d_to + timedelta(days=1)
    end_local = datetime(next_day.year, next_day.month, next_day.day, 0, 0, 0, tzinfo=local_tz)

    utc = ZoneInfo("UTC")
    start_utc = start_local.astimezone(utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(utc).replace(tzinfo=None)

    return start_utc, end_utc


def _product_name():
    return ProductTemplate.name["en_US"].as_string()


def _domain_filters(view: str):
    """Core domain filters — uses cached location IDs (no location JOINs)."""
    return [
        StockMoveLine.state == "done",
        or_(ProductProduct.grade.is_(None), ProductProduct.grade != "Pending"),
        StockMoveLine.location_id.in_(_location_cache["src"]),
        StockMoveLine.location_dest_id.in_(_location_cache["dst"]),
        or_(StockMoveLine.product_category_name.is_(None),
            ~StockMoveLine.product_category_name.ilike("%acces%")),
        or_(ProductTemplate.default_code.is_(None),
            ~ProductTemplate.default_code.ilike("%Flip-Product%")),
    ]


def _date_where(d_from: date, d_to: date):
    """Return index-friendly date range filters using UTC conversion."""
    utc_start, utc_end = _date_to_utc_range(d_from, d_to)
    return [
        StockMoveLine.date >= utc_start,
        StockMoveLine.date < utc_end,
    ]


def _build_filtered_query(
    view: str,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    grade: str | None = None,
    category: str | None = None,
    cost_min: float | None = None,
    cost_max: float | None = None,
):
    """Build a full query with domain + user filters."""
    domain = _domain_filters(view)

    q = (
        select(
            StockMoveLine.id,
            StockMoveLine.date,
            StockMoveLine.uid_name,
            StockMoveLine.product_category_name,
            StockMoveLine.reference,
            ProductProduct.grade,
            ProductTemplate.list_price,
            _product_name().label("product_name"),
            ProductTemplate.default_code,
        )
        .select_from(StockMoveLine)
        .join(ProductProduct, StockMoveLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*domain)
    )

    if date_from and date_to:
        q = q.where(*_date_where(date_from, date_to))
    elif date_from:
        utc_start, _ = _date_to_utc_range(date_from, date_from)
        q = q.where(StockMoveLine.date >= utc_start)
    elif date_to:
        _, utc_end = _date_to_utc_range(date_to, date_to)
        q = q.where(StockMoveLine.date < utc_end)

    if search:
        term = f"%{search}%"
        q = q.where(or_(
            _product_name().ilike(term),
            StockMoveLine.uid_name.ilike(term),
            ProductTemplate.default_code.ilike(term),
        ))
    if grade:
        q = q.where(ProductProduct.grade == grade)
    if category:
        q = q.where(StockMoveLine.product_category_name == category)
    if cost_min is not None:
        q = q.where(ProductTemplate.list_price >= cost_min)
    if cost_max is not None:
        q = q.where(ProductTemplate.list_price <= cost_max)

    return q


def _trend_pct(current: float, previous: float) -> float | None:
    if previous == 0:
        return None
    return round(((current - previous) / previous) * 100, 1)


# ── Public service functions ───────────────────────────────────────────


async def get_grading_summary(
    db: AsyncSession, view: str,
    date_from: date, date_to: date,
):
    """KPIs with current + previous period in ONE query using conditional aggregation."""
    await _ensure_location_ids(db)
    domain = _domain_filters(view)

    period_days = (date_to - date_from).days + 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=period_days - 1)

    cur_utc_start, cur_utc_end = _date_to_utc_range(date_from, date_to)
    prev_utc_start, prev_utc_end = _date_to_utc_range(prev_from, prev_to)

    is_current = and_(StockMoveLine.date >= cur_utc_start, StockMoveLine.date < cur_utc_end)
    is_prev = and_(StockMoveLine.date >= prev_utc_start, StockMoveLine.date < prev_utc_end)

    # Use plain UTC date for distinct-day counting — avoids expensive AT TIME ZONE per row.
    # Slight timezone shift doesn't meaningfully affect "average items per day" metric.
    dt = func.date(StockMoveLine.date)

    q = (
        select(
            func.count(case((is_current, StockMoveLine.id))).label("cur_items"),
            func.count(func.distinct(case((is_current, dt)))).label("cur_days"),
            func.coalesce(func.sum(case((is_current, ProductTemplate.list_price))), 0).label("cur_value"),
            func.count(func.distinct(case((is_current, StockMoveLine.product_id)))).label("cur_products"),
            func.count(case((is_prev, StockMoveLine.id))).label("prev_items"),
            func.count(func.distinct(case((is_prev, dt)))).label("prev_days"),
            func.coalesce(func.sum(case((is_prev, ProductTemplate.list_price))), 0).label("prev_value"),
            func.count(func.distinct(case((is_prev, StockMoveLine.product_id)))).label("prev_products"),
        )
        .select_from(StockMoveLine)
        .join(ProductProduct, StockMoveLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(
            *domain,
            StockMoveLine.date >= prev_utc_start,
            StockMoveLine.date < cur_utc_end,
        )
    )
    r = (await db.execute(q)).one()

    total_items = r.cur_items or 0
    unique_days = r.cur_days or 1
    daily_avg = round(total_items / unique_days) if unique_days else total_items
    total_value = float(r.cur_value)
    unique_products = r.cur_products or 0

    prev_items = r.prev_items or 0
    prev_days = r.prev_days or 1
    prev_avg = round(prev_items / prev_days) if prev_days else prev_items
    prev_value = float(r.prev_value)
    prev_products = r.prev_products or 0

    return {
        "total_items": total_items,
        "daily_average": daily_avg,
        "total_value": total_value,
        "unique_products": unique_products,
        "trends": {
            "total_items": _trend_pct(total_items, prev_items),
            "daily_average": _trend_pct(daily_avg, prev_avg),
            "total_value": _trend_pct(total_value, prev_value),
            "unique_products": _trend_pct(unique_products, prev_products),
        },
    }


async def get_grade_breakdown(
    db: AsyncSession, view: str,
    date_from: date, date_to: date,
):
    """Grade distribution."""
    await _ensure_location_ids(db)
    domain = _domain_filters(view)

    sub = (
        select(
            func.coalesce(ProductProduct.grade, "Unknown").label("grade"),
        )
        .select_from(StockMoveLine)
        .join(ProductProduct, StockMoveLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*domain, *_date_where(date_from, date_to))
    ).subquery()

    q = select(sub.c.grade, func.count().label("cnt")).group_by(sub.c.grade)
    rows = (await db.execute(q)).all()
    total = sum(r.cnt for r in rows)

    result = []
    for g in VALID_GRADES:
        cnt = next((r.cnt for r in rows if r.grade == g), 0)
        result.append({
            "grade": g,
            "key": GRADE_KEYS[g],
            "count": cnt,
            "percentage": round(cnt / total * 100, 1) if total else 0,
        })
    return result


async def get_daily_grade_data(
    db: AsyncSession, view: str,
    date_from: date, date_to: date,
):
    """Daily grade counts for stacked bar chart."""
    await _ensure_location_ids(db)
    domain = _domain_filters(view)

    # Use plain UTC date for daily grouping — avoids AT TIME ZONE per row.
    sub = (
        select(
            func.date(StockMoveLine.date).label("dt"),
            ProductProduct.grade.label("grade"),
        )
        .select_from(StockMoveLine)
        .join(ProductProduct, StockMoveLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*domain, *_date_where(date_from, date_to))
    ).subquery()

    grade_cols = [
        func.count(case((sub.c.grade == g, 1))).label(GRADE_KEYS[g])
        for g in VALID_GRADES
    ]

    q = select(sub.c.dt, *grade_cols).group_by(sub.c.dt).order_by(sub.c.dt)
    rows = (await db.execute(q)).all()
    return [
        {
            "date": str(r.dt),
            **{GRADE_KEYS[g]: getattr(r, GRADE_KEYS[g]) for g in VALID_GRADES},
        }
        for r in rows
    ]


async def get_category_totals(
    db: AsyncSession, view: str,
    date_from: date, date_to: date,
):
    """Category x grade matrix."""
    await _ensure_location_ids(db)
    domain = _domain_filters(view)

    sub = (
        select(
            func.coalesce(StockMoveLine.product_category_name, "Other").label("category"),
            ProductProduct.grade.label("grade"),
            ProductTemplate.list_price.label("list_price"),
            StockMoveLine.id.label("sml_id"),
        )
        .select_from(StockMoveLine)
        .join(ProductProduct, StockMoveLine.product_id == ProductProduct.id)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id)
        .where(*domain, *_date_where(date_from, date_to))
    ).subquery()

    grade_cols = [
        func.count(case((sub.c.grade == g, 1))).label(GRADE_KEYS[g])
        for g in VALID_GRADES
    ]

    q = (
        select(
            sub.c.category,
            func.count(sub.c.sml_id).label("total_qty"),
            func.coalesce(func.sum(sub.c.list_price), 0).label("total_value"),
            *grade_cols,
        )
        .group_by(sub.c.category)
        .order_by(func.count(sub.c.sml_id).desc())
    )
    rows = (await db.execute(q)).all()

    items = []
    grand = {"category": "Grand Total", "total_qty": 0, "total_value": 0.0}
    for k in GRADE_KEYS.values():
        grand[k] = 0

    for r in rows:
        row_dict = {
            "category": r.category,
            "total_qty": r.total_qty,
            "total_value": float(r.total_value),
        }
        for g in VALID_GRADES:
            k = GRADE_KEYS[g]
            row_dict[k] = getattr(r, k)
            grand[k] += getattr(r, k)
        grand["total_qty"] += r.total_qty
        grand["total_value"] += float(r.total_value)
        items.append(row_dict)

    return {"items": items, "grand_total": grand}


async def get_grading_overview(
    db: AsyncSession, view: str,
    date_from: date, date_to: date,
):
    """Combined endpoint with 15-min response cache + parallel query execution."""
    await _ensure_location_ids(db)

    cache_key = _cache_key("overview", view, date_from, date_to)
    cached = _get_cached(cache_key)
    if cached:
        return cached

    async def _run(fn, *args):
        async with OdooSessionLocal() as session:
            return await fn(session, *args)

    summary, grades, daily_grades, categories = await asyncio.gather(
        _run(get_grading_summary, view, date_from, date_to),
        _run(get_grade_breakdown, view, date_from, date_to),
        _run(get_daily_grade_data, view, date_from, date_to),
        _run(get_category_totals, view, date_from, date_to),
    )

    result = {
        "summary": summary,
        "grades": grades,
        "daily_grades": daily_grades,
        "categories": categories,
    }
    _set_cached(cache_key, result)
    return result


async def get_grading_items(
    db: AsyncSession, view: str,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
    grade: str | None = None,
    category: str | None = None,
    cost_min: float | None = None,
    cost_max: float | None = None,
    offset: int = 0,
    limit: int = 50,
):
    """Paginated stock move line items — cached + count/fetch in parallel."""
    await _ensure_location_ids(db)

    items_cache_key = f"items:{view}:{date_from}:{date_to}:{search}:{grade}:{category}:{cost_min}:{cost_max}:{offset}:{limit}"
    cached = _get_cached(items_cache_key)
    if cached:
        return cached

    q = _build_filtered_query(
        view, date_from, date_to, search, grade, category, cost_min, cost_max,
    )

    items_q = q.order_by(StockMoveLine.date.desc()).offset(offset).limit(limit)

    # Optimisation: when no user filters are active we can pull the total count
    # from the cached overview (which already ran the same base query).  This
    # saves a full COUNT(*) round-trip to the remote RDS.
    has_extra_filters = any(v for v in [search, grade, category, cost_min, cost_max])
    cached_total = None
    if not has_extra_filters and date_from and date_to:
        overview_key = _cache_key("overview", view, date_from, date_to)
        overview_cached = _get_cached(overview_key)
        if overview_cached:
            cached_total = overview_cached["summary"]["total_items"]

    if cached_total is not None:
        # Only need the paginated fetch — count comes from overview cache
        async with OdooSessionLocal() as session:
            rows = (await session.execute(items_q)).all()
        total = cached_total
    else:
        # Run count and fetch in parallel
        count_q = select(func.count()).select_from(q.subquery())

        async def _count():
            async with OdooSessionLocal() as session:
                return (await session.execute(count_q)).scalar()

        async def _fetch():
            async with OdooSessionLocal() as session:
                return (await session.execute(items_q)).all()

        total, rows = await asyncio.gather(_count(), _fetch())

    result = {
        "total": total,
        "items": [
            {
                "id": r.id,
                "date": str(r.date) if r.date else None,
                "uid": r.uid_name,
                "product": r.product_name,
                "default_code": r.default_code,
                "category": r.product_category_name,
                "grade": r.grade,
                "cost": float(r.list_price) if r.list_price else 0,
            }
            for r in rows
        ],
    }
    _set_cached(items_cache_key, result)
    return result


# ── Background pre-warming ────────────────────────────────────────────


async def prewarm_cache():
    """Pre-populate cache for common date ranges on both views.

    Called once on app startup so the first user gets a cache hit.
    """
    today = date.today()
    this_month_start = today.replace(day=1)
    ytd_start = today.replace(month=1, day=1)
    ranges = [
        (this_month_start, today),              # This month (default preset)
        (today - timedelta(days=6), today),     # Last 7 days
        (today - timedelta(days=29), today),    # Last 30 days
        (today - timedelta(days=89), today),    # Last 90 days
        (ytd_start, today),                     # Year to date
    ]
    views = ["total-stocked", "processed-stock"]

    print(f"[PREWARM] Starting grading cache pre-warm: {len(ranges)} ranges × {len(views)} views")
    t0 = time.time()

    # Ensure location cache is ready before running queries
    async with OdooSessionLocal() as db:
        await _ensure_location_ids(db)

    for view in views:
        for d_from, d_to in ranges:
            # 1) Overview (summary + grades + chart + categories)
            cache_key = _cache_key("overview", view, d_from, d_to)
            if not _get_cached(cache_key):
                try:
                    async with OdooSessionLocal() as db:
                        await get_grading_overview(db, view, d_from, d_to)
                    print(f"[PREWARM]   overview  {view} {d_from}→{d_to}")
                except Exception as exc:
                    print(f"[PREWARM]   FAIL overview {view} {d_from}→{d_to}: {exc}")

            # 2) Items page-1 (default params, no filters)
            items_key = f"items:{view}:{d_from}:{d_to}:None:None:None:None:None:0:50"
            if not _get_cached(items_key):
                try:
                    async with OdooSessionLocal() as db:
                        await get_grading_items(db, view, d_from, d_to)
                    print(f"[PREWARM]   items     {view} {d_from}→{d_to}")
                except Exception as exc:
                    print(f"[PREWARM]   FAIL items {view} {d_from}→{d_to}: {exc}")

    elapsed = time.time() - t0
    print(f"[PREWARM] Grading cache pre-warm complete in {elapsed:.1f}s")
