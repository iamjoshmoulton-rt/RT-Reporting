from sqlalchemy import Column, Integer, String, Float, Date
from app.database import OdooBase


class CrossoveredBudget(OdooBase):
    __tablename__ = "crossovered_budget"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    state = Column(String)  # draft, confirm, done
    company_id = Column(Integer)


class AccountBudgetPost(OdooBase):
    __tablename__ = "account_budget_post"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)


class CrossoveredBudgetLine(OdooBase):
    __tablename__ = "crossovered_budget_lines"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    crossovered_budget_id = Column(Integer)
    general_budget_id = Column(Integer)
    date_from = Column(Date)
    date_to = Column(Date)
    planned_amount = Column(Float, default=0)
    company_id = Column(Integer)
