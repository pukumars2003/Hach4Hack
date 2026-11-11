# PS1 Team Formation: Technical Design & Concurrency Spec

Nov 11, 2026 · @Ajay

## 1. Goal and success criteria

We are building a team-formation service where 50 or 250 people racing for one seat produce exactly one winner, and we can prove it with a repeatable test. Judges rank correctness under concurrency first, then design defense, then code, tests and UX, so every decision below serves the first.

| Area | Organizer requirement | Our 5x target |
| --- | --- | --- |
| Participants seeded | 10,000 | 50,000 |
| Teams seeded | 2,000 | 10,000 |
| Board load, p95 under 200 ms | 100 concurrent users | 500 concurrent users |
| Last-seat race | 50 simultaneous | 250 simultaneous, 20 repeated rounds |
| Winners per last seat | exactly 1 | exactly 1 |
| Duplicate memberships / over-capacity teams | 0 | 0 |
| API tests | 20+ | 50+, all against real Postgres in CI |

Every number in the right-hand column is a target. Results go into the report only after we run them, with machine specs, and the same rule applies to the video and the design doc.

## 2. Final architecture decisions

Postgres decides who gets a seat; nothing else is allowed to. Redis, caches and the browser are never in the correctness path. The system is one Fastify process (a modular monolith) in front of one Postgres 16.

| Decision | Choice | Why |
| --- | --- | --- |
| Backend | Fastify + TypeScript, modular monolith | Schema validation built in, low overhead, one deployable unit |
| Database access | `pg` with hand-written SQL for every membership transaction | The exact lock and statement order is the product; an ORM hides it |
| Source of truth | PostgreSQL 16, READ COMMITTED, row locks plus constraints | Row lock serializes one team; constraints are the second line of defense |
| Real-time | SSE fed by Postgres `LISTEN/NOTIFY` | `NOTIFY` fires only on commit, so there is no dual-write problem and no outbox table |
| Idempotency store | Postgres table, written in the same transaction as the change | A crash cannot leave a key without its effect, or an effect without its key |
| Board speed | Keyset pagination, partial index, 1 s single-flight in-process cache | Meets 200 ms without Redis |
| Auth | Email + password (argon2id), JWT bearer token | Seed users share one precomputed hash so seeding 50,000 users stays fast |
| Rate limiting | `@fastify/rate-limit`, in-memory per instance | Enough for one instance; Postgres or Redis counter if we add replicas |
| Frontend | React + Vite + TypeScript + TanStack Query + Tailwind | Optimistic updates with rollback come from TanStack Query mutations |
| Packaging | Docker Compose: `db`, `api`, `web` | `docker compose up --build` is the whole setup |

Two constraints to keep in mind. `LISTEN` does not work through a transaction-mode pooler (PgBouncer, Supabase pooler), so the API uses a direct connection for its listener. And `NOTIFY` payloads are capped at 8,000 bytes, so events carry ids only and clients refetch.

## 4. Business rules and how each is enforced

Each rule has an application check for a friendly error and a database mechanism that holds even if the application is wrong.

| Rule | Application behavior | Database guarantee |
| --- | --- | --- |
| Max team size | Join returns 409 `team_full` | `UPDATE ... WHERE member_count < max_members` and `CHECK (member_count BETWEEN 0 AND max_members)` |
| Min team size | A team below the minimum is shown as "forming", at or above as "ready". It is derived, never stored | None needed; see the decision below |
| One team per person per hackathon | 409 `already_on_team` | `UNIQUE (hackathon_id, user_id)` on `team_members` |
| Invite codes expire | Unknown, expired and revoked codes all return the same 404 `invalid_code` | `expires_at` compared with the database `now()`, never the app clock |
| Leader leaves | Longest-standing member becomes leader (`joined_at`, then `user_id`) | Deferrable foreign key `(team_id, leader_id)` to `team_members`, checked at commit |
| Last member leaves | Team is deleted with its codes and requests | `ON DELETE CASCADE`; audit rows survive because they hold no foreign key to the team |
| Only the leader accepts, declines, removes, invites | 403 `not_leader` | Checked under the team row lock, so a leader who was just replaced cannot act |
| Joining cancels the person's other pending requests | Automatic | Same transaction as the join |

**Decision to confirm with organizers: minimum size.** A hard floor cannot work, because the last member leaving must delete the team and teams of one must exist while forming. We therefore treat the minimum as a readiness threshold shown on the board and team page. If the organizers mean something stricter (for example, teams cannot submit below the minimum), we add a `locked` state that requires `member_count >= min_team_size`. This is a one-column change and does not touch the concurrency design.

**Invite codes** are 12 characters of Crockford Base32 (60 bits of entropy), shown as `ABCD-EFGH-JKMN`. They are multi-use until they expire or the leader revokes them, and each use still needs a free seat. Only the SHA-256 of the code is stored, so a database leak does not leak working codes. The raw code is returned once, at creation.

## 5. Concurrency protocol

The whole design rests on one rule: every operation that changes who is on a team takes that team's row lock first and holds it until COMMIT. Two requests for the same team can never interleave, while requests for different teams never wait on each other.

