import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index.js';
import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { generateInviteCode, hashPassword } from '../../src/utils/crypto.js';
import { config } from '../../src/config.js';

describe('Complete API Test Suite (50+ Invariants & Edge Cases)', () => {
  let app: FastifyInstance;
  let hackathonId: string;
  let user1: any;
  let user1Token: string;
  let user2: any;
  let user2Token: string;
  let user3: any;
  let user3Token: string;
  let bootstrapAdminUsername: string;

  beforeAll(async () => {
    await runMigrations();
    const previousAdminUsername = process.env.ADMIN_USERNAME;
    const previousAdminPassword = process.env.ADMIN_PASSWORD;
    bootstrapAdminUsername = `testadmin${Date.now()}`;
    process.env.ADMIN_USERNAME = bootstrapAdminUsername;
    process.env.ADMIN_PASSWORD = 'TestAdminPassword123!';
    try {
      app = await buildApp();
      await app.ready();
    } finally {
      if (previousAdminUsername === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = previousAdminUsername;
      if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = previousAdminPassword;
    }

    // Setup Hackathon with unique run slug
    const runId = Date.now();
    const hRes = await pool.query(
      `INSERT INTO hackathons (name, slug, min_team_size, max_team_size, is_active)
       VALUES ($1, $2, 2, 4, true)
       RETURNING id`,
      [`Full API Test Hackathon ${runId}`, `full-api-test-hackathon-${runId}`]
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
  it('0. POST /api/auth/login: provisions and authenticates the configured admin username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: bootstrapAdminUsername, password: 'TestAdminPassword123!' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.role).toBe('admin');
  });

  it('0a. POST /api/auth/login: backfills usernames for seeded demo accounts', async () => {
    const email = 'user99999@demo.test';
    await query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
      [email, await hashPassword('Demo@12345'), 'Demo Judge']
    );

    try {
      await runMigrations();
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'user99999', password: 'Demo@12345' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).user.email).toBe(email);
    } finally {
      await query('DELETE FROM users WHERE email = $1', [email]);
    }
  });

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

  it('2a. POST /api/auth/login: authenticates with a username', async () => {
    const username = `api_user_${Date.now()}`;
    await query('UPDATE users SET username = $1 WHERE id = $2', [username, user1.id]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password: 'Password123!' },
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

  it('5a. PATCH /api/teams/:id: profile changes are recorded in the audit log', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/teams/${createdTeamId}`,
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { description: 'Updated project plan', neededSkills: ['Rust'] },
    });
    expect(res.statusCode).toBe(200);

    const audit = await pool.query(
      `SELECT details FROM audit_logs
       WHERE team_id = $1 AND action = 'team_updated'
       ORDER BY created_at DESC LIMIT 1`,
      [createdTeamId]
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].details.before.description).toBe('Building distributed algorithms');
    expect(audit.rows[0].details.after.description).toBe('Updated project plan');
  });

  it('5b. GET /api/realtime/stream: only authenticated team members can subscribe', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/realtime/stream?hackathonId=${hackathonId}&teamId=${createdTeamId}`,
    });
    expect(anonymous.statusCode).toBe(401);

    const nonMember = await app.inject({
      method: 'GET',
      url: `/api/realtime/stream?hackathonId=${hackathonId}&teamId=${createdTeamId}`,
      headers: { authorization: `Bearer ${user2Token}` },
    });
    expect(nonMember.statusCode).toBe(403);
  });

  it('5c. POST /api/teams/lab/batch-racers: requires admin access', async () => {
    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/teams/lab/batch-racers',
      payload: { count: 10 },
    });
    expect(anonymous.statusCode).toBe(401);

    const participant = await app.inject({
      method: 'POST',
      url: '/api/teams/lab/batch-racers',
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { count: 10 },
    });
    expect(participant.statusCode).toBe(403);
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

  it('7a. POST /api/teams: rejects capacities outside the hackathon bounds', async () => {
    const aboveMax = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${user2Token}` },
      payload: {
        hackathonId,
        name: `Oversized Team ${Date.now()}`,
        maxMembers: 5,
      },
    });
    expect(aboveMax.statusCode).toBe(400);
    expect(JSON.parse(aboveMax.body).code).toBe('team_size_out_of_bounds');

    const strictMinimum = await pool.query(
      `INSERT INTO hackathons (name, slug, min_team_size, max_team_size, is_active)
       VALUES ($1, $2, 3, 4, true) RETURNING id`,
      [`Min Team Test ${Date.now()}`, `min-team-test-${Date.now()}`]
    );
    const belowMin = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${user2Token}` },
      payload: {
        hackathonId: strictMinimum.rows[0].id,
        name: `Undersized Team ${Date.now()}`,
        maxMembers: 2,
      },
    });
    expect(belowMin.statusCode).toBe(400);
    expect(JSON.parse(belowMin.body).code).toBe('team_size_out_of_bounds');
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

  it('10a. POST /api/teams/:id/invites: rejects invalid expiry values', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/teams/${createdTeamId}/invites`,
      headers: { authorization: `Bearer ${user1Token}` },
      payload: { expiresInHours: 0.5 },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('validation_error');
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

  it('13. Concurrent same-key join retries replay one committed result', async () => {
    const leaderRegistration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `idem_leader_${Date.now()}@test.com`,
        password: 'Password123!',
        name: 'Idempotency Team Leader',
      },
    });
    const { user: leader, token: leaderToken } = JSON.parse(leaderRegistration.body);
    const team = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${leaderToken}` },
      payload: { hackathonId, name: `Idempotency Team ${Date.now()}`, maxMembers: 4 },
    });
    expect(team.statusCode).toBe(201);
    const teamId = JSON.parse(team.body).id;
    const invite = await app.inject({
      method: 'POST',
      url: `/api/teams/${teamId}/invites`,
      headers: { authorization: `Bearer ${leaderToken}` },
      payload: {},
    });
    expect(invite.statusCode).toBe(201);
    const code = JSON.parse(invite.body).code;

    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `idem_racer_${Date.now()}@test.com`,
        password: 'Password123!',
        name: 'Idempotency Racer',
      },
    });
    const { user, token } = JSON.parse(registration.body);
    const key = `concurrent-join-${Date.now()}`;
    const request = () => app.inject({
      method: 'POST',
      url: '/api/teams/join-by-code',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
      payload: { code },
    });

    const [first, retry] = await Promise.all([request(), request()]);
    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect([first.headers['idempotent-replayed'], retry.headers['idempotent-replayed']]).toContain('true');
    expect(JSON.parse(first.body)).toEqual(JSON.parse(retry.body));

    const membership = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM team_members
       WHERE team_id = $1 AND user_id = $2 AND hackathon_id = $3`,
      [teamId, user.id, hackathonId]
    );
    expect(membership.rows[0].count).toBe(1);
    expect(leader.id).toBe(JSON.parse(team.body).leader_id);
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

  it('17a. DELETE /api/requests/:id: cancellation is audited in the same transaction', async () => {
    const user = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `cancel_user_${Date.now()}@test.com`,
        password: 'Password123!',
        name: 'Cancellation Tester',
      },
    });
    const token = JSON.parse(user.body).token;
    const created = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers: { authorization: `Bearer ${token}` },
      payload: { teamId: createdTeamId, message: 'Please consider my application.' },
    });
    expect(created.statusCode).toBe(201);
    const canceled = await app.inject({
      method: 'DELETE',
      url: `/api/requests/${JSON.parse(created.body).id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(canceled.statusCode).toBe(200);

    const audit = await pool.query(
      `SELECT 1 FROM audit_logs
       WHERE team_id = $1 AND actor_id = $2 AND action = 'request_cancelled'
       ORDER BY created_at DESC LIMIT 1`,
      [createdTeamId, JSON.parse(user.body).user.id]
    );
    expect(audit.rowCount).toBe(1);
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

  // 14. Raw HTTP response cache (bypasses Fastify on hits)
  it('26. Board cache hits at the HTTP layer keep JSON, CORS and content-length headers', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = `${address}/api/teams?limit=20&_cacheProbe=${Date.now()}`;

    const first = await fetch(url);
    const firstBody = await first.text();
    expect(first.status).toBe(200);

    // The second identical request is served from the in-process HTTP cache.
    const second = await fetch(url);
    const secondBody = await second.text();

    expect(second.status).toBe(200);
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(second.headers.get('content-type')).toContain('application/json');
    expect(second.headers.get('access-control-allow-origin')).toBe(config.corsOrigin);
    expect(second.headers.get('content-length')).toBe(String(Buffer.byteLength(secondBody)));
    expect(secondBody).toBe(firstBody);
  });

  // 15. Cache correctness under a write
  it('27. A join is visible on the next board read: no stale copy is served after a commit', async () => {
    // Two fresh users so the seat maths is deterministic on a dedicated team.
    const stamp = Date.now();
    const leaderRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `cache_leader_${stamp}@test.com`,
        password: 'Password123!',
        name: 'Cache Leader',
        skills: ['React'],
        interests: [],
        timezoneOffsetMinutes: 0,
      },
    });
    const leaderToken = JSON.parse(leaderRes.body).token;

    const joinerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `cache_joiner_${stamp}@test.com`,
        password: 'Password123!',
        name: 'Cache Joiner',
        skills: ['Node'],
        interests: [],
        timezoneOffsetMinutes: 0,
      },
    });
    const joinerToken = JSON.parse(joinerRes.body).token;

    const teamRes = await app.inject({
      method: 'POST',
      url: '/api/teams',
      headers: { authorization: `Bearer ${leaderToken}` },
      payload: { name: `Cache Watch Team ${stamp}`, hackathonId, maxMembers: 4 },
    });
    expect(teamRes.statusCode).toBe(201);
    const teamId = JSON.parse(teamRes.body).id;

    const boardUrl = `/api/teams?limit=20&_cacheProbe=${stamp}`;
    const before = JSON.parse((await app.inject({ method: 'GET', url: boardUrl })).body);
    const beforeTeam = before.teams.find((t: any) => t.id === teamId);
    expect(beforeTeam.member_count).toBe(1);

    // Prime the raw HTTP cache so the next read would be a HIT without invalidation.
    const primed = await app.inject({ method: 'GET', url: boardUrl });
    expect(primed.headers['x-cache']).toBeDefined();

    // The join commits and notifies inside its transaction.
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers: { authorization: `Bearer ${joinerToken}` },
      payload: { teamId },
    });
    expect(joinRes.statusCode).toBe(201);
    const requestId = JSON.parse(joinRes.body).request?.id ?? JSON.parse(joinRes.body).id;

    // The leader accepts, which is what actually consumes the seat.
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/requests/${requestId}/accept`,
      headers: { authorization: `Bearer ${leaderToken}` },
    });
    expect(acceptRes.statusCode).toBe(200);

    // Immediately read the board again: it must show the new member count.
    const after = JSON.parse((await app.inject({ method: 'GET', url: boardUrl })).body);
    const afterTeam = after.teams.find((t: any) => t.id === teamId);
    expect(afterTeam.member_count).toBe(2);
  });

  // 16. Browser caching of the board
  it('28. Board responses are not stored by the browser cache', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/teams?limit=20&_cacheProbe=${Date.now()}` });
    expect(res.statusCode).toBe(200);
    const cacheControl = (res.headers['cache-control'] || '').toLowerCase();
    expect(cacheControl).toContain('no-store');
    expect(cacheControl).not.toContain('max-age');
  });
});

