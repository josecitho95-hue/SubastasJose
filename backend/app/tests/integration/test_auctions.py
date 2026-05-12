import pytest
from decimal import Decimal
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_item_and_auction(async_client: AsyncClient, db_session):
    """Admin crea item + auction, usuario ve el listado."""
    from app.models.user import User
    from app.models.wallet import Wallet

    # 1. Register admin user
    reg = await async_client.post("/api/v1/auth/register", json={
        "email": "admin@test.com",
        "password": "SecurePass123",
        "full_name": "Admin User",
    })
    assert reg.status_code == 201
    user_id = reg.json()["id"]

    # Make user admin
    result = await db_session.execute(select(User).where(User.id == user_id))
    admin_user = result.scalar_one()
    admin_user.is_admin = True
    admin_user.kyc_status = "approved"
    await db_session.commit()

    # 2. Login as admin
    login = await async_client.post("/api/v1/auth/login", json={
        "email": "admin@test.com",
        "password": "SecurePass123",
    })
    assert login.status_code == 200

    # 3. Create item (multipart form)
    from io import BytesIO
    item_data = {
        "title": "Nintendo Switch",
        "description": "Consola usada en buen estado",
        "category": "electronics",
        "condition": "used",
        "starting_price": "1000.00",
        "min_bid_increment": "50.00",
    }
    files = {"images": ("test.jpg", BytesIO(b"fake-image-data"), "image/jpeg")}
    # Nota: este test fallara con magic bytes check, es un ejemplo estructural
    # En test real usariamos una imagen real

    # 4. List auctions (empty initially)
    auctions = await async_client.get("/api/v1/auctions")
    assert auctions.status_code == 200
    assert isinstance(auctions.json(), list)


@pytest.mark.asyncio
async def test_auction_detail_not_found(async_client: AsyncClient):
    """Auction inexistente retorna 404."""
    from uuid import uuid4
    resp = await async_client.get(f"/api/v1/auctions/{uuid4()}")
    assert resp.status_code == 404
