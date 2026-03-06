from datetime import date
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.crm import CrmLead, CrmStage
from app.services.tz import local_date, local_timestamp


def _stage_name():
    """Extract English stage name from JSONB name field."""
    return CrmStage.name["en_US"].as_string()


async def get_crm_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    # Open leads: active, not in Won/Lost-type stages (is_won != True and stage not fold)
    # Simpler: active and date_closed is null
    open_result = await db.execute(
        select(func.count(CrmLead.id)).where(
            CrmLead.active.is_(True),
            CrmLead.date_closed.is_(None),
        )
    )
    open_leads = open_result.scalar()

    # Pipeline value (expected_revenue on open leads)
    pipeline_result = await db.execute(
        select(func.coalesce(func.sum(CrmLead.expected_revenue), 0)).where(
            CrmLead.active.is_(True),
            CrmLead.date_closed.is_(None),
        )
    )
    pipeline_value = pipeline_result.scalar()

    # Won this period
    won_filters = [
        CrmLead.stage_id.in_(
            select(CrmStage.id).where(CrmStage.is_won.is_(True))
        ),
    ]
    if date_from:
        won_filters.append(local_date(CrmLead.date_closed) >= date_from)
    if date_to:
        won_filters.append(local_date(CrmLead.date_closed) <= date_to)

    won_result = await db.execute(
        select(func.count(CrmLead.id)).where(*won_filters)
    )
    won_count = won_result.scalar()

    # Conversion rate: won / (won + lost) in period
    closed_filters = [CrmLead.date_closed.isnot(None)]
    if date_from:
        closed_filters.append(local_date(CrmLead.date_closed) >= date_from)
    if date_to:
        closed_filters.append(local_date(CrmLead.date_closed) <= date_to)

    closed_result = await db.execute(
        select(func.count(CrmLead.id)).where(*closed_filters)
    )
    total_closed = closed_result.scalar()
    conversion_rate = round((won_count / total_closed * 100) if total_closed else 0, 1)

    return {
        "open_leads": open_leads,
        "pipeline_value": float(pipeline_value),
        "won_count": won_count,
        "conversion_rate": conversion_rate,
    }


async def get_pipeline_by_stage(
    db: AsyncSession,
):
    """Pipeline view: active leads grouped by stage with revenue."""
    result = await db.execute(
        select(
            _stage_name().label("stage_name"),
            CrmStage.sequence,
            func.count(CrmLead.id).label("lead_count"),
            func.coalesce(func.sum(CrmLead.expected_revenue), 0).label("expected_revenue"),
        )
        .join(CrmStage, CrmLead.stage_id == CrmStage.id)
        .where(CrmLead.active.is_(True))
        .group_by(_stage_name(), CrmStage.sequence)
        .order_by(CrmStage.sequence)
    )
    return [
        {
            "stage_name": row.stage_name,
            "lead_count": row.lead_count,
            "expected_revenue": float(row.expected_revenue),
        }
        for row in result.all()
    ]


async def get_leads_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    filters = []
    if date_from:
        filters.append(local_date(CrmLead.create_date) >= date_from)
    if date_to:
        filters.append(local_date(CrmLead.create_date) <= date_to)

    local_dt_expr = local_timestamp(CrmLead.create_date)
    if group_by == "day":
        period = local_date(CrmLead.create_date)
    elif group_by == "week":
        period = func.date_trunc("week", local_dt_expr)
    elif group_by == "year":
        period = func.date_trunc("year", local_dt_expr)
    else:
        period = func.date_trunc("month", local_dt_expr)

    query = (
        select(
            period.label("period"),
            func.count(CrmLead.id).label("lead_count"),
            func.coalesce(func.sum(CrmLead.expected_revenue), 0).label("expected_revenue"),
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
            "lead_count": row.lead_count,
            "expected_revenue": float(row.expected_revenue),
        }
        for row in result.all()
    ]


async def get_crm_leads(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    stage_id: int | None = None,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
):
    filters = []
    if date_from:
        filters.append(local_date(CrmLead.create_date) >= date_from)
    if date_to:
        filters.append(local_date(CrmLead.create_date) <= date_to)
    if stage_id:
        filters.append(CrmLead.stage_id == stage_id)
    if search:
        term = f"%{search}%"
        filters.append(or_(
            CrmLead.name.ilike(term),
            CrmLead.partner_name.ilike(term),
            CrmLead.email_from.ilike(term),
        ))

    count_q = select(func.count(CrmLead.id))
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            CrmLead.id,
            CrmLead.name,
            CrmLead.partner_name,
            CrmLead.email_from,
            CrmLead.expected_revenue,
            CrmLead.probability,
            CrmLead.priority,
            CrmLead.create_date,
            CrmLead.date_closed,
            _stage_name().label("stage_name"),
        )
        .join(CrmStage, CrmLead.stage_id == CrmStage.id, isouter=True)
    )
    if filters:
        query = query.where(*filters)
    query = query.order_by(CrmLead.create_date.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    leads = [
        {
            "id": row.id,
            "name": row.name,
            "partner_name": row.partner_name,
            "email_from": row.email_from,
            "expected_revenue": float(row.expected_revenue) if row.expected_revenue else 0,
            "probability": row.probability,
            "priority": row.priority,
            "stage_name": row.stage_name,
            "create_date": str(row.create_date) if row.create_date else None,
            "date_closed": str(row.date_closed) if row.date_closed else None,
        }
        for row in result.all()
    ]
    return {"total": total, "leads": leads}


async def get_lead_detail(db: AsyncSession, lead_id: int):
    """CRM lead/opportunity detail with stage info."""
    result = await db.execute(
        select(
            CrmLead.id, CrmLead.name, CrmLead.type,
            CrmLead.partner_name, CrmLead.email_from, CrmLead.phone,
            CrmLead.priority, CrmLead.expected_revenue,
            CrmLead.prorated_revenue, CrmLead.probability,
            CrmLead.active, CrmLead.date_deadline,
            CrmLead.date_closed, CrmLead.date_open,
            CrmLead.date_conversion, CrmLead.city,
            CrmLead.create_date, CrmLead.write_date,
            _stage_name().label("stage_name"),
            CrmStage.is_won,
        )
        .join(CrmStage, CrmLead.stage_id == CrmStage.id, isouter=True)
        .where(CrmLead.id == lead_id)
    )
    row = result.one_or_none()
    if not row:
        return None

    return {
        "lead": {
            "id": row.id, "name": row.name, "type": row.type,
            "partner_name": row.partner_name, "email_from": row.email_from,
            "phone": row.phone, "priority": row.priority,
            "expected_revenue": float(row.expected_revenue) if row.expected_revenue else 0,
            "prorated_revenue": float(row.prorated_revenue) if row.prorated_revenue else 0,
            "probability": row.probability,
            "active": row.active, "stage_name": row.stage_name,
            "is_won": row.is_won,
            "date_deadline": str(row.date_deadline) if row.date_deadline else None,
            "date_closed": str(row.date_closed) if row.date_closed else None,
            "date_open": str(row.date_open) if row.date_open else None,
            "date_conversion": str(row.date_conversion) if row.date_conversion else None,
            "city": row.city,
            "create_date": str(row.create_date) if row.create_date else None,
        },
    }
