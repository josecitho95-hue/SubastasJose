import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint(async_client: AsyncClient):
    """Health check debe responder 200."""
    response = await async_client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "1.1.0"


@pytest.mark.asyncio
async def test_metrics_endpoint(async_client: AsyncClient):
    """Prometheus metrics deben estar disponibles."""
    response = await async_client.get("/metrics")
    assert response.status_code == 200
    assert "subastas_app_info" in response.text or "http_request_total" in response.text


@pytest.mark.asyncio
async def test_cors_headers(async_client: AsyncClient):
    """Headers CORS deben estar presentes en respuestas."""
    response = await async_client.get("/api/health")
    assert "access-control-allow-origin" in response.headers


@pytest.mark.asyncio
async def test_security_headers(async_client: AsyncClient):
    """Headers de seguridad deben estar presentes."""
    response = await async_client.get("/api/health")
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert "x-request-id" in response.headers
