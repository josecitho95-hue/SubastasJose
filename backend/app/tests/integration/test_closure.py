import pytest
from decimal import Decimal
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_close_auction_releases_losers(async_client: AsyncClient, db_session):
    """Al cerrar subasta, los no-ganadores liberan su hold."""
    from datetime import datetime, timedelta, timezone
    from app.models.auction import Auction
    from app.models.item import Item
    from app.models.user import User
    from app.models.wallet import Wallet
    from app.models.bid import Bid
    from app.tasks.close_auctions import _async_close_auctions

    # Setup users
    reg1 = await async_client.post("/api/v1/auth/register", json={
        "email": "winner@test.com", "password": "SecurePass123", "full_name": "Winner",
    })
    winner_id = reg1.json()["id"]

    reg2 = await async_client.post("/api/v1/auth/register", json={
        "email": "loser@test.com", "password": "SecurePass123", "full_name": "Loser",
    })
    loser_id = reg2.json()["id"]

    # Fund wallets and approve KYC
    for uid in [winner_id, loser_id]:
        result = await db_session.execute(select(User).where(User.id == uid))
        u = result.scalar_one()
        u.kyc_status = "approved"
        w = Wallet(user_id=uid, balance=Decimal("1000.00"))
        db_session.add(w)
    await db_session.commit()

    # Create item + auction (already ended)
    item = Item(title="Test", description="Test", category="electronics", condition="new",
                images=[], starting_price=Decimal("100.00"))
    db_session.add(item)
    await db_session.flush()

    auction = Auction(
        item_id=item.id, seller_id=winner_id,
        start_time=datetime.now(timezone.utc) - timedelta(hours=2),
        end_time=datetime.now(timezone.utc) - timedelta(minutes=1),  # Already ended
        current_price=Decimal("500.00"),
        status="active",
        winning_bidder_id=winner_id,
    )
    db_session.add(auction)

    # Add bids
    db_session.add(Bid(auction_id=auction.id, user_id=winner_id, amount=Decimal("500.00"), is_winning=True))
    db_session.add(Bid(auction_id=auction.id, user_id=loser_id, amount=Decimal("400.00"), is_winning=False))

    # Apply holds
    w_winner = await db_session.execute(select(Wallet).where(Wallet.user_id == winner_id))
    w_winner = w_winner.scalar_one()
    w_winner.held_balance = Decimal("500.00")
    w_winner.balance = Decimal("500.00")

    await db_session.commit()

    # Run close task
    await _async_close_auctions()

    # Verify auction closed
    result = await db_session.execute(select(Auction).where(Auction.id == auction.id))
    auction_after = result.scalar_one()
    assert auction_after.status == "closed"
    assert auction_after.final_price == Decimal("500.00")

    # Verify winner charged
    w_after = await db_session.execute(select(Wallet).where(Wallet.user_id == winner_id))
    w_after = w_after.scalar_one()
    assert w_after.held_balance == Decimal("0")
    assert w_after.balance == Decimal("500.00")


@pytest.mark.asyncio
async def test_close_auction_no_sale(async_client: AsyncClient, db_session):
    """Subasta que no alcanza precio de reserva -> closed_no_sale."""
    from datetime import datetime, timedelta, timezone
    from app.models.auction import Auction
    from app.models.item import Item
    from app.models.user import User
    from app.models.wallet import Wallet
    from app.tasks.close_auctions import _async_close_auctions

    reg = await async_client.post("/api/v1/auth/register", json={
        "email": "nosale@test.com", "password": "SecurePass123", "full_name": "No Sale",
    })
    user_id = reg.json()["id"]

    result = await db_session.execute(select(User).where(User.id == user_id))
    u = result.scalar_one()
    u.kyc_status = "approved"
    w = Wallet(user_id=user_id, balance=Decimal("1000.00"), held_balance=Decimal("100.00"))
    db_session.add(w)
    await db_session.commit()

    item = Item(title="Test", description="Test", category="electronics", condition="new",
                images=[], starting_price=Decimal("100.00"), reserve_price=Decimal("1000.00"))
    db_session.add(item)
    await db_session.flush()

    auction = Auction(
        item_id=item.id, seller_id=user_id,
        start_time=datetime.now(timezone.utc) - timedelta(hours=2),
        end_time=datetime.now(timezone.utc) - timedelta(minutes=1),
        current_price=Decimal("100.00"),
        status="active",
        winning_bidder_id=user_id,
    )
    db_session.add(auction)
    await db_session.commit()

    # Run close task
    await _async_close_auctions()

    # Verify no sale
    result = await db_session.execute(select(Auction).where(Auction.id == auction.id))
    auction_after = result.scalar_one()
    assert auction_after.status == "closed_no_sale"

    # Verify hold released
    w_after = await db_session.execute(select(Wallet).where(Wallet.user_id == user_id))
    w_after = w_after.scalar_one()
    assert w_after.held_balance == Decimal("0")
    assert w_after.balance == Decimal("1000.00")
