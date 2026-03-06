from sqlalchemy import Column, Integer, String, DateTime, Numeric
from app.database import OdooBase


class QualityCheck(OdooBase):
    __tablename__ = "quality_check"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    product_id = Column(Integer)
    point_id = Column(Integer)
    team_id = Column(Integer)
    company_id = Column(Integer)
    test_type_id = Column(Integer)
    picking_id = Column(Integer)
    lot_id = Column(Integer)
    production_id = Column(Integer)
    workorder_id = Column(Integer)
    quality_state = Column(String)  # none, pass, fail
    measure = Column(Numeric)
    qty_tested = Column(Numeric)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class QualityPoint(OdooBase):
    __tablename__ = "quality_point"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    title = Column(String)
    team_id = Column(Integer)
    company_id = Column(Integer)
    test_type_id = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class QualityAlert(OdooBase):
    __tablename__ = "quality_alert"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    product_id = Column(Integer)
    product_tmpl_id = Column(Integer)
    lot_id = Column(Integer)
    team_id = Column(Integer)
    stage_id = Column(Integer)
    company_id = Column(Integer)
    user_id = Column(Integer)
    priority = Column(String)
    date_close = Column(DateTime)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
