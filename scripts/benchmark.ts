import http from 'http';

interface BenchmarkStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencies: number[];
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  avg: number;
  reqPerSec: number;
  cacheHits: number;
  cacheMisses: number;
  thinkTimeMs: number;
  cold: boolean;
}

const PASS_LINE_MS = 200; // organizer pass/fail threshold
const GOAL_MS = 30; // our own engineering goal, not a submission gate

/**
 * High-performance concurrency benchmark runner
 * Simulates 100 to 500 concurrent virtual users hitting the board endpoint.
 */
export async function runLoadTest(options: {
  url?: string;
  concurrentVUs?: number;
  durationSeconds?: number;
  maxRequests?: number;
  thinkTimeMs?: number;
  warmUpRequests?: number;
  /**
   * When true every request uses a different filter/cursor combination, so the
   * in-process response cache always misses and each request runs the real
   * keyset query. Use it to report the DB-bound number next to the cache-hit
   * number instead of a single cache-flattered figure.
   */
  cold?: boolean;
}): Promise<BenchmarkStats> {
  const baseUrl = options.url || 'http://localhost:3000/api/teams?limit=20';
  const VUs = options.concurrentVUs || 100;
  const duration = options.durationSeconds || 10;
  const maxRequests = options.maxRequests;
  // Match the k6 scenario: each virtual user pauses briefly between requests
  // instead of hammering the socket in a tight loop. This models real clients
  // and keeps throughput comparable across both benchmark tools.
  const thinkTimeMs = options.thinkTimeMs ?? 50;
  const warmUpRequests = options.warmUpRequests ?? 1000;
  const cold = options.cold ?? false;

  let issued = 0;
  const nextUrl = () => {
    // Unique (created_at, id) keyset cursor plus a rotating filter per request.
    const n = issued++;
    const page = n % 40;
    const cursorTime = new Date(Date.parse('2026-11-14T15:00:00.000Z') - page * 60000).toISOString();
    const limits = [20, 25, 30, 40, 50];
    const statuses = ['all', 'forming', 'ready', 'full'];
    const skills = ['', 'React', 'Node', 'Design', 'ML'];
    if (!cold) return baseUrl;

    const limit = limits[n % limits.length];
    const status = statuses[Math.floor(n / 3) % statuses.length];
    const skill = skills[Math.floor(n / 17) % skills.length];
    let url = `${baseUrl}&limit=${limit}&status=${status}&cursorCreatedAt=${encodeURIComponent(cursorTime)}&cursorId=00000000-0000-4000-8000-${String(page + 1).padStart(12, '0')}`;
    if (skill) url += `&skill=${encodeURIComponent(skill)}`;
    return url;
  };

  const targetUrl = new URL(baseUrl);

  console.log('====================================================');
  console.log(`BOARD ENDPOINT HIGH-CONCURRENCY LOAD TEST`);
  console.log(`Target: ${targetUrl.toString()}`);
  console.log(`Virtual Users: ${VUs} concurrent workers`);
  console.log(`Think Time: ${thinkTimeMs} ms between requests per worker`);
  console.log(`Cache: ${cold ? 'COLD — unique URL per request, response cache bypassed' : 'WARM — hot URL, served from the in-process response cache'}`);
  console.log(`Duration: ${duration} seconds ${maxRequests ? `(or up to ${maxRequests.toLocaleString()} requests)` : ''}`);
  console.log('====================================================');

  // Pre-flight check: ensure target server is up
  try {
    await new Promise<void>((resolve, reject) => {
      const ping = http.get(targetUrl, { timeout: 3000 }, (res) => {
        res.resume();
        resolve();
      });
      ping.on('error', reject);
      ping.on('timeout', () => { ping.destroy(); reject(new Error('Timeout')); });
    });
  } catch {
    console.error(`\n❌ Target server unreachable at ${targetUrl.origin}`);
    console.error(`👉 Please start the server first in another terminal: npm run dev:server (or npm start)\n`);
    process.exit(1);
  }

  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: VUs + 50,
  });

  // Warm-up: prime the JIT, database pool, and in-memory board cache before the
  // measurement window starts. Warm-up traffic is excluded from the stats so the
  // reported percentiles reflect steady state, mirroring `setup()` in k6.
  if (warmUpRequests > 0) {
    const warmUpConcurrency = Math.min(VUs, 50);
    let sent = 0;
    await Promise.all(
      Array.from({ length: warmUpConcurrency }, async () => {
        while (sent < warmUpRequests) {
          sent++;
          await new Promise<void>((resolve) => {
            const req = http.get(
              targetUrl,
              { agent, headers: { Accept: 'application/json' } },
              (res) => {
                res.resume();
                res.on('end', () => resolve());
              }
            );
            req.on('error', () => resolve());
            req.setTimeout(5000, () => { req.destroy(); resolve(); });
          });
        }
      })
    );
    console.log(`Warm-up: ${warmUpRequests.toLocaleString()} requests completed (excluded from metrics)`);
  }

  const latencies: number[] = [];
  let successCount = 0;
  let failCount = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  let running = true;

  const trackCache = (res: import('http').IncomingMessage) => {
    const header = res.headers['x-cache'];
    if (header === 'HIT') cacheHits++;
    else cacheMisses++;
  };

  const testStartTime = Date.now();
  const testEndTime = testStartTime + duration * 1000;

  async function worker() {
    while (running && Date.now() < testEndTime) {
      if (maxRequests && latencies.length >= maxRequests) {
        running = false;
        break;
      }
      const reqStart = process.hrtime.bigint();
      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.get(
            nextUrl(),
            { agent, headers: { Accept: 'application/json' } },
            (res) => {
              trackCache(res);
              res.resume();
              res.on('end', () => {
                const reqEnd = process.hrtime.bigint();
                const latencyMs = Number(reqEnd - reqStart) / 1_000_000;
                latencies.push(latencyMs);
                if (res.statusCode && res.statusCode < 400) {
                  successCount++;
                } else {
                  failCount++;
                }
                resolve();
              });
            }
          );
          req.on('error', (err) => {
            failCount++;
            resolve();
          });
          req.setTimeout(5000, () => {
            req.destroy();
            failCount++;
            resolve();
          });
        });
      } catch {
        failCount++;
      }

      if (thinkTimeMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, thinkTimeMs));
      }
    }
  }

  // Spawn VUs
  const workers = Array.from({ length: VUs }, () => worker());
  await Promise.all(workers);
  running = false;

  const totalTimeSeconds = (Date.now() - testStartTime) / 1000;
  latencies.sort((a, b) => a - b);

  const getPercentile = (p: number) => {
    if (latencies.length === 0) return 0;
    const idx = Math.floor((p / 100) * (latencies.length - 1));
    return Math.round(latencies[idx] * 100) / 100;
  };

  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = latencies.length > 0 ? Math.round((sum / latencies.length) * 100) / 100 : 0;

  const stats: BenchmarkStats = {
    totalRequests: latencies.length,
    successfulRequests: successCount,
    failedRequests: failCount,
    latencies,
    p50: getPercentile(50),
    p90: getPercentile(90),
    p95: getPercentile(95),
    p99: getPercentile(99),
    avg,
    reqPerSec: Math.round((latencies.length / totalTimeSeconds) * 10) / 10,
    cacheHits,
    cacheMisses,
    thinkTimeMs,
    cold,
  };

  const slowest = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const fastest = latencies.length > 0 ? latencies[0] : 0;
  const cacheLookups = cacheHits + cacheMisses;
  const hitRatio = cacheLookups > 0 ? (cacheHits / cacheLookups) * 100 : 0;
  const perVuCeiling = 1000 / (stats.p50 + thinkTimeMs);
  const clientCeiling = Math.round(perVuCeiling * VUs);

  console.log('\n--- BENCHMARK RESULTS ---');
  console.log(`Total Requests:      ${stats.totalRequests.toLocaleString()}`);
  console.log(`Requests / Sec:      ${stats.reqPerSec.toLocaleString()} req/s (client-limited, see note)`);
  console.log(`Success Rate:        ${((successCount / Math.max(1, stats.totalRequests)) * 100).toFixed(2)}%`);
  console.log(`Latency p50:         ${stats.p50} ms`);
  console.log(`Latency p90:         ${stats.p90} ms`);
  console.log(`Latency p95:         ${stats.p95} ms (PASS LINE: < ${PASS_LINE_MS} ms organizer spec · internal goal: < ${GOAL_MS} ms)`);
  console.log(`Latency p99:         ${stats.p99} ms`);
  console.log(`Latency Avg:         ${stats.avg} ms`);
  console.log(`Latency Min / Max:   ${fastest < 0.01 ? '<0.01' : fastest.toFixed(2)} ms / ${slowest.toFixed(2)} ms`);
  console.log(`Cache:               HIT ${cacheHits.toLocaleString()} · MISS ${cacheMisses.toLocaleString()} (${hitRatio.toFixed(2)}% hit ratio) [${cold ? 'cold run' : 'warm run'}]`);
  console.log('------------------------');
  console.log(`Throughput note:     ${VUs} VUs x 1000 / (p50 ${stats.p50} ms + ${thinkTimeMs} ms think time) ≈ ${clientCeiling.toLocaleString()} req/s ceiling.`);
  console.log(`                     Measured req/s is limited by the client think time, not by server capacity.\n`);

  if (stats.p95 < GOAL_MS) {
    console.log(`✅ PASS (organizer spec p95 < ${PASS_LINE_MS} ms): p95 is ${stats.p95} ms, also under our own ${GOAL_MS} ms goal.`);
  } else if (stats.p95 < PASS_LINE_MS) {
    console.log(`✅ PASS (organizer spec p95 < ${PASS_LINE_MS} ms): p95 is ${stats.p95} ms, above our own ${GOAL_MS} ms goal.`);
  } else {
    console.log(`❌ FAIL: p95 latency is ${stats.p95} ms, above the ${PASS_LINE_MS} ms organizer threshold.`);
  }

  return stats;
}

if (process.argv[1].endsWith('benchmark.ts') || process.argv[1].endsWith('benchmark.js')) {
  const vus = process.argv[2] ? parseInt(process.argv[2], 10) : 100;
  const dur = process.argv[3] ? parseInt(process.argv[3], 10) : 10;
  const maxReqs = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;
  const thinkTime = process.argv[5] ? parseInt(process.argv[5], 10) : undefined;
  const cold = process.argv.includes('--cold');
  runLoadTest({ concurrentVUs: vus, durationSeconds: dur, maxRequests: maxReqs, thinkTimeMs: thinkTime, cold })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

