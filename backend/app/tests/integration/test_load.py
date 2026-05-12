import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_rate_limit_api(async_client: AsyncClient):
    """API debe resistir múltiples requests sin degradarse."""
    # 20 requests rapidos
    results = []
    for _ in range(20):
        r = await async_client.get("/api/health")
        results.append(r.status_code)

    assert all(code == 200 for code in results)


@pytest.mark.asyncio
async def test_concurrent_registrations(async_client: AsyncClient):
    """Registros concurrentes no deben crear duplicados."""
    import asyncio

    async def register(i):
        return await async_client.post("/api/v1/auth/register", json={
            "email": f"concurrent{i}@test.com",
            "password": "SecurePass123",
            "full_name": f"User {i}",
        })

    responses = await asyncio.gather(*[register(i) for i in range(5)])
    codes = [r.status_code for r in responses]

    assert all(c == 201 for c in codes)

    # Intentar duplicado
    dup = await async_client.post("/api/v1/auth/register", json={
        "email": "concurrent0@test.com",
        "password": "SecurePass123",
        "full_name": "Dup",
    })
    assert dup.status_code == 409
