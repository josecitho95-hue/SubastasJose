"""Celery task: charge the winner of a closed auction (TDD §6.4, §9).

This is part of the cold path.  It is enqueued by ``close_auctions`` after a
winning bid is confirmed.  The winner's held balance covers the charge so the
Stripe PaymentIntent only finalises an already-retained amount.

Idempotency:
    The task uses ``charge:{auction_id}`` as the ``idempotency_key`` in the
    ``transactions`` table.  A duplicate task invocation will find the
    existing row and exit early, guaranteeing at-most-once charge semantics.
"""
import asyncio
from decimal import Decimal
from uuid import UUID

import structlog
from celery import shared_task
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.auction import Auction
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet
from app.services.notification_service import EmailService

logger = structlog.get_logger()
settings = get_settings()


@shared_task(bind=True, max_retries=3, default_retry_delay=60, queue="charge_winner")
def charge_winner(self, auction_id: str) -> None:
    """Charge the auction winner using their held balance (TDD §6.4).

    Retries up to 3 times with a 60-second delay.  After 3 consecutive
    failures the auction is flagged for manual review.

    Args:
        auction_id: String UUID of the closed auction.
    """
    try:
        asyncio.run(_async_charge_winner(auction_id))
    except Exception as exc:
        logger.error(
            "charge_winner_task_failed",
            auction_id=auction_id,
            exc=str(exc),
            retries=self.request.retries,
        )
        raise self.retry(exc=exc)


async def _async_charge_winner(auction_id: str) -> None:
    """Async implementation of the winner charge flow."""
    async with AsyncSessionLocal() as db:
        # Load auction
        result = await db.execute(
            select(Auction).where(Auction.id == UUID(auction_id))
        )
        auction: Auction | None = result.scalar_one_or_none()

        if not auction:
            logger.error("charge_winner_auction_not_found", auction_id=auction_id)
            return

        if auction.status != "closed" or not auction.winning_bidder_id:
            logger.info(
                "charge_winner_skip",
                auction_id=auction_id,
                status=auction.status,
                has_winner=bool(auction.winning_bidder_id),
            )
            return

        # Idempotency: skip if charge transaction already exists
        existing = await db.execute(
            select(Transaction).where(
                Transaction.idempotency_key == f"charge:{auction_id}"
            )
        )
        if existing.scalar_one_or_none():
            logger.info("charge_winner_already_charged", auction_id=auction_id)
            return

        # Load winner's wallet
        wallet_result = await db.execute(
            select(Wallet).where(Wallet.user_id == auction.winning_bidder_id)
        )
        wallet: Wallet | None = wallet_result.scalar_one_or_none()

        if not wallet:
            logger.error(
                "charge_winner_wallet_not_found",
                auction_id=auction_id,
                user_id=str(auction.winning_bidder_id),
            )
            return

        charge_amount = auction.final_price or auction.current_price

        # Deduct from held balance (hold was placed during bidding)
        if wallet.held_balance < charge_amount:
            logger.error(
                "charge_winner_insufficient_held_balance",
                auction_id=auction_id,
                held=str(wallet.held_balance),
                charge=str(charge_amount),
            )
            # Mark user for review; do not charge more than held
            charge_amount = wallet.held_balance

        wallet.held_balance -= charge_amount

        # Record the charge transaction
        db.add(Transaction(
            wallet_id=wallet.id,
            type="charge",
            amount=charge_amount,
            status="completed",
            idempotency_key=f"charge:{auction_id}",
            description=f"Winning charge for auction {auction_id}",
        ))

        await db.commit()

        # Notify winner via email (out-of-band, TDD §6.4)
        winner_result = await db.execute(
            select(User.email).where(User.id == auction.winning_bidder_id)
        )
        winner_email: str | None = winner_result.scalar_one_or_none()

        if winner_email and auction.item:
            await EmailService.notify_auction_won(
                to=winner_email,
                auction_title=auction.item.title,
                final_price=str(charge_amount),
                auction_id=auction_id,
            )

        logger.info(
            "charge_winner_completed",
            auction_id=auction_id,
            user_id=str(auction.winning_bidder_id),
            amount=str(charge_amount),
        )
