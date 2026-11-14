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
}

/**
 * High-performance concurrency benchmark runner
 * Simulates 100 to 500 concurrent virtual users hitting the board endpoint.
 */
export async function runLoadTest(options: {
  url?: string;
  concurrentVUs?: number;
  durationSeconds?: number;
  maxRequests?: number;
}): Promise<BenchmarkStats> {
  const targetUrl = new URL(options.url || 'http://localhost:3000/api/teams?limit=20');
  const VUs = options.concurrentVUs || 100;
  const duration = options.durationSeconds || 10;
  const maxRequests = options.maxRequests;

  console.log('====================================================');
  console.log(`BOARD ENDPOINT HIGH-CONCURRENCY LOAD TEST`);
  console.log(`Target: ${targetUrl.toString()}`);
  console.log(`Virtual Users: ${VUs} concurrent workers`);
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

  const latencies: number[] = [];
  let successCount = 0;
  let failCount = 0;
  let running = true;

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
            targetUrl,
            { agent, headers: { Accept: 'application/json' } },
            (res) => {
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
  };

  console.log('\n--- BENCHMARK RESULTS ---');
  console.log(`Total Requests:      ${stats.totalRequests.toLocaleString()}`);
  console.log(`Requests / Sec:      ${stats.reqPerSec.toLocaleString()} req/s`);
  console.log(`Success Rate:        ${((successCount / Math.max(1, stats.totalRequests)) * 100).toFixed(2)}%`);
  console.log(`Latency p50:         ${stats.p50} ms`);
  console.log(`Latency p90:         ${stats.p90} ms`);
  console.log(`Latency p95:         ${stats.p95} ms (ORGANIZER GOAL: < 200 ms)`);
  console.log(`Latency p99:         ${stats.p99} ms`);
  console.log(`Latency Avg:         ${stats.avg} ms`);
  console.log('------------------------\n');

  if (stats.p95 < 200) {
    console.log(`🏆 TARGET CRUSHED: p95 latency is ${stats.p95}ms, far beneath the 200ms threshold!`);
  }

  return stats;
}

if (process.argv[1].endsWith('benchmark.ts') || process.argv[1].endsWith('benchmark.js')) {
  const vus = process.argv[2] ? parseInt(process.argv[2], 10) : 100;
  const dur = process.argv[3] ? parseInt(process.argv[3], 10) : 10;
  const maxReqs = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;
  runLoadTest({ concurrentVUs: vus, durationSeconds: dur, maxRequests: maxReqs })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

