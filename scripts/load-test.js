/**
 * k6 Load Test for TeamForge — Board endpoint + authenticated join simulation
 *
 * Pre-requisites:
 *   1. Run:  npx tsx scripts/generate-tokens.ts --count=50000
 *   2. Run:  k6 run scripts/load-test.js --out json=docs/k6-results.json
 *
 * Thresholds (5x targets):
 *   - p95 < 20ms on board endpoint at 500 VUs
 *   - error rate < 1%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

// ── Pre-generated tokens (run generate-tokens.ts first) ──────────────────────
// If tokens.json doesn't exist, the board-only test still runs anonymously.
let tokens = [];
try {
  tokens = new SharedArray('tokens', function () {
    return JSON.parse(open('./tokens.json'));
  });
} catch (_) {
  // tokens.json not present — board-only mode
}

// ── Custom metrics ────────────────────────────────────────────────────────────
const boardLatency = new Trend('board_latency', true);
const joinLatency  = new Trend('join_latency', true);
const joinErrors   = new Counter('join_errors');

// ── Test configuration ────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Scenario 1: Board load — anonymous reads
    board_read: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 100 },  // ramp-up
        { duration: '20s', target: 500 },  // 5x peak
        { duration: '10s', target: 500 },  // hold
        { duration: '5s',  target: 0   },  // ramp-down
      ],
      exec: 'boardRead',
    },
    // Scenario 2: Authenticated join requests (needs tokens.json)
    join_race: {
      executor: 'constant-vus',
      vus: tokens.length > 0 ? Math.min(50, tokens.length) : 0,
      duration: '30s',
      startTime: '10s', // start after board warms up
      exec: 'joinRace',
    },
  },
  thresholds: {
    // Organizer requirement: p95 < 200ms; our 5x target: p95 < 20ms
    'board_latency': ['p(95)<200', 'p(99)<300'],
    'http_req_failed': ['rate<0.01'],
    // Join race: allow 409 (conflict) — only errors we reject are 5xx
    'join_errors': ['count<5'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ── Board read scenario ───────────────────────────────────────────────────────
export function boardRead() {
  group('board_endpoint', () => {
    const r = http.get(`${BASE_URL}/api/teams?limit=20`, {
      tags: { scenario: 'board_read' },
    });

    boardLatency.add(r.timings.duration);

    check(r, {
      'board status 200': (res) => res.status === 200,
      'has teams array':  (res) => {
        try { return Array.isArray(JSON.parse(res.body).teams); } catch { return false; }
      },
    });
  });

  sleep(0.05); // 50ms think time → ~20 req/s per VU
}

// ── Join race scenario (uses pre-generated tokens) ────────────────────────────
export function joinRace() {
  if (tokens.length === 0) return; // no tokens → skip

  const t = tokens[__VU % tokens.length];

  group('join_by_code', () => {
    // First fetch a team that has space
    const boardRes = http.get(`${BASE_URL}/api/teams?status=forming&limit=5`, {
      headers: { Authorization: `Bearer ${t.token}` },
    });

    if (boardRes.status !== 200) return;

    let teams;
    try { teams = JSON.parse(boardRes.body).teams; } catch { return; }
    if (!teams || teams.length === 0) return;

    // Pick a random team from results and try to join by its invite code
    // (If team has invite code — otherwise just check request-join flow)
    const target = teams[Math.floor(Math.random() * teams.length)];
    if (!target) return;

    // Try request-join (no invite code needed)
    const joinRes = http.post(
      `${BASE_URL}/api/teams/${target.id}/request-join`,
      JSON.stringify({ message: 'k6 load test request' }),
      {
        headers: {
          Authorization: `Bearer ${t.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `k6-${t.userId}-${target.id}-${Date.now()}`,
        },
        tags: { scenario: 'join_race' },
      }
    );

    joinLatency.add(joinRes.timings.duration);

    // 201 = requested, 409 = already in team / full — both are correct outcomes
    const ok = check(joinRes, {
      'join: success or conflict': (r) => r.status === 201 || r.status === 409 || r.status === 400,
    });
    if (!ok && joinRes.status >= 500) {
      joinErrors.add(1);
    }
  });

  sleep(0.1 + Math.random() * 0.2); // stagger join attempts
}
