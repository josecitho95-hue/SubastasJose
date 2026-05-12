import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from prometheus_client import make_asgi_app

from app.core.config import get_settings
from app.core.database import engine
from app.observability.logging import configure_logging
from app.observability.metrics import setup_metrics
from app.redis.client import close_redis, get_redis

settings = get_settings()
logger = structlog.get_logger()

configure_logging(level=settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", service=settings.otel_service_name, env=settings.app_env)
    redis = await get_redis()
    await redis.connect()
    yield
    logger.info("shutdown")
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
    logger.error("unhandled_exception", exc=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": getattr(request.state, "request_id", None)},
    )


from app.api.v1.endpoints import auth, auctions, users, payments, documents, admin as admin_endpoints, privacy
from app.websocket import bid_handler
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(auctions.router, prefix="/api/v1", tags=["auctions"])
app.include_router(payments.router, prefix="/api/v1/payments", tags=["payments"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(admin_endpoints.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(privacy.router, tags=["privacy"])
app.include_router(bid_handler.router, tags=["websocket"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.1.0"}


FastAPIInstrumentor.instrument_app(app)
setup_metrics(app)
