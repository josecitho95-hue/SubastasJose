from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_csrf
from app.core.database import get_db
from app.models.auction import Auction
from app.models.bid import Bid
from app.models.transaction import Transaction
from app.models.wallet import Wallet
from app.models.user import User
from app.schemas import BidOut, TransactionOut, UserMeOut, UserUpdate, WalletOut

router = APIRouter()


@router.get("/me", response_model=UserMeOut)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the authenticated user's profile (TDD §5.2)."""
    return UserMeOut.model_validate(current_user)


@router.put("/me", response_model=UserMeOut)
async def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    """Update the authenticated user's profile and shipping address (TDD §5.2)."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.phone is not None:
        current_user.phone = payload.phone
    if payload.shipping_address is not None:
        current_user.shipping_address = payload.shipping_address

    await db.commit()
    await db.refresh(current_user)
    return UserMeOut.model_validate(current_user)


@router.get("/me/dashboard")
async def dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the user's auction summary dashboard (TDD §5.2).

    Returns:
        dict: Auctions won, active bids, recent transactions and wallet state.
    """
    # Auctions won (with full details including payment/shipping status)
    won_result = await db.execute(
        select(Auction)
        .where(Auction.winning_bidder_id == current_user.id)
        .where(Auction.status.in_(["closed", "closed_no_sale"]))
        .order_by(Auction.created_at.desc())
        .limit(10)
    )
    auctions_won = []
    for a in won_result.scalars().all():
        auctions_won.append({
            "id": str(a.id),
            "status": a.status,
            "final_price": str(a.final_price),
            "payment_status": a.payment_status,
            "payment_deadline": a.payment_deadline.isoformat() if a.payment_deadline else None,
            "admin_payment_approved": a.admin_payment_approved,
            "shipping_status": a.shipping_status,
            "title": a.item.title if a.item else None,
            "image_thumb": a.item.images[0] if a.item and a.item.images else None,
        })

    # Active bids (auctions where user has a bid and auction is still active)
    active_bids_result = await db.execute(
        select(Bid)
        .join(Auction, Auction.id == Bid.auction_id)
        .where(Bid.user_id == current_user.id)
        .where(Auction.status == "active")
        .order_by(Bid.placed_at.desc())
        .limit(10)
    )
    active_bids = [BidOut.model_validate(b) for b in active_bids_result.scalars().all()]

    # Wallet
    wallet_result = await db.execute(
        select(Wallet).where(Wallet.user_id == current_user.id)
    )
    wallet = wallet_result.scalar_one_or_none()
    wallet_data = WalletOut.model_validate(wallet) if wallet else None

    # Recent transactions (last 20)
    tx_result = await db.execute(
        select(Transaction)
        .where(Transaction.wallet_id == (wallet.id if wallet else None))
        .order_by(Transaction.created_at.desc())
        .limit(20)
    ) if wallet else None

    recent_transactions: List = []
    if tx_result:
        recent_transactions = [TransactionOut.model_validate(t) for t in tx_result.scalars().all()]

    return {
        "auctions_won": auctions_won,
        "active_bids": [b.model_dump() for b in active_bids],
        "wallet": wallet_data.model_dump() if wallet_data else None,
        "recent_transactions": [t.model_dump() for t in recent_transactions],
    }


@router.get("/me/transactions", response_model=List[TransactionOut])
async def list_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    """Return paginated transaction history for the authenticated user."""
    wallet_result = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    result = await db.execute(
        select(Transaction)
        .where(Transaction.wallet_id == wallet.id)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    transactions = result.scalars().all()
    return [TransactionOut.model_validate(t) for t in transactions]
