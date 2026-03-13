"""Accounting Dashboard service — P&L-based revenue, margin, COGS analysis.

Queries the Odoo read-replica for posted journal entries on income and
expense accounts to produce P&L metrics, revenue trends, channel breakdowns,
and vendor rev-share.  Results are cached in Redis with a 15-min TTL.
"""

import asyncio
import logging
from datetime import date

from sqlalchemy import select, func, case, literal_column, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.accounting import AccountMove, AccountMoveLine, AccountAccount
from app.odoo_models.partners import (
    ResPartner, ProductProduct, ProductTemplate, CrmTeam,
)
from app.odoo_models.procurement import PurchaseOrder, PurchaseOrderLine
from app.odoo_models.sales import SaleOrder
from app.services.tz import local_date
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes


def _cache_key(prefix: str, date_from: date, date_to: date) -> str:
    return f"acct_dash:{prefix}:{date_from}:{date_to}"


async def _get_cached(key: str):
    return await cache_get(key)


async def _set_cached(key: str, value):
    await cache_set(key, value, CACHE_TTL)


# ── Helpers ───────────────────────────────────────────────────────────

# Odoo account types for P&L
_INCOME_TYPES = ["income", "income_other"]
_COGS_TYPES = ["expense_direct_cost"]
_VARIABLE_EXPENSE_TYPES = ["expense"]


def _posted_aml_base(date_from: date, date_to: date):
    """Base filters: posted account move lines within date range."""
    f = [AccountMoveLine.parent_state == "posted"]
    if date_from:
        f.append(AccountMoveLine.date >= date_from)
    if date_to:
        f.append(AccountMoveLine.date <= date_to)
    return f


# ═══════════════════════════════════════════════════════════════════════
#  QUERY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════

async def _ad_kpis(db: AsyncSession, date_from: date, date_to: date):
    """KPIs: Net Revenue, Device Margin, Margin%, Variable COGS, Raw Inventory.

    Revenue & COGS from AML on income / expense_direct_cost accounts.
    In Odoo, income account lines have negative balance (credit > debit),
    so Net Revenue = -SUM(balance) for income accounts.
    COGS = SUM(balance) for expense_direct_cost accounts (positive = expense).
    """
    base = _posted_aml_base(date_from, date_to)

    # Revenue: -SUM(balance) for income accounts
    rev_q = (
        select(
            func.coalesce(-func.sum(AccountMoveLine.balance), 0).label("revenue"),
        )
        .join(AccountAccount, AccountMoveLine.account_id == AccountAccount.id)
        .where(*base, AccountAccount.account_type.in_(_INCOME_TYPES))
    )
    rev_row = (await db.execute(rev_q)).one()
    net_revenue = float(rev_row.revenue)

    # COGS: SUM(balance) for direct cost accounts
    cogs_q = (
        select(
            func.coalesce(func.sum(AccountMoveLine.balance), 0).label("cogs"),
        )
        .join(AccountAccount, AccountMoveLine.account_id == AccountAccount.id)
        .where(*base, AccountAccount.account_type.in_(_COGS_TYPES))
    )
    cogs_row = (await db.execute(cogs_q)).one()
    device_cogs = float(cogs_row.cogs)

    device_margin = net_revenue - device_cogs
    margin_pct = (device_margin / net_revenue * 100) if net_revenue else 0

    # Variable COGS: SUM(balance) for general expense accounts
    var_q = (
        select(
            func.coalesce(func.sum(AccountMoveLine.balance), 0).label("var_cogs"),
        )
        .join(AccountAccount, AccountMoveLine.account_id == AccountAccount.id)
        .where(*base, AccountAccount.account_type.in_(_VARIABLE_EXPENSE_TYPES))
    )
    var_row = (await db.execute(var_q)).one()
    variable_cogs = float(var_row.var_cogs)

    # Raw Inventory: combined PO value for POs not in processing stage
    # POs in draft/sent/to approve = not yet being processed
    inv_q = (
        select(
            func.coalesce(func.sum(PurchaseOrderLine.price_subtotal), 0).label("raw_inv"),
        )
        .join(PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id)
        .where(
            PurchaseOrder.state.in_(["draft", "sent", "to approve"]),
        )
    )
    inv_row = (await db.execute(inv_q)).one()
    raw_inventory = float(inv_row.raw_inv)

    return {
        "net_revenue": round(net_revenue, 2),
        "device_margin": round(device_margin, 2),
        "margin_pct": round(margin_pct, 1),
        "variable_cogs": round(variable_cogs, 2),
        "raw_inventory": round(raw_inventory, 2),
    }


async def _ad_revenue_trend(db: AsyncSession, date_from: date, date_to: date):
    """Monthly invoiced revenue trend for bar chart."""
    base = _posted_aml_base(date_from, date_to)

    q = (
        select(
            extract("year", AccountMoveLine.date).label("year"),
            extract("month", AccountMoveLine.date).label("month"),
            func.coalesce(-func.sum(AccountMoveLine.balance), 0).label("revenue"),
        )
        .join(AccountAccount, AccountMoveLine.account_id == AccountAccount.id)
        .where(*base, AccountAccount.account_type.in_(_INCOME_TYPES))
        .group_by(
            extract("year", AccountMoveLine.date),
            extract("month", AccountMoveLine.date),
        )
        .order_by(
            extract("year", AccountMoveLine.date),
            extract("month", AccountMoveLine.date),
        )
    )
    rows = (await db.execute(q)).all()

    import calendar
    return [
        {
            "month": f"{calendar.month_abbr[int(r.month)]} {int(r.year)}",
            "revenue": round(float(r.revenue), 2),
        }
        for r in rows
    ]


