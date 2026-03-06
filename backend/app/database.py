import ssl as ssl_module
import logging
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

logger = logging.getLogger(__name__)


class AppBase(DeclarativeBase):
    """Base for app-owned tables (users, roles, permissions, etc.)."""
    pass


class OdooBase(DeclarativeBase):
    """Base for Odoo read-replica table mappings (read-only)."""
    pass


def _strip_sslmode(url: str) -> str:
    """Remove sslmode from URL query params (asyncpg doesn't understand it)."""
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    if "sslmode" in params:
        del params["sslmode"]
        new_query = urlencode(params, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
    return url


def _needs_ssl(url: str) -> dict:
    """Return connect_args for asyncpg SSL when needed."""
    if ".neon.tech" in url or ".rds.amazonaws.com" in url or "sslmode" in url:
        ctx = ssl_module.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl_module.CERT_NONE
        return {"ssl": ctx}
    return {}


settings = get_settings()

# Strip sslmode from URLs (asyncpg uses connect_args for SSL instead)
app_db_url = _strip_sslmode(settings.app_database_url)
odoo_db_url = _strip_sslmode(settings.odoo_database_url)

logger.info(f"App DB host: {urlparse(app_db_url).hostname}")
logger.info(f"Odoo DB host: {urlparse(odoo_db_url).hostname}")

app_engine = create_async_engine(
    app_db_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
    connect_args=_needs_ssl(settings.app_database_url),
)

odoo_engine = create_async_engine(
    odoo_db_url,
    echo=False,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    connect_args=_needs_ssl(settings.odoo_database_url),
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
