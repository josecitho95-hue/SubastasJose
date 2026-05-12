import asyncio
import json
import pytest
from decimal import Decimal
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_bid_hot_path_integration(async_client: AsyncClient, redis_client, db_session):
    """Test completo del flujo de puja: WS connect -> bid -> ACK -> price_update."""
    from datetime import datetime, timedelta, timezone
    from app.models.auction import Auction
    from app.models.item import Item
    from app.models.user import User
    from app.models.wallet import Wallet

    # 1. Setup users
    reg1 = await async_client.post("/api/v1/auth/register", json={
        "email": "bidder1@test.com",
        "password": "SecurePass123",
        "full_name": "Bidder One",
    })
    user1_id = reg1.json()["id"]

    reg2 = await async_client.post("/api/v1/auth/register", json={
        "email": "bidder2@test.com",
        "password": "SecurePass123",
        "full_name": "Bidder Two",
    })
    user2_id = reg2.json()["id"]

    # Approve KYC and fund wallets
    for uid in [user1_id, user2_id]:
        result = await db_session.execute(select(User).where(User.id == uid))
        u = result.scalar_one()
        u.kyc_status = "approved"
        wallet = Wallet(user_id=uid, balance=Decimal("5000.00"))
        db_session.add(wallet)
    await db_session.commit()

    # 2. Create item + auction
    item = Item(
        title="Test Item",
        description="Test",
        category="electronics",
        condition="new",
        images=[],
        starting_price=Decimal("100.00"),
        min_bid_increment=Decimal("10.00"),
    )
    db_session.add(item)
    await db_session.flush()

    auction = Auction(
        item_id=item.id,
        seller_id=user1_id,
        start_time=datetime.now(timezone.utc),
        end_time=datetime.now(timezone.utc) + timedelta(hours=1),
        current_price=Decimal("100.00"),
        status="active",
    )
    db_session.add(auction)
    await db_session.commit()

    # 3. Initialize Redis state
    from app.redis.client import get_redis
    redis = await get_redis()
    await redis.set_auction_state(str(auction.id), {
        "current_price": "100.00",
        "leader_id": "",
        "end_time": str(int(auction.end_time.timestamp() * 1000)),
        "status": "active",
        "min_bid_increment": "10.00",
    })
    await redis.init_user_wallet(user1_id, balance="5000.00")
    await redis.init_user_wallet(user2_id, balance="5000.00")

    # 4. Simulate bid via HTTP (since WS testing is complex in pytest)
    # We'll test the Lua script directly
    result = await redis.evalsha(
        "bid_script",
        [redis.auction_state_key(str(auction.id)), redis.user_wallet_key(user1_id)],
        ["150.00", str(int(datetime.now(timezone.utc).timestamp() * 1000)), user1_id, "bid-001", "10.00", "60000"],
    )
    data = json.loads(result)
    assert data["status"] == "accepted"
    assert data["new_price"] == "150.00"

    # 5. Verify Redis state updated
    state = await redis.get_auction_state(str(auction.id))
    assert state["current_price"] == "150.00"
    assert state["leader_id"] == user1_id

    # 6. Second bid by user2
    result2 = await redis.evalsha(
        "bid_script",
        [redis.auction_state_key(str(auction.id)), redis.user_wallet_key(user2_id)],
        ["200.00", str(int(datetime.now(timezone.utc).timestamp() * 1000)), user2_id, "bid-002", "10.00", "60000"],
    )
    data2 = json.loads(result2)
    assert data2["status"] == "accepted"
    assert data2["new_price"] == "200.00"

    # 7. User1's hold should be released
    wallet1 = await redis.get_user_wallet(user1_id)
    assert Decimal(wallet1["held"]) == Decimal("0")
    assert Decimal(wallet1["free"]) == Decimal("5000.00")

    # 8. User2 should have hold
    wallet2 = await redis.get_user_wallet(user2_id)
    assert Decimal(wallet2["held"]) == Decimal("200.00")
    assert Decimal(wallet2["free"]) == Decimal("4800.00")

    # 9. Rejected bid (below increment)
    result3 = await redis.evalsha(
        "bid_script",
        [redis.auction_state_key(str(auction.id)), redis.user_wallet_key(user1_id)],
        ["205.00", str(int(datetime.now(timezone.utc).timestamp() * 1000)), user1_id, "bid-003", "10.00", "60000"],
    )
    data3 = json.loads(result3)
    assert data3["status"] == "rejected"
    assert data3["reason"] == "below_min_increment"

    # 10. Rejected bid (insufficient balance)
    await redis.init_user_wallet("poor-user", balance="0")
    result4 = await redis.evalsha(
        "bid_script",
        [redis.auction_state_key(str(auction.id)), redis.user_wallet_key("poor-user")],
        ["300.00", str(int(datetime.now(timezone.utc).timestamp() * 1000)), "poor-user", "bid-004", "10.00", "60000"],
    )
    data4 = json.loads(result4)
    assert data4["status"] == "rejected"
    assert data4["reason"] == "insufficient_balance"


@pytest.mark.asyncio
async def test_rate_limiter(async_client: AsyncClient, redis_client):
    """Token bucket rate limiter permite ráfaga y luego bloquea."""
    from app.redis.client import get_redis
    redis = await get_redis()

    user_id = "rate-test-user"
    now_ms = "1000000"

    # 3 pujas permitidas (burst)
    for i in range(3):
        result = await redis.evalsha(
            "rate_limit",
            [f"rate_limit:{user_id}:bid"],
            ["3", "0.333", "1", str(int(now_ms) + i * 100)],
        )
        data = json.loads(result)
        assert data["allowed"] == True, f"Bid {i+1} should be allowed"

    # 4ta puja bloqueada
    result = await redis.evalsha(
        "rate_limit",
        [f"rate_limit:{user_id}:bid"],
        ["3", "0.333", "1", str(int(now_ms) + 400)],
    )
    data = json.loads(result)
    assert data["allowed"] == False
    assert "retry_after_ms" in data


@pytest.mark.asyncio
async def test_dedup_script(async_client: AsyncClient, redis_client):
    """Dedup evita procesar el mismo client_bid_id dos veces."""
    from app.redis.client import get_redis
    redis = await get_redis()

    user_id = "dedup-test-user"

    # Primera vez: no es duplicado
    result1 = await redis.evalsha(
        "dedup",
        [f"dedup:user:{user_id}"],
        ["bid-id-123", "60"],
    )
    data1 = json.loads(result1)
    assert data1["is_duplicate"] == False

    # Segunda vez: es duplicado
    result2 = await redis.evalsha(
        "dedup",
        [f"dedup:user:{user_id}"],
        ["bid-id-123", "60"],
    )
    data2 = json.loads(result2)
    assert data2["is_duplicate"] == True
