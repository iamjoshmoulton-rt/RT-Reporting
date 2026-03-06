from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Numeric
from app.database import OdooBase


class MrpProduction(OdooBase):
    __tablename__ = "mrp_production"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    product_id = Column(Integer)
    product_qty = Column(Numeric)
    product_uom_qty = Column(Float)
    qty_producing = Column(Numeric)
    state = Column(String)  # draft, confirmed, progress, to_close, done, cancel
    priority = Column(String)
    origin = Column(String)
    user_id = Column(Integer)
    company_id = Column(Integer)
    bom_id = Column(Integer)
    picking_type_id = Column(Integer)
    location_src_id = Column(Integer)
    location_dest_id = Column(Integer)
    date_start = Column(DateTime)
    date_finished = Column(DateTime)
    date_deadline = Column(DateTime)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class MrpBom(OdooBase):
    __tablename__ = "mrp_bom"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    product_tmpl_id = Column(Integer)
    product_id = Column(Integer)
    product_qty = Column(Float)
    code = Column(String)
    type = Column(String)  # normal, phantom
    company_id = Column(Integer)
    active = Column(Boolean, default=True)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class MrpBomLine(OdooBase):
    __tablename__ = "mrp_bom_line"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    bom_id = Column(Integer)
    product_id = Column(Integer)
    product_qty = Column(Float)
    product_uom_id = Column(Integer)
    company_id = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
