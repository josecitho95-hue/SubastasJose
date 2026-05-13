from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin, require_csrf
from app.core.database import get_db
from app.models.bid import Bid
from app.models.user import User
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
