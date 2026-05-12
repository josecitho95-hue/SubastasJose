# Subastas en Línea — MVP

Sistema de subastas en tiempo real con arquitectura híbrida hot/cold path.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.11 + FastAPI |
| Frontend | React 18 + Vite |
| Base de Datos | PostgreSQL 16 |
| Cache/Colas | Redis 7 + Lua atómico |
| Workers | Celery |
| Pagos | Stripe Connect Express (México) |
| Contenedores | Docker + Docker Compose |

## Arquitectura

```
[Usuario] → [Nginx] → [React]
                ↓
           [FastAPI] ←→ [Redis Lua]
                ↓           ↓
           [PostgreSQL]  [Celery]
```

## Inicio Rápido

### 1. Clonar y configurar

```bash
git clone https://github.com/josecitho95-hue/SubastasJose.git
cd SubastasJose
cp .env.example .env
# Editar .env con tus claves de Stripe
```

### 2. Levantar con Docker

```bash
docker compose up --build -d
```

### 3. Ejecutar migraciones

```bash
docker compose exec api alembic upgrade head
```

### 4. Poblar datos de prueba (seed)

```bash
docker compose exec api python -m scripts.run_seed
```

### 5. Acceder

- App: http://localhost
- API Docs: http://localhost/api/docs
- Admin: admin@subastas.local / AdminPass123!
- Usuarios: user1@example.com, user2@example.com / UserPass123!

## Variables de Entorno

| Variable | Descripción | Requerido |
|----------|-------------|-----------|
| `SECRET_KEY` | Clave JWT (generar con `openssl rand -base64 32`) | ✅ |
| `CSRF_SECRET` | Clave CSRF | ✅ |
| `DATABASE_URL` | URL PostgreSQL | ✅ |
| `REDIS_URL` | URL Redis | ✅ |
| `STRIPE_SECRET_KEY` | Clave secreta Stripe | ✅ |
| `STRIPE_PUBLISHABLE_KEY` | Clave pública Stripe | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Secret webhook Stripe | Para webhooks |
| `RESEND_API_KEY` | API key Resend | Para emails |
| `APP_ENV` | `development` o `production` | ✅ |

## Tests

### Funcionales (pytest)

```bash
cd backend
pytest app/tests/integration/ -v --cov=app
```

### No funcionales (k6)

```bash
# API REST
k6 run -e BASE_URL=http://localhost backend/app/tests/load/k6_api_rest.js

# WebSocket bidding
k6 run -e WS_URL=ws://localhost/ws/auctions/ -e AUCTION_ID=<uuid> backend/app/tests/load/k6_ws_bidding.js
```

## CI/CD

| Workflow | Trigger | Qué hace |
|----------|---------|----------|
| `ci.yml` | Push/PR | Tests, lint, build |
| `cd.yml` | Push a `main` | Deploy automático a VPS |
| `security.yml` | Lunes 2AM | Bandit, npm audit, Trivy |

### Secrets requeridos para CD

- `VPS_HOST`: IP o dominio del servidor
- `VPS_USER`: Usuario SSH
- `VPS_SSH_KEY`: Clave privada SSH
- `SLACK_WEBHOOK_URL`: Opcional, para notificaciones

## Roadmap Post-MVP

- [ ] Proxy bidding (puja automática)
- [ ] App móvil (React Native)
- [ ] Multi-vendedor (Stripe Connect)
- [ ] Búsqueda avanzada (Meilisearch)
- [ ] Notificaciones push (FCM)

## Licencia

MIT
