from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.auction import Auction
from app.models.item import Item
from app.models.shipment import Shipment
from app.models.user import User
from app.schemas import ShipmentCreate, ShipmentOut
from app.services.notification_service import EmailService

router = APIRouter()


@router.post("/auctions/{auction_id}/shipping", response_model=ShipmentOut)
async def create_shipment(
    auction_id: UUID,
    payload: ShipmentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Winner selects shipping method after winning auction."""
    result = await db.execute(
        select(Auction).options(joinedload(Auction.item)).where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()

    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    if auction.status not in ("closed",):
        raise HTTPException(status_code=400, detail="Auction not closed yet")
    if auction.winning_bidder_id != current_user.id:
        raise HTTPException(status_code=403, detail="You are not the winner")

    # Check if shipment already exists
    existing = await db.execute(
        select(Shipment).where(Shipment.auction_id == auction_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Shipment already created")

    shipment = Shipment(
        auction_id=auction_id,
        winner_id=current_user.id,
        method=payload.method,
        address=payload.address,
    )
    db.add(shipment)
    await db.commit()
    await db.refresh(shipment)

    # Notify winner about new shipment
    item_title = auction.item.title if auction.item else "el artículo"
    await EmailService.send_email(
        to=current_user.email,
        subject=f"Envío registrado: {item_title}",
        html=f"""
        <h1>Envío registrado</h1>
        <p>Has seleccionado <strong>{payload.method}</strong> para el envío de <strong>{item_title}</strong>.</p>
        <p>Te notificaremos cuando el artículo sea enviado.</p>
        """,
    )

    return ShipmentOut.model_validate(shipment)


@router.get("/auctions/{auction_id}/shipping", response_model=ShipmentOut)
async def get_shipment(
    auction_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Shipment).where(Shipment.auction_id == auction_id)
    )
    shipment = result.scalar_one_or_none()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    if shipment.winner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return ShipmentOut.model_validate(shipment)