**Why 250 simultaneous joins yield exactly one winner.** The first transaction's `UPDATE teams SET member_count = member_count + 1 WHERE id = $1 AND member_count < max_members` locks the row. The other 249 block on that row. When the first commits, Postgres re-evaluates the `WHERE` clause for each waiter against the new committed row (this is how READ COMMITTED behaves for UPDATE). The count is now at the maximum, so they match zero rows and get 409 `team_full`. The lock is held until commit in this approach and in a plain `SELECT ... FOR UPDATE`; the guarded UPDATE is chosen for fewer round trips and simpler code, not for a shorter lock.

**Lock order, always:** team row, then join-request or invite row, then member rows. No operation locks two teams, so team-to-team deadlocks cannot occur. A user racing to join teams A and B holds one team lock each; the loser of the `UNIQUE (hackathon_id, user_id)` check rolls back, which also undoes its count increment. Deadlock errors (`40P01`) are still retried up to 3 times with jitter as a safety net.

**Discover, lock, re-check.** Operations that start from a user (leave) first read which team the user is on without locking, then lock that team, then re-verify membership under the lock, because it may have changed in between.

**Time limits.** Each transaction sets `lock_timeout = 3s` and `statement_timeout = 5s`; a timeout returns 503 with `Retry-After`, never a half-applied change.

All steps of one operation run in a single transaction, ending with the audit row, the idempotency record and `pg_notify`.

| Operation | Steps inside the transaction | Failure and result |
| --- | --- | --- |
| Create team | Insert team with `member_count = 1`; insert leader membership; cancel the user's pending requests; audit | Already on a team: 409 `already_on_team`. Duplicate name: 409 `name_taken` |
| Redeem invite code | Look up code by hash and `expires_at > now()`; guarded UPDATE on the team; insert membership; cancel user's pending requests; audit | Bad, expired or revoked code: 404 `invalid_code`. Zero rows from the UPDATE: 409 `team_full`. Unique violation: 409 `already_on_team` and the count increment rolls back |
| Request to join | Insert pending request; no seat is reserved | Already on a team: 409. Duplicate pending request: 409 `request_exists`. Team already full: 409 `team_full` |
| Accept request | Lock team; verify actor is leader; lock request, must be pending; capacity check; insert membership; count + 1; mark request accepted; cancel the requester's other pending requests; audit | Not leader: 403. Request not pending: 409 `request_not_pending`. Full: 409 `team_full` and the request stays pending. Requester joined elsewhere: request becomes cancelled, 409 `already_on_team` |
| Decline request | Lock team; verify leader; pending request becomes declined; audit | Not leader: 403. Not pending: 409 |
| Cancel own request | Single UPDATE on the request where status is pending and owner matches | Zero rows: 409. Waits behind an in-flight accept on the request row, then sees it is no longer pending |
| Remove member | Lock team; verify leader; target is a non-leader member; delete membership; count - 1; audit | Not leader: 403. Target not a member: 404. Target is the leader: 409 (use leave) |
| Leave | Discover team; lock; re-check membership; if `member_count = 1` delete the team; else if the leaver is leader promote the successor first; delete membership; count - 1; audit | Not a member: 404. All outcomes are one transaction, so a crash never leaves a team without a leader |
| Transfer leadership | Lock team; verify leader; target is a member; update `leader_id` and both roles; audit | Not leader: 403. Target not a member: 404 |
| Create or revoke invite | Lock team; verify leader; insert or revoke code row; audit | Not leader: 403 |
| Edit team profile | Lock team; verify leader; update name, description, needed skills; audit | Not leader: 403. Duplicate name: 409 |

A crash before COMMIT rolls back everything, and `NOTIFY` is only delivered for committed transactions, so subscribers never see an event for a change that did not happen.

## 6. Idempotency

A retried request (double click, flaky network, client timeout) must never join twice or create two teams, and the key must live in the same transaction as the change it protects. A key kept in Redis or committed separately breaks this: a crash between the two writes lets the retry run again.

Every mutating endpoint requires an `Idempotency-Key` header (a UUID made by the client for each user action and reused on retries).

1. Open the transaction.
2. `INSERT INTO idempotency_keys (user_id, key, endpoint, request_hash) ... ON CONFLICT DO NOTHING`. If an identical key is being processed by another transaction, this statement waits for that transaction to finish, so a double click is serialized by the primary key.
3. Row inserted: run the business logic, then store the status code and response body on the same row, then COMMIT.
4. Row already existed (the earlier request committed): compare `request_hash`. A different body returns 422 `idempotency_key_reuse`. The same body replays the stored response with the header `Idempotent-Replayed: true` and runs no business logic.

Keys are scoped to the user and the endpoint. Only successful results are stored: a business failure such as `team_full` rolls back the key with everything else, so a retry is evaluated fresh and may succeed if a seat has opened.

Different keys for the same intent (two separate clicks that both reach the server) are handled by the database constraints instead: a second "create team" fails the `UNIQUE (hackathon_id, user_id)` check, and a second join fails the same way. A cleanup job deletes keys older than 24 hours.

## 7. Real-time updates

