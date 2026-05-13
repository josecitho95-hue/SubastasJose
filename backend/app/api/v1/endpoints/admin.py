from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.v1.deps import get_current_user, require_admin, require_csrf
from app.core.database import get_db
from app.models.auction import Auction
from app.models.bid import Bid
from app.models.item import Item
from app.models.shipment import Shipment
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas import (
    AuctionAdminOut,
    AuctionOut,
    ShipmentAdminOut,
    ShipmentOut,
    UserMeOut,
)
from app.services.notification_service import EmailService, NotificationService

router = APIRouter()


# ============= Dashboard =============

@router.get("/dashboard")
async def admin_dashboard(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
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


# ============= Finances =============

@router.get("/finances")
async def admin_finances(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Total completed charges
    charges = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), Decimal("0")))
        .where(Transaction.type == "charge")
        .where(Transaction.status == "completed")
    )
    total_charges = charges.scalar()

    # Total completed deposits
    deposits = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), Decimal("0")))
        .where(Transaction.type == "deposit")
        .where(Transaction.status == "completed")
    )
    total_deposits = deposits.scalar()

    # Total penalties
    penalties = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), Decimal("0")))
        .where(Transaction.type == "penalty")
        .where(Transaction.status == "completed")
    )
    total_penalties = penalties.scalar()

    # Auction counts
    closed_with_sale = await db.execute(
        select(func.count(Auction.id)).where(Auction.status == "closed")
    )
    closed_with_sale = closed_with_sale.scalar()

    closed_no_sale = await db.execute(
        select(func.count(Auction.id)).where(Auction.status == "closed_no_sale")
    )
    closed_no_sale = closed_no_sale.scalar()

    # Total held balance
    held = await db.execute(select(func.coalesce(func.sum(Wallet.held_balance), Decimal("0"))))
    total_held = held.scalar()

    return {
        "total_charges": str(total_charges),
        "total_deposits": str(total_deposits),
        "total_penalties": str(total_penalties),
        "closed_with_sale": closed_with_sale,
        "closed_no_sale": closed_no_sale,
        "total_held_balance": str(total_held),
    }


# ============= Users =============

@router.get("/users", response_model=List[UserMeOut])
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()).limit(100))
    return [UserMeOut.model_validate(u) for u in result.scalars().all()]


