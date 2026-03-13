from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_database_url: str = "postgresql+asyncpg://rt_user:rt_password@app-db:5432/rt_reporting"
    odoo_database_url: str = "postgresql+asyncpg://odoo_reader:password@localhost:5432/odoo_db"

    jwt_secret_key: str = "change-this-secret-key"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    allowed_domain: str = "refreshedtech.com"

    vapid_private_key: str = ""
    vapid_public_key: str = ""
    vapid_claim_email: str = "mailto:admin@refreshedtech.com"

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_name: str = "RT Reporting"
    smtp_from_email: str = ""

    superadmin_emails: str = "ozzy@refreshedtech.com"

    business_timezone: str = "America/New_York"

    # JSON object mapping Odoo budget post names to KPI keys, e.g. {"Revenue":"invoiced_revenue","Margin":"invoiced_margin"}
    budget_kpi_mapping: str = "{}"

    redis_url: str = "redis://redis:6379/0"

    frontend_url: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
