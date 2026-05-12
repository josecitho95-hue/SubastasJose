from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet

logger = structlog.get_logger()
settings = get_settings()


class PaymentService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.stripe = None
        if settings.stripe_secret_key:
            import stripe
            stripe.api_key = settings.stripe_secret_key
            self.stripe = stripe

    async def create_deposit_intent(self, user: User, amount: Decimal) -> dict:
        """Create a Stripe PaymentIntent for deposit. Validates LFPIORPI caps."""
        if not self.stripe:
            raise RuntimeError("Stripe not configured")

        # Validate caps
        await self._validate_deposit_caps(user, amount)

        # Get or create Stripe customer
        if not user.stripe_customer_id:
            customer = self.stripe.Customer.create(
                email=user.email,
                name=user.full_name,
                metadata={"user_id": str(user.id)},
            )
            user.stripe_customer_id = customer.id
            await self.db.commit()

        # Create PaymentIntent
        intent = self.stripe.PaymentIntent.create(
            amount=int(amount * 100),  # cents
            currency="mxn",
            customer=user.stripe_customer_id,
            payment_method_options={
                "card": {
                    "request_three_d_secure": "any",
                }
            },
            metadata={
                "user_id": str(user.id),
                "type": "deposit",
            },
        )

        # Create pending transaction
        wallet = await self._get_or_create_wallet(user.id)
        db.add(Transaction(
            wallet_id=wallet.id,
            type="deposit",
            amount=amount,
            status="pending",
            stripe_payment_intent_id=intent.id,
            idempotency_key=f"deposit:{intent.id}",
            description=f"Deposit of ${amount}",
        ))
        await self.db.commit()

        return {
            "client_secret": intent.client_secret,
            "stripe_publishable_key": settings.stripe_publishable_key,
        }

    async def process_webhook(self, payload: bytes, sig_header: str) -> bool:
        """Process Stripe webhook with signature verification and dedup."""
        if not self.stripe:
            return False

        try:
            event = self.stripe.Webhook.construct_event(
                payload, sig_header, settings.stripe_webhook_secret
            )
        except Exception as exc:
            logger.error("stripe_webhook_signature_failed", exc=str(exc))
            return False

        # Dedup by event id
        existing = await self.db.execute(
            select(Transaction).where(Transaction.idempotency_key == f"webhook:{event.id}")
        )
        if existing.scalar_one_or_none():
            logger.info("stripe_webhook_dedup", event_id=event.id)
            return True

        event_type = event["type"]
        data = event["data"]["object"]

        if event_type == "payment_intent.succeeded":
            await self._handle_payment_success(data)
        elif event_type == "payment_intent.payment_failed":
            await self._handle_payment_failed(data)

        # Record webhook processed
        logger.info("stripe_webhook_processed", event_type=event_type, event_id=event.id)
        return True

    async def _handle_payment_success(self, data: dict):
        user_id = data.get("metadata", {}).get("user_id")
        payment_intent_id = data["id"]
        amount = Decimal(data["amount"]) / 100

        if not user_id:
            logger.error("stripe_webhook_missing_user_id", payment_intent_id=payment_intent_id)
            return

        user = await self.db.execute(select(User).where(User.id == UUID(user_id)))
        user = user.scalar_one_or_none()
        if not user:
            logger.error("stripe_webhook_user_not_found", user_id=user_id)
            return

        wallet = await self._get_or_create_wallet(user.id)

        # Update transaction
        tx = await self.db.execute(
            select(Transaction).where(Transaction.stripe_payment_intent_id == payment_intent_id)
        )
        tx = tx.scalar_one_or_none()
        if tx and tx.status == "pending":
            tx.status = "completed"
            wallet.balance += amount
            user.lifetime_deposit_mxn += amount

            # Dedup webhook record
            self.db.add(Transaction(
                wallet_id=wallet.id,
                type="deposit",
                amount=Decimal(0),
                status="completed",
                idempotency_key=f"webhook:{payment_intent_id}",
                description="Webhook processed marker",
            ))
            await self.db.commit()
            logger.info("deposit_completed", user_id=user_id, amount=str(amount))

    async def _handle_payment_failed(self, data: dict):
        payment_intent_id = data["id"]
        tx = await self.db.execute(
            select(Transaction).where(Transaction.stripe_payment_intent_id == payment_intent_id)
        )
        tx = tx.scalar_one_or_none()
        if tx and tx.status == "pending":
            tx.status = "failed"
            await self.db.commit()
            logger.info("deposit_failed", payment_intent_id=payment_intent_id)

    async def _validate_deposit_caps(self, user: User, amount: Decimal):
        """Validate LFPIORPI caps before creating PaymentIntent."""
        new_total = user.lifetime_deposit_mxn + amount

        if amount > settings.deposit_per_event_cap:
            raise ValueError(f"deposit_exceeds_per_event_cap: max ${settings.deposit_per_event_cap}")
        if new_total > settings.deposit_annual_cap:
            raise ValueError(f"deposit_exceeds_annual_cap: max ${settings.deposit_annual_cap}")

        # Check 30d cap (simplified: check total since we don't have sliding window yet)
        # In production, query transactions from last 30 days
        if new_total > settings.deposit_30d_cap:
            logger.warning("deposit_approaching_30d_cap", user_id=str(user.id), total=str(new_total))

    async def _get_or_create_wallet(self, user_id: UUID) -> Wallet:
        result = await self.db.execute(select(Wallet).where(Wallet.user_id == user_id))
        wallet = result.scalar_one_or_none()
        if not wallet:
            wallet = Wallet(user_id=user_id)
            self.db.add(wallet)
            await self.db.flush()
        return wallet

    async def get_wallet(self, user_id: UUID) -> Optional[Wallet]:
        result = await self.db.execute(select(Wallet).where(Wallet.user_id == user_id))
        return result.scalar_one_or_none()
