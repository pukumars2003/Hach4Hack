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

const TZ_OFFSETS = [-480, -300, 0, 60, 120, 330, 480, 540]; // -8h, -5h, UTC, +1, +2, +5:30 (India), +8, +9

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

    // 2. Batch insert users in chunks of 2,500
    console.log(`[Seed] Generating and inserting ${userCount} users...`);
    const chunkSize = 2500;
    const allUserIds: string[] = [];

    for (let c = 0; c < userCount; c += chunkSize) {
      const currentChunk = Math.min(chunkSize, userCount - c);
      const emails: string[] = [];
      const passHashes: string[] = [];
      const names: string[] = [];
      const skillsArr: string[][] = [];
      const interestsArr: string[][] = [];
      const tzArr: number[] = [];
      const discArr: boolean[] = [];

      for (let i = 0; i < currentChunk; i++) {
        const idx = c + i;
        emails.push(`hacker_${idx}@hackathon.org`);
        passHashes.push(PRECOMPUTED_SEED_PASSWORD_HASH);
        names.push(`Hacker ${idx}`);

        // Assign 2-4 random skills
        const uSkills = [
          SKILL_POOL[idx % SKILL_POOL.length],
          SKILL_POOL[(idx * 3 + 1) % SKILL_POOL.length],
          SKILL_POOL[(idx * 7 + 2) % SKILL_POOL.length],
        ];
        skillsArr.push(uSkills);

        // Assign 2 random interests
        const uInterests = [
          INTEREST_POOL[idx % INTEREST_POOL.length],
          INTEREST_POOL[(idx + 4) % INTEREST_POOL.length],
        ];
        interestsArr.push(uInterests);

        tzArr.push(TZ_OFFSETS[idx % TZ_OFFSETS.length]);
        discArr.push(idx % 10 !== 0); // 90% discoverable
      }

      const userInsert = await pool.query(
        `INSERT INTO users (email, password_hash, name, skills, interests, timezone_offset_minutes, discovery_enabled)
         SELECT * FROM UNNEST(
           $1::varchar[], $2::varchar[], $3::varchar[], $4::text[][], $5::text[][], $6::int[], $7::boolean[]
         )
         RETURNING id`,
        [emails, passHashes, names, skillsArr, interestsArr, tzArr, discArr]
      );

      for (const row of userInsert.rows) {
        allUserIds.push(row.id);
      }
      process.stdout.write(`\r[Seed] Inserted ${allUserIds.length} / ${userCount} users...`);
    }
    console.log('\n[Seed] Users successfully inserted.');

    // 3. Batch insert teams in chunks of 2,000
    console.log(`[Seed] Inserting ${teamCount} teams...`);
    const teamChunkSize = 2000;
    const allTeamIds: string[] = [];

    for (let c = 0; c < teamCount; c += teamChunkSize) {
      const currentChunk = Math.min(teamChunkSize, teamCount - c);
      const hackathonIds: string[] = [];
      const names: string[] = [];
      const descriptions: string[] = [];
      const neededSkillsArr: string[][] = [];
      const leaderIds: string[] = [];

      for (let i = 0; i < currentChunk; i++) {
        const teamIdx = c + i;
        const leaderId = allUserIds[teamIdx]; // 1-to-1 leader from users
        hackathonIds.push(hackathonId);
        names.push(`Team Alpha-${teamIdx}`);
        descriptions.push(`Building hyper-scale systems for hackathon project ${teamIdx}`);
        neededSkillsArr.push([
          SKILL_POOL[(teamIdx * 2) % SKILL_POOL.length],
          SKILL_POOL[(teamIdx * 5 + 3) % SKILL_POOL.length],
        ]);
        leaderIds.push(leaderId);
      }

      const teamInsert = await pool.query(
        `INSERT INTO teams (hackathon_id, name, description, needed_skills, leader_id, member_count, max_members)
         SELECT * FROM UNNEST(
           $1::uuid[], $2::varchar[], $3::text[], $4::text[][], $5::uuid[]
         ), 1, 4
         RETURNING id, leader_id`,
        [hackathonIds, names, descriptions, neededSkillsArr, leaderIds]
      );

      // Insert leader memberships
      const teamIdList: string[] = [];
      const leaderIdList: string[] = [];
      const hIdList: string[] = [];
      const roles: string[] = [];

      for (const row of teamInsert.rows) {
        allTeamIds.push(row.id);
        teamIdList.push(row.id);
        leaderIdList.push(row.leader_id);
        hIdList.push(hackathonId);
        roles.push('leader');
      }

      await pool.query(
        `INSERT INTO team_members (team_id, user_id, hackathon_id, role)
         SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::varchar[])`,
        [teamIdList, leaderIdList, hIdList, roles]
      );

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

