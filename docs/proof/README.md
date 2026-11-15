# Grafana k6 Load-Test Proof

These are fresh local runs from 2026-11-15 against `http://localhost:3000/api/teams`, using Grafana k6
v2.1.0 on Windows. The API health check reported healthy before and after the runs.

Each run used a 15-second realistic mix (`MIX=true`), a 50 ms think time, and `WARMUP=0` so the requested
VU count is the only measured scenario load. The mix serves most requests from the default board URL and
varies the rest across filters and cursors. Results are specific to this local host and current database;
the dataset row count was not separately measured for this run.

| VUs | Mode | Setup warm-up | Requests | p95 | Errors | 200 ms target |
| ---: | --- | ---: | ---: | ---: | ---: | :---: |
| 1 | Realistic mix | 0 | 262 | 8.92 ms | 0.00% | Pass |
| 100 | Realistic mix | 0 | 12,359 | 95.68 ms | 0.00% | Pass |
| 100 | Warm, user-shared run | 1,000 | 29,308 | 2.83 ms | 0.00% | Pass |
| 100 | Warm, rerun | 1,000 | 24,766 | 39.03 ms | 0.00% | Pass |
| 250 | Realistic mix | 0 | 24,728 | 183.35 ms | 0.00% | Pass |
| 500 | Realistic mix | 0 | 24,258 | 272.41 ms | 1.60% | Fail |

The 500-VU run did not meet the p95 < 200 ms target and exceeded the 1% request-error threshold. It is
included as a measured limit, not presented as a pass. These results do not replace the historical
full-seed runs in the [benchmark report](../LOAD_TEST_REPORT.md).

## Interpreting the Results

The command `k6 run scripts/load-test.js` uses the default warm mode: 100 VUs repeatedly request the same
board URL, after 1,000 setup requests have warmed the cache. The user-shared run showed 99.93% cache hits,
so its 2.83 ms p95 mostly reflects cached response time. The 95.68 ms result used `MIX=true` and
`WARMUP=0`: 80% of requests use the hot URL and 20% vary filters/cursors, producing database-backed cache
misses as well as cache hits. The two p95 values measure different workloads.

A subsequent rerun using the same default warm configuration measured 39.03 ms p95 (99.85% cache hits),
rather than 2.83 ms. Both meet the 200 ms target. This demonstrates run-to-run tail-latency variation even
with the same settings; we did not capture enough host telemetry to isolate its cause.

The k6 generator and API ran on the same Windows machine. At 500 VUs, 387 requests were refused during
the run, although the API health check passed afterward. This points to a local capacity or connection
limit under that load. RAM pressure could contribute, but RAM and CPU usage were not recorded during the
test, so the failure cannot be attributed to memory alone. The database host was not recorded separately.

The realistic-mix ladder used one 15-second run per VU level and 50 ms think time. `WARMUP=0` includes
initial cache misses in the measured interval. The historical full-seed realistic-mix runs used a measured
10,078-team dataset and a 1,000-request setup warm-up; the current dataset row count was not audited. The
current and historical mix runs use broadly the same traffic shape, but differ in warm-up, dataset-size
verification, and host conditions. An earlier 3.43 ms p95 result was a warm-cache run on the smaller
2,039-team dataset, so that hot-URL result is a different workload from this mixed run.

A dedicated server may perform better if the API and database have more resources and k6 runs from a
separate load-generator machine. That is a reasonable expectation, not a measured result; repeat the same
mix, duration, and VU levels on that setup before claiming an improvement.

## Run artifacts

Each VU level has a terminal result (`.txt`), the generated HTML report (`.html`), and the k6 summary
metrics (`.json`). The 500-VU text file is a concise summary because its full console output contained
hundreds of connection-error warnings; the verbose transcript stays in the ignored `.local-only` folder.
The user-shared 100-VU warm result is also preserved as the current default [HTML report](../load-test-report.html)
and [JSON metrics](../load-test-runs/last-run.json).

- [1 VU terminal](k6-1vu-terminal.txt) · [HTML report](k6-1vu.html) · [JSON metrics](k6-1vu.json)
- [100 VUs terminal](k6-100vu-terminal.txt) · [HTML report](k6-100vu.html) · [JSON metrics](k6-100vu.json)
- [100 VUs warm rerun terminal](k6-100vu-warm-terminal.txt) · [HTML report](k6-100vu-warm.html) · [JSON metrics](k6-100vu-warm.json)
- [250 VUs terminal](k6-250vu-terminal.txt) · [HTML report](k6-250vu.html) · [JSON metrics](k6-250vu.json)
- [500 VUs terminal](k6-500vu-terminal.txt) · [HTML report](k6-500vu.html) · [JSON metrics](k6-500vu.json)

To keep existing report files intact, set `REPORT_PREFIX` to a unique path for each run. For example, in
PowerShell:

```powershell
$env:VUS = '100'
$env:DURATION = '15s'
$env:WARMUP = '0'
$env:MIX = 'true'
$env:REPORT_PREFIX = 'docs/proof/k6-100vu'
k6 run scripts/load-test.js 2>&1 | Tee-Object 'docs/proof/k6-100vu-terminal.txt'
```

The terminal capture is the k6 CLI output; the HTML is the project-generated report built from k6 metrics.
