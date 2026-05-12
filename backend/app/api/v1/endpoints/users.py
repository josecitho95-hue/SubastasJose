from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas import UserMeOut, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserMeOut)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return UserMeOut.model_validate(current_user)


@router.put("/me", response_model=UserMeOut)
async def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.phone is not None:
        current_user.phone = payload.phone
    if payload.shipping_address is not None:
        current_user.shipping_address = payload.shipping_address

    await db.commit()
    await db.refresh(current_user)
    return UserMeOut.model_validate(current_user)
