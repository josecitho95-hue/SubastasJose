from fastapi import FastAPI
from prometheus_client import Counter, Gauge, Histogram, Info

APP_INFO = Info("subastas_app", "Application info")
REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration",
    ["method", "endpoint", "status_code"],
)
REQUEST_COUNT = Counter(
    "http_request_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)
WS_CONNECTIONS = Gauge(
    "websocket_active_connections",
    "Active WebSocket connections",
    ["auction_id"],
)
BID_LATENCY = Histogram(
    "bid_hot_path_latency_seconds",
    "Bid hot path latency",
    ["status"],
)


def setup_metrics(app: FastAPI) -> None:
    APP_INFO.info({"version": "1.1.0"})

    @app.middleware("http")
    async def prometheus_middleware(request, call_next):
        from time import time

        start = time()
        response = await call_next(request)
        duration = time() - start
        method = request.method
        endpoint = request.url.path
        status = str(response.status_code)

        REQUEST_DURATION.labels(method=method, endpoint=endpoint, status_code=status).observe(duration)
        REQUEST_COUNT.labels(method=method, endpoint=endpoint, status_code=status).inc()
        return response
