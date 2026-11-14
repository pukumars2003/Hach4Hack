import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';

const { fetchBoardMock } = vi.hoisted(() => ({ fetchBoardMock: vi.fn() }));

vi.mock('../../src/services/board.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/board.js')>();
  // Default every call to the real query. Individual tests queue a one-off slow
  // response with mockImplementationOnce, so the rest of the suite is unchanged.
  fetchBoardMock.mockImplementation(actual.fetchBoard);
  return { ...actual, fetchBoard: fetchBoardMock };
});

import { buildApp } from '../../src/index.js';
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

describe('Board cache: a read that starts before a write', () => {
  let app: FastifyInstance;
  let hackathonId: string;
  let leaderToken: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    await app.ready();

    const runId = Date.now();
    const hackathon = await pool.query(
      `INSERT INTO hackathons (name, slug, min_team_size, max_team_size, is_active)
       VALUES ($1, $2, 2, 4, true)
       RETURNING id`,
      [`Inflight Cache Test ${runId}`, `inflight-cache-test-${runId}`]
    );
    hackathonId = hackathon.rows[0].id;

    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `inflight_leader_${runId}@test.com`,
        password: 'Password123!',
        name: 'Inflight Leader',
      },
    });
    expect(registered.statusCode).toBe(201);
    leaderToken = JSON.parse(registered.body).token;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('a later GET runs a fresh query instead of joining the pre-write one', async () => {
    const stamp = Date.now();
    const boardUrl = `/api/teams?hackathonId=${hackathonId}&limit=20&_probe=${stamp}`;

    let releaseSlowRead!: (value: unknown) => void;
    const slowQuery = new Promise((resolve) => {
      releaseSlowRead = resolve;
    });

    // The first read enters a query that stays open across the write below.
    fetchBoardMock.mockImplementationOnce(() => slowQuery);
    const slowRead = app.inject({ method: 'GET', url: boardUrl });

    try {
      await vi.waitFor(() => expect(fetchBoardMock).toHaveBeenCalledTimes(1));

      // A real write commits and invalidates while the first read is open.
      const teamRes = await app.inject({
        method: 'POST',
        url: '/api/teams',
        headers: { authorization: `Bearer ${leaderToken}` },
        payload: { hackathonId, name: `Inflight Team ${stamp}`, maxMembers: 4 },
      });
      expect(teamRes.statusCode).toBe(201);
      const teamId = JSON.parse(teamRes.body).id;

      // This GET must not be handed the pre-write snapshot: it has to run its
      // own query, which is the real fetchBoard implementation.
      const afterWrite = await app.inject({ method: 'GET', url: boardUrl });
      expect(afterWrite.statusCode).toBe(200);
      const afterBody = JSON.parse(afterWrite.body);
      expect(afterBody.teams.some((team: any) => team.id === teamId)).toBe(true);

      // Let the stale query finish. Its result must not repopulate the cache.
      releaseSlowRead({ teams: [], nextCursor: null, hasMore: false });
      await slowRead;

      // A final read still shows the committed write.
      const finalRead = await app.inject({ method: 'GET', url: boardUrl });
      expect(finalRead.statusCode).toBe(200);
      const finalBody = JSON.parse(finalRead.body);
      expect(finalBody.teams.some((team: any) => team.id === teamId)).toBe(true);
    } finally {
      releaseSlowRead({ teams: [], nextCursor: null, hasMore: false });
      await slowRead.catch(() => {});
    }
  });
});