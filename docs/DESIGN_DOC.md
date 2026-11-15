# 1-Page Design Document: Race-Proof Team Formation at Scale

**Author:** Ajay (@Ajay) & Antigravity Engineering  
**Submission Target:** PS1 · Race-Proof Team Formation Platform

---

### 1. Data Model & Integrity Constraints

The data model is engineered so that correctness is guaranteed at the database engine level, independent of application logic.

- **`teams`**: Stores `id`, `hackathon_id`, `name`, `needed_skills`, `leader_id`, `member_count`, `max_members`. Guarded by:
  - `CHECK (member_count >= 0 AND member_count <= max_members)`
  - `UNIQUE (hackathon_id, name)`
- **`team_members`**: The primary invariant enforcer.
  - `UNIQUE (hackathon_id, user_id)`: Guarantees that no user can belong to two teams in the same hackathon, even across concurrent requests.
- **`join_requests`**: Filtered partial index `UNIQUE (team_id, user_id) WHERE status = 'pending'` prevents duplicate pending requests.
- **`invite_codes`**: 60-bit Crockford Base32 (`ABCD-EFGH-JKMN`). Only `SHA-256(code)` is stored with `expires_at` evaluated against database `clock_timestamp()`.
- **`audit_logs`**: Append-only log with a PostgreSQL trigger `BEFORE UPDATE OR DELETE` raising an exception. Deliberately has no foreign key to `teams` so history survives team deletion.
- **`idempotency_keys`**: Primary key `(user_id, key, endpoint)` written in the **same transaction** as state mutations.

---

### 2. How Races Are Prevented (The Mathematical Proof)

The automated concurrency test sends 50 simultaneous requests for the last seat. The browser race lab also supports larger runs up to 250 racers:

```sql
UPDATE teams 
SET member_count = member_count + 1, updated_at = clock_timestamp()
WHERE id = $1 AND member_count < max_members
RETURNING member_count;
```

1. **Row Serialization**: In PostgreSQL `READ COMMITTED`, the first transaction to reach the team row acquires an exclusive row-level lock. Other requests for that team wait on the row.
2. **Post-Commit Statement Re-Evaluation**: When Transaction 1 commits, PostgreSQL releases the lock. Waiters sequentially re-evaluate the query’s `WHERE` clause against the **newly committed state**.
3. **Guaranteed Rejection**: Since Transaction 1 incremented `member_count` to 4, the predicate `member_count < 4` evaluates to `FALSE` for all subsequent transactions. The query matches **0 rows**, throwing `409 team_full`.
4. **Cross-Team Join Race Defense**: If a user attempts to join Team A and Team B simultaneously, two transactions run in parallel. The second to insert into `team_members` violates `UNIQUE (hackathon_id, user_id)` and triggers an automatic rollback, which **reverts the loser team's member count increment**.

---

### 3. Trade-Offs Defended

| Decision | Alternative Considered | Why Chosen |
| :--- | :--- | :--- |
| **Guarded `UPDATE`** | `SELECT ... FOR UPDATE` | Saves a full database round-trip while obtaining the identical row lock until COMMIT. |
| **PostgreSQL-Transactional Idempotency** | Redis Distributed Lock | Redis locks create a split-brain vulnerability: a server crash between Redis release and DB commit allows duplicate retries. In-Postgres storage guarantees atomic consistency. |
| **SSE via `LISTEN/NOTIFY`** | WebSockets / Outbox table | Eliminates dual-write bugs. Postgres delivers `NOTIFY` **only upon transaction COMMIT**. SSE reconnects natively and passes through free-tier HTTP/2 proxies. |
| **Keyset Cursor Pagination** | `OFFSET / LIMIT` | At 10,000 teams, `OFFSET 9500` scans 9,520 rows. Keyset pagination `(created_at, id) < ($t, $id)` uses an index scan in **0.95 ms** at the full 10,078-team seed (`EXPLAIN ANALYZE`, 89 buffers). |
| **Single-Flight Coalescing Cache** | Redis Caching Cluster | In-memory 1-second single-flight deduplication handles thundering herds without external network hops. Only the read-only board collection is cached (5 s fresh + 30 s stale-while-revalidate); join, accept and team-detail reads always hit PostgreSQL, and board responses are `Cache-Control: no-store` so browsers cannot hold a pre-join copy. Every write invalidates immediately and bumps a version; in-flight queries are keyed by `query@version`, so a read that starts before a write cannot join the pre-write query and cannot repopulate the cache afterwards. Worst-case staleness is ~0 ms for every client, not just SSE subscribers (whose invalidation still runs before the event is broadcast). The 5 s TTL only bounds staleness on a board with no writes at all. |

---

### 4. What We Would Do With One More Week

1. **Read-Replica Horizontal Scaling**: Introduce transaction-mode connection poolers (PgBouncer) for queries, routing writes to primary and reads to replicas with an out-of-band SSE listener sidecar.
2. **Per-team admission queue**: Evaluate this if higher-concurrency load tests show database connections queuing on one team's row. PostgreSQL remains the authority for capacity.
3. **Trigram index for board search**: `search` uses a leading-wildcard `ILIKE` and is a 57 ms sequential scan at 10,078 teams (the default keyset page is 0.95 ms). A `pg_trgm` GIN index on `name`/`description` would make it an index scan.
4. **Vector Similarity Matching (`pgvector`)**: Replace heuristic Jaccard scoring with dense embeddings for candidate bios and project briefs to discover non-obvious skill alignments.
5. **Consensus Team Expansion Protocol**: A multi-member in-app voting mechanism allowing teams to collectively vote to expand capacity beyond standard thresholds.
6. **Passkey (WebAuthn) Passwordless Authentication**: FIDO2 hardware-backed authentication replacing passwords for zero-trust login.

