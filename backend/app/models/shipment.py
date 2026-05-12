import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, JSON, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    auction_id = Column(UUID(as_uuid=True), ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False)
    winner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    method = Column(
        Enum("standard", "express", "pickup", name="shipment_method_enum"),
        nullable=False,
    )
    address = Column(JSON, nullable=False)
    status = Column(
        Enum("pending", "shipped", "delivered", name="shipment_status_enum"),
        default="pending",
        nullable=False,
    )
    tracking_number = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
