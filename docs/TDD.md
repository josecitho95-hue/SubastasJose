# Plataforma de Subastas en Línea — Technical Design Document (TDD)

**Versión:** 1.1
**Stack:** Python (FastAPI async) + React (Vite) + PostgreSQL + Redis (Lua + Streams) + Celery + Docker
**Moneda:** MXN
**Ambiente MVP:** Docker Compose local
**Ambiente Producción:** VPS escalable (Hetzner/AWS Lightsail)

---

## 1. Resumen Ejecutivo

Sistema de subastas en línea para artículos diversos (juguetes electrónicos, ropa). Soporta registro de usuarios, verificación manual de identidad (KYC), depósitos en garantía vía Stripe, pujas en tiempo real mediante WebSockets, y un dashboard de control. Diseñado para soportar 500-1000 usuarios concurrentes pujando sin pérdida de consistencia, con una arquitectura desacoplada que permita migrar a producción sin reescribir código.

---

## 2. Stack Tecnológico Definitivo

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Backend** | Python 3.11+ + FastAPI | Async nativo, WebSockets integrados, alto rendimiento en I/O bound (pujas). |
| **ORM / Validación** | SQLAlchemy 2.0 + Pydantic v2 | Modelado declarativo, migraciones con Alembic. |
| **Base de Datos** | PostgreSQL 16 | Transaccional ACID, robusto para historial de pujas y pagos. |
| **Cache / Streams / Cola** | Redis 7 | Estado en vivo de subastas (hot path Lua), Streams para fan-out de eventos a réplicas FastAPI con replay, broker de Celery para cold path. |
| **Workers Async** | Celery + Redis (Broker y Backend) | Cold path: persistencia de pujas a PG, cobros, refunds, cron de cierre. **No** está en el hot path de validación (ver §6). |
| **Hot Path Pujas** | Redis 7 + script Lua | Validación atómica e idempotente (precio + saldo + ventana temporal) en una sola operación Redis. Elimina condición de carrera por construcción. |
| **Frontend** | React 18 + Vite | Build rápido, HMR, bundle ligero. |
| **Estado Frontend** | Zustand | Ligero, sin boilerplate, manejo de estado global de subastas y auth. |
| **Decimales Frontend** | `decimal.js` | Manejo de montos sin pérdida de precisión IEEE754. Prohibido usar `Number` para montos. |
| **Auth** | JWT (python-jose) + OAuth2 Password Flow | Sin costos de terceros en MVP. Token en **cookie httpOnly + SameSite=Strict** (no localStorage). |
| **Pasarela de Pagos** | **Stripe Connect Express** (México) | Stripe es Merchant of Record → traslada compliance CNBV/CONDUSEF a Stripe Payments Mexico. Depósitos en garantía, retenciones y cobros en MXN. Soporta tarjeta + OXXO Pay. **3DS obligatorio** (CNBV 2024). |
| **Imágenes** | Pillow | Generación de thumbnails (200/600/1200 px) al subir, validación por magic bytes. |
| **Observabilidad** | `structlog` + Prometheus client + OpenTelemetry | Desde día 1: logs estructurados con `request_id`+`user_id`, métricas Prometheus, tracing distribuido del path WS→Lua→PG. |
| **Storage** | Local filesystem (MVP) | Imágenes y documentos KYC. Migración a MinIO/S3 transparente vía abstracción `StorageBackend`. |
| **Web Server** | Nginx | Reverse proxy, servir frontend estático, rate limiting (IP), SSL (Let's Encrypt en prod), upgrade WS con `proxy_http_version 1.1`. |
| **Contenedores** | Docker + Docker Compose | Infraestructura como código. Cada servicio es un contenedor independiente. |

---

## 3. Arquitectura del Sistema

### 3.1 Diagrama de Componentes (Local)

```
┌─────────────────────────────────────────────────────────────┐
│                        HOST (Docker)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Nginx      │  │  PostgreSQL  │  │      Redis       │  │
│  │   :80/:443   │  │    :5432     │  │      :6379       │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘  │
│         │                                                    │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  React (Vite)│  │  FastAPI API │  │  Celery Worker   │  │
│  │  :3000 (dev) │  │    :8000     │  │   (bid queue)    │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────┘  │
│                           │                                  │
│                    WebSocket (ws://)                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Diagrama de Flujo de una Puja (Arquitectura Híbrida)

**Principio:** validación atómica en Redis (hot path, < 30 ms) + persistencia diferida en PostgreSQL vía Celery (cold path). El cliente recibe ACK inmediato; la durabilidad se garantiza vía Redis AOF + cola persistente.

```
[Usuario Frontend]
       │
       ▼ (WebSocket: {type:"bid", client_bid_id, amount:"150.00"})
[FastAPI WS Endpoint]
       │
       ▼ (Auth cookie httpOnly + dedup por client_bid_id)
       │
       ╔════════════════ HOT PATH (Redis Lua atómico) ════════════════╗
       ║  EVALSHA bid_script KEYS[auction:{id}:state, user:{id}:hold] ║
       ║    1. Validar now < end_time                                  ║
       ║    2. Validar amount >= current_price + min_increment         ║
       ║    3. Validar saldo libre del usuario                         ║
       ║    4. SET current_price, leader_id                            ║
       ║    5. Mover hold del leader anterior → al nuevo leader        ║
       ║    6. Si end_time - now < 60s → end_time += 60s (anti-snipe)  ║
       ║    7. XADD stream:auction:{id} (evento durable)               ║
       ║    8. Retornar {ok|rejected, new_price, new_end_time}         ║
       ╚═══════════════════════════════════════════════════════════════╝
       │
       ├─► ACK al cliente vía WS (< 30 ms desde envío)
       │
       ▼ (Si ok: encolar tarea Celery)
       │
       ╔════════════════ COLD PATH (Celery worker) ═══════════════════╗
       ║   INSERT bids (immutable history)                              ║
       ║   UPDATE auctions (current_price, winning_bidder, end_time)    ║
       ║   UPDATE wallets (release prev leader, hold new leader)        ║
       ║   Todo en UNA transacción PG + idempotency_key = client_bid_id ║
       ╚═══════════════════════════════════════════════════════════════╝
       │
       ▼ (XREAD del stream desde otras instancias FastAPI)
[FastAPI WS Manager (todas las réplicas)]
       │
       ▼ (Broadcast con backpressure: timeout 200ms por conexión)
[Usuarios Conectados] (price_update con secuencia monotónica)
```

**Por qué Streams en lugar de PubSub:** los Streams persisten, permiten replay en reconexión (cursor por cliente), y soportan consumer groups para fan-out a múltiples réplicas FastAPI sin perder mensajes.

---

## 4. Modelo de Datos (Esquema Relacional)

### 4.1 Entidades Principales

**`users`**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador único |
| `email` | VARCHAR(255), UNIQUE | Correo electrónico |
| `hashed_password` | VARCHAR(255) | Contraseña hasheada (bcrypt) |
| `full_name` | VARCHAR(255) | Nombre completo |
| `phone` | VARCHAR(20) | Teléfono |
| `is_active` | BOOLEAN | Cuenta activa |
| `is_verified` | BOOLEAN | Email verificado |
| `kyc_status` | ENUM('pending','approved','rejected') | Estado de validación de documentos |
| `kyc_level` | ENUM('basic','enhanced') DEFAULT 'basic' | `basic` = solo INE (MVP). `enhanced` = INE+CURP+RFC+selfie (cuando se cruce el umbral LFPIORPI). |
| `curp` | VARCHAR(18) NULL | Solo requerido al subir a `enhanced`. |
| `rfc` | VARCHAR(13) NULL | Solo requerido al subir a `enhanced`. |
| `lifetime_deposit_mxn` | DECIMAL(14,2) DEFAULT 0 | Acumulado de depósitos. Usado para gatillar `enhanced` al acercarse al umbral LFPIORPI (ver §16). |
| `shipping_address` | JSONB | Dirección de envío por defecto |
| `stripe_customer_id` | VARCHAR(255) | ID de cliente en Stripe (lado plataforma). |
| `stripe_connect_account_id` | VARCHAR(255) NULL | Solo vendedores (admin en MVP): ID de la connected account de Stripe Connect Express. |
| `created_at` | TIMESTAMP | Fecha de registro |
| `updated_at` | TIMESTAMP | Última actualización |

**`documents` (KYC)**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador |
| `user_id` | UUID (FK) | Usuario dueño |
| `type` | ENUM('ine','passport','proof_address') | Tipo de documento |
| `file_path` | VARCHAR(500) | Ruta del archivo |
| `status` | ENUM('pending','approved','rejected') | Estado de revisión |
| `reviewed_by` | UUID (FK, admin) | Admin que revisó |
| `review_notes` | TEXT | Notas del revisor |
| `uploaded_at` | TIMESTAMP | Fecha de subida |
| `reviewed_at` | TIMESTAMP | Fecha de revisión |

**`wallets` (Depósitos en garantía)**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador |
| `user_id` | UUID (FK) | Usuario |
| `balance` | DECIMAL(12,2) | Saldo disponible |
| `held_balance` | DECIMAL(12,2) | Saldo retenido en subastas activas |
| `currency` | VARCHAR(3) | 'MXN' |
| `updated_at` | TIMESTAMP | Último movimiento |

**`transactions`**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador |
| `wallet_id` | UUID (FK) | Billetera afectada |
| `type` | ENUM('deposit','hold','release','charge','refund') | Tipo de transacción |
| `amount` | DECIMAL(12,2) | Monto |
| `status` | ENUM('pending','completed','failed') | Estado |
| `stripe_payment_intent_id` | VARCHAR(255) NULL | ID de Stripe (si aplica) |
| `idempotency_key` | VARCHAR(255) NOT NULL | Clave para dedup de webhooks Stripe y reintentos. **UNIQUE**. |
| `description` | TEXT | Descripción |
| `created_at` | TIMESTAMP | Fecha de transacción |

> Restricción: `UNIQUE(idempotency_key)` y `UNIQUE(stripe_payment_intent_id, type) WHERE stripe_payment_intent_id IS NOT NULL` — evitan procesar dos veces el mismo evento de Stripe.

**`items` (Artículos a subastar)**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador |
| `title` | VARCHAR(255) | Título |
| `description` | TEXT | Descripción detallada |
| `category` | ENUM('electronics','clothing','toys','other') | Categoría |
| `condition` | ENUM('new','used','refurbished') | Estado del artículo |
| `images` | JSONB | Array de rutas de imágenes |
| `starting_price` | DECIMAL(12,2) | Precio inicial |
| `reserve_price` | DECIMAL(12,2) | Precio de reserva (nullable, oculto) |
| `min_bid_increment` | DECIMAL(12,2) | Incremento mínimo de puja |
| `created_at` | TIMESTAMP | Fecha de creación |

**`auctions`**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador |
| `item_id` | UUID (FK) | Artículo subastado |
| `seller_id` | UUID (FK) | Vendedor (admin en MVP) |
| `status` | ENUM('scheduled','active','closed','closed_no_sale','cancelled') | Estado. `closed_no_sale` si `final_price < reserve_price`. |
| `start_time` | TIMESTAMP | Inicio de la subasta |
| `end_time` | TIMESTAMP | Fin de la subasta (mutable durante anti-sniping) |
| `current_price` | DECIMAL(12,2) | Precio actual. **Durable** en PG (eventual consistency desde Redis vía cold path). Ver §17.1 — Redis es la fuente autoritativa mientras `status='active'`. |
| `winning_bidder_id` | UUID (FK, nullable) | Ganador actual |
| `final_price` | DECIMAL(12,2) | Precio final (al cerrar) |
| `created_at` | TIMESTAMP | Fecha de creación |

**`bids` (Historial inmutable)**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador |
| `auction_id` | UUID (FK) | Subasta |
| `user_id` | UUID (FK) | Pujador |
| `amount` | DECIMAL(12,2) | Monto de la puja |
| `is_winning` | BOOLEAN | ¿Es la puja ganadora actual? |
| `placed_at` | TIMESTAMP | Fecha exacta de la puja |

**`shipments`**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID (PK) | Identificador |
| `auction_id` | UUID (FK) | Subasta ganada |
| `winner_id` | UUID (FK) | Ganador |
| `method` | ENUM('standard','express','pickup') | Método de envío |
| `address` | JSONB | Dirección de envío |
| `status` | ENUM('pending','shipped','delivered') | Estado |
| `tracking_number` | VARCHAR(255) | Número de rastreo |
| `created_at` | TIMESTAMP | Fecha de creación |

### 4.2 Índices y Particionamiento (definir en migración inicial)

| Tabla | Índice | Motivo |
|-------|--------|--------|
| `bids` | `(auction_id, placed_at DESC)` | Render del historial de pujas. |
| `bids` | `UNIQUE (auction_id) WHERE is_winning = TRUE` (partial) | Garantiza invariante: a lo sumo una puja ganadora por subasta. |
| `bids` | Particionado **por mes** (PG declarative partitioning sobre `placed_at`) | Anticipar crecimiento; subastas activas escriben mucho. |
| `auctions` | `(end_time) WHERE status='active'` (partial) | Scheduler de cierre + lista de subastas próximas a expirar. |
| `auctions` | `(status, start_time)` | Listado público paginado. |
| `users` | `(email)` UNIQUE | Login. |
| `users` | `(kyc_status, lifetime_deposit_mxn DESC)` | Panel admin + alerta de umbral LFPIORPI. |
| `transactions` | `UNIQUE (idempotency_key)` | Dedup. |
| `transactions` | `(wallet_id, created_at DESC)` | Estado de cuenta del usuario. |
| `documents` | `(user_id, status)` | Cola de revisión KYC. |

---

## 5. Especificación de API (Endpoints Principales)

### 5.1 Autenticación (`/api/v1/auth`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/register` | Registro de usuario | No |
| POST | `/login` | Login, devuelve JWT | No |
| POST | `/refresh` | Refresh token | Sí (JWT) |

### 5.2 Usuarios (`/api/v1/users`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/me` | Perfil del usuario logueado | Sí |
| PUT | `/me` | Actualizar perfil y dirección | Sí |
| GET | `/me/dashboard` | Subastas ganadas, activas, pujas | Sí |
| POST | `/me/documents` | Subir documento KYC | Sí |

### 5.3 Subastas (`/api/v1/auctions`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/` | Listar subastas activas (paginado) | No |
| GET | `/{id}` | Detalle de una subasta | No |
| GET | `/{id}/bids` | Historial de pujas de una subasta | No |

### 5.4 Pujas (`/api/v1/bids`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/` | **NO USAR vía HTTP**. Las pujas se envían vía WebSocket. | Sí |

### 5.5 Pagos / Depósitos (`/api/v1/payments`)

Implementación sobre **Stripe Connect Express** — la plataforma es facilitator, Stripe es Merchant of Record.

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/deposit` | Crear `PaymentIntent` (tarjeta o OXXO). Valida topes LFPIORPI antes de llamar a Stripe (ver abajo). | Sí |
| POST | `/webhook/stripe` | Webhook firmado. Procesa `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`. Dedup por `idempotency_key`. | No (firma) |
| GET | `/wallet` | Ver saldo, retenido y `lifetime_deposit_mxn`. | Sí |
| POST | `/connect/onboarding` | Genera link de onboarding para vendedor (Express). | Sí (admin) |

**Validación pre-PaymentIntent (topes LFPIORPI — ver §16):**
- Si `amount + user.lifetime_deposit_30d > MXN 60,000` → 422 `deposit_exceeds_per_event_cap`.
- Si `amount + user.lifetime_deposit_mxn (12 meses) > MXN 180,000` → 422 `deposit_exceeds_annual_cap`.
- Si la tarjeta es mexicana → forzar `payment_method_options.card.request_three_d_secure='any'` (CNBV 2024).
- Para OXXO Pay: el saldo NO se acredita hasta `payment_intent.succeeded` (delay 24-72 h). Frontend muestra "pendiente de pago en OXXO" sin habilitar pujas.

### 5.6 WebSocket (`/ws/auctions/{auction_id}`)

- **Conexión:** `ws://localhost/ws/auctions/123e4567`
- **Autenticación:** cookie httpOnly `session=<JWT>` enviada automáticamente por el navegador en el upgrade. El endpoint la valida ANTES de aceptar el upgrade. Sin cookie válida → 401 (no se establece WS).
- **Heartbeat:** ping cada **20 s** desde el servidor; el cliente responde pong. 2 misses consecutivos → desconexión. Necesario porque Nginx/proxies cortan WS idle a los 30-60 s.
- **Reconexión cliente:** backoff exponencial con jitter (1s, 2s, 4s, 8s, máx 30s). Al reconectar, enviar `{"type":"resume","last_seq":N}` para replay desde Redis Streams.
- **Backpressure:** cada `send` en el servidor usa `asyncio.wait_for(timeout=0.2)`. Cliente que no drena en 200ms → desconectado para no bloquear el broadcast.
- **Montos como string:** todos los montos viajan como string para evitar pérdida de precisión IEEE754.

**Mensajes Cliente → Servidor:**
```json
{ "type": "bid", "client_bid_id": "550e8400-e29b-41d4-a716-446655440000", "amount": "150.00" }
{ "type": "resume", "last_seq": 4821 }
{ "type": "pong" }
```

**Mensajes Servidor → Cliente:**
```json
{ "type": "ack", "client_bid_id": "550e...", "status": "accepted", "seq": 4822 }
{ "type": "ack", "client_bid_id": "550e...", "status": "rejected", "reason": "below_min_increment" }
{ "type": "price_update", "seq": 4822, "current_price": "150.00", "leader_id": "uuid", "end_time": "2026-05-11T10:01:00Z", "timestamp": "2026-05-11T10:00:00Z" }
{ "type": "error", "code": "insufficient_balance", "message": "Saldo insuficiente" }
{ "type": "auction_closed", "winner_id": "uuid", "final_price": "300.00" }
{ "type": "ping" }
```

**Códigos de error normalizados:** `below_min_increment`, `auction_ended`, `insufficient_balance`, `kyc_required`, `rate_limited`, `duplicate_bid_id`, `unauthenticated`.

> `client_bid_id` es generado por el frontend (UUID v4) y permite dedup tanto en reconexiones como en doble-click. El servidor mantiene un SET en Redis `dedup:user:{id}` con TTL 60s.

---

## 6. Flujo de Pujas en Tiempo Real (Detallado)

### 6.1 Conexión y Pre-validación (FastAPI)

1. **Conexión WS:** Usuario entra a la página. Frontend abre WS a `/ws/auctions/{id}`. FastAPI valida cookie httpOnly → JWT → carga `user` y `kyc_status`. Si KYC ≠ `approved` → cierra con `kyc_required`.
2. **Suscripción:** La conexión se añade a la "room" de la subasta. El servidor envía snapshot inicial: `current_price`, `end_time`, `leader_id`, `last_seq`.
3. **Heartbeat:** ping/pong cada 20s.

### 6.2 Envío y Validación de Puja (Hot Path — Redis Lua)

4. **Cliente envía:** `{type:"bid", client_bid_id, amount:"150.00"}`.
5. **Pre-check FastAPI (sin tocar Redis state):** formato válido, dedup `client_bid_id` (SET en Redis TTL 60s), rate limit (1 puja / 3s por usuario, token bucket Lua).
6. **EVALSHA del script Lua atómico** (`bid_script`) con KEYS = `[auction:{id}:state, user:{user_id}:wallet]`, ARGV = `[amount, now_ms, user_id, client_bid_id]`. El script ejecuta atómicamente:
   1. Cargar `state` (current_price, leader_id, end_time, min_increment, prev_leader_hold).
   2. Si `now_ms >= end_time` → retornar `{rejected, auction_ended}`.
   3. Si `amount < current_price + min_increment` → retornar `{rejected, below_min_increment}`.
   4. Si `wallet.free < amount` → retornar `{rejected, insufficient_balance}`.
   5. Mover `hold` del leader anterior de vuelta a `free` (release).
   6. Mover `amount` del nuevo leader de `free` a `hold`.
   7. Actualizar `current_price`, `leader_id`.
   8. **Anti-sniping:** si `end_time - now_ms < 60_000` → `end_time += 60_000`.
   9. `XADD stream:auction:{id} *` con el evento `bid_accepted`.
   10. Retornar `{accepted, new_price, new_end_time, seq}`.
7. **ACK al cliente:** FastAPI envía `{type:"ack", status, seq}` por WS (< 50 ms p99 desde el envío).

### 6.3 Persistencia y Broadcast (Cold Path — Celery)

8. **Encolar tarea Celery** `persist_bid` con el payload del evento + `idempotency_key = client_bid_id`.
9. **Worker Celery (en una única transacción PG):**
   - `INSERT INTO bids` con `is_winning = TRUE`.
   - `UPDATE bids SET is_winning = FALSE WHERE auction_id = X AND id != nueva` (el partial unique index protege la invariante).
   - `UPDATE auctions SET current_price, winning_bidder_id, end_time`.
   - `UPDATE wallets`: libera hold del leader anterior, aplica hold al nuevo leader.
   - `INSERT INTO transactions` con `idempotency_key` para release y hold.
   - Si la transacción falla → retry exponencial (3 intentos). Si todos fallan → alerta + entrada en `failed_bids` para reconciliación manual (la puja sigue siendo válida en Redis; PG se reconcilia eventualmente).
10. **Broadcast a réplicas FastAPI:** Cada réplica corre un task que hace `XREAD BLOCK` del stream `stream:auction:{id}`. Al recibir `bid_accepted`, hace fan-out a sus conexiones WS locales con `{type:"price_update", seq, ...}`. Los clientes detectan gaps en `seq` y disparan `resume`.

### 6.4 Cierre de Subasta

11. **Cierre lazy:** No existe un "momento mágico" de cierre. Cada llamada al script Lua valida `now < end_time`; tras el `end_time`, ninguna puja se acepta.
12. **Cierre formal (Celery Beat cada 10s):** busca `auctions` con `status='active' AND end_time < now`. Para cada una:
    - En una transacción PG: `UPDATE status = 'closed', final_price = current_price`.
    - Si `final_price < reserve_price` (cuando aplica): `status = 'closed_no_sale'`, libera hold del leader, emite `auction_closed_no_sale`.
    - Si hay ganador: emite `auction_closed` por WS y email (out-of-band, por si el WS estaba caído). Encola `charge_winner` (cobro vía Stripe sobre el `held_balance`).
    - Libera holds de todos los **no-ganadores** que hubieran tenido hold residual (no debería haber, pero double-check defensivo).
13. **Cobro al ganador (Celery):** crea PaymentIntent con el `held_balance` ya retenido en wallet → al `succeeded` del webhook, ejecuta `charge` + `release` netos. Si el cobro falla 3 veces, marca al usuario para revisión, libera el item para re-subasta o asignación al runner-up (post-MVP).

### 6.5 Resiliencia y Reconciliación

- **Redis es fuente autoritativa del precio durante la subasta.** PG es replicación durable + base de auditoría.
- **Reconciliación al cierre:** el job de cierre compara `auctions.current_price` (PG) con `auction:{id}:state.current_price` (Redis). Si difieren > 0.01 → alerta (indica que el cold path tiene un backlog que no se drenó).
- **Snapshot Redis:** habilitar AOF con `everysec`. RDB cada 5 min como respaldo.

---

## 7. Flujo de Usuario Completo

```
[Visitante]
    │
    ▼ (Registro)
[Usuario Registrado]
    │
    ▼ (Subir INE/Comprobante)
[KYC Enviado] ──► (Admin revisa en panel y aprueba/rechaza)
    │
    ▼ (KYC Aprobado)
[Usuario Verificado]
    │
    ▼ (Depósito vía Stripe)
[Saldo en Garantía]
    │
    ▼ (Navega subastas, entra a una)
[Participante Activo]
    │
    ├─► Puja en vivo (WebSocket)
    ├─► Recibe actualizaciones de precio
    │
    ▼ (Subasta cierra)
[Ganador / Perdedor]
    │
    ├─► Si gana: Elige método de envío, se cobra el saldo retenido, se genera orden de envío.
    └─► Si pierde: Se libera el saldo retenido.
```

---

## 8. Seguridad y Rate Limiting

### 8.1 Autenticación y Sesión
- JWT en **cookie httpOnly + Secure + SameSite=Strict** (no localStorage → mitiga XSS).
- Access token: 15 min. Refresh token: 7 días, rotación al usar.
- **Protección CSRF:** double-submit token. Cookie `csrf` no-httpOnly + header `X-CSRF-Token` requerido en POST/PUT/DELETE; servidor compara igualdad.
- Contraseñas con `bcrypt` (12 rounds). Política mínima: 10 chars, mezcla alfa+num.

### 8.2 Rate Limiting (defensa en capas)
- **Nginx (IP anónima, escudo DDoS):** 10 req/s burst 20 sobre `/api`, 60 req/min sobre `/auth`.
- **App (Redis Lua, por usuario autenticado):**
  - Pujas: **token bucket** Lua atómico → 1 puja / 3 s, ráfaga 3. Más eficaz que GET+SET (sin race).
  - Login: 5 intentos / 5 min por email + IP. Bloqueo progresivo.
  - Uploads KYC: 10 / día por usuario.

### 8.3 Validación de Uploads (KYC y fotos de items)
- Tamaño máx: 5 MB.
- Tipos: JPG/PNG/PDF.
- **Verificación por magic bytes** (`python-magic`), no solo Content-Type ni extensión → evita polyglot uploads.
- Re-encode con Pillow (strip EXIF + metadatos) antes de almacenar.
- Nombre de archivo: `{uuid}.{ext}` — nunca usar el nombre original.

### 8.4 Otros
- **CORS:** lista blanca explícita del dominio del frontend, `credentials: true`.
- **Headers:** CSP estricto, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` en prod.
- **Protección de pujas:** validación de saldo es atómica en Lua (§6.2) — imposible spamear por encima del saldo.
- **Secretos:** `.env` para dev, **gestor externo** en prod (AWS Secrets Manager / Hetzner secrets / Doppler). Nunca commitear `.env*.prod`.
- **Webhooks Stripe:** verificación de firma obligatoria con `STRIPE_WEBHOOK_SECRET`. Dedup por `event.id`.

---

## 9. Estructura de Proyecto (Carpetas y Archivos)

```
Subastas/
├── docker-compose.yml
├── .env
├── .gitignore
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── database.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── document.py
│   │   │   ├── wallet.py
│   │   │   ├── transaction.py
│   │   │   ├── item.py
│   │   │   ├── auction.py
│   │   │   ├── bid.py
│   │   │   └── shipment.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   ├── auction.py
│   │   │   └── bid.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── endpoints/
│   │   │   │   │   ├── auth.py
│   │   │   │   │   ├── users.py
│   │   │   │   │   ├── auctions.py
│   │   │   │   │   ├── bids.py
│   │   │   │   │   ├── payments.py
│   │   │   │   │   └── admin.py
│   │   │   │   └── deps.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── auction_service.py
│   │   │   ├── bid_service.py
│   │   │   ├── wallet_service.py
│   │   │   ├── payment_service.py     # Stripe Connect Express
│   │   │   ├── storage_backend.py     # Abstracción: local | s3 | minio
│   │   │   ├── kyc_service.py         # Topes LFPIORPI + telemetría
│   │   │   └── notification_service.py
│   │   ├── websocket/
│   │   │   ├── __init__.py
│   │   │   ├── manager.py             # Heartbeat, backpressure, replay
│   │   │   └── bid_handler.py
│   │   ├── redis/
│   │   │   ├── __init__.py
│   │   │   ├── client.py              # Conexión + carga de scripts
│   │   │   ├── streams.py             # XADD/XREAD helpers
│   │   │   └── scripts/
│   │   │       ├── bid_script.lua     # Hot path atómico (§6.2)
│   │   │       ├── rate_limit.lua     # Token bucket
│   │   │       └── dedup.lua          # client_bid_id dedup
│   │   ├── observability/
│   │   │   ├── __init__.py
│   │   │   ├── logging.py             # structlog
│   │   │   ├── metrics.py             # Prometheus
│   │   │   └── tracing.py             # OpenTelemetry
│   │   └── tasks/
│   │       ├── __init__.py
│   │       ├── persist_bid.py         # Cold path (§6.3)
│   │       ├── close_auctions.py      # Celery Beat (§6.4)
│   │       └── charge_winner.py
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/               # testcontainers PG+Redis
│   │   └── load/                      # k6 scripts
│   └── uploads/
│       ├── kyc/
│       └── items/                     # thumb_/card_/full_ prefijos
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── Navbar.jsx
│       │   ├── AuctionCard.jsx
│       │   ├── BidPanel.jsx
│       │   └── KycUploader.jsx
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── AuctionDetail.jsx
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Deposit.jsx
│       │   └── AdminPanel.jsx
│       ├── services/
│       │   ├── api.js
│       │   └── websocket.js
│       └── store/
│           └── useAuthStore.js
│
├── nginx/
│   └── nginx.conf
│
└── docs/
    └── TDD.md
```

---

## 10. Docker Compose (Servicios Locales)

Servicios definidos en `docker-compose.yml`:

1. **`db`**: PostgreSQL 16, volumen persistente `postgres_data`.
2. **`redis`**: Redis 7 (Alpine), volumen `redis_data`, AOF habilitado (`appendfsync everysec`).
3. **`api`**: FastAPI (Uvicorn con `--workers 2` en MVP), depende de `db` y `redis`. Expone `:8000` interno y `/metrics` para Prometheus.
4. **`worker`**: Celery worker, depende de `redis` y `db`. Concurrencia inicial: 4.
5. **`beat`**: Celery Beat (scheduler para `close_auctions`, reportes LFPIORPI, reconciliación), depende de `redis`.
6. **`frontend`**: React + Vite (modo dev con HMR), expone `:3000` interno.
7. **`nginx`**: Puerto `:80` mapeado al host. Proxy a `/api` → `:8000`, `/ws` → `:8000` con headers WS, `/` → `:3000`.
8. **`prometheus`** (opcional dev, recomendado): scrape de `api:8000/metrics`. Volumen `prometheus_data`.
9. **`grafana`** (opcional dev): dashboards pre-cargados (latencia pujas, lag stream, conexiones WS). Solo en perfil `docker-compose --profile observability up`.

---

## 11. Plan de Migración a Producción

> **Nota:** La observabilidad (`structlog`, métricas Prometheus, tracing OpenTelemetry) se incorpora **desde Fase 1 del roadmap (§12), no en producción**. En MVP solo se expone a stdout / endpoint `/metrics`; en producción se conectan a un backend.

| Fase | Acción | Tecnología Objetivo |
|------|--------|---------------------|
| **1. VPS** | Subir Docker Compose a un VPS (Hetzner CX21 o AWS Lightsail). | VPS €5-10/mes |
| **2. DB** | Migrar PostgreSQL local a instancia gestionada (Supabase, AWS RDS) o mantener contenedor con backups automáticos + WAL archiving. | Supabase Free o RDS |
| **3. Storage** | Reemplazar volumen local por MinIO (self-hosted S3) o AWS S3, vía la abstracción `StorageBackend`. | MinIO en VPS |
| **4. SSL + Nginx WS** | Nginx + Let's Encrypt automático. Config WS específica: `proxy_http_version 1.1`, `proxy_set_header Upgrade $http_upgrade`, `proxy_set_header Connection "upgrade"`, `proxy_read_timeout 3600s`. | Certbot |
| **5. Escalar API** | Múltiples réplicas del contenedor `api` detrás de Nginx con sticky sessions opcionales (no necesarias gracias a Redis Streams). | Docker Swarm o K8s |
| **6. Escalar Workers** | Aumentar réplicas de `worker` según el lag del stream. | Celery autoscale |
| **7. Observabilidad backend** | Conectar Prometheus + Grafana, Loki para logs, Tempo/Jaeger para traces. Dashboards: latencia p50/p95/p99 de pujas, lag de Celery, conexiones WS activas, throughput de webhooks Stripe. | Grafana stack |
| **8. Backups y DR** | PG backups diarios → S3, retención 30d. Probar `pg_restore` mensual. RTO objetivo: 4h. RPO objetivo: 24h. | Cron + S3 |
| **9. Alerting** | Alertas en: error rate > 1%, latencia p95 puja > 200ms, lag stream > 5s, fallos de pago > 3% en 1h, disco > 80%. | Grafana Alerting o PagerDuty |

---

## 12. Roadmap de Implementación

> **Principio:** testing y observabilidad NO son fases separadas — cada fase incluye sus propios tests (unit + integration con testcontainers) y mete sus métricas/logs estructurados desde el inicio.

### Fase 1: Infraestructura, Auth y Observabilidad (Semana 1)

- Docker Compose con PostgreSQL, Redis, Nginx.
- FastAPI base con SQLAlchemy 2.0, Alembic, Pydantic v2.
- Registro/login con JWT en **cookie httpOnly + CSRF** double-submit.
- Frontend base React + Vite con rutas y layout.
- **Observabilidad desde día 1:** `structlog` con `request_id`+`user_id`, endpoint `/metrics` Prometheus, instrumentación OpenTelemetry básica.
- **Testing base:** `pytest-asyncio` + `httpx.AsyncClient` + `testcontainers` (PG + Redis reales en CI). Cobertura mínima: auth happy + edge paths.

### Fase 2: Catálogo y Subastas (Semana 1-2)

- CRUD de `items` y `auctions` (admin).
- Pipeline de imágenes con Pillow (3 tamaños) + validación magic bytes.
- Listado público paginado de subastas activas.
- Página de detalle con cronómetro (server time sync para evitar reloj cliente desfasado).
- **Testing:** integration tests del CRUD + tests de validación de uploads (rechazo de polyglot).

### Fase 3: WebSockets y Motor de Pujas (Semana 2)

- WebSocket Manager con cookie auth + heartbeat ping/pong.
- **Script Lua `bid_script`** (hot path) con anti-sniping incluido.
- Redis Streams para eventos + replay en reconexión.
- Celery worker `persist_bid` (cold path, transacción PG atómica).
- Rate limiting Lua (token bucket).
- Frontend: panel de puja con `decimal.js`, `client_bid_id`, reconexión exponencial.
- **Testing:** 100 pujas simultáneas al mismo monto (race condition test), kill del worker en medio de procesar, replay tras desconexión.

### Fase 4: Pagos y Garantías con Stripe Connect (Semana 3)

- Onboarding de plataforma a **Stripe Connect Express**.
- PaymentIntent con 3DS forzado para tarjetas MX.
- Wallets, transactions con `idempotency_key`.
- Validación de topes LFPIORPI antes de crear PaymentIntent (ver §16).
- Webhook signed con dedup por `event.id`.
- OXXO Pay con UX de "pendiente de confirmación".
- **Testing:** Stripe test mode con tarjetas de prueba (éxito, declined, 3DS challenge, fraude). Simular webhook duplicado.

### Fase 5: KYC y Dashboard (Semana 3-4)

- Upload de documentos (INE + comprobante) — `kyc_level='basic'`.
- Panel Admin para aprobar/rechazar KYC con notas.
- Dashboard de usuario (mis pujas, ganadas, saldo, transacciones).
- Aviso de privacidad LFPDPPP en el flujo de registro + sección "Mis datos" (derechos ARCO).
- Tope técnico de depósitos visible en UI antes de gatillar.
- **Testing:** flujo end-to-end de registro → KYC → depósito → puja.

### Fase 6: Envíos y Cierre (Semana 4)

- Selección de método de envío al ganar.
- Celery Beat cada 10s para cierre formal + cobro al ganador.
- Email de notificación (Resend o SendGrid). Email obligatorio out-of-band para ganador (no depender de WS).
- Manejo de subastas sin venta (`reserve_price` no alcanzado).
- **Testing:** cierre con/sin reserve, fallo de cobro al ganador, ganador desconectado al cierre.

### Fase 7: Carga, Hardening y Pulido (Semana 4-5)

- **Load test k6:** 1000 conexiones WS + 1 puja/seg/usuario; medir p99 latencia, error rate, lag de cold path.
- Reconciliación Redis vs PG (job auditor).
- Penetration test básico: OWASP Top 10, prueba CSRF, prueba IDOR en endpoints.
- Documentación de despliegue + runbook de incidentes (Redis down, PG down, Stripe webhook backlog).

---

## 13. Costo Operativo Estimado

| Escenario | Infraestructura | Costo Mensual |
|-----------|----------------|---------------|
| **MVP Local** | Tu máquina + Docker | $0 |
| **Producción Inicial** | Hetzner CX21 (2vCPU/4GB) + Dominio | ~$6-10 USD |
| **Producción + DB Gestiona** | Hetzner VPS + Supabase Free Tier | ~$6 USD |
| **Escala Media** (5k usuarios) | Hetzner CPX31 + Redis Cloud + MinIO | ~$25-40 USD |
| **Escala Alta** (>20k concurrentes) | K8s cluster + AWS/GCP + Kafka | $200+ USD |

---

## 14. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Condición de carrera en pujas** | Alto | Script Lua atómico en Redis (validación + actualización en una operación). Imposible por construcción. |
| **Spam de pujas / Bots** | Medio | Rate limiting Lua token bucket + CAPTCHA en registro + dedup por `client_bid_id`. |
| **Pérdida de datos por corte** | Medio | PG con WAL + backups diarios. Redis AOF `everysec`. Reconciliación Redis↔PG al cierre. |
| **Usuario no paga al ganar** | Alto | Depósito en garantía obligatorio. Cobro automático del hold al cierre. Política de penalización tras 3 fallos. |
| **Latencia en WebSockets** | Medio | Redis Streams (con replay) en lugar de PubSub. Backpressure por conexión. |
| **Usuario excede umbral LFPIORPI sin detección** | Alto | Tope técnico en código (§5.5, §16) + alerta automática al 80% del límite. Lifetime tracker en `users.lifetime_deposit_mxn`. |
| **Partición de red Redis** | Alto | Detección de split-brain con Redis Sentinel en prod. Hot path falla cerrado (rechaza pujas en lugar de aceptar de forma inconsistente). |
| **Cliente lento bloqueando broadcast** | Medio | `asyncio.wait_for(timeout=0.2)` por conexión. Cliente lento → desconectado. |
| **Backlog del cold path (Celery)** | Medio | Métrica de lag del stream + alerta. Reconciliación al cierre detecta desincronizaciones. |
| **Compromiso de Stripe webhook** | Alto | Verificación de firma con `STRIPE_WEBHOOK_SECRET` obligatoria + dedup por `event.id`. |
| **Pérdida de fondos por bug en wallet** | Crítico | Toda mutación de wallet es transaccional con `idempotency_key` único. Auditoría periódica: `SUM(transactions) == wallet.balance + wallet.held_balance`. |

---

## 15. Decisiones Post-MVP (Escalabilidad)

- **Proxy Bidding (Puja Automática):** Lógica adicional en el script Lua + UI para configurar max_bid.
- **KYC Enhanced obligatorio:** activar `kyc_level='enhanced'` (INE+CURP+RFC+selfie) automáticamente cuando el usuario alcance el 80% del umbral LFPIORPI. Schema ya soporta los campos (§4 users).
- **Multi-vendedor real:** habilitar onboarding self-service de vendedores en Stripe Connect Express. Schema ya soporta `stripe_connect_account_id`.
- **Búsqueda Avanzada:** Integrar Meilisearch (más simple que Elasticsearch para este caso de uso).
- **Asignación al runner-up tras fallo de cobro:** si el ganador no paga, ofrecer el item al 2º lugar antes de re-subastar.
- **Notificaciones Push:** Firebase Cloud Messaging para web push + app móvil.
- **App Móvil:** React Native consumiendo la misma API + WS.
- **Subastas en vivo con video:** WebRTC para streaming del subastador.

---

## 16. Cumplimiento Regulatorio (México)

Esta sección formaliza la postura legal del MVP. **No sustituye asesoría legal.** Antes de operar con dinero real (Fase 4), consultar abogado especializado en fintech MX.

### 16.1 LFPDPPP — Ley Federal de Protección de Datos Personales

Aplica desde el primer registro de usuario, antes de cualquier KYC o pago.

- **Aviso de Privacidad:** publicado en `/aviso-privacidad`, enlazado desde el flujo de registro con checkbox de consentimiento.
- **Responsable del tratamiento:** designado y nombrado en el aviso.
- **Derechos ARCO** (Acceso, Rectificación, Cancelación, Oposición): sección "Mis datos" en el dashboard permite ejercerlos. Email `privacidad@<dominio>` para solicitudes formales (responder en ≤ 20 días hábiles).
- **Datos sensibles** (documentos KYC): cifrado en reposo (volumen cifrado o S3 SSE), acceso loggeado, retención mínima necesaria.

### 16.2 LFPIORPI — Anti-Lavado (Actividad Vulnerable)

Aplica cuando la plataforma retiene fondos de terceros (Fase 4). Con Stripe Connect Express, **Stripe es Merchant of Record**, lo que mitiga gran parte del riesgo. Sin embargo, la plataforma sigue siendo responsable de la **identificación del cliente** que deposita.

**Decisión MVP (consciente):** operar con `kyc_level='basic'` (solo INE) y **topes técnicos** que mantienen al usuario bajo los umbrales de "Actividad Vulnerable":

| Topa | Límite | Implementación |
|------|--------|----------------|
| Depósito individual (un evento) | **MXN 60,000** | Validación en POST `/payments/deposit` antes de crear PaymentIntent. |
| Acumulado 30 días por usuario | **MXN 60,000** | Tracker en `users.lifetime_deposit_mxn` con ventana móvil. |
| Acumulado anual por usuario | **MXN 180,000** | Mismo tracker, ventana 12 meses. |
| Margen vs. umbral legal | ~17% bajo 645 UMA (~MXN 73k) | Buffer ante variación de UMA. |

**Telemetría obligatoria:**
- Alerta automática (Slack + email admin) cuando un usuario alcanza el 80% de cualquiera de los topes.
- Reporte mensual de "top 50 depositantes" para revisión manual.
- Si el negocio crece y se proyecta cruzar topes con frecuencia → activar **flujo enhanced** (Plan B abajo).

**Plan B — KYC Enhanced (no en MVP, ya preparado en schema):**
- Subir `kyc_level` del usuario a `enhanced` → bloquear pujas hasta completar:
  - CURP (validado con SAT vía API o manual).
  - RFC.
  - Selfie con INE en mano (validación visual por admin).
  - Comprobante < 3 meses.
- Activar registro como "Actividad Vulnerable" ante SAT → obligación de reportes a UIF.
- Idealmente: contratar proveedor KYC mexicano (Truora, MetaMap) para automatizar.

### 16.3 CNBV / CONDUSEF — Servicios Financieros

- **Stripe Connect Express** transfiere a Stripe Payments Mexico la responsabilidad de retención de fondos → la plataforma es "facilitador" no "intermediario financiero".
- **3DS obligatorio** desde octubre 2024 para tarjetas mexicanas: `payment_method_options.card.request_three_d_secure='any'` en el PaymentIntent.
- Disclosures de fees y términos visibles antes de cada depósito y pago final.
- Mecanismo de queja claro (`condusef@<dominio>` + sección de "Quejas y aclaraciones").

### 16.4 Contables / SAT

- Facturación electrónica (CFDI 4.0) para cobros finales — diferida a post-MVP, evaluar Facturapi.io o similar.
- Retención de IVA: aplica si la plataforma se considera intermediario. Confirmar régimen con contador antes de Fase 4.

---

## 17. Decisiones de Persistencia y Consistencia

Documentar explícitamente para evitar ambigüedad operacional.

### 17.1 Fuentes de Verdad

| Dato | Fuente autoritativa durante subasta activa | Fuente autoritativa al cierre / post-mortem |
|------|--------------------------------------------|---------------------------------------------|
| `current_price`, `leader_id`, `end_time` | **Redis** (`auction:{id}:state`) | PostgreSQL (`auctions`) |
| Historial de pujas | Redis Streams (`stream:auction:{id}`) | PostgreSQL (`bids`) |
| Saldo de usuario | Redis (`user:{id}:wallet`) + PG (eventually consistent) | PostgreSQL (`wallets`) |
| KYC, perfil, items | PostgreSQL siempre | PostgreSQL siempre |

### 17.2 Consistencia

- **Hot path:** strong consistency dentro de Redis (Lua atómico).
- **Cold path Redis→PG:** eventual consistency, máximo lag esperado: 500 ms. Métrica alertable si > 5 s.
- **Reconciliación al cierre:** job compara Redis state vs PG. Discrepancias > 0.01 MXN → alerta crítica + bloqueo de cobro hasta investigación.

### 17.3 Durabilidad

- Redis: AOF `appendfsync everysec` + RDB cada 5 min. RPO esperado: < 1 s.
- PostgreSQL: WAL + replicación streaming (en prod). RPO objetivo: < 1 min.
- Cola Celery: persistente en Redis (broker). En crash de worker, tareas no-acked se reentregan automáticamente.

### 17.4 Modos de Falla

| Falla | Comportamiento |
|-------|----------------|
| Redis no disponible | Hot path falla cerrado: rechaza pujas con `service_unavailable`. WS sigue aceptando conexiones pero notifica el estado. |
| PostgreSQL no disponible | Hot path sigue aceptando pujas (Redis suficiente). Cold path encola; tras 5 min de backlog → alerta. |
| Celery worker crash | Tareas se reentregan al siguiente worker. Idempotency_key garantiza no doble-aplicación. |
| Stripe webhook caído | Pagos pendientes se reintentan automáticamente por Stripe (hasta 3 días). El usuario ve "pending" hasta confirmación. |
| Una réplica FastAPI muere | Conexiones WS de esa réplica se cierran; clientes reconectan a otra réplica vía Nginx; replay desde Redis Streams reconstruye estado. |

---

**Revisa este documento. Si estás de acuerdo con el alcance, la arquitectura y el roadmap, confírmame para comenzar con la generación de código.**
