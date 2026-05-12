"""KYC service: LFPIORPI compliance, threshold alerts, and level management (TDD §9, §16.2).

This module centralises all KYC-related business logic so it is not scattered
across endpoints.  Key responsibilities:
- Computing 30-day and annual deposit totals for a user.
- Deciding when to trigger the ``enhanced`` KYC level upgrade.
- Generating and sending LFPIORPI telemetry alerts to admins.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.transaction import Transaction
from app.models.user import User
from app.models.wallet import Wallet

logger = structlog.get_logger()
settings = get_settings()


class KYCService:
    """Service layer for KYC compliance operations."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialise with an async database session.

        Args:
            db: Active :class:`sqlalchemy.ext.asyncio.AsyncSession`.
        """
        self.db = db

    async def get_deposits_last_30d(self, user_id: UUID) -> Decimal:
        """Return the sum of completed deposits for a user in the last 30 days.

        Args:
            user_id: The user's UUID.

        Returns:
            Total deposited amount (MXN) in the rolling 30-day window.
        """
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        result = await self.db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .where(
                Transaction.wallet_id.in_(
                    select(Wallet.id).where(Wallet.user_id == user_id)
                )
            )
            .where(Transaction.type == "deposit")
            .where(Transaction.status == "completed")
            .where(Transaction.created_at >= thirty_days_ago)
        )
        return Decimal(str(result.scalar() or 0))

    async def check_kyc_thresholds(self, user: User) -> dict:
        """Check whether the user is approaching or has exceeded LFPIORPI thresholds.

        Emits ``deposit_approaching_cap`` warnings at 80% of each limit and
        ``deposit_at_cap`` errors at 100%.

        Args:
            user: The ORM user object.

        Returns:
            dict with keys ``annual_pct``, ``d30_pct``, ``needs_enhanced``.
        """
        deposits_30d = await self.get_deposits_last_30d(user.id)
        annual_cap = Decimal(str(settings.deposit_annual_cap))
        d30_cap = Decimal(str(settings.deposit_30d_cap))

        annual_pct = float(user.lifetime_deposit_mxn / annual_cap) if annual_cap else 0.0
        d30_pct = float(deposits_30d / d30_cap) if d30_cap else 0.0

        needs_enhanced = annual_pct >= 0.8 or d30_pct >= 0.8

        log_kwargs = dict(
            user_id=str(user.id),
            annual_pct=f"{annual_pct:.1%}",
            d30_pct=f"{d30_pct:.1%}",
        )
        if annual_pct >= 1.0 or d30_pct >= 1.0:
            logger.error("deposit_at_cap", **log_kwargs)
        elif needs_enhanced:
            logger.warning("deposit_approaching_cap", **log_kwargs)

        return {
            "annual_pct": annual_pct,
            "d30_pct": d30_pct,
            "needs_enhanced": needs_enhanced,
        }

    async def upgrade_to_enhanced(self, user: User) -> None:
        """Upgrade the user's KYC level to ``enhanced`` and block bidding until completed.

        This is Plan B from TDD §16.2: triggered when the user approaches
        the LFPIORPI threshold and must provide CURP, RFC, and selfie.

        Args:
            user: The ORM user object (will be mutated in place).
        """
        if user.kyc_level == "enhanced":
            return

        user.kyc_level = "enhanced"
        user.kyc_status = "pending"  # Require re-review with enhanced docs
        await self.db.commit()
        logger.info("kyc_level_upgraded_to_enhanced", user_id=str(user.id))

    async def validate_can_bid(self, user: User) -> Optional[str]:
        """Return an error code string if the user is not allowed to bid, else None.

        Args:
            user: The ORM user object.

        Returns:
            One of ``'kyc_required'``, ``'account_inactive'`` or ``None`` if the
            user is allowed to bid.
        """
        if not user.is_active:
            return "account_inactive"
        if user.kyc_status != "approved":
            return "kyc_required"
        return None
