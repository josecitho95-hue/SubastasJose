import asyncio
from datetime import datetime, timezone

import structlog
from celery import shared_task
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.auction import Auction

logger = structlog.get_logger()


@shared_task(bind=True, max_retries=3)
def activate_auctions(self):
    """Celery Beat task: activate scheduled auctions every 30s."""
    asyncio.run(_async_activate_auctions())


async def _async_activate_auctions():
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(Auction)
            .where(Auction.status == "scheduled")
            .where(Auction.start_time <= now)
        )
        auctions = result.scalars().all()

        activated = 0
        for auction in auctions:
            auction.status = "active"
            activated += 1
            logger.info("auction_activated", auction_id=str(auction.id), start_time=str(auction.start_time))

        await db.commit()
        if activated:
            logger.info("activate_auctions_completed", count=activated)
