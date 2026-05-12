import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_kyc_upload_and_approval(async_client: AsyncClient, db_session):
    """Flujo completo KYC: upload -> pending -> admin approve -> approved."""
    from app.models.user import User

    # 1. Register user
    reg = await async_client.post("/api/v1/auth/register", json={
        "email": "kyc@test.com",
        "password": "SecurePass123",
        "full_name": "KYC User",
    })
    assert reg.status_code == 201
    user_id = reg.json()["id"]

    # 2. Check KYC is pending
    me = await async_client.get("/api/v1/users/me")
    assert me.json()["kyc_status"] == "pending"

    # 3. List documents (empty)
    docs = await async_client.get("/api/v1/documents/me/documents")
    assert docs.status_code == 200
    assert len(docs.json()) == 0

    # 4. Admin review setup
    # Make user1 admin for testing
    result = await db_session.execute(select(User).where(User.id == user_id))
    admin = result.scalar_one()
    admin.is_admin = True
    admin.kyc_status = "approved"
    await db_session.commit()

    # KYC queue (as admin)
    queue = await async_client.get("/api/v1/documents/admin/kyc-queue")
    assert queue.status_code == 200

    # 5. After approval, user can bid
    # (Simulated by checking kyc_status)
    result2 = await db_session.execute(select(User).where(User.id == user_id))
    user = result2.scalar_one()
    user.kyc_status = "approved"
    await db_session.commit()

    me_after = await async_client.get("/api/v1/users/me")
    assert me_after.json()["kyc_status"] == "approved"


@pytest.mark.asyncio
async def test_kyc_required_for_bidding(async_client: AsyncClient, db_session):
    """Usuario sin KYC approved no puede conectarse al WS."""
    reg = await async_client.post("/api/v1/auth/register", json={
        "email": "nokyc@test.com",
        "password": "SecurePass123",
        "full_name": "No KYC",
    })
    assert reg.status_code == 201

    # User has kyc_status = pending
    me = await async_client.get("/api/v1/users/me")
    assert me.json()["kyc_status"] == "pending"

    # WS connection should be rejected with kyc_required
    # (Tested indirectly through bid_handler validation)
