"""
Rate limiting helpers using Redis atomic counters.

Usage:
    await check_login_rate_limit(email, ip)        # raises HTTP 429 if exceeded
    await check_kyc_upload_rate_limit(user_id)     # raises HTTP 429 if exceeded
    await reset_login_rate_limit(email, ip)        # call on successful login
"""
from fastapi import HTTPException, Request, status

from app.redis.client import get_redis

# ─── Login: 5 intentos / 5 minutos por email+IP ─────────────────────────────
_LOGIN_LIMIT = 5
_LOGIN_WINDOW = 300  # seconds (5 min)


def _login_key(email: str, ip: str) -> str:
    return f"ratelimit:login:{email}:{ip}"


async def check_login_rate_limit(email: str, ip: str) -> None:
    """Raise HTTP 429 if the email+IP pair has exceeded 5 failed attempts in 5 min."""
    redis = await get_redis()
    key = _login_key(email, ip)

    count_raw = await redis.get(key)
    count = int(count_raw) if count_raw else 0

    if count >= _LOGIN_LIMIT:
        # Get remaining TTL for Retry-After header
        ttl = await redis.redis.ttl(key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos de inicio de sesión. Intenta más tarde.",
            headers={"Retry-After": str(max(ttl, 1))},
        )


async def increment_login_failures(email: str, ip: str) -> None:
    """Increment failure counter. Sets TTL on first failure."""
    redis = await get_redis()
    key = _login_key(email, ip)
    pipe = redis.redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, _LOGIN_WINDOW)
    await pipe.execute()


async def reset_login_rate_limit(email: str, ip: str) -> None:
    """Delete the counter on successful login."""
    redis = await get_redis()
    await redis.delete(_login_key(email, ip))


# ─── KYC upload: 10 subidas / día por usuario ────────────────────────────────
_KYC_LIMIT = 10
_KYC_WINDOW = 86400  # seconds (24 h)


def _kyc_key(user_id: str) -> str:
    return f"ratelimit:kyc_upload:{user_id}"


async def check_kyc_upload_rate_limit(user_id: str) -> None:
    """Raise HTTP 429 if the user has uploaded more than 10 KYC docs in 24 h."""
    redis = await get_redis()
    key = _kyc_key(user_id)

    count_raw = await redis.get(key)
    count = int(count_raw) if count_raw else 0

    if count >= _KYC_LIMIT:
        ttl = await redis.redis.ttl(key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Límite diario de documentos KYC alcanzado. Intenta mañana.",
            headers={"Retry-After": str(max(ttl, 1))},
        )

    # Increment counter atomically
    pipe = redis.redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, _KYC_WINDOW)
    await pipe.execute()