@router.patch("/users/{user_id}")
async def update_user(
    user_id: UUID,
    is_verified: Optional[bool] = None,
    is_active: Optional[bool] = None,
    can_bid: Optional[bool] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if is_verified is not None:
        user.is_verified = is_verified
    if is_active is not None:
        user.is_active = is_active
    if can_bid is not None:
        user.can_bid = can_bid

    await db.commit()
    await db.refresh(user)
    return UserMeOut.model_validate(user)


# ============= Auctions =============

@router.get("/auctions", response_model=List[AuctionAdminOut])
async def list_admin_auctions(
    status: Optional[str] = None,
    payment_status: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(Auction).options(
        joinedload(Auction.item),
        joinedload(Auction.winning_bidder),
    ).order_by(Auction.created_at.desc())

    if status:
        query = query.where(Auction.status == status)
    if payment_status:
        query = query.where(Auction.payment_status == payment_status)

    result = await db.execute(query)
    auctions = result.scalars().unique().all()
    return [AuctionAdminOut.model_validate(a) for a in auctions]


@router.put("/auctions/{auction_id}", response_model=AuctionOut)
async def update_auction(
    auction_id: UUID,
    title: Optional[str] = None,
    description: Optional[str] = None,
    reserve_price: Optional[Decimal] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    result = await db.execute(
        select(Auction).options(joinedload(Auction.item)).where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")

    if auction.status in ("closed", "cancelled"):
        raise HTTPException(status_code=400, detail="Cannot edit closed or cancelled auction")

    if title is not None:
        auction.item.title = title
    if description is not None:
        auction.item.description = description
    if reserve_price is not None:
        auction.item.reserve_price = reserve_price
    if start_time is not None:
        if auction.status == "active" and start_time < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Cannot move active auction start_time to the past")
        auction.start_time = start_time
    if end_time is not None:
        auction.end_time = end_time

    await db.commit()
    await db.refresh(auction)
    return AuctionOut.model_validate(auction)


@router.delete("/auctions/{auction_id}")
async def cancel_auction(
    auction_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    result = await db.execute(select(Auction).where(Auction.id == auction_id))
    auction = result.scalar_one_or_none()
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")

    if auction.status == "cancelled":
        raise HTTPException(status_code=400, detail="Auction already cancelled")

    # Release holds for active bids if any (find winning bidder and release)
    if auction.winning_bidder_id and auction.status == "active":
        wallet_result = await db.execute(select(Wallet).where(Wallet.user_id == auction.winning_bidder_id))
        wallet = wallet_result.scalar_one_or_none()
        if wallet and wallet.held_balance >= auction.current_price:
            wallet.held_balance -= auction.current_price
            wallet.balance += auction.current_price
            db.add(Transaction(
                wallet_id=wallet.id,
                type="release",
                amount=auction.current_price,
                status="completed",
                idempotency_key=f"cancel_release:{auction.id}",
                description=f"Release hold - auction cancelled {auction.id}",
            ))

    auction.status = "cancelled"
    auction.payment_status = "not_required"
    auction.shipping_status = "cancelled"

    await db.commit()
    return {"detail": "Auction cancelled"}


@router.patch("/auctions/{auction_id}/approve-payment")
async def approve_auction_payment(
    auction_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    result = await db.execute(
        select(Auction).options(joinedload(Auction.item)).where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")

    if auction.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Auction payment is not in 'paid' status")

    auction.admin_payment_approved = True
    auction.shipping_status = "processing"

    await db.commit()

    # Notify winner
    if auction.winning_bidder_id:
        winner_result = await db.execute(select(User.email).where(User.id == auction.winning_bidder_id))
        winner_email = winner_result.scalar_one_or_none()
        if winner_email and auction.item:
            await EmailService.notify_payment_approved(winner_email, auction.item.title, str(auction.id))

        await NotificationService.create_notification(
            user_id=auction.winning_bidder_id,
            type="payment_approved",
            title="Pago confirmado",
            message=f"Tu pago por '{auction.item.title}' ha sido confirmado. Estamos preparando tu envío.",
            db=db,
        )

    return {"detail": "Payment approved"}


# ============= Shipments =============

@router.get("/shipments", response_model=List[ShipmentAdminOut])
async def list_shipments(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Shipment)
        .options(joinedload(Shipment.winner), joinedload(Shipment.auction).joinedload(Auction.item))
        .order_by(Shipment.created_at.desc())
    )
    shipments = result.scalars().unique().all()
    return [ShipmentAdminOut.model_validate(s) for s in shipments]


@router.put("/shipments/{shipment_id}", response_model=ShipmentOut)
async def update_shipment(
    shipment_id: UUID,
    status: Optional[str] = None,
    tracking_number: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    result = await db.execute(
        select(Shipment)
        .options(joinedload(Shipment.auction).joinedload(Auction.item))
        .where(Shipment.id == shipment_id)
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if status is not None:
        shipment.status = status
        # Also sync auction shipping_status
        if shipment.auction:
            shipment.auction.shipping_status = status
    if tracking_number is not None:
        shipment.tracking_number = tracking_number

    await db.commit()
    await db.refresh(shipment)

    # Notify winner
    if shipment.winner_id and shipment.auction and shipment.auction.item:
        winner_result = await db.execute(select(User.email).where(User.id == shipment.winner_id))
        winner_email = winner_result.scalar_one_or_none()
        if winner_email:
            await EmailService.notify_shipping_updated(
                winner_email,
                shipment.auction.item.title,
                shipment.status,
                shipment.tracking_number,
            )

        await NotificationService.create_notification(
            user_id=shipment.winner_id,
            type="shipping_updated",
            title="Envío actualizado",
            message=f"Tu envío de '{shipment.auction.item.title}' está ahora: {shipment.status}.",
            db=db,
        )

    return ShipmentOut.model_validate(shipment)
