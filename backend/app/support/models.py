import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import AppBase


class AppSetting(AppBase):
    __tablename__ = "app_settings"

    key = Column(String(200), primary_key=True)
    value = Column(Text, nullable=False, default="")


class SupportTicket(AppBase):
    __tablename__ = "support_tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject = Column(String(500), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False, default="medium")
    screenshot = Column(Text, nullable=True)
    recording_filename = Column(String(255), nullable=True)
    page_url = Column(String(2000), nullable=True)
    diagnostics = Column(JSONB, nullable=True)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_by_name = Column(String(255), nullable=False)
    submitted_by_email = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
