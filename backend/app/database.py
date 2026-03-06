from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings


class AppBase(DeclarativeBase):
    """Base for app-owned tables (users, roles, permissions, etc.)."""
    pass


class OdooBase(DeclarativeBase):
    """Base for Odoo read-replica table mappings (read-only)."""
    pass


settings = get_settings()

app_engine = create_async_engine(
    settings.app_database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
)

odoo_engine = create_async_engine(
    settings.odoo_database_url,
    echo=False,
    pool_size=20,
    max_overflow=30,
    pool_pre_ping=True,
)

AppSessionLocal = async_sessionmaker(
    app_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

OdooSessionLocal = async_sessionmaker(
    odoo_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_app_db() -> AsyncSession:
    async with AppSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_odoo_db() -> AsyncSession:
    async with OdooSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_app_db():
    async with app_engine.begin() as conn:
        await conn.run_sync(AppBase.metadata.create_all)
