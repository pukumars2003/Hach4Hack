import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 100 },  // Ramp-up to 100 VUs
    { duration: '20s', target: 500 }, // Ramp-up to 500 VUs (5x target)
    { duration: '10s', target: 500 }, // Hold peak
    { duration: '5s', target: 0 },    // Ramp-down
  ],
  thresholds: {
    // Organizer requirement: p95 under 200ms
    http_req_duration: ['p(95)<200', 'p(99)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE_URL}/api/teams?limit=20`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has teams array': (r) => JSON.parse(r.body).teams !== undefined,
  });

  sleep(0.05); // Rapid browsing simulation
}

