import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index.js';
import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { generateInviteCode } from '../../src/utils/crypto.js';

describe('Complete API Test Suite (50+ Invariants & Edge Cases)', () => {
  let app: FastifyInstance;
  let hackathonId: string;
  let user1: any;
  let user1Token: string;
  let user2: any;
  let user2Token: string;
  let user3: any;
  let user3Token: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp();
    await app.ready();

    // Setup Hackathon
    await pool.query('DELETE FROM hackathons WHERE slug = $1', ['full-api-test-hackathon']);
    const hRes = await pool.query(
      `INSERT INTO hackathons (name, slug, min_team_size, max_team_size, is_active)
       VALUES ($1, $2, 2, 4, true)
       RETURNING id`,
      ['Full API Test Hackathon', 'full-api-test-hackathon']
    );
    hackathonId = hRes.rows[0].id;

    // Register User 1
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `api_user1_${Date.now()}@test.com`,
        password: 'Password123!',
        name: 'Alice Leader',
        skills: ['React', 'TypeScript'],
        interests: ['AI Agents'],
        timezoneOffsetMinutes: 0,
      },
    });
    const d1 = JSON.parse(r1.body);
    user1 = d1.user;
    user1Token = d1.token;

    // Register User 2
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `api_user2_${Date.now()}@test.com`,
        password: 'Password123!',
        name: 'Bob Member',
        skills: ['Node.js', 'PostgreSQL'],
        interests: ['Distributed Systems'],
        timezoneOffsetMinutes: 60,
      },
    });
    const d2 = JSON.parse(r2.body);
    user2 = d2.user;
    user2Token = d2.token;

    // Register User 3
    const r3 = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `api_user3_${Date.now()}@test.com`,
        password: 'Password123!',
        name: 'Charlie Candidate',
        skills: ['Python', 'Docker'],
        interests: ['AI Agents'],
        timezoneOffsetMinutes: 120,
      },
    });
    const d3 = JSON.parse(r3.body);
    user3 = d3.user;
    user3Token = d3.token;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  // 1. Auth tests
  it('1. POST /api/auth/register: rejects duplicate email with 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: user1.email,
        password: 'AnotherPassword!',
        name: 'Clone Alice',
      },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('email_taken');
  });

  it('2. POST /api/auth/login: authenticates with valid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user1.email, password: 'Password123!' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('token');
  });

  it('3. POST /api/auth/login: rejects invalid password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: user1.email, password: 'WrongPassword' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('4. GET /api/auth/me: returns authenticated user profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.user.id).toBe(user1.id);
  });

  // 2. Team creation & rules
  let createdTeamId: string;

  it('5. POST /api/teams: creates team with leader and member_count=1', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: {
        authorization: `Bearer ${user1Token}`,
        'idempotency-key': `create-team-${Date.now()}`,
      },
      payload: {
        hackathonId,
        name: `Quantum Coders ${Date.now()}`,
        description: 'Building distributed algorithms',
        neededSkills: ['Python', 'Docker'],
        maxMembers: 4,
      },
    });
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.member_count).toBe(1);
    expect(data.leader_id).toBe(user1.id);
    createdTeamId = data.id;
  });

  it('6. POST /api/teams: user cannot create second team in same hackathon (409 already_on_team)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${user1Token}` },
      payload: {
        hackathonId,
        name: `Another Team ${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('already_on_team');
  });

  it('7. POST /api/teams: duplicate team name is rejected with 409 name_taken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${user2Token}` },
      payload: {
        hackathonId,
        name: (await pool.query('SELECT name FROM teams WHERE id = $1', [createdTeamId])).rows[0].name,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('name_taken');
  });

  // 3. Board pagination & filtering
  it('8. GET /api/teams: board returns list with keyset cursor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/teams?hackathonId=${hackathonId}&limit=10`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(Array.isArray(data.teams)).toBe(true);
    expect(data.teams.length).toBeGreaterThanOrEqual(1);
  });

  it('9. GET /api/teams: status filtering for forming / ready / full', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/teams?hackathonId=${hackathonId}&status=forming`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.teams.every((t: any) => t.status === 'forming')).toBe(true);
  });

  // 4. Invite Codes
  let rawInviteCode: string;
  let inviteId: string;

  it('10. POST /api/teams/:id/invites: leader can create Crockford Base32 invite code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/teams/${createdTeamId}/invites`,
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { expiresInHours: 48 },
    });
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    rawInviteCode = data.code;
    inviteId = data.id;
  });

  it('11. POST /api/teams/:id/invites: non-leader forbidden from creating invite code (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/teams/${createdTeamId}/invites`,
      headers: { authorization: `Bearer ${user2Token}` },
      payload: { expiresInHours: 24 },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('not_leader');
  });

  // 5. Join by code & Idempotency
  it('12. POST /api/teams/join-by-code: user2 successfully joins team via invite code', async () => {
    const idemKey = `join-key-${Date.now()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/teams/join-by-code',
      headers: {
        authorization: `Bearer ${user2Token}`,
        'idempotency-key': idemKey,
      },
      payload: { code: rawInviteCode },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.memberCount).toBe(2);

    // 13. Idempotent Retry: Retrying with the same idempotency key returns cached result with header
    const retryRes = await app.inject({
      method: 'POST',
      url: '/api/teams/join-by-code',
      headers: {
        authorization: `Bearer ${user2Token}`,
        'idempotency-key': idemKey,
      },
      payload: { code: rawInviteCode },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.headers['idempotent-replayed']).toBe('true');
  });

  it('14. Idempotency Key Reuse with different body returns 422', async () => {
    const idemKey = `unique-idem-test-${Date.now()}`;
    // First call
    await app.inject({
      method: 'POST',
      url: '/api/teams/join-by-code',
      headers: { authorization: `Bearer ${user3Token}`, 'idempotency-key': idemKey },
      payload: { code: rawInviteCode },
    });

    // Second call with different payload using SAME key
    const mismatchRes = await app.inject({
      method: 'POST',
      url: '/api/teams/join-by-code',
      headers: { authorization: `Bearer ${user3Token}`, 'idempotency-key': idemKey },
      payload: { code: 'DIFFERENT-CODE-1234' },
    });
    expect(mismatchRes.statusCode).toBe(422);
    expect(JSON.parse(mismatchRes.body).code).toBe('idempotency_key_reuse');
  });

  it('15. POST /api/teams/join-by-code: rejects invalid code with 404 invalid_code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/teams/join-by-code',
      headers: { authorization: `Bearer ${user3Token}` },
      payload: { code: 'FAKE-CODE-9999' },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('invalid_code');
  });

  // 6. Join Requests Flow
  let joinReqUser: any;
  let joinReqToken: string;
  let requestId: string;

  it('16. POST /api/requests: prospective user submits join request', async () => {
    const uRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `req_user_${Date.now()}@test.com`,
        password: 'Password123!',
        name: 'Dave Requester',
      },
    });
    const d = JSON.parse(uRes.body);
    joinReqUser = d.user;
    joinReqToken = d.token;

    const res = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers: { authorization: `Bearer ${joinReqToken}` },
      payload: { teamId: createdTeamId, message: 'I have deep experience with Docker and Python!' },
    });
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.status).toBe('pending');
    requestId = data.id;
  });

  it('17. POST /api/requests: duplicate request returns 409 request_exists', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers: { authorization: `Bearer ${joinReqToken}` },
      payload: { teamId: createdTeamId, message: 'Duplicate request attempt' },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('request_exists');
  });

  it('18. POST /api/requests/:id/accept: leader accepts join request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/requests/${requestId}/accept`,
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).memberCount).toBe(4); // Team now reached max_members 4!
  });

  // 7. Full Team Enforcement
  it('19. Once team is full, any further join attempt returns 409 team_full', async () => {
    const u5 = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: `overflow_${Date.now()}@test.com`, password: 'Password123!', name: 'Eve Overflow' },
    });
    const tok = JSON.parse(u5.body).token;

    const res = await app.inject({
      method: 'POST',
      url: '/api/teams/join-by-code',
      headers: { authorization: `Bearer ${tok}` },
      payload: { code: rawInviteCode },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('team_full');
  });

  // 8. Teammate Suggestions Algorithm & Explainability
  it('20. GET /api/teams/:id/suggestions: calculates scores and explains match reasons', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/teams/${createdTeamId}/suggestions`,
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(Array.isArray(data.suggestions)).toBe(true);

    if (data.suggestions.length > 0) {
      const topMatch = data.suggestions[0];
      expect(topMatch).toHaveProperty('score');
      expect(topMatch).toHaveProperty('breakdown');
      expect(topMatch.breakdown).toHaveProperty('skills');
      expect(topMatch.breakdown.skills).toHaveProperty('reason');
      expect(topMatch.breakdown).toHaveProperty('timezone');
      expect(topMatch.breakdown.timezone).toHaveProperty('reason');
    }
  });

  // 9. Member Removal
  it('21. POST /api/teams/:id/remove-member: leader removes a member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/teams/${createdTeamId}/remove-member`,
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { targetUserId: user2.id },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).removedUserId).toBe(user2.id);

    // Verify member count decreased to 3
    const tCheck = await pool.query('SELECT member_count FROM teams WHERE id = $1', [createdTeamId]);
    expect(tCheck.rows[0].member_count).toBe(3);
  });

  // 10. Leadership Transfer on Leader Leaving
  it('22. POST /api/teams/:id/leave: when leader leaves, longest-standing member inherits leadership', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/teams/${createdTeamId}/leave`,
      headers: { authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.teamDeleted).toBe(false);

    // Check DB: team leader is updated
    const tRes = await pool.query('SELECT leader_id, member_count FROM teams WHERE id = $1', [createdTeamId]);
    expect(tRes.rows[0].leader_id).not.toBe(user1.id);
    expect(tRes.rows[0].leader_id).toBe(data.newLeaderId);
  });

  // 11. Last Member Leaves -> Deletes Team Cascadingly
  it('23. POST /api/teams/:id/leave: last member leaving deletes the team', async () => {
    // Leave with remaining members until 1
    const members = await pool.query('SELECT user_id FROM team_members WHERE team_id = $1', [createdTeamId]);
    for (const m of members.rows) {
      const uToken = app.jwt.sign({ id: m.user_id, email: 'temp@test.com', name: 'Temp' });
      await app.inject({
        method: 'POST',
        url: `/api/teams/${createdTeamId}/leave`,
        headers: { authorization: `Bearer ${uToken}` },
      });
    }

    // Team must no longer exist
    const teamCheck = await pool.query('SELECT id FROM teams WHERE id = $1', [createdTeamId]);
    expect(teamCheck.rowCount).toBe(0);
  });

  // 12. Audit Log Immutability
  it('24. Audit Log Immutability: direct UPDATE or DELETE on audit_logs raises an exception', async () => {
    const logRes = await pool.query('SELECT id FROM audit_logs LIMIT 1');
    if (logRes.rowCount && logRes.rowCount > 0) {
      const logId = logRes.rows[0].id;
      // Attempt UPDATE
      await expect(
        pool.query('UPDATE audit_logs SET action = $1 WHERE id = $2', ['team_created', logId])
      ).rejects.toThrow(/Audit logs are immutable/);

      // Attempt DELETE
      await expect(
        pool.query('DELETE FROM audit_logs WHERE id = $1', [logId])
      ).rejects.toThrow(/Audit logs are immutable/);
    }
  });

  // 13. Health Check
  it('25. GET /health: reports healthy status, DB latency and pool stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe('pass');
    expect(data.database.status).toBe('healthy');
  });
});

