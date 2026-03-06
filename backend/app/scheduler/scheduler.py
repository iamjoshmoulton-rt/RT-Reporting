import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler stopped")


def add_report_job(job_id: str, cron_expression: str, func, **kwargs):
    parts = cron_expression.split()
    if len(parts) != 5:
        logger.error(f"Invalid cron expression: {cron_expression}")
        return

    trigger = CronTrigger(
        minute=parts[0],
        hour=parts[1],
        day=parts[2],
        month=parts[3],
        day_of_week=parts[4],
    )

    scheduler.add_job(
        func,
        trigger=trigger,
        id=job_id,
        replace_existing=True,
        kwargs=kwargs,
    )
    logger.info(f"Scheduled job {job_id} with cron: {cron_expression}")


def remove_report_job(job_id: str):
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass
