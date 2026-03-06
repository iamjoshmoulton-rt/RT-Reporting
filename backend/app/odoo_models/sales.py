from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Boolean, Text
from app.database import OdooBase


class SaleOrder(OdooBase):
    __tablename__ = "sale_order"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    state = Column(String)  # draft, sent, sale, done, cancel
    date_order = Column(DateTime)
    partner_id = Column(Integer)
    partner_invoice_id = Column(Integer)
    partner_shipping_id = Column(Integer)
    user_id = Column(Integer)  # salesperson
    team_id = Column(Integer)  # sales team
    company_id = Column(Integer)
    currency_id = Column(Integer)
    amount_untaxed = Column(Float)
    amount_tax = Column(Float)
    amount_total = Column(Float)
    invoice_status = Column(String)  # upselling, invoiced, to invoice, no
    margin = Column(Float, default=0)
    commitment_date = Column(DateTime)
    note = Column(Text)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class SaleOrderLine(OdooBase):
    __tablename__ = "sale_order_line"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer)
    product_id = Column(Integer)
    product_uom_qty = Column(Float)
    qty_delivered = Column(Float)
    qty_invoiced = Column(Float)
    price_unit = Column(Float)
    discount = Column(Float)
    price_subtotal = Column(Float)
    price_tax = Column(Float)
    price_total = Column(Float)
    purchase_price = Column(Float, default=0)
    margin = Column(Float, default=0)
    name = Column(Text)
    state = Column(String)
    product_uom = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)
