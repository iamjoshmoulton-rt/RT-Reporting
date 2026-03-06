import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_app_db
from app.auth.dependencies import require_permission
from app.auth.models import User
from app.scheduler.models import ScheduledReport
from app.scheduler.scheduler import add_report_job, remove_report_job
from app.scheduler.jobs import run_scheduled_report

router = APIRouter(prefix="/api/scheduled-reports", tags=["Scheduled Reports"])


class ScheduledReportCreate(BaseModel):
    name: str
    report_type: str
    cron_expression: str
    recipients: list[str]
    filters: dict = {}
    attachment_format: str = "excel"


class ScheduledReportUpdate(BaseModel):
    name: str | None = None
    cron_expression: str | None = None
    recipients: list[str] | None = None
    filters: dict | None = None
    attachment_format: str | None = None
    is_active: bool | None = None


class ScheduledReportResponse(BaseModel):
    id: str
    name: str
    report_type: str
    cron_expression: str
    recipients: list[str]
    filters: dict
    attachment_format: str
    is_active: bool
    last_sent_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def coerce_id(cls, v):
        return str(v) if v else v


@router.get("", response_model=list[ScheduledReportResponse])
async def list_scheduled_reports(
    db: AsyncSession = Depends(get_app_db),
    _user: User = Depends(require_permission("settings.manage")),
):
    result = await db.execute(select(ScheduledReport).order_by(ScheduledReport.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=ScheduledReportResponse, status_code=201)
async def create_scheduled_report(
    body: ScheduledReportCreate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(require_permission("settings.manage")),
):
    report = ScheduledReport(
        name=body.name,
        report_type=body.report_type,
        cron_expression=body.cron_expression,
        recipients=body.recipients,
        filters=body.filters,
        attachment_format=body.attachment_format,
        created_by=user.id,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    if report.is_active:
        add_report_job(
            str(report.id), report.cron_expression, run_scheduled_report,
            report_id=str(report.id), report_type=report.report_type,
            recipients=report.recipients, filters=report.filters,
            attachment_format=report.attachment_format,
        )

    return report


@router.patch("/{report_id}", response_model=ScheduledReportResponse)
async def update_scheduled_report(
    report_id: str,
    body: ScheduledReportUpdate,
    db: AsyncSession = Depends(get_app_db),
    _user: User = Depends(require_permission("settings.manage")),
):
    result = await db.execute(
        select(ScheduledReport).where(ScheduledReport.id == uuid.UUID(report_id))
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    for field in ["name", "cron_expression", "recipients", "filters", "attachment_format", "is_active"]:
        val = getattr(body, field, None)
        if val is not None:
            setattr(report, field, val)

    await db.commit()
    await db.refresh(report)

    if report.is_active:
        add_report_job(
            str(report.id), report.cron_expression, run_scheduled_report,
            report_id=str(report.id), report_type=report.report_type,
            recipients=report.recipients, filters=report.filters,
            attachment_format=report.attachment_format,
        )
    else:
        remove_report_job(str(report.id))

    return report


@router.delete("/{report_id}", status_code=204)
async def delete_scheduled_report(
    report_id: str,
    db: AsyncSession = Depends(get_app_db),
    _user: User = Depends(require_permission("settings.manage")),
):
    result = await db.execute(
        select(ScheduledReport).where(ScheduledReport.id == uuid.UUID(report_id))
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    remove_report_job(str(report.id))
    await db.delete(report)
    await db.commit()


@router.post("/{report_id}/test")
async def test_scheduled_report(
    report_id: str,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(require_permission("settings.manage")),
):
    result = await db.execute(
        select(ScheduledReport).where(ScheduledReport.id == uuid.UUID(report_id))
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Scheduled report not found")

    await run_scheduled_report(
        report_id=str(report.id),
        report_type=report.report_type,
        recipients=[user.email],
        filters=report.filters,
        attachment_format=report.attachment_format,
    )
    return {"status": "sent", "to": user.email}
