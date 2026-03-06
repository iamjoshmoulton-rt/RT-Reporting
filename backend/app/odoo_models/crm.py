from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Numeric, Date
from sqlalchemy.dialects.postgresql import JSONB
from app.database import OdooBase


class CrmLead(OdooBase):
    __tablename__ = "crm_lead"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    type = Column(String)  # lead, opportunity
    partner_id = Column(Integer)
    partner_name = Column(String)
    email_from = Column(String)
    phone = Column(String)
    user_id = Column(Integer)
    team_id = Column(Integer)
    stage_id = Column(Integer)
    priority = Column(String)
    expected_revenue = Column(Numeric)
    prorated_revenue = Column(Numeric)
    probability = Column(Float)
    active = Column(Boolean, default=True)
    date_deadline = Column(Date)
    date_closed = Column(DateTime)
    date_open = Column(DateTime)
    date_conversion = Column(DateTime)
    lost_reason_id = Column(Integer)
    city = Column(String)
    country_id = Column(Integer)
    company_id = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class CrmStage(OdooBase):
    __tablename__ = "crm_stage"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(JSONB)  # {'en_US': 'New'}
    sequence = Column(Integer)
    is_won = Column(Boolean)
    fold = Column(Boolean)
    team_id = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
