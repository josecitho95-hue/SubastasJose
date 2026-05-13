from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.v1.deps import get_current_user, require_admin, require_csrf
from app.core.database import get_db
from app.models.auction import Auction
from app.models.bid import Bid
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas import AuctionListOut, AuctionOut, BidOut, ItemOut
from app.services.auction_service import AuctionService, ItemService

router = APIRouter()


@router.post("/items", status_code=status.HTTP_201_CREATED)
async def create_item(
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    condition: str = Form(...),
    starting_price: Decimal = Form(...),
    reserve_price: Optional[Decimal] = Form(None),
    min_bid_increment: Decimal = Form(Decimal("1.00")),
    images: List[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    _csrf: None = Depends(require_csrf),
):
    """Create a new item for auction (admin only)."""
    svc = ItemService(db)
    item = await svc.create_item(
        title=title,
        description=description,
        category=category,
        condition=condition,
        starting_price=starting_price,
        reserve_price=reserve_price,
        min_bid_increment=min_bid_increment,
        images=images,
    )
    return ItemOut.model_validate(item)


@router.post("/auctions", status_code=status.HTTP_201_CREATED)
async def create_auction(
    item_id: UUID = Form(...),
    start_time: datetime = Form(...),
    end_time: datetime = Form(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
    _csrf: None = Depends(require_csrf),
):
    """Create and schedule a new auction for an existing item (admin only)."""
    svc = AuctionService(db)
    auction = await svc.create_auction(
        item_id=item_id,
        seller_id=admin.id,
        start_time=start_time,
        end_time=end_time,
    )
    return AuctionOut.model_validate(auction)


@router.get("/auctions", response_model=List[AuctionListOut])
async def list_auctions(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List active auctions (public, paginated) — TDD §5.3."""
    svc = AuctionService(db)
    auctions = await svc.list_active(limit=limit, offset=offset)
    return [AuctionListOut.from_auction(a) for a in auctions]


@router.get("/auctions/{auction_id}", response_model=AuctionOut)
async def get_auction(
    auction_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return detailed information for a single auction (TDD §5.3)."""
    svc = AuctionService(db)
    auction = await svc.get_auction(auction_id)
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    return AuctionOut.model_validate(auction)


@router.get("/auctions/{auction_id}/bids", response_model=List[BidOut])
async def list_auction_bids(
    auction_id: UUID,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Return paginated bid history for an auction — TDD §5.3.

    Results are ordered by placement time descending (most recent first).
    """
    result = await db.execute(
        select(Bid)
        .where(Bid.auction_id == auction_id)
        .order_by(Bid.placed_at.desc())
        .limit(limit)
        .offset(offset)
    )
    bids = result.scalars().all()
    return [BidOut.model_validate(b) for b in bids]


@router.post("/auctions/{auction_id}/pay")
async def pay_auction(
    auction_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _csrf: None = Depends(require_csrf),
):
    """Winner confirms payment for a closed auction.

    Converts the held balance into a completed charge.
    """
    result = await db.execute(
        select(Auction).options(joinedload(Auction.item)).where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")

    if auction.winning_bidder_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not the winner of this auction")

    if auction.payment_status != "pending":
        raise HTTPException(status_code=400, detail=f"Payment status is {auction.payment_status}, cannot pay")

    if auction.payment_deadline and auction.payment_deadline < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Payment deadline has expired")

    # Load wallet
    wallet_result = await db.execute(select(Wallet).where(Wallet.user_id == current_user.id))
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    charge_amount = auction.final_price or auction.current_price

    if wallet.held_balance < charge_amount:
        raise HTTPException(status_code=400, detail="Insufficient held balance")

    # Convert hold to charge
    wallet.held_balance -= charge_amount

    db.add(Transaction(
        wallet_id=wallet.id,
        type="charge",
        amount=charge_amount,
        status="completed",
        idempotency_key=f"charge:{auction.id}",
        description=f"Winning charge for auction {auction.id}",
    ))

    auction.payment_status = "paid"

    await db.commit()

    return {
        "detail": "Payment successful",
        "auction_id": str(auction.id),
        "amount": str(charge_amount),
    }
