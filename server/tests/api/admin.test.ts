import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index.js';
import { pool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

describe('Admin users endpoint', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    await app.ready();

    const runId = Date.now();
    // The role column is added by authRoutes at boot; insert an admin directly.
    const admin = await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, email, name`,
      [`admin_test_${runId}@test.com`, 'scrypt$hash', `Admin Test ${runId}`]
    );
    adminToken = app.jwt.sign({
      id: admin.rows[0].id,
      email: admin.rows[0].email,
      name: admin.rows[0].name,
      role: 'admin',
    });

    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `admin_user_test_${runId}@test.com`,
        password: 'Password123!',
        name: 'Normal User',
      },
    });
    userToken = JSON.parse(registered.body).token;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users?limit=1' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a non-admin with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users?limit=1',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns users, pagination and stats for an admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users?limit=5',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThan(0);
    expect(body.limit).toBe(5);
    expect(body.stats.total_users).toBeGreaterThan(0);
    expect(body.users[0]).toHaveProperty('name');
    expect(body.users[0]).toHaveProperty('email');
    expect(body.users[0]).toHaveProperty('role');
  });
});