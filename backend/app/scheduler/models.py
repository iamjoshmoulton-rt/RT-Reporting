import uuid
from datetime import datetime

from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

from app.database import AppBase


class ScheduledReport(AppBase):
    __tablename__ = "scheduled_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    report_type = Column(String(50), nullable=False)  # summary, sales, procurement, accounting, inventory
    cron_expression = Column(String(100), nullable=False)  # e.g. "0 8 * * 1" (Monday 8am)
    recipients = Column(ARRAY(String), nullable=False)
    filters = Column(JSONB, default=dict)
    attachment_format = Column(String(20), default="excel")  # excel, pdf, both
    is_active = Column(Boolean, default=True)
    last_sent_at = Column(DateTime, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
