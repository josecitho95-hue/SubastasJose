import { sleep, check } from 'k6';
import http from 'k6/http';

// Test de endurance: subastas activas por 10 minutos
export const options = {
  stages: [
    { duration: '2m', target: 30 },     // Ramp up gradual
    { duration: '8m', target: 30 },     // Sostenido 8 minutos
    { duration: '2m', target: 0 },      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // 95% under 1s
    http_req_failed: ['rate<0.001'],    // <0.1% errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export default function () {
  // Simular usuario navegando
  
  // 1. Ver subastas
  const auctions = http.get(`${BASE_URL}/api/v1/auctions`);
  check(auctions, {
    'list ok': (r) => r.status === 200,
  });
  sleep(2);

  // 2. Ver detalle de subasta aleatoria
  const auctionId = Math.random().toString(36).substring(7);
  const detail = http.get(`${BASE_URL}/api/v1/auctions/${auctionId}`);
  check(detail, {
    'detail ok or 404': (r) => r.status === 200 || r.status === 404,
  });
  sleep(3);

  // 3. Health check
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    'health ok': (r) => r.status === 200,
  });
  sleep(5);
}
