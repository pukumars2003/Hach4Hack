# Race-Proof Team Formation Platform (PS1)

> **Hundreds of participants clicking "Join" at the exact same millisecond. Exactly one gets the last seat.**  
> Built for the **Hack4Hack Concurrency Championship 2026** at **5x required scale (50,000 Users, 10,000 Teams, 250+ Concurrent Racers)**.

[![CI](https://github.com/ajay/race-proof-team-formation/actions/workflows/ci.yml/badge.svg)](https://github.com/ajay/race-proof-team-formation/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 📖 **Quick Link:** For a complete walkthrough on how to run, test, and verify the platform, see the [Step-by-Step Execution Guide](file:///d:/Prj/Hach4Hack/STEP_BY_STEP_GUIDE.md).

---

## 📋 Hackathon Requirements Checklist & 5x Verification

| Requirement | Specification | Our Implementation | Status |
| :--- | :--- | :--- | :---: |
| **Participants Seeded** | 10,000 participants | **50,000 seed users (61,515 rows incl. test data)** | ✅ Complete |
| **Teams Seeded** | 2,000 teams | **10,000 seed teams (10,078 rows)** | ✅ Complete |
| **Board Latency (p95)** | < 200 ms @ 100 VUs | **Full seed (10,078 teams): 83–179 ms realistic mix · 88 ms warm · 202–221 ms cold with a 20–40 pool** | ✅ Pass at 100 VUs (500 VUs: not met locally) |
| **Last-Seat Race** | 50 simultaneous racers | **50 to 250 simultaneous racers** | ✅ Proven |
| **Winners per Last Seat** | Exactly 1 winner | **Exactly 1 winner (0 double-joins)** | ✅ Proven |
| **Rules Enforcement** | Min/max sizes, 1 team/user | **Postgres CHECK & UNIQUE constraints** | ✅ Proven |
| **Leadership Handover** | Successor elected on leave | **Senior member promoted, or team deleted** | ✅ Proven |
| **Idempotency** | Double-clicks/retries safe | **In-transaction idempotency keys table** | ✅ Proven |
| **Real-Time Updates** | Live board & team changes | **PostgreSQL LISTEN/NOTIFY + SSE** | ✅ Proven |
| **Security & Entropy** | Rate limits, secure codes | **Crockford Base32 + SHA-256 + Rate limits** | ✅ Proven |
| **Audit Logs** | Who, what, when | **Append-only immutable audit_logs table** | ✅ Proven |
| **Teammate Suggestions** | Skill + timezone scoring | **Formula scoring with explicit breakdown** | ✅ Proven |
| **Test Suite** | At least 20 API tests in CI | **33 tests passing in Vitest & GitHub Actions** | ✅ Proven |
| **Frontend UI** | Phone & keyboard-friendly | **React 18 + Tailwind (TeamForge UI)** | ✅ Proven |
| **Deployment** | Free-tier live URL | **render.yaml / Docker Compose** | ✅ Ready |
| **Bonus: Rollback UI** | Optimistic UI with rollback | **Instant toast rollback on 409 rejection** | ✅ Proven |
| **Bonus: Chaos Test** | Server kill mid-transaction | **`npm run test:chaos` (SIGKILL resilience)** | ✅ Proven |

---

## 🚀 Quickstart (One Command Setup)

Run the entire platform (PostgreSQL 16, Fastify API, React Client) with Docker Compose:

```bash
docker compose up --build
```

- **Frontend Application:** [http://localhost](http://localhost) (or [http://localhost:5173](http://localhost:5173) in dev)
- **Backend API & Health:** [http://localhost:3000/health](http://localhost:3000/health)

---

## ☁️ Deploy (Vercel client + Render API)

Vercel hosts static frontends and short-lived serverless functions. It **cannot** run the Fastify API, a
Dockerfile, or the PostgreSQL `LISTEN/NOTIFY` + SSE loop this app depends on. The supported split is:

```
Browser ──> Vercel (React/Vite static) ──> Render (Fastify API + SSE + Postgres, Docker)
```

1. **Push this repo to GitHub.**
2. **Render (API + Postgres):** New → Blueprint → pick the repo. It reads `render.yaml`, builds
   `server/Dockerfile`, provisions `raceproof-db`, and runs migrations on boot. Set `CORS_ORIGIN` to your
   Vercel domain (or `*` while testing). The service URL looks like `https://raceproof-api.onrender.com`.
3. **Vercel (client):** Import the same repo, set **Root Directory = `client`**, Framework **Vite**,
   Build `npm run build`, Output `dist`. Add environment variable
   `VITE_API_BASE_URL=https://raceproof-api.onrender.com` (no trailing slash, no `/api`).
   `client/vercel.json` already rewrites unknown routes to `index.html` for the SPA.
4. **Optional GitHub Actions deploy:** add repo secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID` and repo variable `VITE_API_BASE_URL`; `.github/workflows/deploy-vercel.yml` builds
   and deploys the client on every push. Render also auto-deploys the API from `render.yaml`.

The client sends `Authorization: Bearer` to the API origin and opens SSE at
`{VITE_API_BASE_URL}/api/realtime/stream`; both work cross-origin with `CORS_ORIGIN=*`. The API serves JSON
only in this split (the client is on Vercel), which is why `server/Dockerfile` builds the server alone.

> The monolith path (Fastify serving the built client) still works for local Docker Compose and for a
> single-service Render/VPS deploy; the split above is only needed when the client is on Vercel.

---

## 🧪 Concurrency & Resiliency Test Suite

### 1. Automated 250-Client Simultaneous Race Test
Simulates 250 distinct participants attempting to claim the single remaining seat at the exact same millisecond:
```bash
npm run test:race
```
*Asserts that exactly 1 request returns `200 OK`, 249 return `409 Conflict`, and database count remains strictly bounded.*

### 2. Full Invariants & API Suite (33 Tests)
```bash
npm test
```
Tests team lifecycle, leadership inheritance upon leader departure, cascading deletion of orphaned records, Crockford Base32 invite code entropy, tamper-proof audit logs, and keyset pagination.

### 3. Chaos Engineering: Mid-Join SIGKILL Test
Starts 50 concurrent transactions and abruptly sends `SIGKILL` to the server process mid-flight:
```bash
npm run test:chaos
```
*Validates that zero partial state or over-capacity corruption occurred.*

### 4. High-Concurrency Load Test & HTML Dashboard
```bash
# Run official 100 VU load test with k6 (outputs docs/load-test-report.html):
k6 run scripts/load-test.js

# Or run with built-in zero-dependency Node benchmarker:
npm run load-test
```
*Measures p50, p90, p95, and p99 latency against the board endpoint. Both runners warm up the server first, then report steady-state percentiles against the organizer's **200 ms pass line** (our own 30 ms goal is reported separately, not as a gate). Add `-e VARY=true` to k6 for a cache-bypassing run, or start the server with `BOARD_CACHE_DISABLED=1` for a fully uncached one — see [docs/LOAD_TEST_REPORT.md](docs/LOAD_TEST_REPORT.md). Generates a visual, interactive HTML dashboard at [docs/load-test-report.html](docs/load-test-report.html).*

---

## 📐 Architecture & Mathematical Concurrency Defense

```
[250 Concurrent Users]
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

1. **Keyset (cursor) pagination** — an index seek instead of an `OFFSET` scan, so page depth does not change cost. The default first page is **0.95 ms** at 10,078 teams (`EXPLAIN ANALYZE`).
2. **Single-flight DB coalescing** — concurrent identical queries share one PostgreSQL execution. In-flight work is keyed by the cache version, so a read that starts before a write cannot hand a later caller the pre-write board.
3. **In-process HTTP response cache** — validated board responses are pre-serialized into a reusable `Buffer` and served directly from the Node HTTP layer for 5 s, then served stale for up to 30 s while one background refresh repopulates the entry. Writes invalidate immediately (an earlier 500 ms coalescing window could drop an invalidation and serve a pre-write board for the rest of the TTL — fixed, with a regression test). The SSE/LISTEN handler invalidates **before** broadcasting, so a refetch triggered by a live event cannot be served the pre-change copy. Board reads are the only thing cached: join, accept and team-detail reads always go to PostgreSQL, and responses are `Cache-Control: no-store` so a browser cannot hold a pre-join copy. Measured with the cache disabled, the same endpoint is **202–221 ms p95** at 100 VUs with a 20–40 connection pool; the realistic mix is **83–179 ms p95** at 10,078 teams on this host. The default first page is under 1 ms; the `search` filter is a 57 ms sequential scan at this size and is the next thing to index.

---

## ⌨️ Keyboard-Only Navigation Shortcuts

| Key | Action |
| :---: | :--- |
| `J` | Open Join Team by Invite Code Modal |
| `C` | Create a New Team |
| `/` | Instant search bar focus |
| `L` | Toggle Interactive Concurrency Stress Lab |
| `Esc` | Close active dialog or clear selection |
| `?` | Open Keyboard Shortcuts Help Cheat-Sheet |

---

## 📜 Submission Deliverables & Documentation Index

- **Step-by-Step Execution Guide:** [STEP_BY_STEP_GUIDE.md](STEP_BY_STEP_GUIDE.md)
- **1-Page Design Document:** [docs/DESIGN_DOC.md](docs/DESIGN_DOC.md)
- **Technical Architecture Spec:** [docs/ARCHITECTURE_AND_EXECUTION_PLAN.md](docs/ARCHITECTURE_AND_EXECUTION_PLAN.md)
- **Load Test Report & Analysis:** [docs/LOAD_TEST_REPORT.md](docs/LOAD_TEST_REPORT.md)
- **Visual HTML Benchmark Dashboard:** [docs/load-test-report.html](docs/load-test-report.html)
- **GitHub Actions CI Pipeline:** [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Deployment Manifests:** [render.yaml](render.yaml) & [docker-compose.yml](docker-compose.yml)

