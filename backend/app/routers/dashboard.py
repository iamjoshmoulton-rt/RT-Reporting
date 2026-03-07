import asyncio
import time
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db, OdooSessionLocal
from app.auth.dependencies import get_current_user, require_permission
from app.auth.models import User
from app.services import (
    sales_service, procurement_service, accounting_service, inventory_service,
    helpdesk_service, crm_service, manufacturing_service, projects_service,
)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

# ── Response cache (2-min TTL) ────────────────────────────────────────
_dashboard_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 120  # seconds


def _pct(current: float | int, previous: float | int) -> float | None:
    if previous == 0:
        return None
    return round(((current - previous) / abs(previous)) * 100, 1)


async def _run_with_session(coro_func, *args):
    """Run a service function with its own DB session (for parallel execution)."""
    async with OdooSessionLocal() as session:
        return await coro_func(session, *args)


@router.get("/summary")
async def dashboard_summary(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    _user: User = Depends(get_current_user),
):
    today = date.today()
    df = date_from or today.replace(day=1)
    dt = date_to or today

    # Check cache
    cache_key = f"summary:{df}:{dt}"
    cached = _dashboard_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < CACHE_TTL:
        return cached[1]

    # Calculate previous period
    delta = dt - df
    comp_to = df - timedelta(days=1)
    comp_from = comp_to - delta

    # Run ALL 15 queries in parallel (each with its own DB session)
    (
        sales, procurement, accounting, inventory,
        helpdesk, crm, manufacturing, projects,
        prev_sales, prev_procurement, prev_accounting,
        prev_helpdesk, prev_crm, prev_manufacturing, prev_projects,
    ) = await asyncio.gather(
        _run_with_session(sales_service.get_sales_summary, df, dt),
        _run_with_session(procurement_service.get_procurement_summary, df, dt),
        _run_with_session(accounting_service.get_accounting_summary, df, dt),
        _run_with_session(inventory_service.get_inventory_summary),
        _run_with_session(helpdesk_service.get_helpdesk_summary, df, dt),
        _run_with_session(crm_service.get_crm_summary, df, dt),
        _run_with_session(manufacturing_service.get_manufacturing_summary, df, dt),
        _run_with_session(projects_service.get_projects_summary, df, dt),
        _run_with_session(sales_service.get_sales_summary, comp_from, comp_to),
        _run_with_session(procurement_service.get_procurement_summary, comp_from, comp_to),
        _run_with_session(accounting_service.get_accounting_summary, comp_from, comp_to),
        _run_with_session(helpdesk_service.get_helpdesk_summary, comp_from, comp_to),
        _run_with_session(crm_service.get_crm_summary, comp_from, comp_to),
        _run_with_session(manufacturing_service.get_manufacturing_summary, comp_from, comp_to),
        _run_with_session(projects_service.get_projects_summary, comp_from, comp_to),
    )

    result = {
        "sales": sales,
        "procurement": procurement,
        "accounting": accounting,
        "inventory": inventory,
        "helpdesk": helpdesk,
        "crm": crm,
        "manufacturing": manufacturing,
        "projects": projects,
        "trends": {
            "total_revenue": _pct(sales["total_revenue"], prev_sales["total_revenue"]),
            "avg_order_value": _pct(sales["avg_order_value"], prev_sales["avg_order_value"]),
            "net_revenue": _pct(accounting["net_revenue"], prev_accounting["net_revenue"]),
            "total_spend": _pct(procurement["total_spend"], prev_procurement["total_spend"]),
            "invoices_outstanding": _pct(
                accounting["invoices"]["outstanding"],
                prev_accounting["invoices"]["outstanding"],
            ),
            "open_tickets": _pct(helpdesk["open_tickets"], prev_helpdesk["open_tickets"]),
            "pipeline_value": _pct(crm["pipeline_value"], prev_crm["pipeline_value"]),
            "active_mos": _pct(manufacturing["active_mos"], prev_manufacturing["active_mos"]),
            "open_tasks": _pct(projects["open_tasks"], prev_projects["open_tasks"]),
        },
    }

    _dashboard_cache[cache_key] = (time.time(), result)
    return result


@router.get("/revenue-trend")
async def revenue_trend(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("dashboard.revenue_chart")),
):
    return await sales_service.get_sales_by_period(db, date_from, date_to, group_by)


@router.get("/top-customers")
async def top_customers(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(10),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("dashboard.top_customers")),
):
    return await sales_service.get_sales_by_customer(db, date_from, date_to, limit)


@router.get("/top-products")
async def top_products(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(10),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(require_permission("dashboard.top_products")),
):
    return await sales_service.get_sales_by_product(db, date_from, date_to, limit)
