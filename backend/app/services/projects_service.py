from datetime import date, datetime
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.odoo_models.projects import ProjectProject, ProjectTask, ProjectTaskType
from app.services.tz import local_date, local_timestamp


def _project_name():
    """Extract English project name from JSONB name field."""
    return ProjectProject.name["en_US"].as_string()


def _stage_name():
    """Extract English stage name from JSONB name field."""
    return ProjectTaskType.name["en_US"].as_string()


async def get_projects_summary(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
):
    # Active projects
    active_result = await db.execute(
        select(func.count(ProjectProject.id)).where(
            ProjectProject.active.is_(True),
        )
    )
    active_projects = active_result.scalar()

    # Open tasks (not done or cancelled)
    open_result = await db.execute(
        select(func.count(ProjectTask.id)).where(
            ProjectTask.active.is_(True),
            ProjectTask.state.notin_(["1_done", "1_canceled"]),
        )
    )
    open_tasks = open_result.scalar()

    # Completed this period
    completed_filters = [ProjectTask.state == "1_done"]
    if date_from:
        completed_filters.append(local_date(ProjectTask.date_last_stage_update) >= date_from)
    if date_to:
        completed_filters.append(local_date(ProjectTask.date_last_stage_update) <= date_to)

    completed_result = await db.execute(
        select(func.count(ProjectTask.id)).where(*completed_filters)
    )
    completed_tasks = completed_result.scalar()

    # Overdue tasks (deadline in the past, not done/cancelled)
    overdue_result = await db.execute(
        select(func.count(ProjectTask.id)).where(
            ProjectTask.active.is_(True),
            ProjectTask.state.notin_(["1_done", "1_canceled"]),
            ProjectTask.date_deadline.isnot(None),
            ProjectTask.date_deadline < func.now(),
        )
    )
    overdue_tasks = overdue_result.scalar()

    return {
        "active_projects": active_projects,
        "open_tasks": open_tasks,
        "completed_tasks": completed_tasks,
        "overdue_tasks": overdue_tasks,
    }


async def get_tasks_by_project(
    db: AsyncSession,
    limit: int = 10,
):
    """Top projects by open task count."""
    result = await db.execute(
        select(
            _project_name().label("project_name"),
            func.count(ProjectTask.id).label("task_count"),
        )
        .join(ProjectProject, ProjectTask.project_id == ProjectProject.id)
        .where(
            ProjectTask.active.is_(True),
            ProjectTask.state.notin_(["1_done", "1_canceled"]),
        )
        .group_by(_project_name())
        .order_by(func.count(ProjectTask.id).desc())
        .limit(limit)
    )
    return [
        {
            "project_name": row.project_name,
            "task_count": row.task_count,
        }
        for row in result.all()
    ]


async def get_tasks_by_period(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "month",
):
    """Task completions by period (uses date_last_stage_update for done tasks)."""
    filters = [ProjectTask.state == "1_done"]
    if date_from:
        filters.append(local_date(ProjectTask.date_last_stage_update) >= date_from)
    if date_to:
        filters.append(local_date(ProjectTask.date_last_stage_update) <= date_to)

    local_dt_expr = local_timestamp(ProjectTask.date_last_stage_update)
    if group_by == "day":
        period = local_date(ProjectTask.date_last_stage_update)
    elif group_by == "week":
        period = func.date_trunc("week", local_dt_expr)
    elif group_by == "year":
        period = func.date_trunc("year", local_dt_expr)
    else:
        period = func.date_trunc("month", local_dt_expr)

    query = (
        select(
            period.label("period"),
            func.count(ProjectTask.id).label("task_count"),
        )
        .where(*filters)
        .group_by(period)
        .order_by(period)
    )

    result = await db.execute(query)
    return [
        {
            "period": str(row.period),
            "task_count": row.task_count,
        }
        for row in result.all()
    ]


async def get_project_tasks(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    project_id: int | None = None,
    state: str | None = None,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
):
    filters = []
    if date_from:
        filters.append(local_date(ProjectTask.create_date) >= date_from)
    if date_to:
        filters.append(local_date(ProjectTask.create_date) <= date_to)
    if project_id:
        filters.append(ProjectTask.project_id == project_id)
    if state:
        filters.append(ProjectTask.state == state)
    if search:
        term = f"%{search}%"
        filters.append(or_(
            ProjectTask.name.ilike(term),
        ))

    count_q = select(func.count(ProjectTask.id))
    if filters:
        count_q = count_q.where(*filters)
    total = (await db.execute(count_q)).scalar()

    query = (
        select(
            ProjectTask.id,
            ProjectTask.name,
            ProjectTask.state,
            ProjectTask.priority,
            ProjectTask.date_deadline,
            ProjectTask.allocated_hours,
            ProjectTask.effective_hours,
            ProjectTask.progress,
            ProjectTask.create_date,
            _project_name().label("project_name"),
            _stage_name().label("stage_name"),
        )
        .join(ProjectProject, ProjectTask.project_id == ProjectProject.id, isouter=True)
        .join(ProjectTaskType, ProjectTask.stage_id == ProjectTaskType.id, isouter=True)
    )
    if filters:
        query = query.where(*filters)
    query = query.order_by(ProjectTask.create_date.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    tasks = [
        {
            "id": row.id,
            "name": row.name,
            "project_name": row.project_name,
            "stage_name": row.stage_name,
            "state": row.state,
            "priority": row.priority,
            "date_deadline": str(row.date_deadline) if row.date_deadline else None,
            "allocated_hours": row.allocated_hours,
            "effective_hours": row.effective_hours,
            "progress": row.progress,
            "create_date": str(row.create_date) if row.create_date else None,
        }
        for row in result.all()
    ]
    return {"total": total, "tasks": tasks}


async def get_task_detail(db: AsyncSession, task_id: int):
    """Project task detail with project and stage info."""
    result = await db.execute(
        select(
            ProjectTask.id, ProjectTask.name, ProjectTask.state,
            ProjectTask.priority, ProjectTask.active,
            ProjectTask.date_deadline, ProjectTask.date_assign,
            ProjectTask.date_end, ProjectTask.date_last_stage_update,
            ProjectTask.allocated_hours, ProjectTask.effective_hours,
            ProjectTask.overtime, ProjectTask.progress,
            ProjectTask.create_date, ProjectTask.write_date,
            _project_name().label("project_name"),
            _stage_name().label("stage_name"),
        )
        .join(ProjectProject, ProjectTask.project_id == ProjectProject.id, isouter=True)
        .join(ProjectTaskType, ProjectTask.stage_id == ProjectTaskType.id, isouter=True)
        .where(ProjectTask.id == task_id)
    )
    row = result.one_or_none()
    if not row:
        return None

    return {
        "task": {
            "id": row.id, "name": row.name, "state": row.state,
            "priority": row.priority, "active": row.active,
            "project_name": row.project_name, "stage_name": row.stage_name,
            "date_deadline": str(row.date_deadline) if row.date_deadline else None,
            "date_assign": str(row.date_assign) if row.date_assign else None,
            "date_end": str(row.date_end) if row.date_end else None,
            "date_last_stage_update": str(row.date_last_stage_update) if row.date_last_stage_update else None,
            "allocated_hours": row.allocated_hours,
            "effective_hours": row.effective_hours,
            "overtime": row.overtime,
            "progress": row.progress,
            "create_date": str(row.create_date) if row.create_date else None,
        },
    }
