"""Sales Margin Dashboard service — Invoice-based margin analysis.

Queries the Odoo read-replica for posted customer invoices & credit notes,
computing revenue, margin, margin% KPIs and breakdowns by salesperson.
Results are cached in Redis with a 15-min TTL.
"""

import asyncio
import logging
from datetime import date

from sqlalchemy import select, func, case, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.accounting import AccountMove, AccountMoveLine
from app.odoo_models.partners import ResPartner, ResUsers
from app.services.tz import local_date
from app.database import OdooSessionLocal
from app.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes


def _cache_key(prefix: str, date_from: date, date_to: date, **kwargs) -> str:
    extra = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()) if v is not None)
    return f"sales_margin:{prefix}:{date_from}:{date_to}:{extra}"


async def _get_cached(key: str):
    return await cache_get(key)


async def _set_cached(key: str, value):
    await cache_set(key, value, CACHE_TTL)


# ── Helpers ───────────────────────────────────────────────────────────

def _base_invoice_filters(date_from: date, date_to: date):
    """Base filters: posted customer invoices."""
    f = [
        AccountMove.state == "posted",
        AccountMove.move_type == "out_invoice",
    ]
    if date_from:
        f.append(func.coalesce(AccountMove.invoice_date, AccountMove.date) >= date_from)
    if date_to:
        f.append(func.coalesce(AccountMove.invoice_date, AccountMove.date) <= date_to)
    return f


def _base_refund_filters(date_from: date, date_to: date):
    """Base filters: posted customer refunds (credit notes)."""
    f = [
        AccountMove.state == "posted",
        AccountMove.move_type == "out_refund",
    ]
    if date_from:
        f.append(func.coalesce(AccountMove.invoice_date, AccountMove.date) >= date_from)
    if date_to:
        f.append(func.coalesce(AccountMove.invoice_date, AccountMove.date) <= date_to)
    return f


def _base_all_filters(date_from: date, date_to: date):
    """Base filters: posted customer invoices AND refunds."""
    f = [
        AccountMove.state == "posted",
        AccountMove.move_type.in_(["out_invoice", "out_refund"]),
    ]
    if date_from:
        f.append(func.coalesce(AccountMove.invoice_date, AccountMove.date) >= date_from)
    if date_to:
        f.append(func.coalesce(AccountMove.invoice_date, AccountMove.date) <= date_to)
    return f


# ═══════════════════════════════════════════════════════════════════════
#  Revenue / margin from account_move_line (income lines only)
# ═══════════════════════════════════════════════════════════════════════
#
# In Odoo 17, margin on invoices is stored per move-line:
#   Revenue = price_subtotal (on income account lines with product_id)
#   Cost    = quantity * purchase_price (stored on the sale_order_line)
#
# However the simplest approach: use account_move_line.balance for
# revenue (negative = income for customer invoices), and compute margin
# from the product cost on the move line.
#
# Simpler: use amount_untaxed on account_move for revenue, and compute
# margin from associated sale_order_line.margin via invoice_origin.
#
# Simplest working approach: use AML (account_move_line) with product
# lines on income accounts. Revenue = -balance (for out_invoice) or
# +balance (out_refund). Margin we approximate from the difference of
# selling price vs cost.
#
# For robustness, we query directly from account_move for the invoice-level
# totals and compute margin from the AML product lines cost vs revenue.
# ═══════════════════════════════════════════════════════════════════════

