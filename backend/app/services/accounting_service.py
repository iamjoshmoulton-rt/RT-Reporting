from datetime import date
from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.accounting import AccountMove, AccountMoveLine, AccountAccount
from app.odoo_models.partners import ResPartner


async def get_accounting_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    filters = [AccountMove.state == "posted"]
    if date_from:
        filters.append(AccountMove.date >= date_from)
    if date_to:
        filters.append(AccountMove.date <= date_to)

    invoice_filters = filters + [AccountMove.move_type.in_(["out_invoice", "out_refund"])]
    bill_filters = filters + [AccountMove.move_type.in_(["in_invoice", "in_refund"])]

    inv_result = await db.execute(
        select(
            func.count(AccountMove.id).label("count"),
            func.coalesce(func.sum(AccountMove.amount_total), 0).label("total"),
            func.coalesce(func.sum(AccountMove.amount_residual), 0).label("outstanding"),
        ).where(*invoice_filters)
    )
    inv = inv_result.one()

    bill_result = await db.execute(
        select(
            func.count(AccountMove.id).label("count"),
            func.coalesce(func.sum(AccountMove.amount_total), 0).label("total"),
            func.coalesce(func.sum(AccountMove.amount_residual), 0).label("outstanding"),
        ).where(*bill_filters)
    )
    bill = bill_result.one()

    return {
        "invoices": {
            "count": inv.count,
            "total": float(inv.total),
            "outstanding": float(inv.outstanding),
        },
        "bills": {
            "count": bill.count,
            "total": float(bill.total),
            "outstanding": float(bill.outstanding),
        },
        "net_revenue": float(inv.total) - float(bill.total),
    }


async def get_receivable_aging(db: AsyncSession):
    """Accounts receivable aging buckets (current, 1-30, 31-60, 61-90, 90+)."""
    filters = [
        AccountMove.state == "posted",
        AccountMove.move_type.in_(["out_invoice", "out_refund"]),
        AccountMove.amount_residual > 0,
    ]

    result = await db.execute(
        select(
            func.sum(
                case(
                    (func.current_date() - AccountMove.invoice_date_due <= 0, AccountMove.amount_residual),
                    else_=0,
                )
            ).label("current"),
            func.sum(
                case(
                    (and_(
                        func.current_date() - AccountMove.invoice_date_due > 0,
                        func.current_date() - AccountMove.invoice_date_due <= 30,
                    ), AccountMove.amount_residual),
                    else_=0,
                )
            ).label("days_1_30"),
            func.sum(
                case(
                    (and_(
                        func.current_date() - AccountMove.invoice_date_due > 30,
                        func.current_date() - AccountMove.invoice_date_due <= 60,
                    ), AccountMove.amount_residual),
                    else_=0,
                )
            ).label("days_31_60"),
            func.sum(
                case(
                    (and_(
                        func.current_date() - AccountMove.invoice_date_due > 60,
                        func.current_date() - AccountMove.invoice_date_due <= 90,
                    ), AccountMove.amount_residual),
                    else_=0,
                )
            ).label("days_61_90"),
            func.sum(
                case(
                    (func.current_date() - AccountMove.invoice_date_due > 90, AccountMove.amount_residual),
                    else_=0,
                )
            ).label("days_90_plus"),
        ).where(*filters)
    )
    row = result.one()
    return {
        "current": float(row.current or 0),
        "days_1_30": float(row.days_1_30 or 0),
        "days_31_60": float(row.days_31_60 or 0),
        "days_61_90": float(row.days_61_90 or 0),
        "days_90_plus": float(row.days_90_plus or 0),
    }


