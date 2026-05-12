import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, JSON, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Item(Base):
    __tablename__ = "items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(
        Enum("electronics", "clothing", "toys", "other", name="item_category_enum"),
        nullable=False,
    )
    condition = Column(
        Enum("new", "used", "refurbished", name="item_condition_enum"),
        nullable=False,
    )
    images = Column(JSON, default=list, nullable=False)
    starting_price = Column(Numeric(12, 2), nullable=False)
    reserve_price = Column(Numeric(12, 2), nullable=True)
    min_bid_increment = Column(Numeric(12, 2), default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
