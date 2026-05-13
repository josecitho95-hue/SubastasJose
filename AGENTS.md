# AGENTS.md — Subastas en Línea

Instrucciones compactas para sesiones de OpenCode. Omite lo obvio; conserva lo que un agente probablemente no deduciría solo.

---

## Stack & Entrypoints

| Capa | Tech | Entrypoint / Raíz |
|------|------|-------------------|
| API | Python 3.11 + FastAPI (async) | `backend/app/main.py` → `app.main:app` |
| Frontend | React 18 + Vite | `frontend/` → `npm run dev` (port 3000) |
| DB | PostgreSQL 16 | Migrations vía Alembic (`backend/alembic/`) |
| Cache/Queues | Redis 7 + Lua atómico | `backend/app/redis/` |
| Workers | Celery (worker + beat) | `backend/app/tasks/` (queues: `celery`, `persist_bid`, `charge_winner`) |
| Proxy | Nginx | `nginx/nginx.conf` (rate limiting, WS upgrade) |
| Pagos | Stripe Connect Express (México) | — |

---

## Setup Rápido

```bash
cp .env.example .env
# Editar claves de Stripe y secrets
docker compose up --build -d
docker compose exec api alembic upgrade head
docker compose exec api python -m scripts.run_seed
```

- App: `http://localhost`
- API Docs: `http://localhost/api/docs`
- Admin: `admin@subastas.local` / `AdminPass123!`
- Usuarios seed: `user1@example.com`, `user2@example.com` / `UserPass123!`

---

## Desarrollo Local (Hot-Reload)

Usar **dos terminales**; el frontend no está en `docker-compose.local.yml`:

**Terminal 1 — Infra + Backend:**
```bash
docker compose -f docker-compose.local.yml up -d
# Expone: db 5432, redis 6379, api 8000
# La imagen API usa `--reload` y `LOG_LEVEL=DEBUG`
```

**Terminal 2 — Frontend nativo:**
```bash
cd frontend && npm run dev
```

El `vite.config.js` ya proxyea `/api`, `/ws` y `/uploads` a `localhost:8000`.

> **Quirk de config:** `backend/app/core/config.py` lee `.env` desde `../.env` (relativo a `backend/app/`). En contenedores Docker se inyecta vía `env_file`; no dependas del autoload de Pydantic fuera del contenedor sin asegurar el working directory.

---

## Verificación / CI

**Backend tests** (requiere PostgreSQL + Redis activos):
```bash
cd backend
pytest app/tests/ -v --cov=app --cov-report=xml --cov-report=term
```

**Backend lint / typecheck:**
```bash
black --check app/
ruff check app/
mypy app/   # CI permite fallo con `|| true` mientras se corrigen tipos
```

**Frontend build:**
```bash
cd frontend
npm ci
npm run build
```

**Validar Docker Compose:**
```bash
docker compose config > /dev/null
docker compose build
```

Orden habitual en CI: lint → typecheck (no bloqueante) → tests → build frontend → validación docker.

---

## Arquitectura No Obvia

### WebSocket Bidding (Hot Path)
- Los clientes se conectan a `/ws/auctions/{auction_id}`.
- Nginx hace el upgrade a HTTP 1.1 (`proxy_read_timeout 3600s`).
- El backend usa **Redis Streams** (`backend/app/redis/streams.py`) para fan-out entre réplicas de API: cada réplica tiene un broadcaster task que lee el stream y reenvía a sus clientes WS locales.
- En `lifespan` de FastAPI (`main.py`) se arranca un supervisor que cada 30s revisa subastas activas y mantiene un broadcaster task por cada una.

### Celery Queues
- `celery`: tareas generales (`close_auctions`, `reconcile`).
- `persist_bid`: persistir pujas de Redis a PostgreSQL.
- `charge_winner`: cobro al ganador vía Stripe.
- El worker debe escuchar las tres: `celery -A app.tasks worker -l info -c 4 -Q celery,persist_bid,charge_winner`.

### Uploads / Storage
- Archivos subidos (imágenes de items, docs KYC) se sirven desde `/uploads` vía `StaticFiles`.
- En Docker el volumen es `uploads_data` montado en `/app/uploads`.
- El Dockerfile crea `/app/uploads/kyc` y `/app/uploads/items` en build time.

---

## Testing de Carga (k6)

Requiere [k6](https://k6.io/docs/get-started/installation/) instalado en el host.

```bash
# API REST
cd backend/app/tests/load
k6 run -e BASE_URL=http://localhost k6_api_rest.js

# WebSocket bidding stress
k6 run -e WS_URL=ws://localhost/ws/auctions/ -e AUCTION_ID=<uuid> k6_ws_bidding.js

# Endurance (10 min)
k6 run k6_endurance.js
```

---

## CI/CD

| Workflow | Trigger | Qué hace |
|----------|---------|----------|
| `ci.yml` | Push/PR a `main`, `develop` | Tests, lint (black/ruff/mypy), build frontend, validar docker-compose |
| `cd.yml` | Push a `main` | Deploy automático a VPS: backup DB → `git reset --hard origin/main` → build → up → migraciones → health check (`/api/health`) → cleanup imágenes |
| `security.yml` | Lunes 2 AM + manual | Bandit, `npm audit`, Trivy |

Secrets requeridos para CD: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Opcional: `SLACK_WEBHOOK_URL`.

---

## Observabilidad Opcional

```bash
docker compose --profile observability up -d
```
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

---

## Constraints Importantes

- **Stripe Connect Express México:** Requiere `STRIPE_CONNECT_CLIENT_ID` además de las claves estándar.
- **Topes LFPIORPI:** Variables `DEPOSIT_PER_EVENT_CAP`, `DEPOSIT_30D_CAP`, `DEPOSIT_ANNUAL_CAP` en MXN.
- **Alembic:** Las migraciones **no** corren automáticamente en deploy; el CD las ejecuta explícitamente con `docker compose exec -T api alembic upgrade head`.
- **Mypy:** No es gate bloqueante en CI todavía (`|| true`).
- **Nunca uses `git push --force` a `main` ni `--no-verify` a menos que el usuario lo pida explícitamente.**
