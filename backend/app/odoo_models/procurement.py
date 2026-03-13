from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from app.database import OdooBase


class PurchaseOrderStage(OdooBase):
    """PO processing pipeline stage (custom model)."""
    __tablename__ = "purchase_order_stage"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    sequence = Column(Integer)
    category = Column(String)  # Processing, Logistics, Quoting, Accounting


class PurchaseOrder(OdooBase):
    __tablename__ = "purchase_order"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    state = Column(String)  # draft, sent, to approve, purchase, done, cancel
    date_order = Column(DateTime)
    date_approve = Column(DateTime)
    date_planned = Column(DateTime)
    partner_id = Column(Integer)  # vendor
    user_id = Column(Integer)  # purchase representative
    company_id = Column(Integer)
    currency_id = Column(Integer)
    amount_untaxed = Column(Float)
    amount_tax = Column(Float)
    amount_total = Column(Float)
    invoice_status = Column(String)
    po_stage_id = Column(Integer)  # FK → purchase_order_stage
    x_studio_verified_count = Column(Integer)
    notes = Column(Text)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class PurchaseOrderLine(OdooBase):
    __tablename__ = "purchase_order_line"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer)
    product_id = Column(Integer)
    product_qty = Column(Float)
    qty_received = Column(Float)
    qty_invoiced = Column(Float)
    price_unit = Column(Float)
    price_subtotal = Column(Float)
    price_tax = Column(Float)
    price_total = Column(Float)
    name = Column(Text)
    date_planned = Column(DateTime)
    product_uom = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
