import uuid
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Column, String, DateTime, Date, Text, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AppBase, get_app_db
from app.auth.dependencies import get_current_user
from app.auth.models import User


class Annotation(AppBase):
    __tablename__ = "annotations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    page = Column(String(100), nullable=False, index=True)
    target_date = Column(Date, nullable=False, index=True)
    note = Column(Text, nullable=False)
    author_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


router = APIRouter(prefix="/api/annotations", tags=["Annotations"])


class AnnotationCreate(BaseModel):
    page: str
    target_date: date
    note: str


class AnnotationResponse(BaseModel):
    id: str
    page: str
    target_date: date
    note: str
    author_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AnnotationResponse])
async def list_annotations(
    page: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_app_db),
    _user: User = Depends(get_current_user),
):
    query = select(Annotation)
    if page:
        query = query.where(Annotation.page == page)
    if date_from:
        query = query.where(Annotation.target_date >= date_from)
    if date_to:
        query = query.where(Annotation.target_date <= date_to)
    query = query.order_by(Annotation.target_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=AnnotationResponse, status_code=201)
async def create_annotation(
    body: AnnotationCreate,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    annotation = Annotation(
        user_id=user.id,
        page=body.page,
        target_date=body.target_date,
        note=body.note,
        author_name=user.full_name,
    )
    db.add(annotation)
    await db.commit()
    await db.refresh(annotation)
    return annotation


@router.delete("/{annotation_id}", status_code=204)
async def delete_annotation(
    annotation_id: str,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Annotation).where(Annotation.id == uuid.UUID(annotation_id))
    )
    annotation = result.scalar_one_or_none()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if annotation.user_id != user.id and not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.delete(annotation)
    await db.commit()
