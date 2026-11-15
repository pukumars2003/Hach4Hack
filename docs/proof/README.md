# Grafana k6 Load-Test Proof

These are fresh local runs from 2026-11-15 against `http://localhost:3000/api/teams`, using Grafana k6
v2.1.0 on Windows. The API health check reported healthy before and after the runs.

Each run used a 15-second realistic mix (`MIX=true`), a 50 ms think time, and `WARMUP=0` so the requested
VU count is the only measured scenario load. The mix serves most requests from the default board URL and
varies the rest across filters and cursors. Results are specific to this local host and current database;
the dataset row count was not separately measured for this run.

| Virtual users | Requests | p95 latency | Error rate | 200 ms target | k6 exit |
| ---: | ---: | ---: | ---: | :---: | ---: |
| 1 | 262 | 8.92 ms | 0.00% | Pass | 0 |
| 100 | 12,359 | 95.68 ms | 0.00% | Pass | 0 |
| 250 | 24,728 | 183.35 ms | 0.00% | Pass | 0 |
| 500 | 24,258 | 272.41 ms | 1.60% | Fail | 99 |

The 500-VU run did not meet the p95 < 200 ms target and exceeded the 1% request-error threshold. It is
included as a measured limit, not presented as a pass. These results do not replace the historical
full-seed runs in the [benchmark report](../LOAD_TEST_REPORT.md).

## Interpreting the Results

The k6 generator and API ran on the same Windows machine. At 500 VUs, 387 requests were refused during
the run, although the API health check passed afterward. This points to a local capacity or connection
limit under that load. RAM pressure could contribute, but RAM and CPU usage were not recorded during the
test, so the failure cannot be attributed to memory alone. The database host was not recorded separately.

The current ladder used one 15-second run per VU level, an 80/20 realistic board mix, 50 ms think time, and
`WARMUP=0`. This includes the initial cache misses in the measured interval. The historical full-seed
realistic-mix runs used a measured 10,078-team dataset and a 1,000-request setup warm-up; the current
dataset row count was not audited. The current and historical mix runs use broadly the same traffic shape,
but differ in warm-up, confirmed dataset size, and host conditions. An earlier 3.43 ms p95 result was a
warm-cache run on the smaller 2,039-team dataset, so that hot-URL result is a different workload from this
mixed run.

A dedicated server may perform better if the API and database have more resources and k6 runs from a
separate load-generator machine. That is a reasonable expectation, not a measured result; repeat the same
mix, duration, and VU levels on that setup before claiming an improvement.

## Run artifacts

Each VU level has a terminal result (`.txt`), the generated HTML report (`.html`), and the k6 summary
metrics (`.json`). The 500-VU text file is a concise summary because its full console output contained
hundreds of connection-error warnings; the verbose transcript stays in the ignored `.local-only` folder.

- [1 VU terminal](k6-1vu-terminal.txt) · [HTML report](k6-1vu.html) · [JSON metrics](k6-1vu.json)
- [100 VUs terminal](k6-100vu-terminal.txt) · [HTML report](k6-100vu.html) · [JSON metrics](k6-100vu.json)
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
