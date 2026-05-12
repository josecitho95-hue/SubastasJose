import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(async_client: AsyncClient):
    response = await async_client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_register(async_client: AsyncClient):
    payload = {
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
    }
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["full_name"] == "Test User"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(async_client: AsyncClient):
    payload = {
        "email": "dup@example.com",
        "password": "SecurePass123",
        "full_name": "Dup User",
    }
    r1 = await async_client.post("/api/v1/auth/register", json=payload)
    assert r1.status_code == 201

    r2 = await async_client.post("/api/v1/auth/register", json=payload)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_login(async_client: AsyncClient):
    # Register first
    reg = {
        "email": "login@example.com",
        "password": "SecurePass123",
        "full_name": "Login User",
    }
    await async_client.post("/api/v1/auth/register", json=reg)

    response = await async_client.post("/api/v1/auth/login", json={
        "email": "login@example.com",
        "password": "SecurePass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(async_client: AsyncClient):
    reg = {
        "email": "wrong@example.com",
        "password": "SecurePass123",
        "full_name": "Wrong User",
    }
    await async_client.post("/api/v1/auth/register", json=reg)

    response = await async_client.post("/api/v1/auth/login", json={
        "email": "wrong@example.com",
        "password": "WrongPassword",
    })
    assert response.status_code == 401