async def _ad_stats_by_channel(db: AsyncSession, date_from: date, date_to: date):
    """Stats By Channel — Revenue, Device Margin, Margin% per sales team.

    Join AML → account_move → sale_order (via invoice_origin) → crm_team.
    """
    base = _posted_aml_base(date_from, date_to)
    team_name = CrmTeam.name["en_US"].as_string()

    # Revenue by channel
    rev_q = (
        select(
            team_name.label("channel"),
            func.coalesce(-func.sum(AccountMoveLine.balance), 0).label("revenue"),
        )
        .join(AccountMove, AccountMoveLine.move_id == AccountMove.id)
        .join(AccountAccount, AccountMoveLine.account_id == AccountAccount.id)
        .join(
            SaleOrder,
            SaleOrder.name == AccountMove.invoice_origin,
        )
        .join(CrmTeam, SaleOrder.team_id == CrmTeam.id)
        .where(
            *base,
            AccountAccount.account_type.in_(_INCOME_TYPES),
            AccountMove.move_type.in_(["out_invoice", "out_refund"]),
        )
        .group_by(CrmTeam.id, team_name)
        .order_by(func.coalesce(-func.sum(AccountMoveLine.balance), 0).desc())
    )
    rev_rows = (await db.execute(rev_q)).all()

    # COGS by channel
    cogs_q = (
        select(
            team_name.label("channel"),
            func.coalesce(func.sum(AccountMoveLine.balance), 0).label("cogs"),
        )
        .join(AccountMove, AccountMoveLine.move_id == AccountMove.id)
        .join(AccountAccount, AccountMoveLine.account_id == AccountAccount.id)
        .join(
            SaleOrder,
            SaleOrder.name == AccountMove.invoice_origin,
        )
        .join(CrmTeam, SaleOrder.team_id == CrmTeam.id)
        .where(
            *base,
            AccountAccount.account_type.in_(_COGS_TYPES),
            AccountMove.move_type.in_(["out_invoice", "out_refund"]),
        )
        .group_by(CrmTeam.id, team_name)
    )
    cogs_rows = (await db.execute(cogs_q)).all()
    cogs_map = {r.channel: float(r.cogs) for r in cogs_rows}

    result = []
    for r in rev_rows:
        rev = float(r.revenue)
        cogs = cogs_map.get(r.channel, 0)
        margin = rev - cogs
        margin_pct = (margin / rev * 100) if rev else 0
        result.append({
            "channel": r.channel,
            "revenue": round(rev, 2),
            "device_margin": round(margin, 2),
            "margin_pct": round(margin_pct, 1),
        })

    return result


async def _ad_rev_share(db: AsyncSession, date_from: date, date_to: date):
    """Rev Share — Vendor, Revenue, Units Sold, Avg Sale Price.

    From posted customer invoices, grouped by vendor (partner on the invoice).
    Limited to 10k records as per the Odoo spreadsheet note.
    """
    base = [
        AccountMove.state == "posted",
        AccountMove.move_type.in_(["out_invoice", "out_refund"]),
    ]
    if date_from:
        base.append(func.coalesce(AccountMove.invoice_date, AccountMove.date) >= date_from)
    if date_to:
        base.append(func.coalesce(AccountMove.invoice_date, AccountMove.date) <= date_to)

    q = (
        select(
            ResPartner.name.label("vendor"),
            func.coalesce(func.sum(AccountMove.amount_untaxed), 0).label("revenue"),
            func.coalesce(
                func.sum(
                    case(
                        (AccountMove.move_type == "out_invoice", literal_column("1")),
                        (AccountMove.move_type == "out_refund", literal_column("-1")),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("units_sold"),
        )
        .join(ResPartner, AccountMove.partner_id == ResPartner.id)
        .where(*base)
        .group_by(ResPartner.id, ResPartner.name)
        .order_by(func.sum(AccountMove.amount_untaxed).desc())
        .limit(100)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "vendor": r.vendor,
            "revenue": round(float(r.revenue or 0), 2),
            "units_sold": int(r.units_sold or 0),
            "avg_sale_price": round(
                float(r.revenue or 0) / int(r.units_sold) if int(r.units_sold or 0) else 0, 2
            ),
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
    """Accounting Dashboard overview — all queries in parallel, cached."""
    ck = _cache_key("overview", date_from, date_to)
    cached = await _get_cached(ck)
    if cached:
        return cached

    async def _run(fn):
        async with OdooSessionLocal() as session:
            return await fn(session, date_from, date_to)

    results = await asyncio.gather(
        _run(_ad_kpis),
        _run(_ad_revenue_trend),
        _run(_ad_stats_by_channel),
        _run(_ad_rev_share),
    )

    data = {
        "kpis": results[0],
        "revenue_trend": results[1],
        "stats_by_channel": results[2],
        "rev_share": results[3],
    }
    await _set_cached(ck, data)
    return data
