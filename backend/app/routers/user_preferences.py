import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Column, String, Integer, DateTime, select
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AppBase, get_app_db
from app.auth.dependencies import get_current_user
from app.auth.models import User


class UserPreference(AppBase):
    __tablename__ = "user_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    timezone = Column(String(100), nullable=True)
    default_date_range = Column(String(50), nullable=True)
    default_group_by = Column(String(20), nullable=True)
    landing_page = Column(String(100), nullable=True)
    theme = Column(String(20), nullable=True)
    auto_refresh_interval = Column(Integer, nullable=True)
    module_defaults = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


router = APIRouter(prefix="/api/user-preferences", tags=["User Preferences"])


class UserPreferenceResponse(BaseModel):
    timezone: str | None = None
    default_date_range: str | None = None
    default_group_by: str | None = None
    landing_page: str | None = None
    theme: str | None = None
    auto_refresh_interval: int | None = None
    module_defaults: dict = {}

    model_config = {"from_attributes": True}


class UserPreferenceUpdate(BaseModel):
    timezone: str | None = None
    default_date_range: str | None = None
    default_group_by: str | None = None
    landing_page: str | None = None
    theme: str | None = None
    auto_refresh_interval: int | None = None
    module_defaults: dict | None = None


@router.get("", response_model=UserPreferenceResponse)
async def get_preferences(
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    """Get current user's preferences. Creates default record if none exists."""
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    pref = result.scalar_one_or_none()
    if not pref:
        pref = UserPreference(user_id=user.id, module_defaults={})
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    return pref


@router.patch("", response_model=UserPreferenceResponse)
async def update_preferences(
    body: UserPreferenceUpdate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    """Partial update of user preferences. Merges module_defaults."""
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    pref = result.scalar_one_or_none()
    if not pref:
        pref = UserPreference(user_id=user.id, module_defaults={})
        db.add(pref)
        await db.flush()

    update_data = body.model_dump(exclude_unset=True)

    # Merge module_defaults instead of replacing
    if "module_defaults" in update_data and update_data["module_defaults"] is not None:
        existing = dict(pref.module_defaults or {})
        existing.update(update_data["module_defaults"])
        pref.module_defaults = existing
        del update_data["module_defaults"]

    for key, value in update_data.items():
        setattr(pref, key, value)

    pref.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(pref)
    return pref
