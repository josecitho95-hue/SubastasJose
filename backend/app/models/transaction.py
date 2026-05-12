import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_id = Column(UUID(as_uuid=True), ForeignKey("wallets.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(
        Enum("deposit", "hold", "release", "charge", "refund", name="transaction_type_enum"),
        nullable=False,
    )
    amount = Column(Numeric(12, 2), nullable=False)
    status = Column(
        Enum("pending", "completed", "failed", name="transaction_status_enum"),
        default="pending",
        nullable=False,
    )
    stripe_payment_intent_id = Column(String(255), nullable=True)
    idempotency_key = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
