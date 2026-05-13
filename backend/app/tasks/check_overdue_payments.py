import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import structlog
from celery import shared_task
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.auction import Auction
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet
from app.services.notification_service import EmailService, NotificationService

logger = structlog.get_logger()
settings = get_settings()


@shared_task(bind=True, max_retries=3)
def check_overdue_payments(self):
    """Celery Beat task: check for overdue auction payments every 5 minutes."""
    from app.tasks.async_runner import run_async
    run_async(_async_check_overdue_payments())


async def _async_check_overdue_payments():
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(Auction)
            .where(Auction.payment_status == "pending")
            .where(Auction.payment_deadline < now)
        )
        overdue_auctions = result.scalars().all()

        for auction in overdue_auctions:
            try:
                await _process_overdue_auction(db, auction)
            except Exception as exc:
                logger.error("overdue_processing_failed", auction_id=str(auction.id), exc=str(exc))
                await db.rollback()

        await db.commit()


async def _process_overdue_auction(db, auction: Auction):
    if not auction.winning_bidder_id:
        return

    # Load winner
    user_result = await db.execute(select(User).where(User.id == auction.winning_bidder_id))
    user = user_result.scalar_one_or_none()
    if not user:
        logger.error("overdue_user_not_found", auction_id=str(auction.id), user_id=str(auction.winning_bidder_id))
        return

    # Load winner's wallet
    wallet_result = await db.execute(select(Wallet).where(Wallet.user_id == auction.winning_bidder_id))
    wallet = wallet_result.scalar_one_or_none()

    # Release hold
    if wallet and wallet.held_balance >= auction.final_price:
        wallet.held_balance -= auction.final_price
        wallet.balance += auction.final_price
        db.add(Transaction(
            wallet_id=wallet.id,
            type="release",
            amount=auction.final_price,
            status="completed",
            idempotency_key=f"overdue_release:{auction.id}",
            description=f"Release hold - payment overdue for auction {auction.id}",
        ))

    # Apply penalty if enabled
    penalty_amount = Decimal("0")
    if settings.penalty_enabled:
        penalty_amount = auction.final_price * Decimal(str(settings.penalty_percent)) / Decimal("100")
        if wallet:
            wallet.balance -= penalty_amount
            db.add(Transaction(
                wallet_id=wallet.id,
                type="penalty",
                amount=penalty_amount,
                status="completed",
                idempotency_key=f"penalty:{auction.id}",
                description=f"Penalty ({settings.penalty_percent}%) for overdue payment - auction {auction.id}",
            ))

    # Update auction
    auction.payment_status = "overdue"
    auction.shipping_status = "cancelled"
    auction.penalty_amount = penalty_amount

    # Update user
    user.overdue_auctions_count += 1
    if user.overdue_auctions_count >= 3:
        user.can_bid = False
        logger.warning("user_bid_blocked", user_id=str(user.id), overdue_count=user.overdue_auctions_count)

    await db.flush()

    # Notify user
    winner_email = await _get_user_email(db, auction.winning_bidder_id)
    if winner_email and auction.item:
        await EmailService.notify_auction_overdue(
            winner_email,
            auction.item.title,
            str(auction.final_price),
            str(penalty_amount),
        )

    await NotificationService.create_notification(
        user_id=auction.winning_bidder_id,
        type="payment_overdue",
        title="Pago vencido",
        message=f"Perdiste '{auction.item.title}' por no pagar a tiempo. Penalización: ${penalty_amount}",
        db=db,
    )

    logger.info("auction_marked_overdue",
        auction_id=str(auction.id),
        user_id=str(auction.winning_bidder_id),
        penalty=str(penalty_amount),
    )


async def _get_user_email(db, user_id):
    from uuid import UUID
    result = await db.execute(select(User.email).where(User.id == user_id))
    return result.scalar_one_or_none()
