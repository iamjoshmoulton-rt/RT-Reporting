from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import get_current_user, require_permission
from app.auth.models import User
from app.services import (
    sales_service, procurement_service, accounting_service, inventory_service,
    helpdesk_service, crm_service, manufacturing_service, projects_service,
)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _pct(current: float | int, previous: float | int) -> float | None:
    if previous == 0:
        return None
    return round(((current - previous) / abs(previous)) * 100, 1)


@router.get("/summary")
async def dashboard_summary(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_odoo_db),
    _user: User = Depends(get_current_user),
):
    # Default to current month if no dates supplied
    today = date.today()
    df = date_from or today.replace(day=1)
    dt = date_to or today

    sales = await sales_service.get_sales_summary(db, df, dt)
    procurement = await procurement_service.get_procurement_summary(db, df, dt)
    accounting = await accounting_service.get_accounting_summary(db, df, dt)
    inventory = await inventory_service.get_inventory_summary(db)
    helpdesk = await helpdesk_service.get_helpdesk_summary(db, df, dt)
    crm = await crm_service.get_crm_summary(db, df, dt)
    manufacturing = await manufacturing_service.get_manufacturing_summary(db, df, dt)
    projects = await projects_service.get_projects_summary(db, df, dt)

    # Calculate previous period (same length, immediately before)
    delta = dt - df
    comp_to = df - timedelta(days=1)
    comp_from = comp_to - delta

    prev_sales = await sales_service.get_sales_summary(db, comp_from, comp_to)
    prev_procurement = await procurement_service.get_procurement_summary(db, comp_from, comp_to)
    prev_accounting = await accounting_service.get_accounting_summary(db, comp_from, comp_to)
    prev_helpdesk = await helpdesk_service.get_helpdesk_summary(db, comp_from, comp_to)
    prev_crm = await crm_service.get_crm_summary(db, comp_from, comp_to)
    prev_manufacturing = await manufacturing_service.get_manufacturing_summary(db, comp_from, comp_to)
    prev_projects = await projects_service.get_projects_summary(db, comp_from, comp_to)

    return {
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
