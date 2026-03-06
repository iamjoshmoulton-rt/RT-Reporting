import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, String, Boolean, DateTime, select, update
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AppBase, get_app_db
from app.auth.dependencies import get_current_user
from app.auth.models import User


class SavedFilter(AppBase):
    __tablename__ = "saved_filters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    page = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    filters = Column(JSONB, nullable=False, default=dict)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


router = APIRouter(prefix="/api/saved-filters", tags=["Saved Filters"])


class FilterCreate(BaseModel):
    page: str
    name: str
    filters: dict


class FilterResponse(BaseModel):
    id: str
    page: str
    name: str
    filters: dict
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[FilterResponse])
async def list_filters(
    page: str | None = None,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    query = select(SavedFilter).where(SavedFilter.user_id == user.id)
    if page:
        query = query.where(SavedFilter.page == page)
    query = query.order_by(SavedFilter.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=FilterResponse, status_code=201)
async def create_filter(
    body: FilterCreate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    f = SavedFilter(
        user_id=user.id,
        page=body.page,
        name=body.name,
        filters=body.filters,
    )
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return f


class FilterUpdate(BaseModel):
    name: str | None = None
    filters: dict | None = None


@router.patch("/{filter_id}", response_model=FilterResponse)
async def update_filter(
    filter_id: str,
    body: FilterUpdate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedFilter).where(
            SavedFilter.id == uuid.UUID(filter_id),
            SavedFilter.user_id == user.id,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Filter not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(f, key, value)
    await db.commit()
    await db.refresh(f)
    return f


@router.patch("/{filter_id}/set-default", response_model=FilterResponse)
async def set_filter_default(
    filter_id: str,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    """Set this filter as the default for its page, clearing any other default."""
    result = await db.execute(
        select(SavedFilter).where(
            SavedFilter.id == uuid.UUID(filter_id),
            SavedFilter.user_id == user.id,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Filter not found")

    # Clear existing defaults for this user+page
    await db.execute(
        update(SavedFilter)
        .where(
            SavedFilter.user_id == user.id,
            SavedFilter.page == f.page,
            SavedFilter.id != f.id,
        )
        .values(is_default=False)
    )

    # Toggle: if already default, unset it; otherwise set it
    f.is_default = not f.is_default
    await db.commit()
    await db.refresh(f)
    return f


@router.delete("/{filter_id}", status_code=204)
async def delete_filter(
    filter_id: str,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedFilter).where(
            SavedFilter.id == uuid.UUID(filter_id),
            SavedFilter.user_id == user.id,
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Filter not found")
    await db.delete(f)
    await db.commit()
