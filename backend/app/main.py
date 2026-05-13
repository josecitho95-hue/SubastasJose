import asyncio
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from prometheus_client import make_asgi_app

from app.core.config import get_settings
from app.core.database import engine
from app.observability.logging import configure_logging
from app.observability.metrics import setup_metrics
from app.observability.tracing import configure_tracing
from app.redis.client import close_redis, get_redis
from app.redis.streams import AuctionStream

settings = get_settings()
logger = structlog.get_logger()

configure_logging(level=settings.log_level)
configure_tracing()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown lifecycle."""
    logger.info("startup", service=settings.otel_service_name, env=settings.app_env)
    redis = await get_redis()
    await redis.connect()

    # Start WebSocket heartbeat task
    from app.websocket.manager import get_manager
    manager = get_manager()
    manager.start_heartbeat()

    # Start StreamBroadcaster background task (fan-out multi-replica)
    # Broadcasts Redis stream events to locally connected WebSocket clients.
    broadcaster_tasks: dict[str, asyncio.Task] = {}

    async def _broadcast_loop(auction_id: str) -> None:
        """Consume Redis stream for one auction and broadcast to local WS connections."""
        stream = AuctionStream(auction_id)
        last_id = "0"
        logger.info("stream_broadcaster_started", auction_id=auction_id)
        try:
            while True:
                events = await stream.read_events(last_id=last_id, block_ms=5000)
                for event in events:
                    last_id = event["id"]
                    if event.get("type") == "price_update":
                        await manager.broadcast(auction_id, event)
        except asyncio.CancelledError:
            logger.info("stream_broadcaster_stopped", auction_id=auction_id)
        except Exception as exc:
            logger.error("stream_broadcaster_error", auction_id=auction_id, exc=str(exc))

    async def _broadcaster_supervisor() -> None:
        """Poll active auctions every 30 s and ensure each has a running broadcaster."""
        from sqlalchemy import select as sa_select
        from app.core.database import AsyncSessionLocal
        from app.models.auction import Auction
        while True:
            try:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        sa_select(Auction.id).where(Auction.status == "active")
                    )
                    active_ids = {str(row[0]) for row in result.all()}

                # Start missing broadcasters
                for aid in active_ids:
                    if aid not in broadcaster_tasks or broadcaster_tasks[aid].done():
                        broadcaster_tasks[aid] = asyncio.create_task(_broadcast_loop(aid))

                # Cancel broadcasters for closed auctions
                for aid in list(broadcaster_tasks):
                    if aid not in active_ids:
                        broadcaster_tasks.pop(aid).cancel()

            except Exception as exc:
                logger.error("broadcaster_supervisor_error", exc=str(exc))

            await asyncio.sleep(30)

    supervisor_task = asyncio.create_task(_broadcaster_supervisor())

    yield

    logger.info("shutdown")
    supervisor_task.cancel()
    for task in broadcaster_tasks.values():
        task.cancel()
    await manager.stop()
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title="Subastas API",
    version="1.1.0",
    docs_url="/api/docs" if settings.app_env == "development" else None,
    redoc_url="/api/redoc" if settings.app_env == "development" else None,
    openapi_url="/api/openapi.json" if settings.app_env == "development" else None,
    lifespan=lifespan,
)

# Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# CORS (restrictive in prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
    expose_headers=["X-CSRF-Token"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Attach a unique request_id to every HTTP request for structured logging."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        path=request.url.path,
        method=request.method,
    )
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all handler: log unhandled exceptions and return a 500 JSON response."""
    logger.error("unhandled_exception", exc=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": getattr(request.state, "request_id", None)},
    )


# ---------------------------------------------------------------------------
# Routers
# TDD §5: /api/v1/auth, /api/v1/users (incl. KYC docs), /api/v1/auctions,
#          /api/v1/payments, /api/v1/admin, /ws/auctions/{id}
# ---------------------------------------------------------------------------
from app.api.v1.endpoints import (  # noqa: E402
    auth,
    auctions,
    users,
    payments,
    documents,
    admin as admin_endpoints,
    privacy,
    shipments,
    notifications,
)
from app.websocket import bid_handler  # noqa: E402

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
# users + KYC documents share /api/v1/users prefix (TDD §5.2)
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(documents.router, prefix="/api/v1/users", tags=["users"])
app.include_router(auctions.router, prefix="/api/v1", tags=["auctions"])
app.include_router(payments.router, prefix="/api/v1/payments", tags=["payments"])
app.include_router(shipments.router, prefix="/api/v1", tags=["shipments"])
app.include_router(admin_endpoints.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(notifications.router, prefix="/api/v1", tags=["notifications"])
app.include_router(privacy.router, tags=["privacy"])
app.include_router(bid_handler.router, tags=["websocket"])

# Serve uploaded files (images, KYC docs)
app.mount("/uploads", StaticFiles(directory=settings.local_storage_path), name="uploads")


@app.get("/api/health")
async def health():
    """Liveness probe endpoint."""
    return {"status": "ok", "version": "1.1.0"}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Inject security headers on every response (TDD §8.4)."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # CSP restrictivo para produccion
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://js.stripe.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' ws: wss: https://api.stripe.com; "
            "frame-src https://js.stripe.com https://hooks.stripe.com;"
        )
    return response


FastAPIInstrumentor.instrument_app(app)
setup_metrics(app)

