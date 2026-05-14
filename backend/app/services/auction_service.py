from decimal import Decimal
from typing import List, Optional
from uuid import UUID

import structlog
from fastapi import Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.v1.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.auction import Auction
from app.models.item import Item
from app.models.user import User
from app.schemas import AuctionListOut, AuctionOut, ItemOut
from app.services.storage_backend import save_item_images

logger = structlog.get_logger()


class ItemService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_item(
        self,
        title: str,
        description: str,
        category: str,
        condition: str,
        starting_price: Decimal,
        reserve_price: Optional[Decimal],
        min_bid_increment: Decimal,
        images: List[UploadFile],
    ) -> Item:
        item = Item(
            title=title,
            description=description,
            category=category,
            condition=condition,
            starting_price=starting_price,
            reserve_price=reserve_price,
            min_bid_increment=min_bid_increment,
        )
        self.db.add(item)
        await self.db.flush()

        # Save images
        image_paths = await save_item_images(images, item.id)
        item.images = image_paths
        await self.db.commit()
        await self.db.refresh(item)

        logger.info("item_created", item_id=str(item.id), title=title)
        return item

    async def list_items(self) -> List[Item]:
        result = await self.db.execute(select(Item).order_by(Item.created_at.desc()))
        return result.scalars().all()

    async def update_item(
        self,
        item_id: UUID,
        title: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        condition: Optional[str] = None,
        starting_price: Optional[Decimal] = None,
        reserve_price: Optional[Decimal] = None,
        min_bid_increment: Optional[Decimal] = None,
        images: Optional[List[UploadFile]] = None,
    ) -> Optional[Item]:
        result = await self.db.execute(select(Item).where(Item.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            return None

        if title is not None:
            item.title = title
        if description is not None:
            item.description = description
        if category is not None:
            item.category = category
        if condition is not None:
            item.condition = condition
        if starting_price is not None:
            item.starting_price = starting_price
        if reserve_price is not None:
            item.reserve_price = reserve_price
        if min_bid_increment is not None:
            item.min_bid_increment = min_bid_increment
        if images is not None and len(images) > 0:
            image_paths = await save_item_images(images, item.id)
            item.images = image_paths

        await self.db.commit()
        await self.db.refresh(item)
        logger.info("item_updated", item_id=str(item.id))
        return item

    async def delete_item(self, item_id: UUID) -> bool:
        result = await self.db.execute(select(Item).where(Item.id == item_id))
        item = result.scalar_one_or_none()
        if not item:
            return False

        # Check if item is used in any auction
        auction_result = await self.db.execute(select(Auction).where(Auction.item_id == item_id))
        auction = auction_result.scalar_one_or_none()
        if auction:
            raise HTTPException(status_code=400, detail="Cannot delete item linked to an auction")

        await self.db.delete(item)
        await self.db.commit()
        logger.info("item_deleted", item_id=str(item_id))
        return True


class AuctionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_auction(
        self,
        item_id: UUID,
        seller_id: UUID,
        start_time,
        end_time,
    ) -> Auction:
        item_result = await self.db.execute(select(Item).where(Item.id == item_id))
        item = item_result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        auction = Auction(
            item_id=item_id,
            seller_id=seller_id,
            start_time=start_time,
            end_time=end_time,
            current_price=item.starting_price,
            status="scheduled",
        )
        self.db.add(auction)
        await self.db.commit()
        await self.db.refresh(auction)

        logger.info("auction_created", auction_id=str(auction.id), item_id=str(item_id))
        return auction

    async def list_active(self, limit: int = 20, offset: int = 0) -> List[Auction]:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(Auction)
            .options(joinedload(Auction.item))
            .where(Auction.status == "active")
            .where(Auction.start_time <= now)
            .where(Auction.end_time > now)
            .order_by(Auction.end_time.asc())
            .limit(limit)
            .offset(offset)
        )
        return result.scalars().all()

    async def get_auction(self, auction_id: UUID) -> Optional[Auction]:
        result = await self.db.execute(
            select(Auction)
            .options(joinedload(Auction.item))
            .where(Auction.id == auction_id)
        )
        return result.scalar_one_or_none()
