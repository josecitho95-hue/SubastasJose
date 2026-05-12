import asyncio
import json
from decimal import Decimal
from time import time
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user_ws
from app.core.config import get_settings
from app.core.database import get_db
from app.models.auction import Auction
from app.models.user import User
from app.redis.client import get_redis
from app.redis.streams import AuctionStream
from app.websocket.manager import get_manager

logger = structlog.get_logger()
settings = get_settings()
router = APIRouter()


@router.websocket("/ws/auctions/{auction_id}")
async def auction_websocket(websocket: WebSocket, auction_id: str):
    """
    WebSocket endpoint for live bidding.
    Auth via httpOnly cookie sent automatically by browser.
    """
    manager = get_manager()

    # Validate auth BEFORE accepting upgrade (§5.6)
    token = websocket.cookies.get("session")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="unauthenticated")
        return

    payload = None
    from app.core.security import decode_token
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="invalid_token")
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="invalid_token")
        return

    # Load user to check KYC
    # We need a DB session here — for simplicity we create a short-lived one
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()

    if not user or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="user_not_found")
        return
    if user.kyc_status != "approved":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="kyc_required")
        return

    await manager.connect(websocket, auction_id, str(user.id))

    # Send initial snapshot
    redis = await get_redis()
    state = await redis.get_auction_state(auction_id)
    if state:
        await manager.send_personal(websocket, {
            "type": "snapshot",
            "current_price": state.get("current_price", "0"),
            "end_time": state.get("end_time", "0"),
            "leader_id": state.get("leader_id"),
            "last_seq": "0",
        })

    # Start stream consumer for this auction if not already running
    # In multi-replica setup, each replica runs its own broadcaster
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await manager.send_personal(websocket, {"type": "error", "code": "invalid_json"})
                continue

            msg_type = msg.get("type")

            if msg_type == "pong":
                manager._last_pong[websocket] = asyncio.get_event_loop().time()
                continue

            if msg_type == "resume":
                # Replay from last_seq (simplified: send current snapshot)
                state = await redis.get_auction_state(auction_id)
                await manager.send_personal(websocket, {
                    "type": "snapshot",
                    "current_price": state.get("current_price", "0"),
                    "end_time": state.get("end_time", "0"),
                    "leader_id": state.get("leader_id"),
                })
                continue

            if msg_type == "bid":
                await _handle_bid(websocket, auction_id, user, msg, manager, redis)
                continue

            await manager.send_personal(websocket, {"type": "error", "code": "unknown_message_type"})

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as exc:
        logger.error("ws_error", exc=str(exc), auction_id=auction_id, user_id=str(user.id))
        await manager.disconnect(websocket)


async def _handle_bid(
    websocket: WebSocket,
    auction_id: str,
    user: User,
    msg: dict,
    manager,
    redis,
):
    """Handle a bid message via the hot path (Redis Lua)."""
    from time import time as now_fn
    from decimal import Decimal

    client_bid_id = msg.get("client_bid_id")
    amount_str = msg.get("amount")

    if not client_bid_id or not amount_str:
        await manager.send_personal(websocket, {"type": "error", "code": "missing_fields"})
        return

    # Rate limit check (token bucket Lua)
    now_ms = int(now_fn() * 1000)
    rate_result = await redis.evalsha(
        "rate_limit",
        [f"rate_limit:{user.id}:bid"],
        ["3", "0.333", "1", str(now_ms)],  # burst 3, 1 per 3s
    )
    rate_data = json.loads(rate_result)
    if not rate_data.get("allowed"):
        await manager.send_personal(websocket, {
            "type": "error",
            "code": "rate_limited",
            "retry_after_ms": rate_data.get("retry_after_ms", 3000),
        })
        return

    # Dedup check
    dedup_result = await redis.evalsha(
        "dedup",
        [f"dedup:user:{user.id}"],
        [client_bid_id, "60"],
    )
    dedup_data = json.loads(dedup_result)
    if dedup_data.get("is_duplicate"):
        await manager.send_personal(websocket, {"type": "ack", "client_bid_id": client_bid_id, "status": "rejected", "reason": "duplicate_bid_id"})
        return

    # Load auction from DB to get min_increment
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Auction).where(Auction.id == UUID(auction_id)))
        auction = result.scalar_one_or_none()

    if not auction or auction.status != "active":
        await manager.send_personal(websocket, {"type": "ack", "client_bid_id": client_bid_id, "status": "rejected", "reason": "auction_not_active"})
        return

    # Ensure Redis state exists
    state = await redis.get_auction_state(auction_id)
    if not state:
        await redis.set_auction_state(auction_id, {
            "current_price": str(auction.current_price),
            "leader_id": str(auction.winning_bidder_id) if auction.winning_bidder_id else "",
            "end_time": str(int(auction.end_time.timestamp() * 1000)),
            "status": auction.status,
            "min_bid_increment": str(auction.item.min_bid_increment),
        })

    # Ensure user wallet exists in Redis
    wallet_state = await redis.get_user_wallet(str(user.id))
    if not wallet_state:
        from app.models.wallet import Wallet
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Wallet).where(Wallet.user_id == user.id))
            wallet = result.scalar_one_or_none()
            if wallet:
                await redis.init_user_wallet(
                    str(user.id),
                    balance=str(wallet.balance),
                    held=str(wallet.held_balance),
                )
            else:
                await manager.send_personal(websocket, {"type": "error", "code": "wallet_not_found"})
                return

    # Execute hot path Lua script
    try:
        result = await redis.evalsha(
            "bid_script",
            [
                redis.auction_state_key(auction_id),
                redis.user_wallet_key(str(user.id)),
            ],
            [
                amount_str,
                str(now_ms),
                str(user.id),
                client_bid_id,
                str(auction.item.min_bid_increment),
                "60000",  # anti_snipe_ms
            ],
        )
    except Exception as exc:
        logger.error("lua_bid_error", exc=str(exc), auction_id=auction_id, user_id=str(user.id))
        await manager.send_personal(websocket, {"type": "error", "code": "service_unavailable"})
        return

    result_data = json.loads(result)
    status = result_data.get("status")

    # Send ACK immediately (< 30ms target)
    await manager.send_personal(websocket, {
        "type": "ack",
        "client_bid_id": client_bid_id,
        "status": status,
        "reason": result_data.get("reason") if status == "rejected" else None,
        "seq": result_data.get("seq"),
    })

    if status == "accepted":
        # Enqueue cold path Celery task
        from app.tasks.persist_bid import persist_bid
        persist_bid.delay(
            auction_id=auction_id,
            user_id=str(user.id),
            amount=amount_str,
            client_bid_id=client_bid_id,
            previous_price=result_data.get("previous_price"),
            previous_leader=result_data.get("previous_leader"),
            new_end_time=result_data.get("new_end_time"),
            seq=result_data.get("seq"),
        )

        # Broadcast price update to all connected clients
        await manager.broadcast(auction_id, {
            "type": "price_update",
            "seq": result_data.get("seq"),
            "current_price": result_data.get("new_price"),
            "leader_id": str(user.id),
            "end_time": result_data.get("new_end_time"),
            "timestamp": str(now_ms),
        })
