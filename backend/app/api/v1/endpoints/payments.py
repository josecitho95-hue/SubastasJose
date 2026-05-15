from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin, require_csrf
from app.core.database import get_db
from app.models.user import User
from app.schemas import DepositIntent, DepositIntentResponse, WalletOut
from app.services.payment_service import PaymentService

router = APIRouter()


@router.post("/deposit", response_model=DepositIntentResponse)
async def create_deposit(
    payload: DepositIntent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    """Create a Stripe PaymentIntent for a deposit (TDD §5.5). Enforces LFPIORPI caps."""
    if current_user.kyc_status != "approved":
        raise HTTPException(
            status_code=403,
            detail="Debes completar la verificación de identidad (KYC) antes de depositar fondos.",
        )
    svc = PaymentService(db)
    try:
        result = await svc.create_deposit_intent(current_user, payload.amount)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Payment service unavailable")


@router.get("/wallet", response_model=WalletOut)
async def get_wallet(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the authenticated user's wallet balance and held amounts (TDD §5.5)."""
    svc = PaymentService(db)
    wallet = await svc.get_wallet(current_user.id)
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return WalletOut.model_validate(wallet)


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receive Stripe webhook events with signature verification (TDD §5.5, §8.4)."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing signature")

    svc = PaymentService(db)
    success = await svc.process_webhook(payload, sig_header)
    if not success:
        raise HTTPException(status_code=400, detail="Webhook processing failed")
    return {"status": "ok"}


@router.post("/connect/onboarding")
async def connect_onboarding(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    """Generate a Stripe Connect Express onboarding link for the admin seller (TDD §5.5)."""
    svc = PaymentService(db)
    try:
        url = await svc.create_connect_onboarding_link(admin)
        return {"onboarding_url": url}
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Payment service unavailable")
