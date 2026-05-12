import asyncio
import json
from decimal import Decimal
from typing import Dict, List, Optional, Set
from uuid import UUID

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.redis.client import get_redis
from app.redis.streams import StreamBroadcaster

logger = structlog.get_logger()


class ConnectionManager:
    """Manages WebSocket connections per auction with heartbeat and backpressure."""

    def __init__(self):
        # auction_id -> set of websockets
        self._rooms: Dict[str, Set[WebSocket]] = {}
        # websocket -> auction_id
        self._mapping: Dict[WebSocket, str] = {}
        # websocket -> last_pong_at
        self._last_pong: Dict[WebSocket, float] = {}
        # websocket -> user_id
        self._user_ids: Dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()
        self._running = False

    async def connect(self, websocket: WebSocket, auction_id: str, user_id: str):
        await websocket.accept()
        async with self._lock:
            if auction_id not in self._rooms:
                self._rooms[auction_id] = set()
            self._rooms[auction_id].add(websocket)
            self._mapping[websocket] = auction_id
            self._user_ids[websocket] = user_id
            self._last_pong[websocket] = asyncio.get_event_loop().time()

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            auction_id = self._mapping.pop(websocket, None)
            if auction_id and auction_id in self._rooms:
                self._rooms[auction_id].discard(websocket)
                if not self._rooms[auction_id]:
                    del self._rooms[auction_id]
            self._user_ids.pop(websocket, None)
            self._last_pong.pop(websocket, None)

    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await asyncio.wait_for(
                websocket.send_text(json.dumps(message)),
                timeout=0.2,
            )
        except (asyncio.TimeoutError, Exception):
            # Backpressure: client too slow, disconnect
            logger.warning("ws_backpressure_disconnect", user_id=self._user_ids.get(websocket))
            await self.disconnect(websocket)

    async def broadcast(self, auction_id: str, message: dict):
        """Broadcast to all connections in an auction room."""
        if auction_id not in self._rooms:
            return
        # Create a snapshot of connections to avoid mutation during iteration
        connections = list(self._rooms[auction_id])
        tasks = []
        for ws in connections:
            tasks.append(self.send_personal(ws, message))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def send_ping(self, websocket: WebSocket):
        try:
            await websocket.send_text(json.dumps({"type": "ping"}))
        except Exception:
            pass

    async def heartbeat_task(self):
        """Send pings every 20s and disconnect clients that haven't ponged in 40s."""
        self._running = True
        while self._running:
            await asyncio.sleep(20)
            now = asyncio.get_event_loop().time()
            to_disconnect = []
            async with self._lock:
                for ws, last in list(self._last_pong.items()):
                    if now - last > 40:
                        to_disconnect.append(ws)
                    else:
                        asyncio.create_task(self.send_ping(ws))
            for ws in to_disconnect:
                logger.info("ws_heartbeat_timeout", user_id=self._user_ids.get(ws))
                await self.disconnect(ws)

    def start_heartbeat(self):
        asyncio.create_task(self.heartbeat_task())

    async def stop(self):
        self._running = False


_manager: Optional[ConnectionManager] = None


def get_manager() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager
