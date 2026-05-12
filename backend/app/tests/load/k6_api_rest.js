import { sleep, check } from 'k6';
import http from 'k6/http';

// Configuracion de carga para API REST
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up
    { duration: '1m', target: 50 },    // Sostenido
    { duration: '30s', target: 100 },  // Pico
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95% under 500ms
    http_req_failed: ['rate<0.01'],     // <1% errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost';

export default function () {
  // Health check
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    'health status 200': (r) => r.status === 200,
    'health fast': (r) => r.timings.duration < 100,
  });

  // List auctions (public, no auth)
  const auctions = http.get(`${BASE_URL}/api/v1/auctions`);
  check(auctions, {
    'auctions status 200': (r) => r.status === 200,
    'auctions fast': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
