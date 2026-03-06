from datetime import date
from sqlalchemy import select, func, case, text, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.helpdesk import HelpdeskTicket, HelpdeskStage, HelpdeskTeam
from app.services.tz import local_date, local_timestamp


def _stage_name():
    """Extract English stage name from JSONB name field."""
    return HelpdeskStage.name["en_US"].as_string()


def _team_name():
    """Extract English team name from JSONB name field."""
    return HelpdeskTeam.name["en_US"].as_string()


async def get_helpdesk_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    # Open tickets (no close_date, active)
    open_result = await db.execute(
        select(func.count(HelpdeskTicket.id)).where(
            HelpdeskTicket.close_date.is_(None),
            HelpdeskTicket.active.is_(True),
        )
    )
    open_tickets = open_result.scalar()

    # Period-filtered: new tickets created
    new_filters = []
    if date_from:
        new_filters.append(local_date(HelpdeskTicket.create_date) >= date_from)
    if date_to:
        new_filters.append(local_date(HelpdeskTicket.create_date) <= date_to)

    new_result = await db.execute(
        select(func.count(HelpdeskTicket.id)).where(*new_filters) if new_filters
        else select(func.count(HelpdeskTicket.id))
    )
    new_tickets = new_result.scalar()

    # Closed this period
    closed_filters = [HelpdeskTicket.close_date.isnot(None)]
    if date_from:
        closed_filters.append(local_date(HelpdeskTicket.close_date) >= date_from)
    if date_to:
        closed_filters.append(local_date(HelpdeskTicket.close_date) <= date_to)

    closed_result = await db.execute(
        select(func.count(HelpdeskTicket.id)).where(*closed_filters)
    )
    closed_tickets = closed_result.scalar()

    # Avg resolution days (for closed tickets in period)
    avg_result = await db.execute(
        select(
            func.coalesce(
                func.avg(
                    func.extract("epoch", HelpdeskTicket.close_date)
                    - func.extract("epoch", HelpdeskTicket.create_date)
                )
                / 86400,
                0,
            )
        ).where(*closed_filters)
    )
    avg_resolution_days = avg_result.scalar()

    return {
        "open_tickets": open_tickets,
        "new_tickets": new_tickets,
        "closed_tickets": closed_tickets,
        "avg_resolution_days": round(float(avg_resolution_days), 1),
    }


async def get_tickets_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    filters = []
    if date_from:
        filters.append(local_date(HelpdeskTicket.create_date) >= date_from)
    if date_to:
        filters.append(local_date(HelpdeskTicket.create_date) <= date_to)

    local_dt_expr = local_timestamp(HelpdeskTicket.create_date)
    if group_by == "day":
        period = local_date(HelpdeskTicket.create_date)
    elif group_by == "week":
        period = func.date_trunc("week", local_dt_expr)
    elif group_by == "year":
        period = func.date_trunc("year", local_dt_expr)
    else:
        period = func.date_trunc("month", local_dt_expr)

    query = (
        select(
            period.label("period"),
            func.count(HelpdeskTicket.id).label("ticket_count"),
            func.count(HelpdeskTicket.close_date).label("closed_count"),
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
            "ticket_count": row.ticket_count,
            "closed_count": row.closed_count,
        }
        for row in result.all()
    ]


