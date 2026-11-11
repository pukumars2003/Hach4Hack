# 5-Minute Video Walkthrough Script

**Topic:** PS1 · Race-Proof Team Formation at Scale  
**Presenter:** Ajay (@Ajay)  
**Total Duration:** 4 minutes 45 seconds (strictly under the 5-minute limit)

---

### [0:00 - 0:45] Introduction & The Concurrency Problem

**Visual:** Camera on you + Screen showing `docs/DESIGN_DOC.md` and the architecture diagram.

> "Hi everyone, I'm Ajay. Today I'm presenting our production-grade, race-proof team formation service for 10,000 to 50,000 hackathon participants.
> 
> The central challenge is simple: **50 people click 'join' for the last remaining seat at the exact same millisecond. Exactly one person must get it, and 49 must be cleanly rejected.**
> 
> Naive ORM implementations fail because between checking if the team has 3 members and inserting the 4th, 49 other requests pass the check, resulting in a 4-person team having 52 members.
> 
> We solved this not with fragile application locks, but at the database engine level using a guarded atomic UPDATE under PostgreSQL `READ COMMITTED` transactions, coupled with dual database-level unique constraints. Let's see it live."

---

### [0:45 - 2:00] The Showstopper: Live Concurrency Stress Lab Demo

**Visual:** Switch to the running React UI, navigate to the **"Concurrency Lab"** tab (`Press L`).

> "To make this instantly testable by the judges without needing a terminal, we built the **Concurrency Stress Lab** directly into our frontend.
> 
> Here, I can select 50 simultaneous racers. When I click **'Fire Simultaneous Race'**, the browser spawns 50 separate users with distinct JWT tokens and fires 50 concurrent HTTP requests at the exact same millisecond using `Promise.all` targeting Team Seat #4.
> 
> *[Click button 'Fire Simultaneous Race']*
> 
> Look at the real-time waterfall:
> - **Exactly 1 green tile: HTTP 200 OK.** Racer #1 claimed the last seat in 4 milliseconds.
> - **Exactly 49 amber tiles: HTTP 409 Conflict.** Every other request received an immediate, clean conflict response.
> - And look at the PostgreSQL verification box: the database count is strictly **4 out of 4**.
> - Zero over-capacity, zero duplicate memberships.
> 
> We also backed this up with an automated test in Vitest that runs in GitHub Actions CI, repeating this exact race for 20 consecutive rounds with 100% repeatability."

---

### [2:00 - 3:00] Teammate Suggestions & Explainability Engine

**Visual:** Open a team page and click on the **"Find Teammates (AI Rank)"** tab.

> "The second requirement was a teammate suggestion endpoint that ranks unassigned hackers by complementary skills and time zones, with the scoring clearly explained.
> 
> Our scoring engine uses the exact weighted formula:
> **Score = 100 × (0.6 × Skill Complement + 0.3 × Timezone Proximity + 0.1 × Interest Overlap)**
> 
> Notice how every single candidate card provides full explainability:
> - For Skill Synergy, it doesn't just give a percentage; it states: *'Covers 2 wanted skills: PostgreSQL and Docker; brings new expertise in Rust which the team lacks.'*
> - For Timezone, it calculates the wrapped UTC offset difference and says: *'1 hour difference from team median (enables 7+ hours of overlapping collaboration).'*
> - And for Shared Interests, it calculates the Jaccard similarity across project interests.
> 
> Leaders can review recommendations and send invites with one click."

---

### [3:00 - 3:45] Real-Time Synchronization & Security

**Visual:** Split screen with two browser windows side by side.

> "For real-time synchronization, we avoided the dual-write problem by using PostgreSQL `LISTEN/NOTIFY` over Server-Sent Events. Because `pg_notify` fires strictly upon transaction COMMIT, clients never receive an event for a rolled-back transaction.
> 
> Watch: when I redeem an invite code in Window A, Window B updates instantly without refreshing.
> 
> Security controls:
> 1. **Invite Codes**: 60-bit Crockford Base32 (`ABCD-EFGH-JKMN`) with 10^15 entropy. Only the SHA-256 hash is stored, and codes have strict expiration timestamps checked against `clock_timestamp()`.
> 2. **Transactional Idempotency**: Double-clicks send an `Idempotency-Key` stored in the same database transaction, ensuring flaky connections never produce duplicate memberships.
> 3. **Tamper-Proof Audit Log**: An append-only table guarded by a PostgreSQL trigger that forbids any `UPDATE` or `DELETE`."

---

### [3:45 - 4:30] 5x Scale & Load Test Benchmarks

**Visual:** Show the terminal running the benchmark and open `docs/LOAD_TEST_REPORT.md`.

> "The organizer requirement was p95 under 200 ms with 100 concurrent users on a seeded dataset of 10,000 users.
> 
> We demonstrated **5x scale**:
> - We seeded **50,000 users and 10,000 teams** in 12 seconds using PostgreSQL bulk `UNNEST`.
> - We ran a load test at **500 concurrent virtual users**.
> - Our **p95 latency was 14.2 ms**—more than **14 times faster** than the 200 ms threshold.
> 
> We achieved this using Keyset Cursor pagination `(created_at, id) < ($t, $id)` which scans in 0.4 ms regardless of table depth, plus a 1-second in-memory single-flight coalescer that turns bursts of concurrent queries into a single database execution."

---

### [4:30 - 4:45] Conclusion & One-Command Setup

**Visual:** Camera back on you + terminal showing `docker compose up --build`.

> "The entire stack is packaged into a single `docker-compose.yml` for one-command local setup, and fully tested in GitHub Actions CI with over 25 integration, race, and chaos tests.
> 
> Thank you for reviewing our submission. All documentation, tests, and code are open in the GitHub repository!"

