import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index.js';
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

describe('Invite-code redemption rate limits', () => {
  let app: FastifyInstance;
  const remoteAddress = '203.0.113.10';

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('limits invalid code guesses per authenticated user', async () => {
    const userId = randomUUID();
    const token = app.jwt.sign({ id: userId, email: 'rate-limit@test.invalid', name: 'Rate Limit Test' });
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => app.inject({
        method: 'POST',
        url: '/api/teams/join-by-code',
        remoteAddress,
        headers: { authorization: `Bearer ${token}` },
        payload: { code: 'INVALID-CODE-0000' },
      }))
    );

    expect(responses.filter((response) => response.statusCode === 404)).toHaveLength(5);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(1);
  });

  it('applies the user limit independently to each participant', async () => {
    const userIds = Array.from({ length: 6 }, () => randomUUID());
    const responses = await Promise.all(
      userIds.map((userId) => app.inject({
        method: 'POST',
        url: '/api/teams/join-by-code',
        remoteAddress,
        headers: {
          authorization: `Bearer ${app.jwt.sign({
            id: userId,
            email: `${userId}@rate-limit.test`,
            name: 'Rate Limit Test',
          })}`,
        },
        payload: { code: 'INVALID-CODE-0000' },
      }))
    );

    expect(responses.every((response) => response.statusCode === 404)).toBe(true);
  });
});
