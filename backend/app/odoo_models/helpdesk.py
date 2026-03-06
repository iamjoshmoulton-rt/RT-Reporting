from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB
from app.database import OdooBase


class HelpdeskTicket(OdooBase):
    __tablename__ = "helpdesk_ticket"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    ticket_ref = Column(String)
    team_id = Column(Integer)
    stage_id = Column(Integer)
    partner_id = Column(Integer)
    partner_name = Column(String)
    partner_email = Column(String)
    user_id = Column(Integer)
    priority = Column(String)
    kanban_state = Column(String)
    description = Column(Text)
    active = Column(Boolean, default=True)
    close_date = Column(DateTime)
    assign_date = Column(DateTime)
    date_last_stage_update = Column(DateTime)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
    sla_deadline = Column(DateTime)
    sla_reached = Column(Boolean)
    sla_reached_late = Column(Boolean)
    rating_last_value = Column(Float)


class HelpdeskStage(OdooBase):
    __tablename__ = "helpdesk_stage"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(JSONB)  # {'en_US': 'Open'}
    sequence = Column(Integer)
    fold = Column(Boolean)
    active = Column(Boolean, default=True)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class HelpdeskTeam(OdooBase):
    __tablename__ = "helpdesk_team"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(JSONB)  # {'en_US': 'Support'}
    sequence = Column(Integer)
    active = Column(Boolean, default=True)
    use_sla = Column(Boolean)
    company_id = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
