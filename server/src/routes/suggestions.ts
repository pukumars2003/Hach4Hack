import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { scoreCandidate, TeamProfile, CandidateUser } from '../utils/scoring.js';

export const suggestionRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/teams/:id/suggestions
  app.get('/:id/suggestions', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: teamId } = req.params as { id: string };
    const callerId = (req.user as any).id;

    // 1. Fetch team details
    const teamRes = await query(
      `SELECT id, hackathon_id, name, needed_skills, member_count, max_members
       FROM teams 
       WHERE id = $1`,
      [teamId]
    );

    if (teamRes.rowCount === 0) {
      return reply.status(404).send({ code: 'team_not_found', message: 'Team not found.' });
    }
    const team = teamRes.rows[0];

    // 2. Fetch current team members
    const membersRes = await query(
      `SELECT tm.user_id, u.skills, u.interests, u.timezone_offset_minutes
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1`,
      [teamId]
    );

    const existingSkills: string[] = [];
    const combinedInterests: string[] = [];
    const tzOffsets: number[] = [];

    for (const m of membersRes.rows) {
      existingSkills.push(...(m.skills || []));
      combinedInterests.push(...(m.interests || []));
      tzOffsets.push(m.timezone_offset_minutes || 0);
    }

    // Compute median timezone offset
    tzOffsets.sort((a, b) => a - b);
    const medianTimezoneOffset = tzOffsets.length > 0
      ? tzOffsets[Math.floor(tzOffsets.length / 2)]
      : 0;

    const teamProfile: TeamProfile = {
      id: teamId,
      neededSkills: team.needed_skills || [],
      existingSkills,
      medianTimezoneOffset,
      combinedInterests,
    };

    // 3. Narrow pool via SQL (not on any team in this hackathon, discoverable, excluding caller)
    // Limits to 500 candidates for fast application-layer scoring
    const candidatesRes = await query(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.skills, u.interests, u.timezone_offset_minutes
       FROM users u
       WHERE u.discovery_enabled = true
         AND u.id != $1
         AND NOT EXISTS (
           SELECT 1 FROM team_members tm
           WHERE tm.hackathon_id = $2 AND tm.user_id = u.id
         )
       LIMIT 500`,
      [callerId, team.hackathon_id]
    );

    // 4. Score all candidates using the exact spec formula
    const scored = candidatesRes.rows.map((row) => {
      const candidate: CandidateUser = {
        id: row.id,
        name: row.name,
        email: row.email,
        avatarUrl: row.avatar_url,
        skills: row.skills || [],
        interests: row.interests || [],
        timezoneOffsetMinutes: row.timezone_offset_minutes || 0,
      };
      return scoreCandidate(teamProfile, candidate);
    });

    // 5. Sort descending by score, tie-break by userId
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.userId.localeCompare(b.userId);
    });

    // Return top 20 suggestions
    return reply.send({
      teamId,
      totalEvaluated: candidatesRes.rowCount,
      suggestions: scored.slice(0, 20),
    });
  });
};

