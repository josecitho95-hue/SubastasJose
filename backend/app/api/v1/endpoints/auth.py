import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_csrf
from app.api.v1.rate_limit import (
    check_login_rate_limit,
    increment_login_failures,
    reset_login_rate_limit,
)
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_csrf_token,
    get_password_hash,
    verify_csrf_token,
    verify_password,
)
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas import TokenResponse, UserLogin, UserOut, UserRegister

router = APIRouter()
settings = get_settings()


# ── helpers ────────────────────────────────────────────────────────────────────

def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="session",
        value=access_token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key="refresh",
        value=refresh_token,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        max_age=settings.refresh_token_expire_days * 86400,
    )
    response.set_cookie(
        key="csrf",
        value=generate_csrf_token(),
        httponly=False,
        secure=settings.app_env == "production",
        samesite="strict",
        max_age=settings.access_token_expire_minutes * 60,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("session")
    response.delete_cookie("refresh")
    response.delete_cookie("csrf")


async def _create_user_and_wallet(db: AsyncSession, **kwargs) -> User:
    user = User(id=uuid.uuid4(), **kwargs)
    db.add(user)
    await db.flush()
    db.add(Wallet(user_id=user.id))
    await db.commit()
    return user


# ── standard email/password ─────────────────────────────────────────────────────

@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    if not payload.phone:
        raise HTTPException(status_code=422, detail="El teléfono es requerido para verificación OTP")

    user = await _create_user_and_wallet(
        db,
        email=str(payload.email).lower(),
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        terms_accepted_at=datetime.now(timezone.utc),
        # phone_verified starts False — user must complete OTP via /auth/otp/verify
        phone_verified=False,
    )

    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    set_auth_cookies(response, access, refresh)

    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    client_ip = request.client.host if request.client else "unknown"
    email_lower = str(payload.email).lower()

    await check_login_rate_limit(email_lower, client_ip)

    result = await db.execute(select(User).where(User.email == email_lower))
    user: Optional[User] = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        await increment_login_failures(email_lower, client_ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    await reset_login_rate_limit(email_lower, client_ip)

    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    set_auth_cookies(response, access, refresh)

    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, _csrf: None = Depends(require_csrf)):
    refresh_token = request.cookies.get("refresh")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    access = create_access_token({"sub": payload["sub"]})
    new_refresh = create_refresh_token({"sub": payload["sub"]})
    set_auth_cookies(response, access, new_refresh)

    return TokenResponse(access_token=access, refresh_token=new_refresh)


@router.post("/logout")
async def logout(response: Response, _csrf: None = Depends(require_csrf)):
    clear_auth_cookies(response)
    return {"detail": "Logged out"}


# ── Google OAuth ─────────────────────────────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    id_token: str


@router.post("/google", response_model=UserOut)
async def login_with_google(
    payload: GoogleAuthRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    """Exchange a Google id_token for a session. Creates the user on first login."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        idinfo = google_id_token.verify_oauth2_token(
            payload.id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    google_sub = idinfo["sub"]
    email = idinfo.get("email", "").lower()
    full_name = idinfo.get("name", email)

    # Try to find existing user by google_id first, then email
    result = await db.execute(select(User).where(User.google_id == google_sub))
    user: Optional[User] = result.scalar_one_or_none()

    if not user and email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            # Link google_id to existing account
            user.google_id = google_sub
            user.phone_verified = True
            await db.commit()

    if not user:
        user = await _create_user_and_wallet(
            db,
            email=email,
            hashed_password=get_password_hash(uuid.uuid4().hex),
            full_name=full_name,
            google_id=google_sub,
            phone_verified=True,  # Google already verified the identity
            terms_accepted_at=datetime.now(timezone.utc),
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    access = create_access_token({"sub": str(user.id)})
    refresh_tok = create_refresh_token({"sub": str(user.id)})
    set_auth_cookies(response, access, refresh_tok)

    return user


# ── Firebase OTP verify ──────────────────────────────────────────────────────────

class OtpVerifyRequest(BaseModel):
    firebase_token: str


@router.post("/otp/verify", response_model=UserOut)
async def verify_otp(
    payload: OtpVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    """Verify a Firebase phone auth token and mark the current user's phone as verified."""
    if not settings.firebase_project_id:
        raise HTTPException(status_code=501, detail="Firebase OTP not configured")

    # Decode current session to identify the user
    session_token = request.cookies.get("session")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token_payload = decode_token(session_token)
    if not token_payload or token_payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid session")

    user_id = token_payload.get("sub")

    try:
        import firebase_admin
        from firebase_admin import auth as firebase_auth, credentials

        # Initialize Firebase app lazily (idempotent)
        if not firebase_admin._apps:
            import json
            svc_account = json.loads(settings.firebase_service_account_json or "{}")
            cred = credentials.Certificate(svc_account)
            firebase_admin.initialize_app(cred)

        decoded = firebase_auth.verify_id_token(payload.firebase_token)
        phone_number = decoded.get("phone_number")
        if not phone_number:
            raise HTTPException(status_code=400, detail="Token does not contain phone number")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Firebase token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user: Optional[User] = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.phone_verified = True
    if not user.phone:
        user.phone = phone_number
    await db.commit()
    await db.refresh(user)

    return user
