from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ============= User schemas =============

class UserBase(BaseModel):
    # NOTE(prod): Plain str to avoid email-validator rejecting reserved TLDs
    # like .local in dev/staging. Output schemas (UserOut, UserMeOut) inherit
    # this, so existing users with non-RFC emails won't crash serialization.
    # Registration enforces stricter validation via field_validator.
    email: str
    full_name: str
    phone: Optional[str] = None


class ShippingAddress(BaseModel):
    street: str
    city: str
    state: str
    zip_code: str
    country: str = "México"
    references: Optional[str] = None


class UserRegister(UserBase):
    email: str  # Re-declare to allow custom validation
    password: str = Field(
        ...,
        min_length=10,
        description="Mínimo 10 caracteres con mezcla de letras y números (TDD §8.1)",
    )
    shipping_address: Optional[ShippingAddress] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        from email_validator import EmailNotValidError, validate_email as _validate
        try:
            _validate(v, check_deliverability=False)
        except EmailNotValidError as exc:
            raise ValueError(str(exc))
        return v.lower()

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        has_alpha = any(c.isalpha() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not has_alpha or not has_digit:
            raise ValueError("La contraseña debe contener letras y números")
        return v


class UserLogin(BaseModel):
    # NOTE(prod): Login accepts plain string to avoid email-validator rejecting
    # reserved TLDs like .local (used in dev/admin accounts). Registration still
    # uses EmailStr for stricter validation. In production, consider normalizing
    # or re-validating after authentication if strict RFC compliance is required.
    email: str
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    shipping_address: Optional[dict] = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    is_active: bool
    is_verified: bool
    is_admin: bool
    kyc_status: str
    kyc_level: str
    lifetime_deposit_mxn: Decimal
    created_at: datetime


class UserMeOut(UserOut):
    shipping_address: Optional[dict] = None


# ============= Token schemas =============

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    type: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ============= Document schemas =============

class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    type: str
    file_path: str
    status: str
    review_notes: Optional[str] = None
    uploaded_at: datetime
    reviewed_at: Optional[datetime] = None


class DocumentAdminOut(DocumentOut):
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None


# ============= Wallet / Transaction schemas =============

class WalletOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    balance: Decimal
    held_balance: Decimal
    currency: str


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    type: str
    amount: Decimal
    status: str
    description: Optional[str] = None
    created_at: datetime


# ============= Item / Auction schemas =============

class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    description: str
    category: str
    condition: str
    images: List[str]
    starting_price: Decimal
    reserve_price: Optional[Decimal] = None
    min_bid_increment: Decimal


class AuctionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    item: ItemOut
    status: str
    start_time: datetime
    end_time: datetime
    current_price: Decimal
    winning_bidder_id: Optional[UUID] = None
    final_price: Optional[Decimal] = None
    payment_status: str
    payment_deadline: Optional[datetime] = None
    admin_payment_approved: bool
    shipping_status: str


class AuctionAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    item: ItemOut
    status: str
    start_time: datetime
    end_time: datetime
    current_price: Decimal
    winning_bidder_id: Optional[UUID] = None
    final_price: Optional[Decimal] = None
    payment_status: str
    payment_deadline: Optional[datetime] = None
    admin_payment_approved: bool
    shipping_status: str
    winning_bidder: Optional[UserMeOut] = None


class AuctionListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    item_id: UUID
    title: str
    category: str
    current_price: Decimal
    end_time: datetime
    image_thumb: Optional[str] = None

    @classmethod
    def from_auction(cls, auction):
        return cls(
            id=auction.id,
            item_id=auction.item_id,
            title=auction.item.title,
            category=auction.item.category,
            current_price=auction.current_price,
            end_time=auction.end_time,
            image_thumb=auction.item.images[0] if auction.item.images else None,
        )


class BidOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    auction_id: UUID
    user_id: UUID
    amount: Decimal
    is_winning: bool
    placed_at: datetime


# ============= Payment schemas =============

class DepositIntent(BaseModel):
    amount: Decimal = Field(..., gt=0)


class DepositIntentResponse(BaseModel):
    client_secret: str
    stripe_publishable_key: str


# ============= Shipment schemas =============

class ShipmentCreate(BaseModel):
    method: str
    address: dict


class ShipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    method: str
    address: dict
    status: str
    tracking_number: Optional[str] = None
    created_at: datetime


class ShipmentAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    auction_id: UUID
    winner_id: UUID
    method: str
    address: dict
    status: str
    tracking_number: Optional[str] = None
    created_at: datetime
    winner: Optional[UserMeOut] = None
    auction: Optional[AuctionOut] = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    type: str
    title: str
    message: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime
