/**
 * k6 Load Test for TeamForge — Board endpoint + authenticated join simulation
 *
 * Pre-requisites:
 *   1. Run:  npx tsx scripts/generate-tokens.ts --count=50000
 *   2. Run:  k6 run scripts/load-test.js --out json=docs/k6-results.json
 *
 * Pass/fail line (organizer spec):
 *   - p95 < 200ms on the board endpoint at 100 VUs, error rate < 1%
 *
 * Internal engineering goal (not a pass/fail line): p95 < 30 ms.
 *
 * Modes:
 *   default          warm run: 100 VUs re-request the same hot URL, so most
 *                    requests are served from the in-process response cache.
 *   VARY=true        cold run: each VU rotates filters/cursors so every URL is
 *                    unique. The HTTP cache always misses and every request runs
 *                    the real keyset query. Use this to report the DB-bound
 *                    number next to the cache-hit number.
 *   COMPARE=true     runs the cold scenario first, then the warm scenario, and
 *                    reports both side by side.
 *   SCENARIO=stress  legacy ramping 100 -> 500 VU board read plus join race.
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
const coldBoardLatency = new Trend('cold_board_latency', true);
const warmBoardLatency = new Trend('warm_board_latency', true);
const joinLatency = new Trend('join_latency', true);
const joinErrors = new Counter('join_errors');

// Per-invariant counters. `checks` only gives one aggregate pass/fail pair, so
// the report is built from these counters: every row is a real observation and
// the rows always add up to the printed total.
const invariantBoard200 = new Counter('invariant_board_200');
const invariantTeamsArray = new Counter('invariant_teams_array');
const invariantFailures = new Counter('invariant_failures');

// Cache visibility. Without this, a single-digit p95 cannot be told apart from a
// measurement error, so the report always shows the hit ratio it was taken at.
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const cacheStale = new Counter('cache_stale');
// Responses served with X-Cache: BYPASS, i.e. the server was started with
// BOARD_CACHE_DISABLED=1 and no cache layer ran at all.
const cacheBypass = new Counter('cache_bypass');
// Requests whose measured duration is below k6's 0.01 ms reporting floor. k6
// truncates these to exactly 0, so the min column is printed as "<0.01 ms"
// together with this count instead of a literal 0.00 ms.
const subHundredthMs = new Counter('sub_0_01ms_requests');

// ── Test configuration ────────────────────────────────────────────────────────
const MODE =
  __ENV.COMPARE === 'true'
    ? 'compare'
    : __ENV.VARY === 'true'
      ? 'cold'
      : __ENV.MIX === 'true'
        ? 'mix'
        : 'warm';
// Realistic mix: 80% of VUs re-request the default first page (what a hackathon
// board actually does), 20% walk random filters, cursors and searches. This is
// the headline number; pure warm and pure cold are the two bounds.
const MIX_COLD_PCT = parseFloat(__ENV.MIX_COLD_PCT || '20');
const THINK_TIME_S = parseFloat(__ENV.THINK_TIME || '0.05');
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = parseInt(__ENV.VUS || (__ENV.SCENARIO === 'stress' ? '100' : '100'), 10);
const DURATION = __ENV.DURATION || '15s';
const summaryTrendStats = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];

// The URL under test. In cold mode every iteration appends a unique filter
// combination so the exact-URL cache entry is never reused.
const BOARD_URL = `${BASE_URL}/api/teams?limit=20`;

const targetIterations = __ENV.ITERATIONS
  ? parseInt(__ENV.ITERATIONS, 10)
  : __ENV.ONE_LAKH === 'true'
    ? 100000
    : null;

function buildBoardUrl(cold) {
  if (!cold) return BOARD_URL;
  if (MODE === 'mix' && hash(__VU || 1, __ITER || 0, 13) % 100 >= MIX_COLD_PCT) return BOARD_URL;

  // Deterministic per-(VU, iteration) rotation over the real filter space of the
  // board: limit, status, skill and a keyset cursor. Every iteration therefore
  // asks for a URL the server has never seen, so the pre-serialized HTTP cache
  // misses and the single-flight cache key is unique. The request has to run the
  // real keyset query against PostgreSQL.
  //
  // Each dimension is hashed independently so the joint space is the product of
  // the dimensions (~500k combinations) instead of one aliased index.
  const vu = __VU || 1;
  const iter = __ITER || 0;

  const limits = [20, 25, 30, 40, 50];
  const statuses = ['all', 'forming', 'ready', 'full'];
  const skills = ['', 'React', 'Node', 'Design', 'ML'];
  const searches = ['', '', '', 'Team B'];

  const limit = limits[hash(vu, iter, 2) % limits.length];
  const status = statuses[hash(vu, iter, 3) % statuses.length];
  const skill = skills[hash(vu, iter, 5) % skills.length];
  const search = searches[hash(vu, iter, 7) % searches.length];

  // Keyset page: a distinct (created_at, id) cursor drawn from the seeded data
  // window (the seed spans ~3 days, so a one-minute grid covers every page with
  // real rows). Pages walk the same index the API uses, so page depth does not
  // change the query plan.
  const page = hash(vu, iter, 11) % CURSOR_PAGES;
  const cursorTime = new Date(CURSOR_BASE_MS - page * 60000).toISOString();
  const cursorId = uuidFromInt(page + 1);

  // Built by hand: k6's goja runtime has no URLSearchParams global.
  let url = `${BASE_URL}/api/teams?limit=${limit}&status=${status}`
    + `&cursorCreatedAt=${encodeURIComponent(cursorTime)}&cursorId=${encodeURIComponent(cursorId)}`;
  if (skill) url += `&skill=${encodeURIComponent(skill)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  return url;
}

/** Deterministic integer hash, stable across runs so reports are reproducible. */
function hash(a, b, c) {
  return Math.abs((a * 7919 + b * 104729 + c * 15485863) % 1000003);
}

/** Deterministic v4-shaped UUID so k6 needs no crypto import. */
function uuidFromInt(seed) {
  const hex = (seed * 2654435761 % 0xffffffff).toString(16).padStart(8, '0');
  const rest = ((seed + 1) * 40503 % 0xffffffff).toString(16).padStart(8, '0');
  const tail = ((seed + 7) * 2246822519 % 0xffffffff).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${rest.slice(0, 3)}-a${tail.slice(0, 3)}-${rest}${tail}`.slice(0, 36);
}

const CURSOR_BASE_MS = Date.parse('2026-11-14T15:50:00.000Z');
// One-minute grid over the seeded data window (~3 days), so every page returns
// real rows instead of an empty tail.
const CURSOR_PAGES = 5000;

export const options = targetIterations
  ? {
      summaryTrendStats,
      scenarios: {
        one_lakh_benchmark: {
          executor: 'shared-iterations',
          vus: VUS,
          iterations: targetIterations,
          maxDuration: '3m',
          exec: 'boardRead',
        },
      },
      thresholds: {
        board_latency: ['p(95)<200', 'p(99)<300'],
        http_req_failed: ['rate<0.01'],
      },
    }
  : MODE === 'compare'
    ? {
        summaryTrendStats,
        // Cold first, then warm. Two separate Trend metrics so the percentiles
        // are not mixed into one aggregate number.
        scenarios: {
          cold_board: {
            executor: 'constant-vus',
            vus: VUS,
            duration: DURATION,
            exec: 'boardReadCold',
            gracefulStop: '0s',
            startTime: '0s',
          },
          warm_board: {
            executor: 'constant-vus',
            vus: VUS,
            duration: DURATION,
            exec: 'boardReadWarm',
            gracefulStop: '0s',
            startTime: `${parseFloat(DURATION) + 2}s`,
          },
        },
        thresholds: {
          cold_board_latency: ['p(95)<200'],
          warm_board_latency: ['p(95)<200'],
          http_req_failed: ['rate<0.01'],
        },
      }
    : __ENV.SCENARIO === 'stress'
      ? {
        summaryTrendStats,
        scenarios: {
          board_read: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
              { duration: '5s', target: 100 },
              { duration: '15s', target: 100 },
              { duration: '10s', target: 500 },
              { duration: '5s', target: 0 },
            ],
            exec: 'boardRead',
          },
          join_race: {
            executor: 'constant-vus',
            vus: tokens.length > 0 ? Math.min(25, tokens.length) : 0,
            duration: '30s',
            startTime: '10s',
            exec: 'joinRace',
          },
        },
        thresholds: {
          board_latency: ['p(95)<200', 'p(99)<300'],
          http_req_failed: ['rate<0.05'],
          join_errors: ['count<10'],
        },
      }
      : {
        summaryTrendStats,
        scenarios: {
          board_requirement: {
            executor: 'constant-vus',
            vus: VUS,
            duration: DURATION,
            exec: 'boardRead',
          },
        },
      thresholds: {
        board_latency: ['p(95)<200', 'p(99)<300'],
        http_req_failed: ['rate<0.01'],
      },
    };

// ── Warm-up (not included in reported metrics) ────────────────────────────────
// Prime the server's JIT, database pool, and in-memory board cache so the
// measurement window reflects steady-state throughput rather than cold-start
// compilation. k6 excludes setup() traffic from the scenario metrics.
//
// NOTE: k6 still counts setup() HTTP requests in `http_reqs` and
// `http_req_duration`. That is why the summary prints the total request count
// and the measured iteration count separately — the difference is exactly
// WARMUP_TOTAL.
const WARMUP_TOTAL = parseInt(__ENV.WARMUP || '1000', 10);
const WARMUP_BATCH = 100;

export function setup() {
  const batch = Array.from({ length: WARMUP_BATCH }, () => `${BASE_URL}/api/teams?limit=20`);
  for (let round = 0; round < WARMUP_TOTAL / WARMUP_BATCH; round++) {
    http.batch(batch);
  }
}

// ── Board read helpers ────────────────────────────────────────────────────────
function recordCacheState(res) {
  const cache = (res.headers['X-Cache'] || res.headers['x-cache'] || '').toUpperCase();
  if (cache === 'HIT') cacheHits.add(1);
  else if (cache === 'STALE') cacheStale.add(1);
  else if (cache === 'BYPASS') cacheBypass.add(1);
  else cacheMisses.add(1);
}

function verifyBoard(res) {
  const okStatus = check(res, {
    'board status 200': (r) => {
      const ok = r.status === 200;
      if (ok) invariantBoard200.add(1);
      else invariantFailures.add(1);
      return ok;
    },
    'has teams array': (r) => {
      let ok = false;
      try { ok = Array.isArray(JSON.parse(r.body).teams); } catch { ok = false; }
      if (ok) invariantTeamsArray.add(1);
      else invariantFailures.add(1);
      return ok;
    },
  });
  return okStatus;
}

function hitBoard(url, latencyTrend, scenarioTag) {
  group('board_endpoint', () => {
    const r = http.get(url, { tags: { scenario: scenarioTag } });
    latencyTrend.add(r.timings.duration);
    if (r.timings.duration < 0.01) subHundredthMs.add(1);
    recordCacheState(r);
    verifyBoard(r);
  });

  if (THINK_TIME_S > 0) sleep(THINK_TIME_S);
}

export function boardRead() {
  hitBoard(buildBoardUrl(MODE === 'cold' || MODE === 'mix'), boardLatency, 'board_read');
}

export function boardReadCold() {
  hitBoard(buildBoardUrl(true), coldBoardLatency, 'board_cold');
}

export function boardReadWarm() {
  hitBoard(buildBoardUrl(false), warmBoardLatency, 'board_warm');
}

// ── Join race scenario (uses pre-generated tokens) ────────────────────────────
export function joinRace() {
  if (tokens.length === 0) return; // no tokens → skip

  // Pick a random participant token from the seeded pool
  const t = tokens[Math.floor(Math.random() * tokens.length)];

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

    // Try request-join (submits pending join request)
    const joinRes = http.post(
      `${BASE_URL}/api/requests`,
      JSON.stringify({ teamId: target.id, message: 'k6 load test request' }),
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

// ── Report generation ─────────────────────────────────────────────────────────
// Everything below reads only what k6 actually measured. Two rules keep the
// report auditable:
//   1. Request counts separate the 1,000 setup() warm-up requests (which k6
//      counts in `http_reqs` but which perform no assertions) from the measured
//      scenario requests.
//   2. Assertion counts come from per-invariant counters, so the rows always add
//      up to the printed total.

const PASS_LINE_MS = 200; // organizer pass/fail threshold
const GOAL_MS = 30; // our own engineering goal, not a submission gate

function num(m, metric, field) {
  const v = m[metric]?.values?.[field];
  return typeof v === 'number' ? v : null;
}

function trendOf(m, name) {
  if (!m[name]?.values) return null;
  const t = {
    avg: num(m, name, 'avg'),
    min: num(m, name, 'min'),
    med: num(m, name, 'med'),
    max: num(m, name, 'max'),
    p90: num(m, name, 'p(90)'),
    p95: num(m, name, 'p(95)'),
    p99: num(m, name, 'p(99)'),
  };
  return t;
}

function fmtMs(v) {
  if (v === null || v === undefined) return 'n/a';
  return `${v.toFixed(2)} ms`;
}

/** k6 truncates sub-0.01 ms durations to exactly 0; never print a bare 0.00 ms. */
function fmtMin(v, subCount) {
  if (v === null || v === undefined) return 'n/a';
  if (v < 0.01) return `&lt;0.01 ms (${subCount} req)`;
  return `${v.toFixed(2)} ms`;
}

function fmtMinConsole(v, subCount) {
  if (v === null || v === undefined) return 'n/a';
  if (v < 0.01) return `<0.01 ms (${subCount} req)`;
  return `${v.toFixed(2)} ms`;
}

/**
 * k6's goja runtime does not implement Intl, and `toLocaleString('en-US')` is
 * rejected as an invalid radix. Format thousands separators manually so the
 * summary and HTML report stay reproducible.
 */
function groupDigits(n) {
  const rounded = Math.round(n);
  const negative = rounded < 0;
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${digits}` : digits;
}

function fmtInt(v) {
  if (v === null || v === undefined) return 'n/a';
  return groupDigits(v);
}

function extract(data) {
  const m = data.metrics;
  const reqs = num(m, 'http_reqs', 'count') || 0;
  const failRatePct = (num(m, 'http_req_failed', 'rate') || 0) * 100;
  const board200 = num(m, 'invariant_board_200', 'count') || 0;
  const teamsArray = num(m, 'invariant_teams_array', 'count') || 0;
  const failures = num(m, 'invariant_failures', 'count') || 0;
  const assertions = board200 + teamsArray + failures;
  const assertionPass = board200 + teamsArray;
  const assertionRate = assertions > 0 ? (assertionPass / assertions) * 100 : 100;

  const hits = num(m, 'cache_hits', 'count') || 0;
  const misses = num(m, 'cache_misses', 'count') || 0;
  const stales = num(m, 'cache_stale', 'count') || 0;
  const bypass = num(m, 'cache_bypass', 'count') || 0;
  const cacheLookups = hits + misses + stales + bypass;
  const hitRatio = cacheLookups > 0 ? (hits / cacheLookups) * 100 : null;

  const measured = Math.max(0, reqs - WARMUP_TOTAL);
  const maxVus = num(m, 'vus_max', 'value') || VUS;
  const runSeconds = (data.state?.testRunDurationMs || 0) / 1000;

  return {
    reqs,
    measured,
    failRatePct,
    board200,
    teamsArray,
    failures,
    assertions,
    assertionPass,
    assertionRate,
    hits,
    misses,
    stales,
    bypass,
    cacheLookups,
    hitRatio,
    cacheDisabled: bypass > 0 && hits === 0,
    maxVus,
    runSeconds,
    subHundredth: num(m, 'sub_0_01ms_requests', 'count') || 0,
    main: trendOf(m, 'board_latency'),
    cold: trendOf(m, 'cold_board_latency'),
    warm: trendOf(m, 'warm_board_latency'),
    // Phase breakdown: waiting (request sent -> first byte) is mostly server
    // time; blocked/connecting are client-side costs. A large "waiting" with a
    // small "blocked" points at the server, and the reverse points at the client.
    phases: {
      waiting: trendOf(m, 'http_req_waiting'),
      blocked: trendOf(m, 'http_req_blocked'),
      connecting: trendOf(m, 'http_req_connecting'),
    },
  };
}

/** Throughput is client-limited by the think time, not a server capacity number. */
function clientCeiling(med, vus) {
  if (med === null || med === undefined) return null;
  return (1000 / (med + THINK_TIME_S * 1000)) * vus;
}

function generateConsoleSummary(data) {
  const s = extract(data);
  const isCompare = !!(s.cold && s.warm);
  const p95 = isCompare ? null : s.main?.p95 ?? null;
  const cacheLabel = s.cacheDisabled
    ? 'COLD (server started with BOARD_CACHE_DISABLED=1 — no cache layer ran)'
    : MODE === 'cold'
      ? 'COLD (unique URL per iteration — HTTP cache bypassed)'
      : MODE === 'compare'
        ? 'COMPARE (cold scenario, then warm scenario)'
        : 'WARM (hot URL — served from the in-process response cache)';
  // A latency pass only counts when the run actually succeeded: a 0 ms p95 with
  // 100% failures is not a pass.
  const pass = p95 !== null && p95 < PASS_LINE_MS && s.failRatePct === 0 && s.failures === 0;
  const goal = p95 !== null && p95 < GOAL_MS && s.failRatePct === 0 && s.failures === 0;
  const ceiling = clientCeiling(s.main?.med ?? s.warm?.med, s.maxVus);

  const lines = [
    '',
    '================================================================================',
    `TEAMFORGE LOAD TEST SUMMARY  ·  ${MODE.toUpperCase()} run`,
    '================================================================================',
    `Target:            ${BOARD_URL}`,
    `Load:              ${s.maxVus} VUs · think time ${(THINK_TIME_S * 1000).toFixed(0)} ms · ${DURATION}`,
    `Cache mode:        ${cacheLabel}`,
    '',
    `Requests:          ${fmtInt(s.reqs)} total (${fmtInt(s.measured)} measured + ${fmtInt(WARMUP_TOTAL)} warm-up)`,
    `Throughput:        ${fmtInt(num(data.metrics, 'http_reqs', 'rate'))} req/s (k6 rate; includes warm-up window)`,
    `Error rate:        ${s.failRatePct.toFixed(2)}%`,
    '',
    'Latency (measured scenario requests only):',
  ];

  const latencyLines = (t) => [
    `  p50 ${fmtMs(t.med)} · avg ${fmtMs(t.avg)} · p90 ${fmtMs(t.p90)} · p95 ${fmtMs(t.p95)} · p99 ${fmtMs(t.p99)}`,
    `  min ${fmtMinConsole(t.min, s.subHundredth)} (k6 zero-floor artifact) · max ${fmtMs(t.max)}`,
  ];

  if (s.main && !isCompare) lines.push(...latencyLines(s.main));
  else if (s.cold && s.warm) {
    lines.push('  cold (cache bypassed):', ...latencyLines(s.cold), '  warm (cache hit):', ...latencyLines(s.warm));
  }

  lines.push(
    '',
    `Cache:             HIT ${fmtInt(s.hits)} · MISS ${fmtInt(s.misses)} · STALE ${fmtInt(s.stales)}${s.bypass ? ` · BYPASS ${fmtInt(s.bypass)}` : ''}${s.hitRatio === null ? '' : ` (${s.hitRatio.toFixed(2)}% hit ratio)`}`,
    `Phase p50/p95:     waiting ${fmtMs(s.phases.waiting?.med)}/${fmtMs(s.phases.waiting?.p95)} · blocked ${fmtMs(s.phases.blocked?.med)}/${fmtMs(s.phases.blocked?.p95)} · connecting ${fmtMs(s.phases.connecting?.med)}/${fmtMs(s.phases.connecting?.p95)}`,
    `  (waiting = sent -> first byte, mostly server; blocked/connecting = client-side)`,
    `Assertions:        ${fmtInt(s.assertionPass)} passed / ${fmtInt(s.failures)} failed of ${fmtInt(s.assertions)} (${s.assertionRate.toFixed(2)}%)`,
    `  · board 200 OK:            ${fmtInt(s.board200)}`,
    `  · has teams array:         ${fmtInt(s.teamsArray)}`,
    ''
  );

  if (s.cold && s.warm) {
    lines.push(
      'Side-by-side (same VUs, same duration, cold scenario first):',
      '  metric      cold (DB-bound)      warm (cache hit)',
      `  p50         ${fmtMs(s.cold.med).padEnd(20)} ${fmtMs(s.warm.med)}`,
      `  p95         ${fmtMs(s.cold.p95).padEnd(20)} ${fmtMs(s.warm.p95)}`,
      `  p99         ${fmtMs(s.cold.p99).padEnd(20)} ${fmtMs(s.warm.p99)}`,
      `  max         ${fmtMs(s.cold.max).padEnd(20)} ${fmtMs(s.warm.max)}`,
      ''
    );
  }

  if (isCompare && s.cold && s.warm) {
    const coldOk = s.failRatePct === 0;
    const warmOk = s.failRatePct === 0;
    lines.push(
      `Pass/fail line:    p95 < ${PASS_LINE_MS} ms (organizer spec) -> cold ${coldOk && s.cold.p95 < PASS_LINE_MS ? 'PASS' : 'FAIL'} (${fmtMs(s.cold.p95)}) · warm ${warmOk && s.warm.p95 < PASS_LINE_MS ? 'PASS' : 'FAIL'} (${fmtMs(s.warm.p95)})`,
      `Internal goal:     p95 < ${GOAL_MS} ms (our own target, not a submission gate) -> cold ${coldOk && s.cold.p95 < GOAL_MS ? 'met' : 'not met'} · warm ${warmOk && s.warm.p95 < GOAL_MS ? 'met' : 'not met'}`,
      `Client ceiling:    ~${fmtInt(ceiling)} req/s at ${s.maxVus} VUs (1000 / (p50 ${fmtMs(s.warm?.med)} + ${(THINK_TIME_S * 1000).toFixed(0)} ms think time) x ${s.maxVus})`,
      '                   Measured req/s is limited by the k6 think time, not by server capacity.',
      '================================================================================',
      ''
    );
    return lines.join('\n');
  }

  lines.push(
    `Pass/fail line:    p95 < ${PASS_LINE_MS} ms (organizer spec) -> ${pass ? 'PASS' : 'FAIL'} (${fmtMs(p95)})`,
    `Internal goal:     p95 < ${GOAL_MS} ms (our own target, not a submission gate) -> ${goal ? 'met' : 'not met'}`,
    `Client ceiling:    ~${fmtInt(ceiling)} req/s at ${s.maxVus} VUs (1000 / (p50 ${fmtMs(s.main?.med)} + ${(THINK_TIME_S * 1000).toFixed(0)} ms think time) x ${s.maxVus})`,
    '                   Measured req/s is limited by the k6 think time, not by server capacity.',
    '================================================================================',
    ''
  );

  return lines.join('\n');
}

function latencyRow(label, value, max, status) {
  const pct = value === null || value === undefined ? 0 : Math.min(100, (value / max) * 100);
  return `          <tr>
            <td><strong>${label}</strong></td>
            <td class="mono">${value === null || value === undefined ? 'n/a' : `${value.toFixed(2)} ms`}</td>
            <td><div class="bar-bg"><div class="bar-fill" style="width: ${pct}%"></div></div></td>
            <td>${status}</td>
          </tr>`;
}

function generateHtmlReport(data) {
  const s = extract(data);
  // In compare mode the headline is the warm scenario (the one that corresponds
  // to the official board-read run); the cold scenario is shown beside it.
  const headline = s.main ?? s.warm ?? null;
  const p95 = headline?.p95 ?? null;
  const runClean = s.failRatePct === 0 && s.failures === 0;
  const isPass = p95 !== null && p95 < PASS_LINE_MS && runClean;
  const isGoal = p95 !== null && p95 < GOAL_MS && runClean;
  const ok = (v) => (v ? '<span style="color: var(--pass); font-weight: 700;">Optimal</span>' : '<span style="color: #B45309; font-weight: 700;">Above goal</span>');
  const statusWord = (v) => (v ? '<span style="color: var(--pass); font-weight: 800;">✓ PASS</span>' : '<span style="color: #DC2626; font-weight: 800;">✗ FAIL</span>');

  const compareSection = s.cold && s.warm
    ? `
    <div class="section-card">
      <div class="section-title">Cold vs Warm (same VUs, same duration, sequential scenarios)</div>
      <p class="note">
        The cold scenario gives every iteration a unique URL (rotating filters and keyset cursors), so the
        pre-serialized response cache always misses and each request runs the real keyset query against
        PostgreSQL. The warm scenario re-requests one hot URL, so almost every request is answered from the
        in-process cache. Both numbers describe the same build.
      </p>
      <table>
        <thead>
          <tr><th>Metric</th><th>Cold — cache bypassed (DB-bound)</th><th>Warm — cache hit</th></tr>
        </thead>
        <tbody>
          ${compareRow('p50', s.cold.med, s.warm.med)}
          ${compareRow('Average', s.cold.avg, s.warm.avg)}
          ${compareRow('p90', s.cold.p90, s.warm.p90)}
          ${compareRow('p95 (organizer pass line: &lt; 200 ms)', s.cold.p95, s.warm.p95, true)}
          ${compareRow('p99', s.cold.p99, s.warm.p99)}
          ${compareRow('Max', s.cold.max, s.warm.max)}
        </tbody>
      </table>
    </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TeamForge — High-Concurrency Load Test Report</title>
  <style>
    :root {
      --pine: #12302D;
      --teal: #0F766E;
      --mint: #5EEAD4;
      --canvas: #F6F5F1;
      --surface: #FFFFFF;
      --charcoal: #16181D;
      --muted: #64748B;
      --border: #E2E8F0;
      --pass: #059669;
      --pass-bg: #ECFDF5;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--canvas);
      color: var(--charcoal);
      line-height: 1.5;
      padding: 32px 16px;
    }
    .container { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
    .header {
      background: var(--pine);
      color: #F8FAFC;
      border-radius: 16px;
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 10px 25px -5px rgba(18, 48, 45, 0.2);
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo {
      width: 36px; height: 36px; border-radius: 10px;
      background: var(--mint); color: var(--pine);
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 18px;
    }
    .title { font-size: 26px; font-weight: 800; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 9999px;
      font-size: 12px; font-weight: 700; text-transform: uppercase;
      background: var(--mint); color: var(--pine);
    }
    .badge-cool { background: #FDE68A; color: #78350F; }
    .status-banner {
      background: ${isPass ? 'var(--pass-bg)' : '#FEF2F2'};
      border: 1px solid ${isPass ? '#A7F3D0' : '#FECACA'};
      color: ${isPass ? 'var(--pass)' : '#DC2626'};
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-weight: 700;
      font-size: 15px;
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .card-label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; }
    .card-value { font-size: 30px; font-weight: 800; color: var(--charcoal); }
    .card-sub { font-size: 12px; color: var(--muted); }
    .card-accent { color: var(--teal); }
    .card-pass { color: var(--pass); }

    .section-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .section-title { font-size: 18px; font-weight: 800; color: var(--pine); }
    .note { font-size: 13px; color: var(--muted); }

    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 10px 12px; border-bottom: 2px solid var(--border); color: var(--muted); font-size: 12px; text-transform: uppercase; }
    td { padding: 12px; border-bottom: 1px solid var(--border); }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .bar-bg { width: 100%; height: 8px; background: #E2E8F0; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--teal); border-radius: 4px; }
    .footer { text-align: center; font-size: 12px; color: var(--muted); margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">
        <div class="logo">T</div>
        <div class="title">TeamForge Load Test Report</div>
        <span class="badge ${s.cacheDisabled || MODE === 'cold' ? 'badge-cool' : ''}">${s.cacheDisabled ? 'cold run (cache disabled)' : `${MODE} run`}</span>
      </div>
      <p style="color: #CBD5E1; font-size: 14px;">
        ${s.maxVus} virtual users · ${(THINK_TIME_S * 1000).toFixed(0)} ms think time · ${DURATION} per scenario ·
        PostgreSQL 16 READ COMMITTED with B-Tree keyset pagination, single-flight DB coalescing, and an
        in-process HTTP response cache with stale-while-revalidate.
      </p>
    </div>

    <div class="status-banner">
      <span>${isPass ? '✓ ORGANIZER THRESHOLD MET' : '✗ ORGANIZER THRESHOLD FAILED'} — pass/fail line: p95 &lt; ${PASS_LINE_MS} ms</span>
      <span>p95 ${p95 === null ? 'n/a' : `${p95.toFixed(2)} ms`}</span>
    </div>

    <div class="grid">
      <div class="card">
        <span class="card-label">p95 Latency</span>
        <span class="card-value ${isPass ? 'card-pass' : ''}">${p95 === null ? 'n/a' : p95.toFixed(2)} <span style="font-size: 16px;">ms</span></span>
        <span class="card-sub">${isGoal ? `✓ under our own ${GOAL_MS} ms goal` : 'above our own 30 ms goal'} · pass line ${PASS_LINE_MS} ms</span>
      </div>
      <div class="card">
        <span class="card-label">Throughput</span>
        <span class="card-value card-accent">${fmtInt(num(data.metrics, 'http_reqs', 'rate'))} <span style="font-size: 16px;">req/s</span></span>
        <span class="card-sub">${fmtInt(s.reqs)} requests total · ${fmtInt(s.measured)} measured + ${fmtInt(WARMUP_TOTAL)} warm-up</span>
      </div>
      <div class="card">
        <span class="card-label">Error Rate</span>
        <span class="card-value ${s.failRatePct === 0 ? 'card-pass' : ''}">${s.failRatePct.toFixed(2)}%</span>
        <span class="card-sub">${fmtInt(Math.round((s.failRatePct / 100) * s.reqs))} of ${fmtInt(s.reqs)} requests</span>
      </div>
      <div class="card">
        <span class="card-label">Cache ${s.cacheDisabled || MODE === 'cold' ? 'Bypassed' : 'Hit Ratio'}</span>
        <span class="card-value">${s.hitRatio === null ? 'n/a' : `${s.hitRatio.toFixed(2)}%`}</span>
        <span class="card-sub">HIT ${fmtInt(s.hits)} · MISS ${fmtInt(s.misses)} · STALE ${fmtInt(s.stales)}${s.bypass ? ` · BYPASS ${fmtInt(s.bypass)}` : ''}</span>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">Latency Distribution (measured requests)</div>
      <table>
        <thead>
          <tr>
            <th>Percentile</th>
            <th>Duration</th>
            <th>Visual Range</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${latencyRow('Median (p50)', headline?.med, 200, ok(headline?.med !== null && headline?.med < GOAL_MS))}
          ${latencyRow('Average', headline?.avg, 200, ok(headline?.avg !== null && headline?.avg < GOAL_MS))}
          ${latencyRow('p90', headline?.p90, 200, ok(headline?.p90 !== null && headline?.p90 < GOAL_MS))}
          <tr style="background: #F8FAFC;">
            <td><strong>p95 (organizer pass line: &lt; ${PASS_LINE_MS} ms)</strong></td>
            <td class="mono" style="color: ${isPass ? 'var(--pass)' : '#DC2626'}; font-weight: 800;">${p95 === null ? 'n/a' : `${p95.toFixed(2)} ms`}</td>
            <td><div class="bar-bg"><div class="bar-fill" style="width: ${Math.min(100, ((p95 || 0) / PASS_LINE_MS) * 100)}%; background: ${isPass ? 'var(--pass)' : '#DC2626'};"></div></div></td>
            <td>${statusWord(isPass)}</td>
          </tr>
          ${latencyRow('p99', headline?.p99, 300, ok(headline?.p99 !== null && headline?.p99 < 100))}
          <tr>
            <td><strong>Min / Max</strong></td>
            <td class="mono">${fmtMin(headline?.min, s.subHundredth)} / ${headline?.max === null || headline?.max === undefined ? 'n/a' : `${headline.max.toFixed(2)} ms`}</td>
            <td><div class="bar-bg"><div class="bar-fill" style="width: 100%; background: #94A3B8;"></div></div></td>
            <td><span style="color: var(--muted);">Bounded</span></td>
          </tr>
        </tbody>
      </table>
      <p class="note">
        Minimum: k6 quantizes sub-timer-resolution responses to an exact
        <span class="mono">0</span>, so this column prints <span class="mono">&lt;0.01 ms</span> with the count of
        affected requests (${fmtInt(s.subHundredth)} of ${fmtInt(s.measured)}) rather than a literal
        <span class="mono">0.00 ms</span>; a zero minimum here is a timer artifact, not a doctored number.
        The p50 (${headline?.med === null || headline?.med === undefined ? 'n/a' : `${headline.med.toFixed(2)} ms`}) is the
        meaningful lower bound for a served response.
        ${MODE === 'warm' || MODE === 'compare' ? 'These percentiles describe cache-served responses.' : ''}
      </p>
    </div>

    ${compareSection}

    <div class="section-card">
      <div class="section-title">Validation Checks &amp; Data Invariants</div>
      <table>
        <thead>
          <tr>
            <th>Invariant / Check</th>
            <th>Passes</th>
            <th>Fails</th>
            <th>Success Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Board Status 200 OK</strong></td>
            <td class="mono">${fmtInt(s.board200)}</td>
            <td class="mono">${fmtInt(s.measured - s.board200 + s.failures > 0 ? s.measured - s.board200 : 0)}</td>
            <td><span style="color: var(--pass); font-weight: 700;">${s.measured > 0 ? ((s.board200 / s.measured) * 100).toFixed(2) : 'n/a'}%</span></td>
          </tr>
          <tr>
            <td><strong>Payload Structure (Has Teams Array)</strong></td>
            <td class="mono">${fmtInt(s.teamsArray)}</td>
            <td class="mono">${fmtInt(s.measured - s.teamsArray > 0 ? s.measured - s.teamsArray : 0)}</td>
            <td><span style="color: var(--pass); font-weight: 700;">${s.measured > 0 ? ((s.teamsArray / s.measured) * 100).toFixed(2) : 'n/a'}%</span></td>
          </tr>
          <tr>
            <td><strong>Total Assertions</strong> (2 per measured request)</td>
            <td class="mono">${fmtInt(s.assertionPass)}</td>
            <td class="mono">${fmtInt(s.failures)}</td>
            <td><span style="color: ${s.failures === 0 ? 'var(--pass)' : '#DC2626'}; font-weight: 800;">${s.assertionRate.toFixed(2)}%</span></td>
          </tr>
        </tbody>
      </table>
      <p class="note">
        Measured requests: ${fmtInt(s.measured)} (${fmtInt(s.reqs)} total minus ${fmtInt(WARMUP_TOTAL)} warm-up
        requests, which k6 counts in <span class="mono">http_reqs</span> but which run no assertions).
        Assertion total ${fmtInt(s.assertions)} = 2 × ${fmtInt(s.measured)}.
      </p>
    </div>

    <div class="section-card">
      <div class="section-title">Methodology Notes</div>
      <p class="note">
        <strong>Pass/fail line:</strong> p95 &lt; ${PASS_LINE_MS} ms, the organizer specification.
        ${GOAL_MS} ms is our own engineering goal and is reported for information only.<br>
        <strong>Throughput is client-limited:</strong> each virtual user sleeps ${(THINK_TIME_S * 1000).toFixed(0)} ms
        between requests, so ${s.maxVus} VUs can issue at most
        ~${fmtInt(clientCeiling(headline?.med, s.maxVus))} req/s at the measured p50. The reported req/s is not a
        server capacity measurement.<br>
        <strong>Cache disclosure:</strong> ${s.cacheDisabled ? 'the server was started with BOARD_CACHE_DISABLED=1, so every request ran the full Fastify + PostgreSQL path (0% cache)' : MODE === 'cold' ? 'this run bypassed the response cache with unique URLs — every request ran the real keyset query' : MODE === 'warm' ? 'this run re-requests one hot URL — most requests were answered from the in-process cache' : 'the cold scenario bypassed the response cache; the warm scenario was served from it'} (HIT ${fmtInt(s.hits)} / MISS ${fmtInt(s.misses)} / STALE ${fmtInt(s.stales)}${s.bypass ? ` / BYPASS ${fmtInt(s.bypass)}` : ''}).<br>
        <strong>Warm-up:</strong> ${fmtInt(WARMUP_TOTAL)} requests before the measurement window, excluded from all latency percentiles.<br>
        <strong>Phase breakdown (p50 / p95):</strong> waiting ${fmtMs(s.phases.waiting?.med)} / ${fmtMs(s.phases.waiting?.p95)},
        blocked ${fmtMs(s.phases.blocked?.med)} / ${fmtMs(s.phases.blocked?.p95)},
        connecting ${fmtMs(s.phases.connecting?.med)} / ${fmtMs(s.phases.connecting?.p95)}. "waiting" is request-sent to first byte
        (mostly server time); "blocked" and "connecting" are client-side costs.
      </p>
    </div>

    <div class="footer">
      Generated automatically by k6 · TeamForge Concurrency Engine · PS1 Hackathon 2026
    </div>
  </div>
</body>
</html>`;
}

function compareRow(label, coldValue, warmValue, strong) {
  const cell = (v) => (v === null || v === undefined ? 'n/a' : `${v.toFixed(2)} ms`);
  const style = strong ? ' style="color: var(--pass); font-weight: 800;"' : '';
  return `          <tr>
            <td><strong>${label}</strong></td>
            <td class="mono"${style}>${cell(coldValue)}</td>
            <td class="mono"${style}>${cell(warmValue)}</td>
          </tr>`;
}

export function handleSummary(data) {
  return {
    'docs/load-test-report.html': generateHtmlReport(data),
    'docs/load-test-runs/last-run.json': JSON.stringify({ mode: MODE, vus: VUS, thinkTimeMs: THINK_TIME_S * 1000, duration: DURATION, metrics: extract(data) }, null, 2),
    stdout: generateConsoleSummary(data),
  };
}

