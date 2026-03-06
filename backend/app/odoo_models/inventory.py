from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Numeric
from app.database import OdooBase


class StockQuant(OdooBase):
    __tablename__ = "stock_quant"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer)
    location_id = Column(Integer)
    lot_id = Column(Integer)
    package_id = Column(Integer)
    quantity = Column(Float)
    reserved_quantity = Column(Float)
    inventory_date = Column(DateTime)
    company_id = Column(Integer)
    write_date = Column(DateTime)
    create_date = Column(DateTime)


class StockMove(OdooBase):
    __tablename__ = "stock_move"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    product_id = Column(Integer)
    product_uom_qty = Column(Float)
    quantity = Column(Float)
    product_uom = Column(Integer)
    location_id = Column(Integer)
    location_dest_id = Column(Integer)
    picking_id = Column(Integer)
    state = Column(String)  # draft, waiting, confirmed, assigned, done, cancel
    origin = Column(String)
    reference = Column(String)
    date = Column(DateTime)
    company_id = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class StockPicking(OdooBase):
    __tablename__ = "stock_picking"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    origin = Column(String)
    partner_id = Column(Integer)
    picking_type_id = Column(Integer)
    location_id = Column(Integer)
    location_dest_id = Column(Integer)
    state = Column(String)  # draft, waiting, confirmed, assigned, done, cancel
    scheduled_date = Column(DateTime)
    date_done = Column(DateTime)
    company_id = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class StockLocation(OdooBase):
    __tablename__ = "stock_location"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    complete_name = Column(String)
    usage = Column(String)  # supplier, internal, customer, inventory, production, transit
    location_id = Column(Integer)  # parent
    company_id = Column(Integer)
    active = Column(Boolean, default=True)


class StockWarehouse(OdooBase):
    __tablename__ = "stock_warehouse"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    code = Column(String)
    company_id = Column(Integer)
    partner_id = Column(Integer)
    lot_stock_id = Column(Integer)


class StockMoveLine(OdooBase):
    """Individual stock move line (device-level tracking)."""
    __tablename__ = "stock_move_line"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    move_id = Column(Integer)
    picking_id = Column(Integer)
    product_id = Column(Integer)
    location_id = Column(Integer)
    location_dest_id = Column(Integer)
    quantity = Column(Numeric)
    state = Column(String)
    reference = Column(String)
    date = Column(DateTime)
    product_category_name = Column(String)
    uid_name = Column(String)
    lot_name = Column(String)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
