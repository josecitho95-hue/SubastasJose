import json
from typing import AsyncGenerator, Dict, List, Optional

import structlog

from app.redis.client import RedisClient, get_redis

logger = structlog.get_logger()


class AuctionStream:
    def __init__(self, auction_id: str):
        self.auction_id = auction_id
        self.stream_key = f"stream:auction:{auction_id}"

    async def add_event(self, event_type: str, payload: Dict) -> str:
        redis = await get_redis()
        data = {"type": event_type, **payload}
        entry_id = await redis.redis.xadd(
            self.stream_key,
            {"data": json.dumps(data)},
            maxlen=10000,
            approximate=True,
        )
        logger.debug("stream_event_added", auction_id=self.auction_id, event_type=event_type, entry_id=entry_id)
        return entry_id

    async def read_events(
        self,
        last_id: str = "0",
        block_ms: int = 5000,
        count: int = 100,
    ) -> List[Dict]:
        redis = await get_redis()
        raw = await redis.redis.xread(
            {self.stream_key: last_id},
            count=count,
            block=block_ms,
        )
        events = []
        for _stream_name, entries in raw:
            for entry_id, fields in entries:
                payload = json.loads(fields.get("data", "{}"))
                events.append({"id": entry_id, **payload})
        return events

    async def read_new(
        self,
        consumer_group: str,
        consumer_name: str,
        block_ms: int = 5000,
        count: int = 100,
    ) -> List[Dict]:
        redis = await get_redis()
        try:
            await redis.redis.xgroup_create(self.stream_key, consumer_group, id="0", mkstream=True)
        except Exception:
            pass  # Group already exists

        raw = await redis.redis.xreadgroup(
            consumer_group,
            consumer_name,
            {self.stream_key: ">"},
            count=count,
            block=block_ms,
        )
        events = []
        for _stream_name, entries in raw:
            for entry_id, fields in entries:
                payload = json.loads(fields.get("data", "{}"))
                events.append({"id": entry_id, **payload})
        return events

    async def ack(self, consumer_group: str, *entry_ids: str) -> int:
        redis = await get_redis()
        return await redis.redis.xack(self.stream_key, consumer_group, *entry_ids)

    async def trim(self, maxlen: int = 10000) -> int:
        redis = await get_redis()
        return await redis.redis.xtrim(self.stream_key, maxlen=maxlen, approximate=True)


class StreamBroadcaster:
    """Broadcasts stream events to local WebSocket connections."""

    def __init__(self, auction_id: str):
        self.auction_id = auction_id
        self.stream = AuctionStream(auction_id)
        self._last_id = "0"

    async def consume_forever(self) -> AsyncGenerator[Dict, None]:
        """Blocking generator that yields events as they arrive."""
        while True:
            events = await self.stream.read_events(last_id=self._last_id, block_ms=5000)
            for event in events:
                self._last_id = event["id"]
                yield event