async def get_payable_aging(db: AsyncSession):
    """Accounts payable aging buckets."""
    filters = [
        AccountMove.state == "posted",
        AccountMove.move_type.in_(["in_invoice", "in_refund"]),
        AccountMove.amount_residual > 0,
    ]

    result = await db.execute(
        select(
            func.sum(
                case(
                    (func.current_date() - AccountMove.invoice_date_due <= 0, AccountMove.amount_residual),
                    else_=0,
                )
            ).label("current"),
            func.sum(
                case(
                    (and_(
                        func.current_date() - AccountMove.invoice_date_due > 0,
                        func.current_date() - AccountMove.invoice_date_due <= 30,
                    ), AccountMove.amount_residual),
                    else_=0,
                )
            ).label("days_1_30"),
            func.sum(
                case(
                    (and_(
                        func.current_date() - AccountMove.invoice_date_due > 30,
                        func.current_date() - AccountMove.invoice_date_due <= 60,
                    ), AccountMove.amount_residual),
                    else_=0,
                )
            ).label("days_31_60"),
            func.sum(
                case(
                    (and_(
                        func.current_date() - AccountMove.invoice_date_due > 60,
                        func.current_date() - AccountMove.invoice_date_due <= 90,
                    ), AccountMove.amount_residual),
                    else_=0,
                )
            ).label("days_61_90"),
            func.sum(
                case(
                    (func.current_date() - AccountMove.invoice_date_due > 90, AccountMove.amount_residual),
                    else_=0,
                )
            ).label("days_90_plus"),
        ).where(*filters)
    )
    row = result.one()
    return {
        "current": float(row.current or 0),
        "days_1_30": float(row.days_1_30 or 0),
        "days_31_60": float(row.days_31_60 or 0),
        "days_61_90": float(row.days_61_90 or 0),
        "days_90_plus": float(row.days_90_plus or 0),
    }


async def get_revenue_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    filters = [
        AccountMove.state == "posted",
        AccountMove.move_type.in_(["out_invoice", "out_refund"]),
    ]
    if date_from:
        filters.append(AccountMove.date >= date_from)
    if date_to:
        filters.append(AccountMove.date <= date_to)

    if group_by == "day":
        period = AccountMove.date
    elif group_by == "week":
        period = func.date_trunc("week", AccountMove.date)
    elif group_by == "year":
        period = func.date_trunc("year", AccountMove.date)
    else:
        period = func.date_trunc("month", AccountMove.date)

    result = await db.execute(
        select(
            period.label("period"),
            func.count(AccountMove.id).label("invoice_count"),
            func.coalesce(func.sum(AccountMove.amount_total), 0).label("total"),
            func.coalesce(func.sum(AccountMove.amount_residual), 0).label("outstanding"),
        )
        .where(*filters)
        .group_by(period)
        .order_by(period)
    )
    return [
        {
            "period": str(row.period),
            "invoice_count": row.invoice_count,
            "total": float(row.total),
            "outstanding": float(row.outstanding),
        }
        for row in result.all()
    ]


async def get_invoices(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    move_type: str | None = None,
    payment_state: str | None = None,
    partner_id: int | None = None,
    offset: int = 0,
    limit: int = 50,
):
    filters = [AccountMove.state == "posted"]
    if date_from:
        filters.append(AccountMove.date >= date_from)
    if date_to:
        filters.append(AccountMove.date <= date_to)
    if move_type:
        filters.append(AccountMove.move_type == move_type)
    else:
        filters.append(AccountMove.move_type.in_(["out_invoice", "out_refund", "in_invoice", "in_refund"]))
    if payment_state:
        filters.append(AccountMove.payment_state == payment_state)
    if partner_id:
        filters.append(AccountMove.partner_id == partner_id)

    count_q = select(func.count(AccountMove.id)).where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            AccountMove.id,
            AccountMove.name,
            AccountMove.move_type,
            AccountMove.date,
            AccountMove.invoice_date_due,
            AccountMove.amount_total,
            AccountMove.amount_residual,
            AccountMove.payment_state,
            ResPartner.name.label("partner_name"),
        )
        .join(ResPartner, AccountMove.partner_id == ResPartner.id, isouter=True)
        .where(*filters)
        .order_by(AccountMove.date.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    invoices = [
        {
            "id": row.id,
            "name": row.name,
            "move_type": row.move_type,
            "date": str(row.date) if row.date else None,
            "invoice_date_due": str(row.invoice_date_due) if row.invoice_date_due else None,
            "amount_total": float(row.amount_total) if row.amount_total else 0,
            "amount_residual": float(row.amount_residual) if row.amount_residual else 0,
            "payment_state": row.payment_state,
            "partner_name": row.partner_name,
        }
        for row in result.all()
    ]
    return {"total": total, "invoices": invoices}
