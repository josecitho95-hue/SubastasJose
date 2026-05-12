import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import redis.asyncio as redis
import structlog

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

_SCRIPTS_DIR = Path(__file__).parent / "scripts"


class RedisClient:
    _instance: Optional["RedisClient"] = None
    _redis: Optional[redis.Redis] = None
    _scripts: Dict[str, str] = {}

    def __new__(cls) -> "RedisClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def connect(self) -> None:
        if self._redis is not None:
            return
        self._redis = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            health_check_interval=30,
        )
        await self._load_scripts()
        logger.info("redis_connected", url=settings.redis_url)

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._redis = None
            logger.info("redis_closed")

    async def _load_scripts(self) -> None:
        for path in _SCRIPTS_DIR.glob("*.lua"):
            name = path.stem
            source = path.read_text(encoding="utf-8")
            sha = await self._redis.script_load(source)
            self._scripts[name] = sha
            logger.info("lua_script_loaded", name=name, sha=sha[:16])

    @property
    def redis(self) -> redis.Redis:
        if self._redis is None:
            raise RuntimeError("Redis not connected. Call connect() first.")
        return self._redis

    def get_script_sha(self, name: str) -> str:
        if name not in self._scripts:
            raise KeyError(f"Lua script '{name}' not loaded")
        return self._scripts[name]

    # ------------------------------------------------------------------
    # Convenience wrappers
    # ------------------------------------------------------------------

    async def ping(self) -> bool:
        return await self.redis.ping()

    async def get(self, key: str) -> Optional[str]:
        return await self.redis.get(key)

    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        return await self.redis.set(key, value, ex=ex)

    async def delete(self, *keys: str) -> int:
        return await self.redis.delete(*keys)

    async def hgetall(self, key: str) -> Dict[str, str]:
        return await self.redis.hgetall(key)

    async def hset(self, key: str, mapping: Dict[str, Any]) -> int:
        return await self.redis.hset(key, mapping=mapping)

    async def evalsha(self, script_name: str, keys: List[str], args: List[str]) -> Any:
        sha = self.get_script_sha(script_name)
        return await self.redis.evalsha(sha, len(keys), *keys, *args)

    # ------------------------------------------------------------------
    # Auction state helpers
    # ------------------------------------------------------------------

    def auction_state_key(self, auction_id: str) -> str:
        return f"auction:{auction_id}:state"

    def user_wallet_key(self, user_id: str) -> str:
        return f"user:{user_id}:wallet"

    def auction_stream_key(self, auction_id: str) -> str:
        return f"stream:auction:{auction_id}"

    def dedup_set_key(self, user_id: str) -> str:
        return f"dedup:user:{user_id}"

    async def get_auction_state(self, auction_id: str) -> Dict[str, str]:
        return await self.hgetall(self.auction_state_key(auction_id))

    async def set_auction_state(self, auction_id: str, state: Dict[str, Any]) -> None:
        await self.hset(self.auction_state_key(auction_id), state)

    async def get_user_wallet(self, user_id: str) -> Dict[str, str]:
        return await self.hgetall(self.user_wallet_key(user_id))

    async def init_user_wallet(self, user_id: str, balance: str = "0", held: str = "0") -> None:
        await self.hset(self.user_wallet_key(user_id), {
            "free": balance,
            "held": held,
        })


# Singleton accessor
_redis_client = RedisClient()


async def get_redis() -> RedisClient:
    if _redis_client._redis is None:
        await _redis_client.connect()
    return _redis_client


async def close_redis() -> None:
    await _redis_client.close()
