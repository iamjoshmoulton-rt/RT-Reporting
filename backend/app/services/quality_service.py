from datetime import date
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.quality import QualityCheck, QualityAlert
from app.odoo_models.partners import ProductProduct, ProductTemplate
from app.services.tz import local_date, local_timestamp


def _product_name():
    """Extract English product name from JSONB name field."""
    return ProductTemplate.name["en_US"].as_string()


async def get_quality_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    # Period filters for checks
    check_filters = []
    if date_from:
        check_filters.append(local_date(QualityCheck.create_date) >= date_from)
    if date_to:
        check_filters.append(local_date(QualityCheck.create_date) <= date_to)

    # Total checks in period
    total_q = select(func.count(QualityCheck.id))
    if check_filters:
        total_q = total_q.where(*check_filters)
    total_checks = (await db.execute(total_q)).scalar()

    # Pass rate
    pass_filters = check_filters + [QualityCheck.quality_state == "pass"]
    pass_q = select(func.count(QualityCheck.id))
    if pass_filters:
        pass_q = pass_q.where(*pass_filters)
    pass_count = (await db.execute(pass_q)).scalar()
    pass_rate = round((pass_count / total_checks * 100) if total_checks else 0, 1)

    # Open alerts (no close_date)
    open_alerts = (await db.execute(
        select(func.count(QualityAlert.id)).where(
            QualityAlert.date_close.is_(None),
        )
    )).scalar()

    # Checks this period (same as total_checks, included for clarity)
    return {
        "total_checks": total_checks,
        "pass_rate": pass_rate,
        "open_alerts": open_alerts,
        "checks_this_period": total_checks,
    }


async def get_checks_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    filters = []
    if date_from:
        filters.append(local_date(QualityCheck.create_date) >= date_from)
    if date_to:
        filters.append(local_date(QualityCheck.create_date) <= date_to)

    local_dt_expr = local_timestamp(QualityCheck.create_date)
    if group_by == "day":
        period = local_date(QualityCheck.create_date)
    elif group_by == "week":
        period = func.date_trunc("week", local_dt_expr)
    elif group_by == "year":
        period = func.date_trunc("year", local_dt_expr)
    else:
        period = func.date_trunc("month", local_dt_expr)

    query = (
        select(
            period.label("period"),
            func.count(QualityCheck.id).label("check_count"),
            func.count(case((QualityCheck.quality_state == "pass", 1))).label("pass_count"),
            func.count(case((QualityCheck.quality_state == "fail", 1))).label("fail_count"),
        )
        .group_by(period)
        .order_by(period)
    )
    if filters:
        query = query.where(*filters)

    result = await db.execute(query)
    return [
        {
            "period": str(row.period),
            "check_count": row.check_count,
            "pass_count": row.pass_count,
            "fail_count": row.fail_count,
        }
        for row in result.all()
    ]


async def get_pass_fail_breakdown(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    filters = []
    if date_from:
        filters.append(local_date(QualityCheck.create_date) >= date_from)
    if date_to:
        filters.append(local_date(QualityCheck.create_date) <= date_to)

    query = (
        select(
            QualityCheck.quality_state.label("state"),
            func.count(QualityCheck.id).label("count"),
        )
        .group_by(QualityCheck.quality_state)
        .order_by(func.count(QualityCheck.id).desc())
    )
    if filters:
        query = query.where(*filters)

    result = await db.execute(query)
    return [
        {"state": row.state or "none", "count": row.count}
        for row in result.all()
    ]


async def get_quality_checks(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    quality_state: str | None = None,
    offset: int = 0,
    limit: int = 50,
):
    filters = []
    if date_from:
        filters.append(local_date(QualityCheck.create_date) >= date_from)
    if date_to:
        filters.append(local_date(QualityCheck.create_date) <= date_to)
    if quality_state:
        filters.append(QualityCheck.quality_state == quality_state)

    count_q = select(func.count(QualityCheck.id))
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            QualityCheck.id,
            QualityCheck.name,
            QualityCheck.quality_state,
            QualityCheck.measure,
            QualityCheck.qty_tested,
            QualityCheck.create_date,
            _product_name().label("product_name"),
        )
        .join(ProductProduct, QualityCheck.product_id == ProductProduct.id, isouter=True)
        .join(ProductTemplate, ProductProduct.product_tmpl_id == ProductTemplate.id, isouter=True)
    )
    if filters:
        query = query.where(*filters)
    query = query.order_by(QualityCheck.create_date.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    checks = [
        {
            "id": row.id,
            "name": row.name,
            "product_name": row.product_name,
            "quality_state": row.quality_state,
            "measure": float(row.measure) if row.measure else None,
            "qty_tested": float(row.qty_tested) if row.qty_tested else None,
            "create_date": str(row.create_date) if row.create_date else None,
        }
        for row in result.all()
    ]
    return {"total": total, "checks": checks}
