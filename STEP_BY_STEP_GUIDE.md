# Step-by-Step Execution & Testing Guide

> **Project:** Hack4Hack — Race-Proof Team Formation Platform (PS1)
> **Target Scale:** 50,000 demo participants and 10,000 teams; the browser race lab supports up to 250 racers.
> **Architecture:** Fastify (Node.js/TypeScript) + PostgreSQL 16 (Row-Level Locks) + React 18 (Tailwind CSS)  

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Environment Configuration](#2-environment-configuration)
3. [Database Setup & Seeding](#3-database-setup--seeding)
4. [Starting the Application](#4-starting-the-application)
5. [Verifying User Authentication & Login State](#5-verifying-user-authentication--login-state)
6. [Testing the Race-Proof Concurrency (CLI & Live UI)](#6-testing-the-race-proof-concurrency-cli--live-ui)
7. [Running the Load Test Benchmark (100 Concurrent Users)](#7-running-the-load-test-benchmark-100-concurrent-users)
8. [Running the Full Test Suite (39 Passing Tests)](#8-running-the-full-test-suite-39-passing-tests)
9. [Running the Chaos / SIGKILL Resilience Test](#9-running-the-chaos--sigkill-resilience-test)
10. [Walkthrough of Core Features in the Web UI](#10-walkthrough-of-core-features-in-the-web-ui)
11. [Running with Docker Compose](#11-running-with-docker-compose)
12. [Troubleshooting & FAQ](#12-troubleshooting--faq)

---

## 1. Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: `v20.x` or higher (`node -v`)
- **npm**: `v10.x` or higher (`npm -v`)
- **PostgreSQL**: `v16.x` (running on `localhost:5432`) or **Docker Desktop**

---

## 2. Environment Configuration

The repository contains pre-configured environment files for quick execution:
- Root `.env`:
  ```env
  DATABASE_URL=postgres://postgres:postgres@localhost:5432/team_formation
  PORT=3000
  NODE_ENV=development
  JWT_SECRET=super-secret-jwt-key-for-development-32chars
  CLIENT_URL=http://localhost:5173
  ```
- `server/.env`: Matches the root `.env`.

> *If your PostgreSQL password is not `postgres`, update `DATABASE_URL` in both `.env` and `server/.env` accordingly.*

---

## 3. Database Setup & Seeding

### Step 3.1: Run Database Migrations
Create the tables, indexes, and triggers:
```powershell
npm run db:migrate
```
*Creates `users`, `hackathons`, `teams`, `team_members`, `invite_codes`, `join_requests`, `audit_logs`, and `idempotency_keys`.*

### Step 3.2: Seed 50,000 Users and 10,000 Teams
Populate the database with the official hackathon dataset:
```powershell
npm run seed
```
**Verification:**
The script seeds:
- **50,000 Users** across global timezones with varied skills (React, Node, Postgres, Rust, UI/UX, Python)
- **10,000 Teams** with statuses: `forming`, `ready`, and `full`
- **Demo Accounts:** `user00001@demo.test` through `user50000@demo.test` with password `Demo@12345`

---

## 4. Starting the Application

Start the API and React development server together from the repository root:

```powershell
npm run dev
```

Open **`http://localhost:5173`** for the UI. The API and health endpoint run at **`http://localhost:3000`** and **`http://localhost:3000/health`**.

---

## 5. Verifying User Authentication & Login State

### A. When You Are Logged Out (Guest Mode)
- **Top Navbar:** Displays the lime-accented **Sign in** action.
- **Main Board:** Displays a charcoal banner:
  > **Browsing as Guest** `[50k Participants Ready]`
  > Sign in with demo credentials (`user00001` or `user00001@demo.test` / `Demo@12345`) to create teams, accept requests, or take the last seat.
  > `[Sign in to participate]`
- Clicking any action (e.g. *Create Team*, *Enter Code*, *Request to Join*) opens the Sign In modal automatically.

### B. Logging In
1. Click **Sign in** in the top-right corner.
2. Enter any seeded account from `user00001` through `user50000` (or its `@demo.test` email address).
3. Use password **`Demo@12345`**, then click **Sign in**.
4. To open the admin dashboard, sign in as **`adminbro`** with the public judging password **`DemoAdmin#2026`**.

### C. When You Are Logged In
- **Top Navbar:**
  - Round avatar with initials: `[DU]`
  - Full Name: **Demo User 00001**
  - Email: **user00001@demo.test**
  - Dedicated **"Sign out"** button.
- **Navigation Tabs:**
  - **Board:** View and filter teams.
  - **My team:** Directly opens your active team workspace (view members, invite codes, join requests, activity audit trail).
  - **Suggestions:** Heuristic teammate recommendations with compatibility score breakdown.
  - **Race test:** Live interactive concurrency test.

The admin dashboard includes a searchable user directory. It displays 200 rows per page and reports the total number of registered users; use search and pagination to browse the full dataset without loading tens of thousands of rows at once.

---

## 6. Testing the Race-Proof Concurrency (CLI & Live UI)

The core requirement: **50 people click the last seat at the same instant; exactly 1 person gets it, 49 get rejected with 409 Conflict, and the team size never exceeds the maximum.**

### Method 1: The Interactive Web UI ("Race test" tab)
1. In your browser at `http://localhost:5173`, click the **"Race test"** tab in the top navigation bar.
2. Select **50 racers** (the lab also offers 25, 100, and 250).
3. Click **"Execute Live Race Test"**.
4. **What happens in real time:**
   - The browser dispatches **50 simultaneous HTTP POST requests** in parallel (`Promise.allSettled`) to `/api/teams/join-by-code`.
   - You can open browser DevTools (**F12 -> Network**) to watch 50 parallel requests hit the server.
   - The dashboard updates in real time:
     - **HTTP 200 OK (Winner):** Exactly 1 user claims the seat.
     - **HTTP 409 Conflict (Rejections):** Exactly 49 users receive `team_full`.
     - **HTTP 5xx Server Errors:** 0.
   - The UI automatically queries the database and displays the final verified roster: **4/4 members** (strictly within limits).

### Method 2: Automated Concurrency Test via CLI
In your terminal, execute:
```powershell
npm run test:race
```
**Expected Output:**
```text
[Race Test] Firing 50 simultaneous join requests for the last seat...
[Race Test] All 50 requests completed in <duration>ms.
[Race Test Result] 200 OK: 1, 409 Conflict: 49, 503 Retry: 0, retried requests: 0, 5xx Errors: 0
Passed: 50 distinct participants race for 1 seat -> Exactly 1 winner, 49 conflicts, zero over-capacity
```
If the connection pool briefly returns `503`, the test retries those requests with their original
idempotency keys. The final state must still be one success, 49 conflicts, and a 4/4 roster.

### Why It Is Guaranteed Race-Proof:
We use an atomic predicate update in PostgreSQL `READ COMMITTED`:
```sql
UPDATE teams 
SET member_count = member_count + 1 
WHERE id = $1 AND member_count < max_members
RETURNING id, member_count, max_members;
```
When 50 transactions arrive at once, PostgreSQL queues them on the row lock. As the first transaction commits (`member_count = 4`), the remaining 49 transactions re-evaluate the `WHERE member_count < max_members` clause. Because `member_count` is now `4`, the predicate is **false**, 0 rows are updated, and the server cleanly returns `409 Conflict` without any race condition.

---

## 7. Running the Load Test Benchmark (100 Concurrent Users)

Start the application in one terminal with `npm run dev`, then run the k6 scenario from the repository root:

```powershell
k6 run -e VUS=100 -e DURATION=15s -e MIX=true scripts/load-test.js
```

The recorded full-seed runs (10,078 teams) measured **83–179 ms p95** for the realistic traffic mix and
**88.21 ms p95** for the warm-cache run at 100 VUs. These are historical results from the host documented
in [docs/LOAD_TEST_REPORT.md](docs/LOAD_TEST_REPORT.md), not a fresh benchmark. That report also records
cold-cache runs above 200 ms for some pool settings and the 500-VU result; do not describe those as passes.

Fresh local runs on 2026-11-15 are captured in [docs/proof](docs/proof/README.md): 1 VU measured 8.92 ms
p95, 100 VUs 95.68 ms, and 250 VUs 183.35 ms. The 500-VU run measured 272.41 ms p95 with 1.60% errors,
so it failed the p95 and error-rate thresholds. Each run lasted 15 seconds with `WARMUP=0`; the dataset
row count was not separately measured for these runs. Because the historical runs used a 1,000-request
warm-up and a measured full-seed database, compare them only after accounting for the warm-up, dataset,
cache-hit ratio, and host conditions; the [proof notes](docs/proof/README.md) explain the details.

The built-in Node benchmark is available with:

```powershell
npm run load-test
```

---

## 8. Running the Full Test Suite (39 Passing Tests)

Run the comprehensive Vitest integration and concurrency test suite:
```powershell
npm test
```

The latest local run passed **48 tests across 6 test files**. Coverage includes authentication, admin access,
team and request rules, invite-code rate limits, audit behavior, idempotency retries, board-cache invalidation,
and concurrency.

---

## 9. Running GitHub Actions and Downloading the k6 Proof

The workflow runs automatically for pushes and pull requests targeting `main` or `master`. To run it manually,
open **Actions → CI - Concurrency & Invariants Suite → Run workflow** on GitHub. Wait for the `test` and
`board-load-test` jobs to finish, then download the `k6-board-100vu-*` artifact from the run summary. It
contains terminal output, the HTML dashboard, raw JSON metrics, and the API log. Current local changes do not
have a hosted Actions result until pushed or manually dispatched.

---

## 10. Running the Chaos / SIGKILL Resilience Test

To prove that the database remains 100% consistent even during sudden server termination mid-transaction:
```powershell
npm run test:chaos
```
This separate test is excluded from `npm test`. It launches concurrent joins, kills the test server process
mid-join, then checks the database state after recovery. Run it only against a disposable test database.

**What it checks:**
1. Spawns high-concurrency join transactions.
2. Sends an ungraceful `SIGKILL` (kill -9) to the backend process mid-flight.
3. Restarts the server.
4. Queries PostgreSQL to confirm:
   - Zero corrupted rows.
   - `member_count` in `teams` exactly equals `COUNT(*)` in `team_members`.
   - Zero phantom memberships.

---

## 10. Walkthrough of Core Features in the Web UI

| Feature | How to Test in the Browser |
| :--- | :--- |
| **Instant Search & Filter** | Press `/` on your keyboard to focus the search bar. Type "Alpha" or filter by status (`Forming`, `Ready`, `Full`) or skill pill (`React`, `PostgreSQL`). |
| **Real-Time Live Updates (SSE)** | Open two browser windows side by side. In Window A, create a team or join a team. Watch Window B update automatically in real time without refreshing! |
| **Create a Team** | Click **Create team** (or press `C`). Enter a team name, description, and required skills. |
| **Invite Codes** | In **My team**, copy the active invitation code; leaders can choose **Revoke & renew**. Codes expire after 24 hours. |
| **Join by Code** | Click **Enter code** in the navbar (or press `J`). Paste the code to join instantly. |
| **Request to Join** | On any team card, click **Request to join**. Enter a pitch message. The leader sees the pending request under their **My team** workspace and can Accept or Decline. |
| **Leader Handover** | In a multi-member team, have the Leader click **Leave team**. The system automatically promotes the longest-standing member to Leader. |
| **Automatic Team Deletion** | When the final remaining member leaves a team, the team is automatically deleted, and an audit entry is recorded. |
| **Teammate Suggestions** | Click **Suggestions**. A heuristic ranks discoverable, unassigned candidates using skill fit, timezone, and interest signals, with a score breakdown. |

---

## 11. Running with Docker Compose

To test the entire system in an isolated container environment with a single command:
```powershell
docker compose up --build
```
- PostgreSQL 16 runs on port `5432`.
- The API runs on port `3000`; the web UI is at `http://localhost`.
- To shut down, run `docker compose down`. Add `-v` only when you intentionally want to delete the local database volume and its data.

---

## 12. Troubleshooting & FAQ

#### Q: The browser shows "Failed to fetch" or 500 on start.
- Ensure PostgreSQL is running on `localhost:5432`.
- Run `npm run db:migrate` to ensure the tables are up to date.

#### Q: What are the demo credentials?
- **Username or email:** `user00001` through `user50000` (or corresponding `@demo.test` email)
- **Password:** `Demo@12345`

#### Q: How do I know the race test is not using dummy data?
- Open DevTools (`F12`), switch to the **Network** tab, and run the test in the **Race test** tab. You will see 50 distinct HTTP requests with real response payloads and timestamps.
- Run `npm run test:race` in your terminal to see the raw test assertion logs.

---

**Built with pride for the Hack4Hack Concurrency Championship 2026.**

