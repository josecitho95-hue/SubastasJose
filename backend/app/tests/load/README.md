# Tests de Carga con k6

## Instalacion

```bash
# Windows (con chocolatey)
choco install k6

# O descargar desde https://k6.io/docs/get-started/installation/
```

## Ejecucion

### 1. API REST Load Test
```bash
cd backend/app/tests/load
k6 run k6_api_rest.js

# Con URL custom
k6 run -e BASE_URL=http://localhost k6_api_rest.js
```

### 2. WebSocket Bidding Stress Test
```bash
k6 run -e WS_URL=ws://localhost/ws/auctions/ -e AUCTION_ID=<uuid> k6_ws_bidding.js
```

### 3. Endurance Test (10 minutos)
```bash
k6 run k6_endurance.js
```

## Interpretacion de Resultados

| Metrica | Objetivo MVP | Accion si falla |
|---------|-------------|----------------|
| p95 latency | < 500ms API, < 200ms WS | Escalar workers Redis |
| Error rate | < 1% | Revisar logs de Lua |
| Throughput | > 100 bids/s | Aumentar replicas API |
| WS reconnections | < 5% | Revisar Nginx timeout |
