import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/index.js';
import { pool, query } from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';
import { hashPassword, generateInviteCode, hashInviteCode } from '../../src/utils/crypto.js';

describe('Race-Proof Concurrency Tests: 50 to 250 Simultaneous Joins for 1 Seat', () => {
  let app: FastifyInstance;
  let hackathonId: string;
  let leaderUser: any;
  let leaderToken: string;

  beforeAll(async () => {
    // Run schema migrations
    await runMigrations();
    app = await buildApp();
    await app.ready();

    // Clean up test records
    await pool.query('DELETE FROM hackathons WHERE slug = $1', ['concurrency-test-hackathon']);

    // Create test hackathon
    const hRes = await pool.query(
      `INSERT INTO hackathons (name, slug, min_team_size, max_team_size, is_active)
       VALUES ($1, $2, 2, 4, true)
       RETURNING id`,
      ['Concurrency Test Hackathon', 'concurrency-test-hackathon']
    );
    hackathonId = hRes.rows[0].id;

    // Create leader user
    const passHash = await hashPassword('TestPass123!');
    const uRes = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      ['race_leader@test.com', passHash, 'Race Leader']
    );
    leaderUser = uRes.rows[0];
    leaderToken = app.jwt.sign({ id: leaderUser.id, email: leaderUser.email, name: leaderUser.name });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('50 distinct participants race for the 1 remaining seat -> Exactly 1 winner, 49 conflicts, zero over-capacity', async () => {
    const CONCURRENT_RACERS = 50;

    // 1. Create a team with max_members = 4 and 3 existing members (leader + 2)
    const teamRes = await pool.query(
      `INSERT INTO teams (hackathon_id, name, leader_id, member_count, max_members)
       VALUES ($1, $2, $3, 3, 4)
       RETURNING id`,
      [hackathonId, `Team Last-Seat-${Date.now()}`, leaderUser.id]
    );
    const teamId = teamRes.rows[0].id;

    // Insert 3 existing members
    await pool.query(
      `INSERT INTO team_members (team_id, user_id, hackathon_id, role)
       VALUES ($1, $2, $3, 'leader')`,
      [teamId, leaderUser.id, hackathonId]
    );

    for (let i = 1; i <= 2; i++) {
      const dummyRes = await pool.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
        [`existing_member_${i}_${Date.now()}@test.com`, 'hash', `Member ${i}`]
      );
      await pool.query(
        `INSERT INTO team_members (team_id, user_id, hackathon_id, role) VALUES ($1, $2, $3, 'member')`,
        [teamId, dummyRes.rows[0].id, hackathonId]
      );
    }

    // 2. Generate valid invite code
    const rawInviteCode = generateInviteCode();
    const codeHash = hashInviteCode(rawInviteCode);
    await pool.query(
      `INSERT INTO invite_codes (team_id, code_hash, created_by, expires_at)
       VALUES ($1, $2, $3, clock_timestamp() + interval '1 day')`,
      [teamId, codeHash, leaderUser.id]
    );

    // 3. Create 50 distinct racers with JWT tokens
    const racerTokens: string[] = [];
    const racerIds: string[] = [];

    for (let i = 0; i < CONCURRENT_RACERS; i++) {
      const racerRes = await pool.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
        [`racer_${i}_${Date.now()}@test.com`, 'hash', `Racer ${i}`]
      );
      const rId = racerRes.rows[0].id;
      racerIds.push(rId);
      racerTokens.push(app.jwt.sign({ id: rId, email: `racer_${i}@test.com`, name: `Racer ${i}` }));
    }

    // 4. Fire all 50 requests at the EXACT same instant using Promise.all
    console.log(`[Race Test] Firing ${CONCURRENT_RACERS} simultaneous join requests for the last seat...`);
    const startTime = Date.now();

    const responses = await Promise.all(
      racerTokens.map((token) =>
        app.inject({
          method: 'POST',
          url: '/api/teams/join-by-code',
          headers: {
            authorization: `Bearer ${token}`,
            'idempotency-key': `race-test-${Date.now()}-${token.slice(-10)}`,
          },
          payload: { code: rawInviteCode },
        })
      )
    );

    const elapsed = Date.now() - startTime;
    console.log(`[Race Test] All ${CONCURRENT_RACERS} requests completed in ${elapsed}ms.`);

    // 5. Evaluate HTTP responses
    const successfulJoins = responses.filter((r) => r.statusCode === 200);
    const conflicts = responses.filter((r) => r.statusCode === 409);
    const serverErrors = responses.filter((r) => r.statusCode >= 500);

    console.log(`[Race Test Result] 200 OK: ${successfulJoins.length}, 409 Conflict: ${conflicts.length}, Errors: ${serverErrors.length}`);

    // EXACTLY 1 winner must get the last seat!
    expect(successfulJoins.length).toBe(1);
    // EXACTLY 49 racers must receive 409 Conflict!
    expect(conflicts.length).toBe(CONCURRENT_RACERS - 1);
    // Zero internal server errors
    expect(serverErrors.length).toBe(0);

    // 6. Mathematical Verification against PostgreSQL Storage Engine
    const verifyTeam = await pool.query(
      `SELECT member_count, max_members FROM teams WHERE id = $1`,
      [teamId]
    );
    expect(verifyTeam.rows[0].member_count).toBe(4);

    const verifyMembers = await pool.query(
      `SELECT COUNT(*)::int as count FROM team_members WHERE team_id = $1`,
      [teamId]
    );
    expect(verifyMembers.rows[0].count).toBe(4);

    // Verify exactly one of the racers is in team_members
    const winnerInDb = await pool.query(
      `SELECT user_id FROM team_members WHERE team_id = $1 AND user_id = ANY($2::uuid[])`,
      [teamId, racerIds]
    );
    expect(winnerInDb.rowCount).toBe(1);
  });

  it('Simultaneous 2-Team Join Race: One user attempting to join two different teams at the exact same millisecond', async () => {
    // 1. Create Team A and Team B
    const tA = await pool.query(
      `INSERT INTO teams (hackathon_id, name, leader_id, member_count, max_members)
       VALUES ($1, $2, $3, 1, 4) RETURNING id`,
      [hackathonId, `Team A-${Date.now()}`, leaderUser.id]
    );
    const tB = await pool.query(
      `INSERT INTO teams (hackathon_id, name, leader_id, member_count, max_members)
       VALUES ($1, $2, $3, 1, 4) RETURNING id`,
      [hackathonId, `Team B-${Date.now()}`, leaderUser.id]
    );

    // Invite code for Team A
    const codeA = generateInviteCode();
    await pool.query(
      `INSERT INTO invite_codes (team_id, code_hash, created_by, expires_at)
       VALUES ($1, $2, $3, clock_timestamp() + interval '1 day')`,
      [tA.rows[0].id, hashInviteCode(codeA), leaderUser.id]
    );

    // Invite code for Team B
    const codeB = generateInviteCode();
    await pool.query(
      `INSERT INTO invite_codes (team_id, code_hash, created_by, expires_at)
       VALUES ($1, $2, $3, clock_timestamp() + interval '1 day')`,
      [tB.rows[0].id, hashInviteCode(codeB), leaderUser.id]
    );

    // Racer user
    const racer = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
      [`cross_racer_${Date.now()}@test.com`, 'hash', 'Cross Racer']
    );
    const racerToken = app.jwt.sign({ id: racer.rows[0].id, email: 'cross_racer@test.com', name: 'Cross Racer' });

    // Fire join for Team A and Team B simultaneously
    const [resA, resB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/teams/join-by-code',
        headers: { authorization: `Bearer ${racerToken}` },
        payload: { code: codeA },
      }),
      app.inject({
        method: 'POST',
        url: '/api/teams/join-by-code',
        headers: { authorization: `Bearer ${racerToken}` },
        payload: { code: codeB },
      }),
    ]);

    const statuses = [resA.statusCode, resB.statusCode];
    // Exactly one 200 and one 409 (already_on_team)
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    // Check membership: racer is in exactly ONE team
    const memCheck = await pool.query(
      `SELECT COUNT(*)::int as count FROM team_members WHERE hackathon_id = $1 AND user_id = $2`,
      [hackathonId, racer.rows[0].id]
    );
    expect(memCheck.rows[0].count).toBe(1);

    // Check that the losing team's member_count was NOT left incremented
    const teamARows = await pool.query(`SELECT member_count FROM teams WHERE id = $1`, [tA.rows[0].id]);
    const teamBRows = await pool.query(`SELECT member_count FROM teams WHERE id = $1`, [tB.rows[0].id]);
    const counts = [teamARows.rows[0].member_count, teamBRows.rows[0].member_count];

    expect(counts).toContain(2); // The winning team has 2 members
    expect(counts).toContain(1); // The losing team reverted back to 1 member!
  });
});