async def _sm_kpis(db: AsyncSession, date_from: date, date_to: date):
    """KPIs: Invoiced Revenue, Margin, Margin%, Return Revenue, Return Margin.

    Revenue = sum(amount_untaxed) for out_invoice
    Margin  = Revenue - Cost, where cost is derived from AML product lines
    Returns = same for out_refund (values are negative)
    """
    # Invoice revenue & margin from AML product lines
    inv_filters = _base_invoice_filters(date_from, date_to)
    inv_q = (
        select(
            func.coalesce(func.sum(AccountMove.amount_untaxed), 0).label("revenue"),
        )
        .where(*inv_filters)
    )
    inv_row = (await db.execute(inv_q)).one()
    inv_revenue = float(inv_row.revenue)

    # Get margin from account_move_line product lines (income lines)
    # For out_invoice: revenue line has negative balance, cost = quantity * price_unit on COGS line
    # Simplification: margin = sum(-balance) from income account lines - sum(debit) from COGS lines
    # Better approach: get margin from AML where we have product lines
    margin_q = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (AccountMoveLine.balance < 0, -AccountMoveLine.balance),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("income"),
            func.coalesce(
                func.sum(
                    case(
                        (AccountMoveLine.balance > 0, AccountMoveLine.balance),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("cost"),
        )
        .join(AccountMove, AccountMoveLine.move_id == AccountMove.id)
        .where(
            AccountMove.state == "posted",
            AccountMove.move_type == "out_invoice",
            AccountMoveLine.product_id.isnot(None),
        )
    )
    if date_from:
        margin_q = margin_q.where(func.coalesce(AccountMove.invoice_date, AccountMove.date) >= date_from)
    if date_to:
        margin_q = margin_q.where(func.coalesce(AccountMove.invoice_date, AccountMove.date) <= date_to)

    margin_row = (await db.execute(margin_q)).one()
    income = float(margin_row.income)
    cost = float(margin_row.cost)
    inv_margin = income - cost

    # Refund revenue & margin
    ref_filters = _base_refund_filters(date_from, date_to)
    ref_q = (
        select(
            func.coalesce(func.sum(AccountMove.amount_untaxed), 0).label("revenue"),
        )
        .where(*ref_filters)
    )
    ref_row = (await db.execute(ref_q)).one()
    ref_revenue = -abs(float(ref_row.revenue))  # show as negative

    ref_margin_q = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (AccountMoveLine.balance > 0, AccountMoveLine.balance),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("income"),
            func.coalesce(
                func.sum(
                    case(
                        (AccountMoveLine.balance < 0, -AccountMoveLine.balance),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("cost"),
        )
        .join(AccountMove, AccountMoveLine.move_id == AccountMove.id)
        .where(
            AccountMove.state == "posted",
            AccountMove.move_type == "out_refund",
            AccountMoveLine.product_id.isnot(None),
        )
    )
    if date_from:
        ref_margin_q = ref_margin_q.where(func.coalesce(AccountMove.invoice_date, AccountMove.date) >= date_from)
    if date_to:
        ref_margin_q = ref_margin_q.where(func.coalesce(AccountMove.invoice_date, AccountMove.date) <= date_to)

    ref_margin_row = (await db.execute(ref_margin_q)).one()
    ref_income = float(ref_margin_row.income)
    ref_cost = float(ref_margin_row.cost)
    ref_margin = -(ref_income - ref_cost)  # negative for returns

    margin_pct = (inv_margin / inv_revenue * 100) if inv_revenue else 0

    return {
        "invoiced_revenue": round(inv_revenue, 2),
        "invoiced_margin": round(inv_margin, 2),
        "margin_pct": round(margin_pct, 1),
        "return_revenue": round(ref_revenue, 2),
        "return_margin": round(ref_margin, 2),
    }


async def _sm_by_salesperson(db: AsyncSession, date_from: date, date_to: date):
    """Margin breakdown by salesperson — invoices only + return totals."""
    salesperson = ResPartner.name

    # Invoices grouped by salesperson
    inv_q = (
        select(
            salesperson.label("sales_person"),
            func.sum(AccountMove.amount_untaxed).label("revenue"),
        )
        .join(ResUsers, AccountMove.invoice_user_id == ResUsers.id)
        .join(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(*_base_invoice_filters(date_from, date_to))
        .group_by(salesperson)
        .order_by(func.sum(AccountMove.amount_untaxed).desc())
    )
    inv_rows = (await db.execute(inv_q)).all()

    # Get margin per salesperson from AML
    margin_q = (
        select(
            salesperson.label("sales_person"),
            func.coalesce(
                func.sum(
                    case(
                        (AccountMoveLine.balance < 0, -AccountMoveLine.balance),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("income"),
            func.coalesce(
                func.sum(
                    case(
                        (AccountMoveLine.balance > 0, AccountMoveLine.balance),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("cost"),
        )
        .join(AccountMove, AccountMoveLine.move_id == AccountMove.id)
        .join(ResUsers, AccountMove.invoice_user_id == ResUsers.id)
        .join(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(
            AccountMove.state == "posted",
            AccountMove.move_type == "out_invoice",
            AccountMoveLine.product_id.isnot(None),
        )
        .group_by(salesperson)
    )
    if date_from:
        margin_q = margin_q.where(func.coalesce(AccountMove.invoice_date, AccountMove.date) >= date_from)
    if date_to:
        margin_q = margin_q.where(func.coalesce(AccountMove.invoice_date, AccountMove.date) <= date_to)

    margin_rows = (await db.execute(margin_q)).all()
    margin_map = {r.sales_person: float(r.income) - float(r.cost) for r in margin_rows}

    # Refunds grouped by salesperson
    ref_q = (
        select(
            salesperson.label("sales_person"),
            func.sum(AccountMove.amount_untaxed).label("return_revenue"),
        )
        .join(ResUsers, AccountMove.invoice_user_id == ResUsers.id)
        .join(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(*_base_refund_filters(date_from, date_to))
        .group_by(salesperson)
    )
    ref_rows = (await db.execute(ref_q)).all()
    ref_map = {r.sales_person: float(r.return_revenue) for r in ref_rows}

    # Refund margin by salesperson
    ref_margin_q = (
        select(
            salesperson.label("sales_person"),
            func.coalesce(
                func.sum(
                    case(
                        (AccountMoveLine.balance > 0, AccountMoveLine.balance),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("income"),
            func.coalesce(
                func.sum(
                    case(
                        (AccountMoveLine.balance < 0, -AccountMoveLine.balance),
                        else_=literal_column("0"),
                    )
                ), 0
            ).label("cost"),
        )
        .join(AccountMove, AccountMoveLine.move_id == AccountMove.id)
        .join(ResUsers, AccountMove.invoice_user_id == ResUsers.id)
        .join(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(
            AccountMove.state == "posted",
            AccountMove.move_type == "out_refund",
            AccountMoveLine.product_id.isnot(None),
        )
        .group_by(salesperson)
    )
    if date_from:
        ref_margin_q = ref_margin_q.where(func.coalesce(AccountMove.invoice_date, AccountMove.date) >= date_from)
    if date_to:
        ref_margin_q = ref_margin_q.where(func.coalesce(AccountMove.invoice_date, AccountMove.date) <= date_to)

    ref_margin_rows = (await db.execute(ref_margin_q)).all()
    ref_margin_map = {r.sales_person: -(float(r.income) - float(r.cost)) for r in ref_margin_rows}

    result = []
    for r in inv_rows:
        rev = float(r.revenue or 0)
        margin = margin_map.get(r.sales_person, 0)
        margin_pct = (margin / rev * 100) if rev else 0
        ret_rev = ref_map.get(r.sales_person, 0)
        ret_margin = ref_margin_map.get(r.sales_person, 0)
        result.append({
            "sales_person": r.sales_person or "Unassigned",
            "total_revenue": round(rev, 2),
            "total_margin": round(margin, 2),
            "margin_pct": round(margin_pct, 1),
            "returned_sales": round(-abs(ret_rev), 2),
            "returned_margin": round(ret_margin, 2),
        })

    return result


async def _sm_transactions(db: AsyncSession, date_from: date, date_to: date):
    """Transaction list — individual invoice/refund rows."""
    salesperson = ResPartner.name
    partner = (
        select(ResPartner.name)
        .where(ResPartner.id == AccountMove.partner_id)
        .correlate(AccountMove)
        .scalar_subquery()
        .label("partner")
    )

    # Revenue from AML product lines per move
    revenue_sub = (
        select(
            AccountMoveLine.move_id,
            func.sum(
                case(
                    (AccountMoveLine.balance < 0, -AccountMoveLine.balance),
                    (AccountMoveLine.balance > 0, AccountMoveLine.balance),
                    else_=literal_column("0"),
                )
            ).label("line_revenue"),
            func.sum(
                case(
                    (AccountMoveLine.balance > 0, AccountMoveLine.balance),
                    else_=literal_column("0"),
                )
            ).label("line_cost"),
        )
        .where(AccountMoveLine.product_id.isnot(None))
        .group_by(AccountMoveLine.move_id)
        .subquery()
    )

    q = (
        select(
            AccountMove.id,
            AccountMove.name.label("number"),
            AccountMove.move_type,
            func.coalesce(AccountMove.invoice_date, AccountMove.date).label("date"),
            salesperson.label("sales_person"),
            partner,
            AccountMove.amount_untaxed.label("revenue"),
        )
        .outerjoin(ResUsers, AccountMove.invoice_user_id == ResUsers.id)
        .outerjoin(ResPartner, ResUsers.partner_id == ResPartner.id)
        .where(*_base_all_filters(date_from, date_to))
        .order_by(func.coalesce(AccountMove.invoice_date, AccountMove.date).desc())
        .limit(500)
    )
    rows = (await db.execute(q)).all()

    # Get margin for each move from AML
    move_ids = [r.id for r in rows]
    if move_ids:
        margin_q = (
            select(
                AccountMoveLine.move_id,
                func.coalesce(
                    func.sum(
                        case(
                            (AccountMoveLine.balance < 0, -AccountMoveLine.balance),
                            else_=literal_column("0"),
                        )
                    ), 0
                ).label("income"),
                func.coalesce(
                    func.sum(
                        case(
                            (AccountMoveLine.balance > 0, AccountMoveLine.balance),
                            else_=literal_column("0"),
                        )
                    ), 0
                ).label("cost"),
            )
            .where(
                AccountMoveLine.move_id.in_(move_ids),
                AccountMoveLine.product_id.isnot(None),
            )
            .group_by(AccountMoveLine.move_id)
        )
        margin_rows = (await db.execute(margin_q)).all()
        margin_map = {r.move_id: (float(r.income), float(r.cost)) for r in margin_rows}
    else:
        margin_map = {}

    result = []
    for r in rows:
        rev = float(r.revenue or 0)
        is_refund = r.move_type == "out_refund"
        income, cost = margin_map.get(r.id, (0, 0))

        if is_refund:
            display_rev = -abs(rev)
            margin = -(income - cost)
        else:
            display_rev = rev
            margin = income - cost

        margin_pct = (margin / abs(display_rev) * 100) if abs(display_rev) else 0

        result.append({
            "number": r.number,
            "date": str(r.date) if r.date else None,
            "sales_person": r.sales_person or "Unassigned",
            "partner": r.partner or "",
            "revenue": round(display_rev, 2),
            "margin": round(margin, 2),
            "margin_pct": round(margin_pct, 1),
            "is_refund": is_refund,
        })

    return result


# ═══════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════

async def get_overview(
    db: AsyncSession,
    date_from: date,
    date_to: date,
):
    """Sales Margin overview — all queries in parallel, cached."""
    ck = _cache_key("overview", date_from, date_to)
    cached = await _get_cached(ck)
    if cached:
        return cached

    async def _run(fn):
        async with OdooSessionLocal() as session:
            return await fn(session, date_from, date_to)

    results = await asyncio.gather(
        _run(_sm_kpis),
        _run(_sm_by_salesperson),
        _run(_sm_transactions),
    )

    data = {
        "kpis": results[0],
        "by_salesperson": results[1],
        "transactions": results[2],
    }
    await _set_cached(ck, data)
    return data
