"""Middleware to set request timezone from X-User-Timezone header for date filtering."""

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.services.tz import set_request_timezone


USER_TIMEZONE_HEADER = "x-user-timezone"


class UserTimezoneMiddleware(BaseHTTPMiddleware):
    """Read X-User-Timezone header and set request-scoped timezone for date filters."""

    async def dispatch(self, request: Request, call_next):
        tz_header = request.headers.get(USER_TIMEZONE_HEADER)
        if tz_header:
            tz_str = tz_header.strip()
            if tz_str:
                try:
                    ZoneInfo(tz_str)
                    set_request_timezone(tz_str)
                except ZoneInfoNotFoundError:
                    pass
        return await call_next(request)
