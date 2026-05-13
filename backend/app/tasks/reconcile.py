import asyncio
from decimal import Decimal

import structlog
from celery import shared_task
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.auction import Auction
from app.models.wallet import Wallet
from app.redis.client import get_redis

logger = structlog.get_logger()


@shared_task(bind=True, max_retries=3)
def reconcile_auctions(self):
    """Reconcile Redis auction state with PostgreSQL every 5 minutes."""
    from app.tasks.async_runner import run_async
    run_async(_async_reconcile())


async def _async_reconcile():
    """Compare Redis state vs PG for active auctions. Alert if discrepancy > 0.01 MXN.

    On discrepancy: sets reconciliation_blocked:{auction_id} in Redis (TTL 1 h)
    so that close_auctions.py will skip charging the winner until resolved.
    """
    async with AsyncSessionLocal() as db:
        redis = await get_redis()

        # Get all active auctions from PG
        result = await db.execute(
            select(Auction).where(Auction.status == "active")
        )
        auctions = result.scalars().all()

        discrepancies = []

        for auction in auctions:
            auction_id = str(auction.id)
            redis_state = await redis.get_auction_state(auction_id)

            if not redis_state:
                logger.warning(
                    "reconcile_redis_missing",
                    auction_id=auction_id,
                    pg_price=str(auction.current_price),
                )
                continue

            redis_price = Decimal(redis_state.get("current_price", "0"))
            pg_price = auction.current_price

            if abs(redis_price - pg_price) > Decimal("0.01"):
                discrepancies.append({
                    "auction_id": auction_id,
                    "redis_price": str(redis_price),
                    "pg_price": str(pg_price),
                    "diff": str(abs(redis_price - pg_price)),
                })
                logger.error(
                    "reconcile_discrepancy",
                    auction_id=auction_id,
                    redis_price=str(redis_price),
                    pg_price=str(pg_price),
                    diff=str(abs(redis_price - pg_price)),
                )

                # ── Block payment for this auction until manually resolved ──
                block_key = f"reconciliation_blocked:{auction_id}"
                await redis.set(block_key, "1", ex=3600)  # TTL 1 h
                logger.critical(
                    "reconcile_payment_blocked",
                    auction_id=auction_id,
                    block_key=block_key,
                    message="Cobro bloqueado por discrepancia. Revisión manual requerida.",
                )

                # ── Prometheus metric ─────────────────────────────────────
                try:
                    from app.observability.metrics import RECONCILIATION_DISCREPANCY_TOTAL
                    RECONCILIATION_DISCREPANCY_TOTAL.inc()
                except Exception:
                    pass  # metrics optional — don't break the task

            else:
                logger.debug(
                    "reconcile_ok",
                    auction_id=auction_id,
                    price=str(pg_price),
                )

        # Check wallet consistency
        await _reconcile_wallets(db, redis)

        if discrepancies:
            logger.warning(
                "reconcile_summary",
                total_checked=len(auctions),
                discrepancies_found=len(discrepancies),
            )
        else:
            logger.info(
                "reconcile_all_ok",
                total_checked=len(auctions),
            )


async def _reconcile_wallets(db, redis):
    """Verify wallet balances: free + held = total transactions."""
    result = await db.execute(select(Wallet))
    wallets = result.scalars().all()

    for wallet in wallets:
        user_id = str(wallet.user_id)
        redis_wallet = await redis.get_user_wallet(user_id)

        if not redis_wallet:
            continue

        redis_free = Decimal(redis_wallet.get("free", "0"))
        redis_held = Decimal(redis_wallet.get("held", "0"))

        pg_total = wallet.balance + wallet.held_balance
        redis_total = redis_free + redis_held

        if abs(pg_total - redis_total) > Decimal("0.01"):
            logger.error(
                "wallet_discrepancy",
                user_id=user_id,
                pg_total=str(pg_total),
                redis_total=str(redis_total),
                diff=str(abs(pg_total - redis_total)),
            )
