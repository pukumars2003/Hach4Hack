import pg from 'pg';
import { config } from '../config.js';
import { PRECOMPUTED_SEED_PASSWORD_HASH } from '../utils/crypto.js';

const { Pool } = pg;

const SKILL_POOL = [
  'React', 'Node.js', 'PostgreSQL', 'TypeScript', 'Python', 'Docker',
  'Rust', 'Go', 'Kubernetes', 'GraphQL', 'Machine Learning', 'PyTorch',
  'TailwindCSS', 'Figma', 'System Design', 'Redis', 'Next.js', 'C++',
];

const INTEREST_POOL = [
  'AI Agents', 'Distributed Systems', 'DevOps', 'Fintech', 'Open Source',
  'Web3', 'Competitive Programming', 'Game Dev', 'Security', 'HealthTech',
];

const TZ_OFFSETS = [-480, -300, 0, 60, 120, 330, 480, 540];

export async function seedDatabase(options: { userCount?: number; teamCount?: number } = {}) {
  const userCount = options.userCount || parseInt(process.env.SEED_USERS || '10000', 10);
  const teamCount = options.teamCount || parseInt(process.env.SEED_TEAMS || '2000', 10);

  const pool = new Pool({ connectionString: config.database.connectionString });
  console.log(`[Seed] Starting seed: ${userCount} users, ${teamCount} teams...`);
  const startTime = Date.now();

  try {
    // 1. Create or fetch default hackathon
    const hackathonRes = await pool.query(
      `INSERT INTO hackathons (name, slug, min_team_size, max_team_size, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET is_active = true
       RETURNING id`,
      ['Hach4Hack Concurrency Championship 2026', 'hack4hack-2026', 2, 4, true]
    );
    const hackathonId = hackathonRes.rows[0].id;

    // 2. Batch insert users using jsonb_to_recordset (chunk size: 2,500)
    console.log(`[Seed] Generating and inserting ${userCount} users...`);
    const chunkSize = 2500;
    const allUserIds: string[] = [];

    for (let c = 0; c < userCount; c += chunkSize) {
      const currentChunk = Math.min(chunkSize, userCount - c);
      const userObjects: any[] = [];

      for (let i = 0; i < currentChunk; i++) {
        const idx = c + i;
        userObjects.push({
          email: `hacker_${idx}@hackathon.org`,
          password_hash: PRECOMPUTED_SEED_PASSWORD_HASH,
          name: `Hacker ${idx}`,
          skills: [
            SKILL_POOL[idx % SKILL_POOL.length],
            SKILL_POOL[(idx * 3 + 1) % SKILL_POOL.length],
            SKILL_POOL[(idx * 7 + 2) % SKILL_POOL.length],
          ],
          interests: [
            INTEREST_POOL[idx % INTEREST_POOL.length],
            INTEREST_POOL[(idx + 4) % INTEREST_POOL.length],
          ],
          timezone_offset_minutes: TZ_OFFSETS[idx % TZ_OFFSETS.length],
          discovery_enabled: idx % 10 !== 0,
        });
      }

      const userInsert = await pool.query(
        `INSERT INTO users (email, password_hash, name, skills, interests, timezone_offset_minutes, discovery_enabled)
         SELECT email, password_hash, name, skills, interests, timezone_offset_minutes, discovery_enabled
         FROM jsonb_to_recordset($1::jsonb) AS x(
           email varchar,
           password_hash varchar,
           name varchar,
           skills text[],
           interests text[],
           timezone_offset_minutes int,
           discovery_enabled boolean
         )
         RETURNING id`,
        [JSON.stringify(userObjects)]
      );

      for (const row of userInsert.rows) {
        allUserIds.push(row.id);
      }
      process.stdout.write(`\r[Seed] Inserted ${allUserIds.length} / ${userCount} users...`);
    }
    console.log('\n[Seed] Users successfully inserted.');

    // 3. Batch insert teams using jsonb_to_recordset (chunk size: 2,000)
    console.log(`[Seed] Inserting ${teamCount} teams...`);
    const teamChunkSize = 2000;
    const allTeamIds: string[] = [];

    for (let c = 0; c < teamCount; c += teamChunkSize) {
      const currentChunk = Math.min(teamChunkSize, teamCount - c);
      const teamObjects: any[] = [];

      for (let i = 0; i < currentChunk; i++) {
        const teamIdx = c + i;
        const leaderId = allUserIds[teamIdx];
        teamObjects.push({
          hackathon_id: hackathonId,
          name: `Team Alpha-${teamIdx}`,
          description: `Building hyper-scale systems for hackathon project ${teamIdx}`,
          needed_skills: [
            SKILL_POOL[(teamIdx * 2) % SKILL_POOL.length],
            SKILL_POOL[(teamIdx * 5 + 3) % SKILL_POOL.length],
          ],
          leader_id: leaderId,
        });
      }

      const teamInsert = await pool.query(
        `INSERT INTO teams (hackathon_id, name, description, needed_skills, leader_id, member_count, max_members)
         SELECT hackathon_id, name, description, needed_skills, leader_id, 1, 4
         FROM jsonb_to_recordset($1::jsonb) AS x(
           hackathon_id uuid,
           name varchar,
           description text,
           needed_skills text[],
           leader_id uuid
         )
         RETURNING id, leader_id`,
        [JSON.stringify(teamObjects)]
      );

      // Insert leader memberships
      const memberObjects = teamInsert.rows.map((row) => ({
        team_id: row.id,
        user_id: row.leader_id,
        hackathon_id: hackathonId,
        role: 'leader',
      }));

      await pool.query(
        `INSERT INTO team_members (team_id, user_id, hackathon_id, role)
         SELECT team_id, user_id, hackathon_id, role
         FROM jsonb_to_recordset($1::jsonb) AS x(
           team_id uuid,
           user_id uuid,
           hackathon_id uuid,
           role varchar
         )`,
        [JSON.stringify(memberObjects)]
      );

      for (const row of teamInsert.rows) {
        allTeamIds.push(row.id);
      }
      process.stdout.write(`\r[Seed] Inserted ${allTeamIds.length} / ${teamCount} teams...`);
    }
    console.log('\n[Seed] Teams successfully inserted.');

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Seed Complete] Successfully seeded ${userCount} users and ${teamCount} teams in ${totalSeconds}s!`);
  } catch (err) {
    console.error('[Seed Error]', err);
    throw err;
  } finally {
    await pool.end();
  }
}

if (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
