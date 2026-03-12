from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, Text
from sqlalchemy.dialects.postgresql import JSONB
from app.database import OdooBase


class ResPartner(OdooBase):
    __tablename__ = "res_partner"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String)
    phone = Column(String)
    mobile = Column(String)
    street = Column(String)
    street2 = Column(String)
    city = Column(String)
    zip = Column(String)
    country_id = Column(Integer)
    state_id = Column(Integer)
    vat = Column(String)
    website = Column(String)
    is_company = Column(Boolean, default=False)
    customer_rank = Column(Integer, default=0)
    supplier_rank = Column(Integer, default=0)
    active = Column(Boolean, default=True)
    commercial_partner_id = Column(Integer)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class ResCompany(OdooBase):
    __tablename__ = "res_company"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    partner_id = Column(Integer)
    currency_id = Column(Integer)
    create_date = Column(DateTime)


class ResCurrency(OdooBase):
    __tablename__ = "res_currency"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    symbol = Column(String)
    active = Column(Boolean)


class ProductTemplate(OdooBase):
    __tablename__ = "product_template"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(JSONB)  # {'en_US': 'Product Name'}
    default_code = Column(String)
    type = Column(String)
    categ_id = Column(Integer)
    list_price = Column(Float)
    active = Column(Boolean, default=True)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class ProductProduct(OdooBase):
    __tablename__ = "product_product"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    product_tmpl_id = Column(Integer)
    default_code = Column(String)
    barcode = Column(String)
    grade = Column(String)
    active = Column(Boolean, default=True)
    create_date = Column(DateTime)
    write_date = Column(DateTime)


class ProductCategory(OdooBase):
    __tablename__ = "product_category"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(String)
    complete_name = Column(String)
    parent_id = Column(Integer)
    create_date = Column(DateTime)


class ResCountry(OdooBase):
    __tablename__ = "res_country"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(JSONB)  # {'en_US': 'United States'}
    code = Column(String)


class ResUsers(OdooBase):
    """Odoo users — display name lives on the linked res_partner record."""
    __tablename__ = "res_users"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    partner_id = Column(Integer)  # FK → res_partner for display name
    login = Column(String)
    active = Column(Boolean, default=True)


class CrmTeam(OdooBase):
    """Sales teams / channels (e.g. WhatNot, Flip, Wholesale)."""
    __tablename__ = "crm_team"
    __table_args__ = {"schema": "public"}

    id = Column(Integer, primary_key=True)
    name = Column(JSONB)  # {'en_US': 'WhatNot'}
    active = Column(Boolean, default=True)
