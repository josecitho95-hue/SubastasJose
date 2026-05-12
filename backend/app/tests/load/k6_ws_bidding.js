import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Test de stress del motor de pujas WebSocket
export const options = {
  stages: [
    { duration: '10s', target: 10 },    // 10 usuarios concurrentes
    { duration: '30s', target: 50 },    // 50 usuarios pujando
    { duration: '1m', target: 100 },    // 100 usuarios (objetivo MVP)
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    ws_session_duration: ['p(95)<30000'], // 95% de sesiones duran < 30s
    checks: ['rate>0.95'],                // 95% de checks pasan
  },
};

const WS_URL = __ENV.WS_URL || 'ws://localhost/ws/auctions/';
const AUCTION_ID = __ENV.AUCTION_ID || 'test-auction-id';

export default function () {
  const url = `${WS_URL}${AUCTION_ID}`;
  
  const res = ws.connect(url, null, function (socket) {
    socket.on('open', () => {
      // Enviar puja aleatoria
      const amount = randomIntBetween(100, 10000);
      const bid = {
        type: 'bid',
        client_bid_id: randomString(8),
        amount: amount.toString(),
      };
      socket.send(JSON.stringify(bid));
    });

    socket.on('message', (msg) => {
      const data = JSON.parse(msg);
      check(data, {
        'received ack or update': (d) => d.type === 'ack' || d.type === 'price_update',
        'ack accepted or rejected': (d) => 
          d.type !== 'ack' || (d.status === 'accepted' || d.status === 'rejected'),
      });
    });

    socket.on('close', () => {
      // Normal
    });

    // Cerrar despues de 5 segundos
    socket.setTimeout(function () {
      socket.close();
    }, 5000);
  });

  check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  });

  sleep(randomIntBetween(1, 3));
}
