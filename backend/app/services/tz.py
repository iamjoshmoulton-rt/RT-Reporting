"""Timezone-aware date helpers for Odoo UTC timestamps."""

import contextvars
from sqlalchemy import func, literal

from app.config import get_settings

# Request-scoped timezone (set by middleware from X-User-Timezone header).
# When set, all local_date() calls use it; otherwise business_timezone is used.
_request_timezone: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_timezone", default=None)


def set_request_timezone(tz: str | None) -> None:
    """Set the timezone for the current request (e.g. from X-User-Timezone header)."""
    _request_timezone.set(tz)


def get_request_timezone() -> str | None:
    """Return the request timezone if set."""
    return _request_timezone.get()


def get_effective_timezone() -> str:
    """Return the timezone to use for this request (user header or config)."""
    return get_request_timezone() or get_settings().business_timezone


def _utc_to_local(column):
    """Return expression: column (UTC, timestamp without tz) as local time in effective timezone."""
    tz = get_effective_timezone()
    utc_timestamptz = column.op("AT TIME ZONE")("UTC")
    return utc_timestamptz.op("AT TIME ZONE")(literal(tz))


def local_date(column):
    """Convert a UTC datetime column to a date in the user's (or business) timezone.

    DB column is assumed timestamp without time zone stored in UTC. We interpret it as UTC,
    convert to the target zone, then take the date. Uses (col AT TIME ZONE 'UTC') AT TIME ZONE tz.
    """
    return func.date(_utc_to_local(column))


def local_timestamp(column):
    """Return the column's instant as local timestamp (for date_trunc grouping)."""
    return _utc_to_local(column)
