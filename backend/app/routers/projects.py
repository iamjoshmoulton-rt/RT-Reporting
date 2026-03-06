from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_odoo_db
from app.auth.dependencies import require_permission
from app.services.projects_service import (
    get_projects_summary,
    get_tasks_by_project,
    get_tasks_by_period,
    get_project_tasks,
    get_task_detail,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("/summary", dependencies=[Depends(require_permission("projects.summary"))])
async def summary(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
):
    return await get_projects_summary(db, date_from, date_to)


@router.get("/tasks-by-project", dependencies=[Depends(require_permission("projects.by_project"))])
async def tasks_by_project(
    db: AsyncSession = Depends(get_odoo_db),
    limit: int = Query(10, ge=1, le=50),
):
    return await get_tasks_by_project(db, limit)


@router.get("/by-period", dependencies=[Depends(require_permission("projects.tasks_chart"))])
async def by_period(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    group_by: str = Query("month"),
    compare_to: str | None = Query(None),
):
    current = await get_tasks_by_period(db, date_from, date_to, group_by)
    comparison = None
    if compare_to and date_from and date_to:
        delta = date_to - date_from
        if compare_to == "previous_period":
            comp_to = date_from - timedelta(days=1)
            comp_from = comp_to - delta
        else:
            comp_from = date_from.replace(year=date_from.year - 1)
            comp_to = date_to.replace(year=date_to.year - 1)
        comparison = await get_tasks_by_period(db, comp_from, comp_to, group_by)
    return {"current": current, "comparison": comparison}


@router.get("/tasks", dependencies=[Depends(require_permission("projects.task_table"))])
async def tasks(
    db: AsyncSession = Depends(get_odoo_db),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    project_id: int | None = Query(None),
    state: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
):
    return await get_project_tasks(db, date_from, date_to, project_id, state, offset, limit, search)


@router.get("/tasks/{task_id}", dependencies=[Depends(require_permission("projects.task_table"))])
async def task_detail(
    task_id: int,
    db: AsyncSession = Depends(get_odoo_db),
):
    result = await get_task_detail(db, task_id)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return result