Board and team pages update without a refresh through Server-Sent Events, fed by Postgres `LISTEN/NOTIFY`. We chose SSE over WebSockets because the traffic is one-way (server to browser), it reconnects on its own, and it passes through free-tier proxies.

- **Publish:** the last statement of every membership transaction is `SELECT pg_notify('team_events', $payload)`. Postgres delivers it only if the transaction commits, so there is no outbox table and no lost-publish window.
- **Payload:** ids only, for example `{"type":"member_joined","teamId":"...","hackathonId":"..."}`. Clients refetch the affected resource; this keeps us far below the 8,000-byte limit and keeps private data off the wire.
- **Listener:** the API holds one dedicated `LISTEN` connection outside the pool and fans out to subscribers in memory. Channels are `board:<hackathonId>` (public) and `team:<teamId>` (members only; pending requests are visible to the leader only).
- **Reconnect and reconcile:** delivery is at-most-once. If the listener connection drops, it reconnects with backoff and broadcasts a `resync` event; every browser then refetches. The browser does the same after any SSE reconnect. A 15-second heartbeat comment keeps proxies from closing idle streams.
- **Thundering herd:** one join makes every board viewer refetch at once. The board endpoint uses a 1-second single-flight cache, so a burst of identical requests becomes one query.
- **Browser client:** `fetch`-based SSE (`@microsoft/fetch-event-source`), because the native `EventSource` cannot send an `Authorization` header.

If we later run several API replicas, each runs its own listener and this design still works unchanged.

## 8. Security

| Threat | Control |
| --- | --- |
| Fake identity | Email + password with argon2id; short-lived JWT; every route except register, login and health requires it |
| Non-leader accepts, declines, removes or invites | Leader check runs inside the transaction under the team row lock, reading `leader_id` from the database, never from the token |
| Guessing invite codes | 60-bit random codes, SHA-256 stored, uniform 404 for unknown, expired and revoked codes, 5 failed redeems per minute and 20 per 15 minutes per user, 20 per minute per IP, then 429 with `Retry-After` |
| Reading other teams' private data | Team detail shows pending requests and audit log only to members (requests to the leader); SSE `team:` channels check membership on subscribe |
| Invalid or oversized input | JSON-schema validation on every route (types, lengths, enums, array sizes, UUID format), unknown properties rejected, 16 KB body limit |
| SQL injection | Parameterized queries only; no string-built SQL |
| Cross-site abuse | CORS allowlist, security headers, bearer tokens (no ambient cookies) |
| Tampering with history | `audit_log` has a trigger that rejects UPDATE and DELETE; rows hold no foreign key to teams, so they survive team deletion |
| Resource exhaustion | Pool size cap, `lock_timeout`, `statement_timeout`, per-user limit on creating teams and requests, request timeout |

Entropy check: with 2,000 live codes in a 2^60 space, one random guess hits a valid code with probability about 1.7 in 10^15. At the per-user and per-IP limits above, brute force is not a realistic attack.

## 9. Teammate suggestions and scoring

`GET /api/teams/:id/suggestions` ranks people who are not on any team by how well they fill the team's gaps and how close their working hours are. Every result carries its own explanation.

```latex
\text{Score} = 100 \times (0.6\,S_{skill} + 0.3\,S_{tz} + 0.1\,S_{interest})
```

| Factor | Definition | Range |
| --- | --- | --- |
| Skill complement, S\_skill | 0.6 × need match + 0.4 × novelty. Need match = share of the team's wanted skills the candidate has. Novelty = share of the candidate's skills the team does not already have | 0 to 1 |
| Time zone, S\_tz | 1 − d / 720, where d is the gap in minutes between the candidate's UTC offset and the team's median offset, wrapped around the clock (maximum 720). Same offset scores 1, opposite side of the world scores 0 | 0 to 1 |
| Shared interests, S\_interest | Overlap of the candidate's interests with the team's combined interests (Jaccard) | 0 to 1 |

Excluded: the requester, anyone already on a team in this hackathon, and anyone who turned off discovery. Ties break by user id so results are stable.

**Worked example.** The team has React and CSS and wants Node, Postgres and Design. The candidate has Node, Postgres and Docker and is one hour away. Need match is 2/3 = 0.667, novelty is 3/3 = 1.0, so S\_skill = 0.6 × 0.667 + 0.4 × 1.0 = 0.80. S\_tz = 1 − 60/720 = 0.917. With an interest overlap of 0.25 the total is 100 × (0.48 + 0.275 + 0.025) = 78.

The response returns the total plus a breakdown and a plain-English reason per factor:

```json
{
  "userId": "u_942",
  "score": 78,
  "breakdown": {
    "skills":    { "score": 0.80, "reason": "Covers 2 of 3 wanted skills (node, postgres); brings docker, which the team lacks" },
    "timezone":  { "score": 0.92, "reason": "1 hour from the team's median time zone" },
    "interests": { "score": 0.25, "reason": "Shares 1 of 4 combined interests" }
  }
}
```

For speed, SQL first narrows the pool (not on a team, discoverable, skills overlap the team's needs or time zone within 6 hours, at most 500 rows); the application then scores and returns the top 20.
