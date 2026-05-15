import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum, JSON, String, Text, Numeric, Integer
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)

    kyc_status = Column(
        Enum("pending", "approved", "rejected", name="kyc_status_enum"),
        default="pending",
        nullable=False,
    )
    kyc_level = Column(
        Enum("basic", "enhanced", name="kyc_level_enum"),
        default="basic",
        nullable=False,
    )
    curp = Column(String(18), nullable=True)
    rfc = Column(String(13), nullable=True)
    lifetime_deposit_mxn = Column(Numeric(14, 2), default=0, nullable=False)

    shipping_address = Column(JSON, nullable=True)
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_connect_account_id = Column(String(255), nullable=True)

    # Phone / OAuth verification
    phone_verified = Column(Boolean, default=False, nullable=False)
    google_id = Column(String(255), nullable=True, unique=True)

    # New fields for terms and bid control
    terms_accepted_at = Column(DateTime(timezone=True), nullable=True)
    can_bid = Column(Boolean, default=True, nullable=False)
    overdue_auctions_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
