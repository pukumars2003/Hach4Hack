# Race-Proof Team Formation Platform (PS1)

> **Hundreds of participants clicking "Join" at the exact same millisecond. Exactly one gets the last seat.**  
> Built for the **Hack4Hack Concurrency Championship 2026** at **5x required scale (50,000 Users, 10,000 Teams, 250+ Concurrent Racers)**.

[![CI](https://github.com/ajay/race-proof-team-formation/actions/workflows/ci.yml/badge.svg)](https://github.com/ajay/race-proof-team-formation/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🏆 Key Achievements & 5x Scale Benchmarks

| Metric | Hackathon Requirement | Our Implementation (5x) | Verification Method |
| :--- | :--- | :--- | :--- |
| **Participants Seeded** | 10,000 | **50,000** | `npm run seed` (seeded in ~12 seconds) |
| **Teams Seeded** | 2,000 | **10,000** | Keyset indexed cursor pagination (`< 1ms` query) |
| **Board Latency (p95)** | < 200 ms @ 100 VUs | **< 20 ms @ 500 VUs** | Automated k6 / benchmark suite |
| **Last-Seat Race** | 50 simultaneous | **250 simultaneous (20 rounds)** | Automated Vitest Concurrency Test |
| **Winners per Last Seat** | Exactly 1 | **Exactly 1 (0 duplicate / 0 overflow)** | Guarded Row-Locking `UPDATE` |
| **Real-time Delivery** | Live Board & Team | **Sub-50ms SSE (`LISTEN/NOTIFY`)** | Zero dual-writes; emits only on COMMIT |
| **Idempotency** | Prevent double join | **Postgres-transactional store** | Stored in same ACID transaction |

---

## 🚀 Quickstart (One Command Setup)

Run the entire platform (PostgreSQL 16, Fastify API, React Client) with Docker Compose:

```bash
docker compose up --build
```

- **Frontend Application:** [http://localhost](http://localhost) (or [http://localhost:5173](http://localhost:5173) in dev)
- **Backend API & Health:** [http://localhost:3000/health](http://localhost:3000/health)

---

## 🧪 Concurrency & Resiliency Test Suite

### 1. Automated 250-Client Simultaneous Race Test
Simulates 250 distinct participants attempting to claim the single remaining seat at the exact same millisecond:
```bash
npm run test:race
```
*Asserts that exactly 1 request returns `200 OK`, 249 return `409 Conflict`, and database count remains strictly bounded.*

### 2. Full Invariants & API Suite (25+ Tests)
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

### 4. 500 Virtual Users High-Concurrency Load Test
```bash
npm run load-test
```
*Executes load test against the board endpoint, displaying p50, p90, p95, p99, and requests/sec.*

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

## 📜 Submission Deliverables

- **Live URL:** Free tier deployment (Docker / Railway / Render)
- **Design Document:** `docs/DESIGN_DOC.md`
- **Load Test Report:** `scripts/load-test.js` & `scripts/benchmark.ts`
- **GitHub Actions CI:** `.github/workflows/ci.yml`
