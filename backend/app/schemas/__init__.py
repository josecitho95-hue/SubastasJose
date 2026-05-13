from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ============= User schemas =============

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    phone: Optional[str] = None


class UserRegister(UserBase):
    password: str = Field(
        ...,
        min_length=10,
        description="Mínimo 10 caracteres con mezcla de letras y números (TDD §8.1)",
    )

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        has_alpha = any(c.isalpha() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not has_alpha or not has_digit:
            raise ValueError("La contraseña debe contener letras y números")
        return v


class UserLogin(BaseModel):
    email: EmailStr
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
    type: str
    status: str
    review_notes: Optional[str] = None
    uploaded_at: datetime
    reviewed_at: Optional[datetime] = None


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
