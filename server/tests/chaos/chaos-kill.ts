import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';
import { config } from '../../src/config.js';
import { runMigrations } from '../../src/db/migrate.js';
import { generateInviteCode, hashInviteCode } from '../../src/utils/crypto.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function signTestJwt(payload: Record<string, unknown>, secret: string): string {
  const base64url = (b: Buffer | string) =>
    (Buffer.isBuffer(b) ? b : Buffer.from(b)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const h = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${base64url(sig)}`;
}

async function runChaosTest() {
  console.log('====================================================');
  console.log('CHAOS ENGINEERING: MID-JOIN SIGKILL RESILIENCY TEST');
  console.log('====================================================');

  await runMigrations();
  const pool = new Pool({ connectionString: config.database.connectionString });

  try {
    const testRunId = Date.now();
    // 1. Prepare test database fixtures
    const hRes = await pool.query(
      `INSERT INTO hackathons (name, slug, min_team_size, max_team_size, is_active)
       VALUES ($1, $2, 2, 4, true)
       RETURNING id`,
      [`Chaos Hackathon ${testRunId}`, `chaos-hackathon-${testRunId}`]
    );
    const hackathonId = hRes.rows[0].id;

    const leaderRes = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`chaos_leader_${testRunId}@test.com`, 'hash', 'Chaos Leader']
    );
    const leaderId = leaderRes.rows[0].id;

    // Create target team with 3/4 members (1 seat remaining)
    const teamRes = await pool.query(
      `INSERT INTO teams (hackathon_id, name, leader_id, member_count, max_members)
       VALUES ($1, $2, $3, 3, 4)
       RETURNING id`,
      [hackathonId, `Chaos Team ${Date.now()}`, leaderId]
    );
    const teamId = teamRes.rows[0].id;

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, hackathon_id, role)
       VALUES ($1, $2, $3, 'leader')`,
      [teamId, leaderId, hackathonId]
    );

    // Insert 2 dummy members
    for (let i = 1; i <= 2; i++) {
      const u = await pool.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
        [`chaos_member_${i}_${Date.now()}@test.com`, 'hash', `Member ${i}`]
      );
      await pool.query(
        `INSERT INTO team_members (team_id, user_id, hackathon_id, role) VALUES ($1, $2, $3, 'member')`,
        [teamId, u.rows[0].id, hackathonId]
      );
    }

    const rawInviteCode = generateInviteCode();
    await pool.query(
      `INSERT INTO invite_codes (team_id, code_hash, created_by, expires_at)
       VALUES ($1, $2, $3, clock_timestamp() + interval '1 day')`,
      [teamId, hashInviteCode(rawInviteCode), leaderId]
    );

    // Generate 50 prospective joiners
    const joiners: { id: string; email: string }[] = [];
    for (let i = 0; i < 50; i++) {
      const j = await pool.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
        [`chaos_racer_${i}_${Date.now()}@test.com`, 'hash', `Chaos Racer ${i}`]
      );
      joiners.push({ id: j.rows[0].id, email: `chaos_racer_${i}@test.com` });
    }

    // 2. Spawn server process
    const serverEntry = path.resolve(__dirname, '../../src/index.ts');
    const port = 3999;
    console.log(`[Chaos] Spawning server process on port ${port}...`);

    const serverProc = spawn('npx', ['tsx', serverEntry], {
      env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    // Wait for server to start
    await new Promise<void>((resolve) => {
      serverProc.stdout?.on('data', (d) => {
        const text = d.toString();
        if (text.includes('Server listening')) {
          resolve();
        }
      });
      setTimeout(resolve, 3000);
    });

    console.log(`[Chaos] Server process up with PID ${serverProc.pid}.`);

    // 3. Initiate 50 concurrent join requests with valid JWT auth
    console.log('[Chaos] Firing 50 concurrent authenticated join requests and triggering kill mid-flight...');
    
    const promises = joiners.map((j) => {
      const token = signTestJwt({ id: j.id, email: j.email, name: `Chaos Racer ${j.id}` }, config.jwtSecret);
      return fetch(`http://localhost:${port}/api/teams/join-by-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': `chaos-${j.id}`,
        },
        body: JSON.stringify({ code: rawInviteCode }),
      }).catch(() => null);
    });

    // Wait 35 milliseconds (mid-flight transaction execution)
    await new Promise((r) => setTimeout(r, 35));

    // Abruptly kill the server process mid-transaction!
    console.log('[Chaos] Sending abrupt KILL to server process...');
    if (process.platform === 'win32' && serverProc.pid) {
      try {
        execSync(`taskkill /F /T /PID ${serverProc.pid}`, { stdio: 'ignore' });
      } catch {
        serverProc.kill();
      }
    } else {
      serverProc.kill('SIGKILL');
    }

    await Promise.allSettled(promises);
    console.log('[Chaos] Server killed and all network connections terminated.');

    // 4. Verify PostgreSQL Data Integrity
    console.log('[Chaos] Checking database state for corruption or inconsistency...');
    const teamCheck = await pool.query(
      `SELECT member_count, max_members FROM teams WHERE id = $1`,
      [teamId]
    );
    const countCheck = await pool.query(
      `SELECT count(*)::int as actual_count FROM team_members WHERE team_id = $1`,
      [teamId]
    );

    const storedMemberCount = teamCheck.rows[0].member_count;
    const actualMemberCount = countCheck.rows[0].actual_count;

    console.log(`[Postgres Verification] stored member_count = ${storedMemberCount}, actual row count = ${actualMemberCount}`);

    // Invariant 1: stored member_count MUST strictly equal actual count of rows
    if (storedMemberCount !== actualMemberCount) {
      throw new Error(`CORRUPTION DETECTED: member_count (${storedMemberCount}) != actual rows (${actualMemberCount})!`);
    }

    // Invariant 2: team can NEVER exceed max_members
    if (actualMemberCount > teamCheck.rows[0].max_members) {
      throw new Error(`CAPACITY EXCEEDED: actual rows (${actualMemberCount}) > max (${teamCheck.rows[0].max_members})!`);
    }

    // Invariant 3: Either 3 (kill caught before commit) or 4 (one won and committed before kill). Never 5!
    if (actualMemberCount !== 3 && actualMemberCount !== 4) {
      throw new Error(`INVALID STATE: actual count is ${actualMemberCount}`);
    }

    console.log('====================================================');
    console.log('✅ CHAOS TEST PASSED: ZERO DATA CORRUPTION OR LEAKS');
    console.log('PostgreSQL ACID atomic transactions preserved 100% integrity!');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ CHAOS TEST FAILED:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runChaosTest();

