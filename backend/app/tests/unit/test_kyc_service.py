"""Unit tests for KYCService (TDD §16.2, §12 Fase 5).

Uses mocked database sessions so no real PostgreSQL is needed.
"""
import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.kyc_service import KYCService


def _make_user(
    kyc_status: str = "pending",
    kyc_level: str = "basic",
    lifetime_deposit_mxn: Decimal = Decimal("0"),
    is_active: bool = True,
):
    """Helper to create a minimal User-like mock."""
    user = MagicMock()
    user.id = uuid4()
    user.kyc_status = kyc_status
    user.kyc_level = kyc_level
    user.lifetime_deposit_mxn = lifetime_deposit_mxn
    user.is_active = is_active
    return user


@pytest.fixture()
def db():
    """Return a mock AsyncSession."""
    session = AsyncMock()
    return session


@pytest.fixture()
def svc(db):
    return KYCService(db)


# ---------------------------------------------------------------------------
# validate_can_bid
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_can_bid_approved_active_user(svc):
    user = _make_user(kyc_status="approved", is_active=True)
    result = await svc.validate_can_bid(user)
    assert result is None


@pytest.mark.asyncio
async def test_cannot_bid_kyc_pending(svc):
    user = _make_user(kyc_status="pending")
    result = await svc.validate_can_bid(user)
    assert result == "kyc_required"


@pytest.mark.asyncio
async def test_cannot_bid_kyc_rejected(svc):
    user = _make_user(kyc_status="rejected")
    result = await svc.validate_can_bid(user)
    assert result == "kyc_required"


@pytest.mark.asyncio
async def test_cannot_bid_inactive_user(svc):
    user = _make_user(kyc_status="approved", is_active=False)
    result = await svc.validate_can_bid(user)
    assert result == "account_inactive"


# ---------------------------------------------------------------------------
# check_kyc_thresholds — alert logic
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_thresholds_below_80_pct(svc):
    """No alert when deposit totals are below 80% of caps."""
    user = _make_user(lifetime_deposit_mxn=Decimal("50000"))
    svc.get_deposits_last_30d = AsyncMock(return_value=Decimal("30000"))
    result = await svc.check_kyc_thresholds(user)
    assert result["needs_enhanced"] is False


@pytest.mark.asyncio
async def test_thresholds_above_80_pct_annual(svc):
    """needs_enhanced=True when annual deposits exceed 80% of the cap."""
    # Cap = 180_000 → 80% = 144_000
    user = _make_user(lifetime_deposit_mxn=Decimal("150000"))
    svc.get_deposits_last_30d = AsyncMock(return_value=Decimal("0"))
    result = await svc.check_kyc_thresholds(user)
    assert result["needs_enhanced"] is True


@pytest.mark.asyncio
async def test_thresholds_above_80_pct_30d(svc):
    """needs_enhanced=True when 30-day deposits exceed 80% of the 30d cap."""
    # Cap = 60_000 → 80% = 48_000
    user = _make_user(lifetime_deposit_mxn=Decimal("0"))
    svc.get_deposits_last_30d = AsyncMock(return_value=Decimal("50000"))
    result = await svc.check_kyc_thresholds(user)
    assert result["needs_enhanced"] is True


# ---------------------------------------------------------------------------
# upgrade_to_enhanced
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upgrade_to_enhanced_idempotent(svc, db):
    """Upgrading an already-enhanced user must not commit again."""
    user = _make_user(kyc_level="enhanced", kyc_status="approved")
    await svc.upgrade_to_enhanced(user)
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_upgrade_to_enhanced_changes_level(svc, db):
    """Upgrading a basic user must set level=enhanced and status=pending."""
    user = _make_user(kyc_level="basic", kyc_status="approved")
    await svc.upgrade_to_enhanced(user)
    assert user.kyc_level == "enhanced"
    assert user.kyc_status == "pending"
    db.commit.assert_called_once()
