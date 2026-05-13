import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Auction(Base):
    __tablename__ = "auctions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    seller_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(
        Enum("scheduled", "active", "closed", "closed_no_sale", "cancelled", name="auction_status_enum"),
        default="scheduled",
        nullable=False,
    )
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    current_price = Column(Numeric(12, 2), nullable=False)
    winning_bidder_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    final_price = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Payment and shipping fields
    payment_status = Column(
        Enum("pending", "paid", "overdue", "refunded", "not_required", name="auction_payment_status_enum"),
        default="not_required",
        nullable=False,
    )
    payment_deadline = Column(DateTime(timezone=True), nullable=True)
    penalty_amount = Column(Numeric(12, 2), default=0, nullable=False)
    admin_payment_approved = Column(Boolean, default=False, nullable=False)
    shipping_status = Column(
        Enum("pending_payment", "processing", "shipped", "delivered", "cancelled", name="auction_shipping_status_enum"),
        default="pending_payment",
        nullable=False,
    )

    item = relationship("Item", lazy="joined")
    seller = relationship("User", foreign_keys=[seller_id], lazy="joined")
    winning_bidder = relationship("User", foreign_keys=[winning_bidder_id], lazy="joined")