async def get_tickets_by_stage(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    filters = []
    if date_from:
        filters.append(local_date(HelpdeskTicket.create_date) >= date_from)
    if date_to:
        filters.append(local_date(HelpdeskTicket.create_date) <= date_to)

    stage_label = _stage_name().label("stage_name")
    query = (
        select(
            stage_label,
            func.count(HelpdeskTicket.id).label("ticket_count"),
        )
        .join(HelpdeskStage, HelpdeskTicket.stage_id == HelpdeskStage.id)
        .group_by(_stage_name())
        .order_by(func.count(HelpdeskTicket.id).desc())
    )
    if filters:
        query = query.where(*filters)

    result = await db.execute(query)
    return [
        {
            "stage_name": row.stage_name,
            "ticket_count": row.ticket_count,
        }
        for row in result.all()
    ]


async def get_helpdesk_tickets(
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
        filters.append(local_date(HelpdeskTicket.create_date) >= date_from)
    if date_to:
        filters.append(local_date(HelpdeskTicket.create_date) <= date_to)
    if stage_id:
        filters.append(HelpdeskTicket.stage_id == stage_id)
    if search:
        term = f"%{search}%"
        filters.append(or_(
            HelpdeskTicket.ticket_ref.ilike(term),
            HelpdeskTicket.name.ilike(term),
            HelpdeskTicket.partner_name.ilike(term),
            HelpdeskTicket.partner_email.ilike(term),
        ))

    count_q = select(func.count(HelpdeskTicket.id))
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            HelpdeskTicket.id,
            HelpdeskTicket.ticket_ref,
            HelpdeskTicket.name,
            HelpdeskTicket.partner_name,
            HelpdeskTicket.partner_email,
            HelpdeskTicket.priority,
            HelpdeskTicket.create_date,
            HelpdeskTicket.close_date,
            _stage_name().label("stage_name"),
            _team_name().label("team_name"),
        )
        .join(HelpdeskStage, HelpdeskTicket.stage_id == HelpdeskStage.id, isouter=True)
        .join(HelpdeskTeam, HelpdeskTicket.team_id == HelpdeskTeam.id, isouter=True)
    )
    if filters:
        query = query.where(*filters)
    query = query.order_by(HelpdeskTicket.create_date.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    tickets = [
        {
            "id": row.id,
            "ticket_ref": row.ticket_ref,
            "name": row.name,
            "partner_name": row.partner_name,
            "partner_email": row.partner_email,
            "priority": row.priority,
            "stage_name": row.stage_name,
            "team_name": row.team_name,
            "create_date": str(row.create_date) if row.create_date else None,
            "close_date": str(row.close_date) if row.close_date else None,
        }
        for row in result.all()
    ]
    return {"total": total, "tickets": tickets}


async def get_ticket_detail(db: AsyncSession, ticket_id: int):
    """Helpdesk ticket detail with stage, team, and SLA info."""
    result = await db.execute(
        select(
            HelpdeskTicket.id, HelpdeskTicket.name, HelpdeskTicket.ticket_ref,
            HelpdeskTicket.partner_name, HelpdeskTicket.partner_email,
            HelpdeskTicket.priority, HelpdeskTicket.kanban_state,
            HelpdeskTicket.description, HelpdeskTicket.active,
            HelpdeskTicket.close_date, HelpdeskTicket.assign_date,
            HelpdeskTicket.sla_deadline, HelpdeskTicket.sla_reached,
            HelpdeskTicket.rating_last_value,
            HelpdeskTicket.create_date, HelpdeskTicket.write_date,
            _stage_name().label("stage_name"),
            _team_name().label("team_name"),
        )
        .join(HelpdeskStage, HelpdeskTicket.stage_id == HelpdeskStage.id, isouter=True)
        .join(HelpdeskTeam, HelpdeskTicket.team_id == HelpdeskTeam.id, isouter=True)
        .where(HelpdeskTicket.id == ticket_id)
    )
    row = result.one_or_none()
    if not row:
        return None

    # Resolution time in days
    resolution_days = None
    if row.close_date and row.create_date:
        delta = row.close_date - row.create_date
        resolution_days = round(delta.total_seconds() / 86400, 1)

    return {
        "ticket": {
            "id": row.id, "name": row.name, "ticket_ref": row.ticket_ref,
            "partner_name": row.partner_name, "partner_email": row.partner_email,
            "priority": row.priority, "kanban_state": row.kanban_state,
            "description": row.description, "active": row.active,
            "stage_name": row.stage_name, "team_name": row.team_name,
            "close_date": str(row.close_date) if row.close_date else None,
            "assign_date": str(row.assign_date) if row.assign_date else None,
            "sla_deadline": str(row.sla_deadline) if row.sla_deadline else None,
            "sla_reached": row.sla_reached,
            "rating_last_value": row.rating_last_value,
            "resolution_days": resolution_days,
            "create_date": str(row.create_date) if row.create_date else None,
        },
    }
