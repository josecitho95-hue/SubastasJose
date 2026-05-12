"""
Script de inicialización (seed) para el MVP de Subastas.
Crea: admin, items de prueba, subastas activas.

Uso:
    docker compose exec api python -m scripts.seed
    # o desde local con variables de entorno configuradas
    cd backend && python -m scripts.seed
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal, engine
from app.core.security import get_password_hash
from app.models.auction import Auction
from app.models.item import Item
from app.models.user import User
from app.models.wallet import Wallet
from app.redis.client import get_redis

settings = get_settings()


async def create_admin(db: AsyncSession):
    """Crear usuario administrador."""
    admin = User(
        id=uuid.uuid4(),
        email="admin@subastas.local",
        hashed_password=get_password_hash("AdminPass123!"),
        full_name="Administrador",
        phone="5555555555",
        is_active=True,
        is_verified=True,
        is_admin=True,
        kyc_status="approved",
        kyc_level="basic",
    )
    db.add(admin)
    await db.flush()

    wallet = Wallet(user_id=admin.id, balance=Decimal("0"), held_balance=Decimal("0"))
    db.add(wallet)
    await db.commit()

    print(f"✅ Admin creado: {admin.email} / AdminPass123!")
    return admin


async def create_demo_users(db: AsyncSession):
    """Crear usuarios de prueba con KYC aprobado y saldo."""
    users_data = [
        {"email": "user1@example.com", "name": "Usuario Uno", "balance": Decimal("50000.00")},
        {"email": "user2@example.com", "name": "Usuario Dos", "balance": Decimal("30000.00")},
        {"email": "user3@example.com", "name": "Usuario Tres", "balance": Decimal("10000.00")},
    ]

    users = []
    for data in users_data:
        user = User(
            id=uuid.uuid4(),
            email=data["email"],
            hashed_password=get_password_hash("UserPass123!"),
            full_name=data["name"],
            is_active=True,
            is_verified=True,
            kyc_status="approved",
            kyc_level="basic",
        )
        db.add(user)
        await db.flush()

        wallet = Wallet(user_id=user.id, balance=data["balance"], held_balance=Decimal("0"))
        db.add(wallet)
        users.append(user)

    await db.commit()
    print(f"✅ {len(users)} usuarios de prueba creados")
    return users


async def create_items(db: AsyncSession):
    """Crear items de prueba con imágenes placeholder."""
    items_data = [
        {
            "title": "Nintendo Switch OLED",
            "description": "Consola en perfecto estado. Incluye 2 Joy-Cons, dock original y cables. 6 meses de uso.",
            "category": "electronics",
            "condition": "used",
            "starting_price": Decimal("2500.00"),
            "reserve_price": Decimal("4000.00"),
            "min_bid_increment": Decimal("50.00"),
            "images": ["items/placeholder-switch/full_0.jpg"],
        },
        {
            "title": "iPhone 14 Pro 256GB",
            "description": "iPhone 14 Pro color Deep Purple. Batería al 92%. Sin detalles. Caja original.",
            "category": "electronics",
            "condition": "used",
            "starting_price": Decimal("8000.00"),
            "reserve_price": Decimal("12000.00"),
            "min_bid_increment": Decimal("100.00"),
            "images": ["items/placeholder-iphone/full_0.jpg"],
        },
        {
            "title": "Chamarra Levi's Original",
            "description": "Chamarra de mezclilla Levi's talla M. Casi nueva, usada solo 2 veces.",
            "category": "clothing",
            "condition": "used",
            "starting_price": Decimal("800.00"),
            "reserve_price": None,
            "min_bid_increment": Decimal("20.00"),
            "images": ["items/placeholder-chamarra/full_0.jpg"],
        },
        {
            "title": "Lego Star Wars Millennium Falcon",
            "description": "Set LEGO 75192 Ultimate Collector's Series. 7541 piezas. Sellado en caja original.",
            "category": "toys",
            "condition": "new",
            "starting_price": Decimal("5000.00"),
            "reserve_price": Decimal("4500.00"),
            "min_bid_increment": Decimal("100.00"),
            "images": ["items/placeholder-lego/full_0.jpg"],
        },
        {
            "title": "MacBook Pro M2 14\"",
            "description": "MacBook Pro 14 pulgadas con chip M2 Pro, 16GB RAM, 512GB SSD. Garantía vigente.",
            "category": "electronics",
            "condition": "new",
            "starting_price": Decimal("15000.00"),
            "reserve_price": Decimal("25000.00"),
            "min_bid_increment": Decimal("200.00"),
            "images": ["items/placeholder-macbook/full_0.jpg"],
        },
        {
            "title": "Tenis Nike Air Jordan 1 Retro",
            "description": "Air Jordan 1 High OG 'Chicago' talla 9 MX. Originales con certificado de autenticidad.",
            "category": "clothing",
            "condition": "new",
            "starting_price": Decimal("3000.00"),
            "reserve_price": None,
            "min_bid_increment": Decimal("50.00"),
            "images": ["items/placeholder-jordan/full_0.jpg"],
        },
    ]

    items = []
    for data in items_data:
        item = Item(
            id=uuid.uuid4(),
            title=data["title"],
            description=data["description"],
            category=data["category"],
            condition=data["condition"],
            images=data["images"],
            starting_price=data["starting_price"],
            reserve_price=data.get("reserve_price"),
            min_bid_increment=data["min_bid_increment"],
        )
        db.add(item)
        items.append(item)

    await db.commit()
    print(f"✅ {len(items)} items de prueba creados")
    return items


async def create_auctions(db: AsyncSession, items, admin):
    """Crear subastas activas con diferentes tiempos."""
    now = datetime.now(timezone.utc)

    auctions_data = [
        # Subasta activa (termina en 30 min)
        {
            "item": items[0],
            "start": now - timedelta(hours=1),
            "end": now + timedelta(minutes=30),
            "price": Decimal("2800.00"),
        },
        # Subasta activa (termina en 2 horas)
        {
            "item": items[1],
            "start": now - timedelta(minutes=30),
            "end": now + timedelta(hours=2),
            "price": Decimal("8500.00"),
        },
        # Subasta activa (termina en 5 min - para probar anti-sniping)
        {
            "item": items[2],
            "start": now - timedelta(minutes=30),
            "end": now + timedelta(minutes=5),
            "price": Decimal("900.00"),
        },
        # Subasta programada (empieza en 1 hora)
        {
            "item": items[3],
            "start": now + timedelta(hours=1),
            "end": now + timedelta(hours=3),
            "price": items[3].starting_price,
        },
        # Subasta activa (termina en 1 día)
        {
            "item": items[4],
            "start": now - timedelta(hours=2),
            "end": now + timedelta(days=1),
            "price": Decimal("16000.00"),
        },
        # Subasta activa (termina en 15 min)
        {
            "item": items[5],
            "start": now - timedelta(minutes=15),
            "end": now + timedelta(minutes=15),
            "price": Decimal("3200.00"),
        },
    ]

    auctions = []
    redis = await get_redis()

    for data in auctions_data:
        auction = Auction(
            id=uuid.uuid4(),
            item_id=data["item"].id,
            seller_id=admin.id,
            start_time=data["start"],
            end_time=data["end"],
            current_price=data["price"],
            status="active" if data["start"] <= now else "scheduled",
        )
        db.add(auction)
        await db.flush()
        auctions.append(auction)

        # Inicializar estado en Redis para subastas activas
        if auction.status == "active":
            await redis.set_auction_state(str(auction.id), {
                "current_price": str(auction.current_price),
                "leader_id": "",
                "end_time": str(int(auction.end_time.timestamp() * 1000)),
                "status": "active",
                "min_bid_increment": str(data["item"].min_bid_increment),
            })

    await db.commit()
    print(f"✅ {len(auctions)} subastas creadas ({sum(1 for a in auctions if a.status == 'active')} activas)")
    return auctions


async def create_placeholder_images():
    """Crear imágenes placeholder para los items."""
    from PIL import Image, ImageDraw, ImageFont

    uploads_dir = Path(settings.local_storage_path)
    placeholders = {
        "placeholder-switch": ("Nintendo Switch", (255, 50, 50)),
        "placeholder-iphone": ("iPhone 14 Pro", (50, 150, 255)),
        "placeholder-chamarra": ("Levi's Jacket", (200, 150, 50)),
        "placeholder-lego": ("LEGO Falcon", (50, 200, 100)),
        "placeholder-macbook": ("MacBook Pro", (150, 50, 200)),
        "placeholder-jordan": ("Air Jordan 1", (255, 100, 50)),
    }

    for folder, (text, color) in placeholders.items():
        dir_path = uploads_dir / "items" / folder
        dir_path.mkdir(parents=True, exist_ok=True)

        for size_name, (w, h) in [("thumb", (200, 200)), ("card", (600, 600)), ("full", (1200, 1200))]:
            img = Image.new("RGB", (w, h), color)
            draw = ImageDraw.Draw(img)

            # Dibujar texto centrado
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(w/10))
            except:
                font = ImageFont.load_default()

            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (w - text_width) / 2
            y = (h - text_height) / 2

            draw.text((x, y), text, fill="white", font=font)
            draw.text((x, y + text_height + 10), f"{w}x{h}", fill="white", font=font)

            img.save(dir_path / f"{size_name}_0.jpg", quality=85)

    print(f"✅ {len(placeholders)} imágenes placeholder creadas")


async def seed():
    """Ejecutar todo el seed."""
    print("\n🌱 Iniciando seed del MVP Subastas...\n")

    async with AsyncSessionLocal() as db:
        # 1. Admin
        admin = await create_admin(db)

        # 2. Usuarios de prueba
        users = await create_demo_users(db)

        # 3. Items
        items = await create_items(db)

        # 4. Subastas
        auctions = await create_auctions(db, items, admin)

    # 5. Imágenes placeholder
    await create_placeholder_images()

    print("\n✨ Seed completado exitosamente!")
    print(f"\nAccesos:")
    print(f"  Admin: admin@subastas.local / AdminPass123!")
    print(f"  Users: user1@example.com, user2@example.com, user3@example.com")
    print(f"  Pass usuarios: UserPass123!")
    print(f"\nSubastas activas: {sum(1 for a in auctions if a.status == 'active')}")
    print(f"Total items: {len(items)}")


if __name__ == "__main__":
    asyncio.run(seed())
