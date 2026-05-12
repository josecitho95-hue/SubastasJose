import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        id=uuid.uuid4(),
        email=str(payload.email).lower(),
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
    )
    db.add(user)
    await db.flush()

    wallet = Wallet(user_id=user.id)
    db.add(wallet)
    await db.commit()

    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    set_auth_cookies(response, access, refresh)

    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == str(payload.email).lower()))
    user: Optional[User] = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    set_auth_cookies(response, access, refresh)

    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response):
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
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"detail": "Logged out"}
