import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

from app.core.config import Settings, get_settings
from app.core.database import Base, get_db
from app.main import app
from app.redis.client import RedisClient


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7-alpine") as redis:
        yield redis


@pytest.fixture(scope="session")
def test_settings(postgres_container, redis_container):
    db_url = postgres_container.get_connection_url().replace("postgresql://", "postgresql+asyncpg://")
    redis_url = redis_container.get_connection_url()
    return Settings(
        database_url=db_url,
        redis_url=redis_url,
        secret_key="test-secret-key-for-unit-tests",
        csrf_secret="test-csrf-secret",
        app_env="testing",
        stripe_secret_key="sk_test_dummy",
    )


@pytest_asyncio.fixture
async def db_engine(test_settings):
    engine = create_async_engine(test_settings.async_database_url, echo=False, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncSession:
    async_session = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session


@pytest_asyncio.fixture
async def redis_client(test_settings):
    client = RedisClient()
    client._redis = None
    client._scripts = {}
    # Monkey-patch settings temporarily
    original_url = get_settings().redis_url
    get_settings().redis_url = test_settings.redis_url
    await client.connect()
    yield client
    await client.close()
    get_settings().redis_url = original_url


@pytest_asyncio.fixture
async def async_client(db_engine, redis_client, test_settings):
    async_session = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()
