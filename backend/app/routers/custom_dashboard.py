import uuid
from datetime import datetime

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import Column, String, Boolean, DateTime, select, update
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AppBase, get_app_db
from app.auth.dependencies import get_current_user
from app.auth.models import User


class DashboardLayout(AppBase):
    __tablename__ = "dashboard_layouts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    layout = Column(JSONB, nullable=False, default=list)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


router = APIRouter(prefix="/api/dashboards", tags=["Custom Dashboards"])


class LayoutWidget(BaseModel):
    i: str
    x: int
    y: int
    w: int
    h: int
    widget_type: str
    config: dict = {}


class DashboardCreate(BaseModel):
    name: str
    layout: list[LayoutWidget] = []


class DashboardUpdate(BaseModel):
    name: str | None = None
    layout: list[LayoutWidget] | None = None
    is_default: bool | None = None


class DashboardResponse(BaseModel):
    id: str
    name: str
    layout: list[dict]
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def id_to_str(cls, v):
        return str(v) if v is not None else v


@router.get("", response_model=list[DashboardResponse])
async def list_dashboards(
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DashboardLayout).where(DashboardLayout.user_id == user.id).order_by(DashboardLayout.updated_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=DashboardResponse, status_code=201)
async def create_dashboard(
    body: DashboardCreate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    layout = DashboardLayout(
        user_id=user.id,
        name=body.name,
        layout=[w.model_dump() for w in body.layout],
    )
    db.add(layout)
    await db.commit()
    await db.refresh(layout)
    return layout


@router.put("/{dashboard_id}", response_model=DashboardResponse)
async def update_dashboard(
    dashboard_id: str,
    body: DashboardUpdate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DashboardLayout).where(
            DashboardLayout.id == uuid.UUID(dashboard_id),
            DashboardLayout.user_id == user.id,
        )
    )
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    if body.name is not None:
        layout.name = body.name
    if body.layout is not None:
        layout.layout = [w.model_dump() for w in body.layout]
    if body.is_default is not None:
        if body.is_default:
            await db.execute(
                update(DashboardLayout)
                .where(DashboardLayout.user_id == user.id)
                .values(is_default=False)
            )
        layout.is_default = body.is_default

    await db.commit()
    await db.refresh(layout)
    return layout


@router.delete("/{dashboard_id}", status_code=204)
async def delete_dashboard(
    dashboard_id: str,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DashboardLayout).where(
            DashboardLayout.id == uuid.UUID(dashboard_id),
            DashboardLayout.user_id == user.id,
        )
    )
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    await db.delete(layout)
    await db.commit()
