import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import structlog
from celery import Celery
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.auction import Auction
from app.models.bid import Bid
from app.models.transaction import Transaction
from app.models.wallet import Wallet

logger = structlog.get_logger()
settings = get_settings()

celery_app = Celery("subastas")
celery_app.config_from_object({
    "broker_url": settings.redis_url,
    "result_backend": settings.redis_url,
    "task_serializer": "json",
    "accept_content": ["json"],
    "result_serializer": "json",
    "timezone": "UTC",
    "enable_utc": True,
    "task_track_started": True,
    "task_time_limit": 30,
    "worker_prefetch_multiplier": 1,
})


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def persist_bid(
    self,
    auction_id: str,
    user_id: str,
    amount: str,
    client_bid_id: str,
    previous_price: str,
    previous_leader: str,
    new_end_time: str,
    seq: str,
):
    """Cold path: persist bid to PostgreSQL atomically."""
    import asyncio
    asyncio.run(_async_persist_bid(
        auction_id, user_id, amount, client_bid_id,
        previous_price, previous_leader, new_end_time, seq,
    ))


async def _async_persist_bid(
    auction_id: str,
    user_id: str,
    amount: str,
    client_bid_id: str,
    previous_price: str,
    previous_leader: str,
    new_end_time: str,
    seq: str,
):
    async with AsyncSessionLocal() as db:
        try:
            # Idempotency: check if bid already persisted
            existing = await db.execute(
                select(Bid).where(Bid.id == UUID(client_bid_id))
            )
            if existing.scalar_one_or_none():
                logger.info("bid_already_persisted", client_bid_id=client_bid_id)
                return

            auction = await db.execute(select(Auction).where(Auction.id == UUID(auction_id)))
            auction = auction.scalar_one()

            # Update previous winning bid
            if previous_leader:
                await db.execute(
                    Bid.__table__.update()
                    .where(Bid.auction_id == UUID(auction_id))
                    .where(Bid.is_winning == True)
                    .values(is_winning=False)
                )

                # Release previous leader's hold
                prev_wallet = await db.execute(
                    select(Wallet).where(Wallet.user_id == UUID(previous_leader))
                )
                prev_wallet = prev_wallet.scalar_one_or_none()
                if prev_wallet:
                    prev_wallet.held_balance -= Decimal(previous_price)
                    prev_wallet.balance += Decimal(previous_price)
                    db.add(prev_wallet)
                    # Release transaction
                    db.add(Transaction(
                        wallet_id=prev_wallet.id,
                        type="release",
                        amount=Decimal(previous_price),
                        status="completed",
                        idempotency_key=f"release:{client_bid_id}:{previous_leader}",
                        description=f"Release hold for auction {auction_id}",
                    ))

            # Insert new bid
            bid = Bid(
                id=UUID(client_bid_id),
                auction_id=UUID(auction_id),
                user_id=UUID(user_id),
                amount=Decimal(amount),
                is_winning=True,
            )
            db.add(bid)

            # Update auction
            auction.current_price = Decimal(amount)
            auction.winning_bidder_id = UUID(user_id)
            auction.end_time = datetime.fromtimestamp(int(new_end_time) / 1000, tz=timezone.utc)

            # Apply hold to new leader
            wallet = await db.execute(select(Wallet).where(Wallet.user_id == UUID(user_id)))
            wallet = wallet.scalar_one()
            wallet.held_balance += Decimal(amount)
            wallet.balance -= Decimal(amount)

            # Hold transaction
            db.add(Transaction(
                wallet_id=wallet.id,
                type="hold",
                amount=Decimal(amount),
                status="completed",
                idempotency_key=f"hold:{client_bid_id}:{user_id}",
                description=f"Hold for auction {auction_id}",
            ))

            await db.commit()
            logger.info("bid_persisted", auction_id=auction_id, user_id=user_id, amount=amount, seq=seq)

        except Exception as exc:
            await db.rollback()
            logger.error("bid_persist_failed", exc=str(exc), auction_id=auction_id, client_bid_id=client_bid_id)
            raise
