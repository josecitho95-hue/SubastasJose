"""Helper to keep a single event loop per Celery worker process.

Celery ForkPoolWorkers import the task module once per process.
By re-using the same asyncio loop across task invocations we avoid
asyncpg connections getting bound to a now-closed loop.
"""
import asyncio

_loop = None


def run_async(coro):
    """Run *coro* on a persistent event loop for this worker process."""
    global _loop
    if _loop is None or _loop.is_closed():
        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)
    return _loop.run_until_complete(coro)
