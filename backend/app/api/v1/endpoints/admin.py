from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_admin
from app.core.database import get_db
from app.models.auction import Auction
from app.models.user import User
from app.schemas import UserMeOut

router = APIRouter()


@router.get("/dashboard")
async def admin_dashboard(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Stats
    total_users = await db.execute(select(func.count(User.id)))
    total_users = total_users.scalar()

    active_auctions = await db.execute(select(func.count(Auction.id)).where(Auction.status == "active"))
    active_auctions = active_auctions.scalar()

    pending_kyc = await db.execute(
        select(func.count(User.id)).where(User.kyc_status == "pending")
    )
    pending_kyc = pending_kyc.scalar()

    return {
        "total_users": total_users,
        "active_auctions": active_auctions,
        "pending_kyc": pending_kyc,
    }


@router.get("/users", response_model=List[UserMeOut])
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()).limit(100))
    return [UserMeOut.model_validate(u) for u in result.scalars().all()]
