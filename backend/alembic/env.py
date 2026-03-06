from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import AppBase
from app.auth.models import User, Role, Permission, ApiKey  # noqa: F401
from app.support.models import AppSetting, SupportTicket  # noqa: F401
from app.scheduler.models import ScheduledReport  # noqa: F401
from app.routers.custom_dashboard import DashboardLayout  # noqa: F401
from app.routers.report_builder import SavedReport  # noqa: F401
from app.routers.alerts import AlertRule, AlertHistory  # noqa: F401
from app.routers.annotations import Annotation  # noqa: F401
from app.routers.saved_filters import SavedFilter  # noqa: F401
from app.routers.push import PushSubscription  # noqa: F401
from app.routers.user_preferences import UserPreference  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = AppBase.metadata

db_url = os.getenv("APP_DATABASE_URL", "").replace("+asyncpg", "")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
