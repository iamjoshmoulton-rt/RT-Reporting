from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Boolean, Text
from app.database import OdooBase


class AccountMove(OdooBase):
    __tablename__ = "account_move"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    move_type = Column(String)  # entry, out_invoice, out_refund, in_invoice, in_refund
    state = Column(String)      # draft, posted, cancel
    date = Column(Date)
    invoice_date = Column(Date)
    invoice_date_due = Column(Date)
    partner_id = Column(Integer)
    journal_id = Column(Integer)
    company_id = Column(Integer)
    currency_id = Column(Integer)
    amount_untaxed = Column(Float)
    amount_tax = Column(Float)
    amount_total = Column(Float)
    amount_residual = Column(Float)
    payment_state = Column(String)  # not_paid, in_payment, paid, partial, reversed
    invoice_user_id = Column(Integer)  # salesperson on the invoice
    invoice_origin = Column(String)
    ref = Column(String)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class AccountMoveLine(OdooBase):
    __tablename__ = "account_move_line"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    move_id = Column(Integer)
    account_id = Column(Integer)
    partner_id = Column(Integer)
    product_id = Column(Integer)
    name = Column(Text)
    debit = Column(Float)
    credit = Column(Float)
    balance = Column(Float)
    amount_currency = Column(Float)
    quantity = Column(Float)
    price_unit = Column(Float)
    discount = Column(Float)
    tax_line_id = Column(Integer)
    date = Column(Date)
    date_maturity = Column(Date)
    journal_id = Column(Integer)
    company_id = Column(Integer)
    currency_id = Column(Integer)
    parent_state = Column(String)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class AccountAccount(OdooBase):
    __tablename__ = "account_account"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    code = Column(String)
    name = Column(String)
    account_type = Column(String)
    company_id = Column(Integer)
    deprecated = Column(Boolean, default=False)


class AccountJournal(OdooBase):
    __tablename__ = "account_journal"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    code = Column(String)
    type = Column(String)  # sale, purchase, cash, bank, general
    company_id = Column(Integer)
