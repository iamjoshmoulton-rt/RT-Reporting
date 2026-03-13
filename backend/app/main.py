from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import AppSessionLocal
from app.auth.router import router as auth_router
from app.auth.seed import seed_roles, seed_superadmin
from app.routers.dashboard import router as dashboard_router
from app.routers.sales import router as sales_router
from app.routers.procurement import router as procurement_router
from app.routers.accounting import router as accounting_router
from app.routers.inventory import router as inventory_router
from app.routers.custom_dashboard import router as custom_dashboard_router
from app.routers.saved_filters import router as saved_filters_router
from app.routers.alerts import router as alerts_router
from app.routers.annotations import router as annotations_router
from app.routers.report_builder import router as report_builder_router
from app.routers.export import router as export_router
from app.routers.scheduled_reports import router as scheduled_reports_router
from app.routers.push import router as push_router
from app.routers.support import router as support_router
from app.routers.manufacturing import router as manufacturing_router
from app.routers.helpdesk import router as helpdesk_router
from app.routers.crm import router as crm_router
from app.routers.projects import router as projects_router
from app.routers.customers import router as customers_router
from app.routers.user_preferences import router as user_preferences_router
from app.routers.grading import router as grading_router
from app.routers.sales_dashboard import router as sales_dashboard_router
from app.routers.procurement_dashboard import router as procurement_dashboard_router
from app.routers.ecommerce import router as ecommerce_router
from app.routers.pricing_history import router as pricing_history_router
from app.scheduler.scheduler import start_scheduler, stop_scheduler
from app.middleware.timezone import UserTimezoneMiddleware
from app.services.grading_service import prewarm_cache as prewarm_grading_cache
from app.cache import close_redis


async def _seed_app_settings(db):
    from sqlalchemy import select
    from app.support.models import AppSetting
    result = await db.execute(select(AppSetting).where(AppSetting.key == "support_email"))
    if not result.scalar_one_or_none():
        db.add(AppSetting(key="support_email", value=""))
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging
    logger = logging.getLogger("rt_reporting.startup")

    settings = get_settings()

    try:
        logger.info("Connecting to app database (Neon)...")
        async with AppSessionLocal() as db:
            await seed_roles(db)
            await seed_superadmin(db)
            await _seed_app_settings(db)
        logger.info("App database seeded successfully.")
    except Exception as e:
        logger.error(f"App database connection failed: {e}")
        raise

    start_scheduler()

    # Pre-warm grading cache in background so first page load is fast
    import asyncio
    asyncio.create_task(prewarm_grading_cache())

    yield

    stop_scheduler()
    await close_redis()


app = FastAPI(
    title="RT Reporting",
    description="Reporting platform for Refreshed Tech - powered by Odoo v17 read replica",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()

# Support comma-separated FRONTEND_URL for multiple origins (e.g. local + production)
allowed_origins = [origin.strip() for origin in settings.frontend_url.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(UserTimezoneMiddleware)

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(sales_router)
app.include_router(procurement_router)
app.include_router(accounting_router)
app.include_router(inventory_router)
app.include_router(custom_dashboard_router)
app.include_router(saved_filters_router)
app.include_router(alerts_router)
app.include_router(annotations_router)
app.include_router(report_builder_router)
app.include_router(export_router)
app.include_router(scheduled_reports_router)
app.include_router(push_router)
app.include_router(support_router)
app.include_router(manufacturing_router)
app.include_router(helpdesk_router)
app.include_router(crm_router)
app.include_router(projects_router)
app.include_router(customers_router)
app.include_router(user_preferences_router)
app.include_router(grading_router)
app.include_router(sales_dashboard_router)
app.include_router(procurement_dashboard_router)
app.include_router(ecommerce_router)
app.include_router(pricing_history_router)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "rt-reporting"}
