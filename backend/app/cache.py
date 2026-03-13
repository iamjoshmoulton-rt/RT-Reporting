"""Redis cache utility — shared across all services.

Provides a simple get/set interface with JSON serialization and TTL.
Falls back to in-memory dict cache if Redis is unavailable.
"""

import json
import logging
import time
from typing import Any

import redis.asyncio as redis

from app.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None
_fallback_cache: dict[str, tuple[float, Any]] = {}
_redis_available = True


async def get_redis() -> redis.Redis | None:
    """Get or create the Redis client singleton."""
    global _redis_client, _redis_available
    if not _redis_available:
        return None
    if _redis_client is None:
        try:
            settings = get_settings()
            _redis_client = redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=3,
                retry_on_timeout=True,
            )
            await _redis_client.ping()
            logger.info("Redis connected at %s", settings.redis_url)
        except Exception as e:
            logger.warning("Redis unavailable, using in-memory fallback: %s", e)
            _redis_client = None
            _redis_available = False
            return None
    return _redis_client


async def cache_get(key: str) -> Any | None:
    """Get a cached value by key. Returns None on miss."""
    r = await get_redis()
    if r:
        try:
            raw = await r.get(key)
            if raw is not None:
                return json.loads(raw)
        except Exception as e:
            logger.debug("Redis GET error for %s: %s", key, e)
    else:
        # Fallback to in-memory with TTL check
        entry = _fallback_cache.get(key)
        if entry:
            expiry, val = entry
            if time.time() < expiry:
                return val
            else:
                del _fallback_cache[key]
    return None


async def cache_set(key: str, value: Any, ttl: int = 900) -> None:
    """Set a cached value with TTL in seconds."""
    r = await get_redis()
    if r:
        try:
            await r.setex(key, ttl, json.dumps(value, default=str))
        except Exception as e:
            logger.debug("Redis SET error for %s: %s", key, e)
    else:
        _fallback_cache[key] = (time.time() + ttl, value)


async def cache_get_or_set(key: str, ttl: int, fetch_fn) -> Any:
    """Get from cache or call fetch_fn, cache the result, and return it.

    This is the primary interface for caching expensive queries.
    `fetch_fn` should be an async callable that returns the data to cache.
    """
    cached = await cache_get(key)
    if cached is not None:
        return cached
    result = await fetch_fn()
    await cache_set(key, result, ttl)
    return result


async def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching a glob pattern (e.g. 'grading:*')."""
    r = await get_redis()
    if r:
        try:
            keys = []
            async for key in r.scan_iter(match=pattern, count=100):
                keys.append(key)
            if keys:
                await r.delete(*keys)
            return len(keys)
        except Exception as e:
            logger.debug("Redis DELETE pattern error: %s", e)
    else:
        to_delete = [k for k in _fallback_cache if _matches_glob(k, pattern)]
        for k in to_delete:
            del _fallback_cache[k]
        return len(to_delete)
    return 0


def _matches_glob(key: str, pattern: str) -> bool:
    """Simple glob matching for fallback cache (supports * only)."""
    if "*" not in pattern:
        return key == pattern
    prefix = pattern.split("*")[0]
    return key.startswith(prefix)


async def close_redis():
    """Close Redis connection (call on shutdown)."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
