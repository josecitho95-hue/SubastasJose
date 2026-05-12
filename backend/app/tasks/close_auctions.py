import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from celery import shared_task
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.auction import Auction
from app.models.bid import Bid
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet
from app.redis.client import get_redis
from app.services.notification_service import EmailService

logger = structlog.get_logger()


@shared_task(bind=True, max_retries=3)
def close_auctions(self):
    """Celery Beat task: close expired auctions every 10s."""
    asyncio.run(_async_close_auctions())


async def _async_close_auctions():
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(Auction)
            .where(Auction.status == "active")
            .where(Auction.end_time <= now)
        )
        auctions = result.scalars().all()

        for auction in auctions:
            try:
                await _close_single_auction(db, auction)
            except Exception as exc:
                logger.error("close_auction_failed", auction_id=str(auction.id), exc=str(exc))
                await db.rollback()

        await db.commit()


async def _close_single_auction(db, auction: Auction):
    redis = await get_redis()
    redis_state = await redis.get_auction_state(str(auction.id))

    # Reconcile Redis vs PG
    redis_price = Decimal(redis_state.get("current_price", "0")) if redis_state else auction.current_price
    if abs(redis_price - auction.current_price) > Decimal("0.01"):
        logger.warning("auction_close_reconcile_mismatch",
            auction_id=str(auction.id),
            redis_price=str(redis_price),
            pg_price=str(auction.current_price),
        )

    # Load all bidders for notification
    bidders_result = await db.execute(
        select(User.email, Bid.user_id, Bid.amount)
        .join(Bid, Bid.user_id == User.id)
        .where(Bid.auction_id == auction.id)
        .distinct()
    )
    all_bidders = bidders_result.all()

    # Check reserve price
    item = auction.item
    if item.reserve_price and auction.current_price < item.reserve_price:
        auction.status = "closed_no_sale"
        auction.final_price = auction.current_price

        # Release all holds
        if auction.winning_bidder_id:
            wallet = await db.execute(
                select(Wallet).where(Wallet.user_id == auction.winning_bidder_id)
            )
            wallet = wallet.scalar_one()
            wallet.held_balance -= auction.current_price
            wallet.balance += auction.current_price

            db.add(Transaction(
                wallet_id=wallet.id,
                type="release",
                amount=auction.current_price,
                status="completed",
                idempotency_key=f"close_release:{auction.id}",
                description=f"Release hold - no sale for auction {auction.id}",
            ))

            # Notify bidders
            winner_email = await _get_user_email(db, auction.winning_bidder_id)
            if winner_email:
                await EmailService.notify_no_sale(winner_email, item.title)
    else:
        auction.status = "closed"
        auction.final_price = auction.current_price

        # Charge winner
        if auction.winning_bidder_id:
            wallet = await db.execute(
                select(Wallet).where(Wallet.user_id == auction.winning_bidder_id)
            )
            wallet = wallet.scalar_one()
            wallet.held_balance -= auction.current_price

            db.add(Transaction(
                wallet_id=wallet.id,
                type="charge",
                amount=auction.current_price,
                status="completed",
                idempotency_key=f"charge:{auction.id}",
                description=f"Charge for winning auction {auction.id}",
            ))

            # Notify winner
            winner_email = await _get_user_email(db, auction.winning_bidder_id)
            if winner_email:
                await EmailService.notify_auction_won(
                    winner_email,
                    item.title,
                    str(auction.final_price),
                    str(auction.id),
                )

            # Notify losers
            for email, user_id, _ in all_bidders:
                if user_id != auction.winning_bidder_id:
                    await EmailService.notify_auction_lost(email, item.title)

    await db.flush()
    logger.info("auction_closed", auction_id=str(auction.id), status=auction.status, final_price=str(auction.final_price))

    # Clean up Redis state
    await redis.delete(f"auction:{auction.id}:state")
    await redis.delete(f"stream:auction:{auction.id}")


async def _get_user_email(db, user_id: UUID) -> str:
    result = await db.execute(select(User.email).where(User.id == user_id))
    return result.scalar_one_or_none()
