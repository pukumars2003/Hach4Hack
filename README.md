# Race-Proof Team Formation Platform (PS1)

> **Hundreds of participants clicking "Join" at the same time. PostgreSQL decides who gets the final seat.**
> Built for the **Hack4Hack Concurrency Championship 2026** and tested against a **5× dataset: 50,000 demo accounts and 10,000 teams**.

[![CI](https://github.com/pukumars2003/Hach4Hack/actions/workflows/ci.yml/badge.svg)](https://github.com/pukumars2003/Hach4Hack/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Live app:** [raceproof-app.onrender.com](https://raceproof-app.onrender.com)

> **Quick Link:** For a complete walkthrough on how to run, test, and verify the platform, see the [Step-by-Step Execution Guide](STEP_BY_STEP_GUIDE.md).

---

## Hackathon Requirements Checklist & 5x Verification

| Requirement | Specification | Our Implementation | Status |
| :--- | :--- | :--- | :---: |
| **Participants Seeded** | 10,000 participants | **50,000 demo accounts** | Seeded |
| **Teams Seeded** | 2,000 teams | **10,000 teams** | Seeded |
| **Board Latency (p95)** | < 200 ms @ 100 VUs | **83–179 ms realistic mix; 88.21 ms warm-cache** | Pass on measured runs; cold runs are documented separately |
| **Last-Seat Race** | 50 simultaneous racers | **Automated 50-way race; UI lab offers up to 250 racers** | Latest run: 1 winner, 49 conflicts |
| **Winners per Last Seat** | Exactly 1 winner | **Exactly 1 winner (0 double-joins)** | Proven |
| **Rules Enforcement** | Min/max sizes, 1 team per hackathon | **Postgres CHECK & UNIQUE constraints** | Proven |
| **Leadership Handover** | Successor elected on leave | **Senior member promoted, or team deleted** | Proven |
| **Idempotency** | Double-clicks/retries safe | **In-transaction idempotency keys table** | Proven |
| **Real-Time Updates** | Live board & team changes | **PostgreSQL LISTEN/NOTIFY + SSE** | Implemented |
| **Security & Entropy** | Rate limits, secure codes | **Crockford Base32 + SHA-256 + Rate limits** | Implemented |
| **Audit Logs** | Who, what, when | **Append-only immutable audit_logs table** | Implemented |
| **Teammate Suggestions** | Skill + timezone scoring | **Formula scoring with explicit breakdown** | Implemented |
| **Test Suite** | At least 20 API tests in CI | **39 tests passed in the latest local run** | Verified |
| **Frontend UI** | Mobile-ready and accessible | **Hack4Hack lime/charcoal palette, responsive layouts, motion with reduced-motion support, keyboard shortcuts** | Implemented |
| **Admin tools** | Browse registered users | **Searchable, paginated directory (200 per page)** | Verified locally |
| **Deployment** | Free-tier live URL | [Live on Render](https://raceproof-app.onrender.com) | Live |

---

## Quickstart (One Command Setup)

Run the platform, demo dataset, and demo admin (PostgreSQL 16, Fastify API, React client) with Docker Compose:

```bash
docker compose up --build
```

- **Frontend Application:** [http://localhost](http://localhost) (or [http://localhost:5173](http://localhost:5173) in dev)
- **Backend API & Health:** [http://localhost:3000/health](http://localhost:3000/health)

---

## Deploy (Render Docker + Postgres)

The simplest hosted setup is one Docker service for the React client, Fastify API, and SSE endpoint, plus
Render-managed PostgreSQL:

```
Browser ──> Render (React + Fastify API + SSE, Docker) ──> Render Postgres
```

1. Push the submission branch to GitHub.
2. In Render, choose **New → Blueprint** (not **New Web Service**) and select `pukumars2003/Hach4Hack`
   on branch `master`. Render reads the root `render.yaml`, builds `server/Dockerfile`, and provisions
   `raceproof-app` and `raceproof-db`.
3. Wait for the first deployment. On an empty database, startup seeds 50,000 demo accounts and 10,000 teams; complete demo datasets are detected and not seeded again. Then open [raceproof-app.onrender.com](https://raceproof-app.onrender.com).
   The client and API share the same
   origin, so no client API URL or CORS configuration is needed. The server runs database migrations on
   startup and provisions the public demo admin `adminbro` / `DemoAdmin#2026`. Judges can also use the
   seeded participant accounts `user00001` through `user50000`, all with password `Demo@12345`.
   These credentials are intentionally public for judging and must not be reused for a private or
   production admin account.

If creating a service manually instead of using the Blueprint, choose **Docker** as the environment,
leave Root Directory empty, and set Dockerfile path to `server/Dockerfile`. You must also provide
`DATABASE_URL` and `JWT_SECRET`, and set the health check path to `/health`; the Blueprint wires these
up automatically.

The Vercel static-client setup remains optional. It requires a separate API origin and
`VITE_API_BASE_URL`; it is not needed for this single-container deployment. The local Docker Compose
setup also remains available with `docker compose up --build`.

---

## Concurrency & Resiliency Test Suite

### 1. Automated Last-Seat Race Test
The automated suite sends 50 concurrent join requests for one remaining seat:
```bash
npm run test:race
```
*Latest run: 1 request returned `200 OK`, 49 returned `409 Conflict`, and the database roster remained exactly 4/4. The browser lab also offers 25, 50, 100, and 250 racers.*

### 2. Full Invariants & API Suite (39 Tests)
```bash
npm test
```
The latest local run passed **39/39 tests** across authentication, admin access, team rules, requests, invite codes, audit logs, board-cache invalidation, and concurrency.

### 3. Chaos Test: Mid-Join Process Termination
The separate chaos test sends 50 concurrent joins, terminates the test server, and checks PostgreSQL
member-count and capacity invariants after the requests settle. Run it only against a disposable test database:
```bash
npm run test:chaos
```

### 4. High-Concurrency Load Test & HTML Dashboard
```bash
# Run official 100 VU load test with k6 (outputs docs/load-test-report.html):
k6 run scripts/load-test.js

# Or run with built-in zero-dependency Node benchmarker:
npm run load-test
```
*Measures p50, p90, p95, and p99 latency against the board endpoint. Both runners warm up the server first, then report steady-state percentiles against the organizer's **200 ms pass line** (our own 30 ms goal is reported separately, not as a gate). Add `-e VARY=true` to k6 for a cache-bypassing run, or start the server with `BOARD_CACHE_DISABLED=1` for a fully uncached one — see [docs/LOAD_TEST_REPORT.md](docs/LOAD_TEST_REPORT.md). Generates a visual, interactive HTML dashboard at [docs/load-test-report.html](docs/load-test-report.html).*

Fresh local proof runs are available in [docs/proof](docs/proof/README.md): 1, 100, and 250 VUs passed
the p95 target; 500 VUs measured 272.41 ms p95 with 1.60% errors and failed the target. Terminal captures,
HTML reports, and JSON metrics are included for every run.
The 500-VU run had connection refusals while k6 and the API shared the local host. RAM was not measured, so
resource limits are a likely explanation, not a confirmed diagnosis; a separate-server run is still needed.

---

## Architecture & Mathematical Concurrency Defense

```
[Concurrent Join Requests]
          │
          ▼
[API Gateway / Fastify Monolith]
          │
          ▼
[PostgreSQL 16 READ COMMITTED Transaction]
    1. Guarded UPDATE teams SET member_count = member_count + 1 
       WHERE id = $1 AND member_count < max_members;  <-- Serializes on team row
    2. INSERT INTO team_members ...                   <-- UNIQUE (hackathon_id, user_id)
    3. INSERT INTO audit_logs ...                     <-- Append-only audit trigger
    4. SELECT pg_notify('team_events', ...)           <-- Delivered ONLY on COMMIT!
```

### Read the Full Specifications:
- **[1-Page Design Document](docs/DESIGN_DOC.md)**
- **[Technical Architecture & Concurrency Spec](docs/ARCHITECTURE_AND_EXECUTION_PLAN.md)**

### Board Read Optimization Path
Even fully cached, the board endpoint dominates read traffic during a race. Three layers keep the hot path cheap:

1. **Keyset (cursor) pagination** — an index seek instead of an `OFFSET` scan, so page depth does not change cost. The default first page measured **0.95 ms** in the recorded 10,078-team `EXPLAIN ANALYZE` run.
2. **Single-flight DB coalescing** — concurrent identical queries share one PostgreSQL execution. In-flight work is keyed by the cache version, so a read that starts before a write cannot hand a later caller the pre-write board.
3. **In-process HTTP response cache** — validated board responses are pre-serialized and cached for 5 s, with stale-while-revalidate for up to 30 s. Writes invalidate immediately; versioned single-flight requests prevent a pre-write read from repopulating stale data. Only the board collection is cached. Join, accept, and team-detail reads go to PostgreSQL; board responses are `Cache-Control: no-store`. In the recorded 100-VU runs, the realistic mix measured **83–179 ms p95**; the uncached path measured **202–221 ms p95** with 20–40 connection pools on the tested host. See the [benchmark report](docs/LOAD_TEST_REPORT.md) for run-specific conditions and limitations.

---

## Keyboard-Only Navigation Shortcuts

| Key | Action |
| :---: | :--- |
| `J` | Open Join Team by Invite Code Modal |
| `C` | Create a New Team |
| `/` | Instant search bar focus |
| `L` | Toggle Interactive Concurrency Stress Lab |
| `Esc` | Close active dialog or clear selection |
| `?` | Open Keyboard Shortcuts Help Cheat-Sheet |

---

## Submission Deliverables & Documentation Index

- **Step-by-Step Execution Guide:** [STEP_BY_STEP_GUIDE.md](STEP_BY_STEP_GUIDE.md)
- **1-Page Design Document:** [docs/DESIGN_DOC.md](docs/DESIGN_DOC.md)
- **Technical Architecture Spec:** [docs/ARCHITECTURE_AND_EXECUTION_PLAN.md](docs/ARCHITECTURE_AND_EXECUTION_PLAN.md)
- **Technical Concurrency Spec:** [PS1 Team Formation Technical Design & Concurrency Spec.md](PS1%20Team%20Formation%20Technical%20Design%20%26%20Concurrency%20Spec.md)
- **Load Test Report & Analysis:** [docs/LOAD_TEST_REPORT.md](docs/LOAD_TEST_REPORT.md)
- **Fresh k6 Proof Runs:** [docs/proof/README.md](docs/proof/README.md)
- **5-Minute Walkthrough Script:** [docs/VIDEO_WALKTHROUGH_SCRIPT.md](docs/VIDEO_WALKTHROUGH_SCRIPT.md)
- **Visual HTML Benchmark Dashboard:** [docs/load-test-report.html](docs/load-test-report.html)
- **GitHub Actions CI Pipeline:** [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Deployment Manifests:** [render.yaml](render.yaml) & [docker-compose.yml](docker-compose.yml)

