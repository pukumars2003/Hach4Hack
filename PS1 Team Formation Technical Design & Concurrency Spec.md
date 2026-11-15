# Hack4Hack Team Formation: Technical Design

## Goal

Hack4Hack lets participants find teams, create a team, join by invitation or request, and discover potential
teammates. Its key correctness requirement is that concurrent joins cannot overfill a team or place a user on
two teams in the same hackathon.

## Architecture

The application is a React/Vite client backed by a Fastify/TypeScript API and PostgreSQL. The API validates
incoming data with Zod, authenticates participant and admin requests, and uses SQL transactions for team
mutations. PostgreSQL is the source of truth for membership and capacity.

The UI receives live updates through Server-Sent Events. PostgreSQL `LISTEN/NOTIFY` signals committed
changes to the API, which then notifies connected clients.

## Data integrity and team rules

- Team member counts are bounded by the team's maximum capacity.
- A guarded PostgreSQL update only increments the count when the team still has space.
- Membership changes and their related records are committed in a transaction.
- A uniqueness constraint on `(hackathon_id, user_id)` prevents a user from joining two teams in the same
  hackathon.
- Pending join requests are distinct from membership; a request does not reserve a seat.
- Team readiness is based on the configured minimum size; the maximum size is enforced on join.

## Last-seat concurrency

The important part of a join is an atomic conditional update, conceptually:

```sql
UPDATE teams
SET member_count = member_count + 1
WHERE id = $1 AND member_count < max_members
RETURNING id;
```

PostgreSQL serializes updates to the same team row. When one transaction takes the final seat and commits,
waiting updates re-evaluate the capacity condition against the committed row. They do not increment the
count, and the API returns a conflict. If a separate membership constraint fails, the transaction rolls back
the count change as well.

The automated integration test covers 50 concurrent requests competing for one seat. The latest recorded
run had one winner, 49 conflicts, no retryable responses or server errors, and a final team size of 4/4.
The browser race lab also offers 25, 50, 100, and 250 racers; the larger UI options are not the automated
test size.

## Authentication and permissions

Participants can log in with username or email. Passwords are hashed with scrypt. Admin-only operations
are protected by the API, and the admin user directory is searchable and paginated (200 users per page).
Demo credentials are intentionally public for judging; replace them before using a private deployment.

## Idempotency, audit, and live updates

The API uses PostgreSQL-backed idempotency records for supported retry-safe mutations. Audit records are
written alongside relevant team changes. PostgreSQL notifications are emitted transactionally, so clients
are notified only after a successful commit. The client refetches current data after receiving an event.

## Suggestions and board performance

Suggestions are heuristic—not AI-generated—and rank eligible candidates using skills, timezone, and
interests. The SQL candidate set is bounded before scoring.

The team board uses cursor pagination and a server-side response cache. Cache invalidation follows writes;
the browser is instructed not to retain the board response. Fresh local k6 runs on 2026-11-15 measured
95.68 ms p95 at 100 VUs and 183.35 ms at 250 VUs. The 500-VU run did not meet the target (272.41 ms p95,
1.60% request errors). These measurements used the current local database; its row count was not separately
audited. The 500-VU run recorded connection-refused requests while k6 and the API shared the local host.
RAM/CPU telemetry was not captured, so resource pressure is a plausible cause, not a confirmed diagnosis.
A dedicated server may behave differently, but requires a separate run. Older full-seed measurements and
methodology details are in the [load-test report](docs/LOAD_TEST_REPORT.md) and [proof folder](docs/proof/README.md).

## Demo dataset and local verification

The demo seed creates up to 50,000 participant accounts and 10,000 teams. Participant usernames are
`user00001` through `user50000`; the shared demo password is `Demo@12345`. The public demo admin is
`adminbro` / `DemoAdmin#2026`.

Run migrations, seed the demo database, start the app, and execute the automated suite from the repository
root:

```powershell
npm run db:migrate
npm run seed
npm run dev
npm test
```

The latest local automated run passed 39 tests across five test files. The separate `npm run test:chaos`
command is excluded from that suite and should only be used with a disposable test database.
