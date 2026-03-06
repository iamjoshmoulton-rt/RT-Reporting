import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, String, DateTime, Boolean, select, delete
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from pywebpush import webpush, WebPushException

from app.config import get_settings
from app.database import AppBase, get_app_db
from app.auth.dependencies import get_current_user
from app.auth.models import User

import json


class PushSubscription(AppBase):
    __tablename__ = "push_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    subscription = Column(JSONB, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


router = APIRouter(prefix="/api/push", tags=["Push Notifications"])


class SubscribeRequest(BaseModel):
    subscription: dict


@router.get("/vapid-key")
async def get_vapid_key():
    settings = get_settings()
    return {"public_key": settings.vapid_public_key}


@router.post("/subscribe", status_code=201)
async def subscribe(
    body: SubscribeRequest,
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    sub = PushSubscription(
        user_id=user.id,
        subscription=body.subscription,
    )
    db.add(sub)
    await db.commit()
    return {"status": "subscribed"}


@router.delete("/unsubscribe")
async def unsubscribe(
    db: AsyncSession = Depends(get_app_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        delete(PushSubscription).where(PushSubscription.user_id == user.id)
    )
    await db.commit()
    return {"status": "unsubscribed"}


async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/dashboard"):
    """Send a push notification to all of a user's subscribed devices."""
    settings = get_settings()
    if not settings.vapid_private_key:
        return

    from app.database import AppSessionLocal
    async with AppSessionLocal() as db:
        result = await db.execute(
            select(PushSubscription).where(PushSubscription.user_id == uuid.UUID(user_id))
        )
        subs = result.scalars().all()

        payload = json.dumps({
            "title": title,
            "body": body,
            "url": url,
            "icon": "/pwa-192x192.png",
            "badge": "/pwa-192x192.png",
        })

        for sub in subs:
            try:
                webpush(
                    subscription_info=sub.subscription,
                    data=payload,
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={
                        "sub": settings.vapid_claim_email,
                    },
                )
            except WebPushException:
                await db.delete(sub)

        await db.commit()
