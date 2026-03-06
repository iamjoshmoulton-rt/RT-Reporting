from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Date, Text
from sqlalchemy.dialects.postgresql import JSONB
from app.database import OdooBase


class ProjectProject(OdooBase):
    __tablename__ = "project_project"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(JSONB)  # {'en_US': 'Project Name'}
    active = Column(Boolean, default=True)
    user_id = Column(Integer)
    partner_id = Column(Integer)
    company_id = Column(Integer)
    date_start = Column(Date)
    date = Column(Date)  # end date
    sequence = Column(Integer)
    privacy_visibility = Column(String)
    allow_timesheets = Column(Boolean)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class ProjectTask(OdooBase):
    __tablename__ = "project_task"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    project_id = Column(Integer)
    stage_id = Column(Integer)
    parent_id = Column(Integer)
    partner_id = Column(Integer)
    company_id = Column(Integer)
    state = Column(String)  # 01_in_progress, 1_done, 1_canceled, 02_changes_requested, 03_approved
    priority = Column(String)
    active = Column(Boolean, default=True)
    date_deadline = Column(DateTime)
    date_assign = Column(DateTime)
    date_end = Column(DateTime)
    date_last_stage_update = Column(DateTime)
    allocated_hours = Column(Float)
    effective_hours = Column(Float)
    overtime = Column(Float)
    progress = Column(Integer)
    sequence = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class ProjectTaskType(OdooBase):
    __tablename__ = "project_task_type"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(JSONB)  # {'en_US': 'New'}
    sequence = Column(Integer)
    fold = Column(Boolean)
    active = Column(Boolean, default=True)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
