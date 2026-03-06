import uuid
from datetime import datetime
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, String, Boolean, DateTime, Float, Integer, Text, select
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AppBase, get_app_db
from app.auth.dependencies import get_current_user
from app.auth.models import User


class AlertRule(AppBase):
    __tablename__ = "alert_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    metric = Column(String(100), nullable=False)
    condition = Column(String(20), nullable=False)  # lt, gt, eq, lte, gte
    threshold = Column(Float, nullable=False)
    notify_email = Column(Boolean, default=True)
    notify_push = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertHistory(AppBase):
    __tablename__ = "alert_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    metric_value = Column(Float, nullable=False)
    message = Column(Text, nullable=False)
    acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


router = APIRouter(prefix="/api/alerts", tags=["Smart Alerts"])


AVAILABLE_METRICS = [
    {"key": "sales.daily_revenue", "label": "Daily Sales Revenue", "unit": "$"},
    {"key": "sales.daily_orders", "label": "Daily Order Count", "unit": ""},
    {"key": "sales.avg_order_value", "label": "Average Order Value", "unit": "$"},
    {"key": "procurement.daily_spend", "label": "Daily Procurement Spend", "unit": "$"},
    {"key": "accounting.outstanding_receivable", "label": "Outstanding Receivables", "unit": "$"},
    {"key": "accounting.outstanding_payable", "label": "Outstanding Payables", "unit": "$"},
    {"key": "inventory.low_stock_products", "label": "Products Below Safety Stock", "unit": ""},
    {"key": "manufacturing.active_mos", "label": "Active Manufacturing Orders", "unit": ""},
    {"key": "helpdesk.open_tickets", "label": "Open Helpdesk Tickets", "unit": ""},
    {"key": "helpdesk.avg_resolution_days", "label": "Avg Ticket Resolution (days)", "unit": "days"},
    {"key": "crm.pipeline_value", "label": "CRM Pipeline Value", "unit": "$"},
    {"key": "crm.open_leads", "label": "Open CRM Leads", "unit": ""},
    {"key": "projects.overdue_tasks", "label": "Overdue Project Tasks", "unit": ""},
    {"key": "projects.open_tasks", "label": "Open Project Tasks", "unit": ""},
]


class AlertRuleCreate(BaseModel):
    name: str
    metric: str
    condition: str
    threshold: float
    notify_email: bool = True
    notify_push: bool = True


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    threshold: float | None = None
    condition: str | None = None
    notify_email: bool | None = None
    notify_push: bool | None = None
    is_active: bool | None = None


class AlertRuleResponse(BaseModel):
    id: str
    name: str
    metric: str
    condition: str
    threshold: float
    notify_email: bool
    notify_push: bool
    is_active: bool
    last_triggered_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertHistoryResponse(BaseModel):
    id: str
    rule_id: str
    metric_value: float
    message: str
    acknowledged: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/metrics")
async def list_metrics():
    return AVAILABLE_METRICS


@router.get("/rules", response_model=list[AlertRuleResponse])
async def list_rules(
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AlertRule).where(AlertRule.user_id == user.id).order_by(AlertRule.created_at.desc())
    )
    return result.scalars().all()


@router.post("/rules", response_model=AlertRuleResponse, status_code=201)
async def create_rule(
    body: AlertRuleCreate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    rule = AlertRule(
        user_id=user.id,
        name=body.name,
        metric=body.metric,
        condition=body.condition,
        threshold=body.threshold,
        notify_email=body.notify_email,
        notify_push=body.notify_push,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_rule(
    rule_id: str,
    body: AlertRuleUpdate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == uuid.UUID(rule_id), AlertRule.user_id == user.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    for field in ["name", "threshold", "condition", "notify_email", "notify_push", "is_active"]:
        val = getattr(body, field, None)
        if val is not None:
            setattr(rule, field, val)

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AlertRule).where(AlertRule.id == uuid.UUID(rule_id), AlertRule.user_id == user.id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    await db.delete(rule)
    await db.commit()


@router.get("/history", response_model=list[AlertHistoryResponse])
async def get_history(
    limit: int = 50,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AlertHistory)
        .where(AlertHistory.user_id == user.id)
        .order_by(AlertHistory.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.patch("/history/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AlertHistory).where(
            AlertHistory.id == uuid.UUID(alert_id),
            AlertHistory.user_id == user.id,
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = True
    await db.commit()
    return {"status": "acknowledged"}
