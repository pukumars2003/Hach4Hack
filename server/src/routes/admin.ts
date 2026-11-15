import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAdmin } from '../middleware/admin.js';

export const adminRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'`);

  // GET /api/admin/users — paginated user directory for the admin dashboard.
  app.get('/users', { preHandler: [requireAdmin] }, async (req, reply) => {
    const parsed = z
      .object({
        search: z.string().trim().max(100).default(''),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .safeParse(req.query);

    if (!parsed.success) {
      return reply.status(400).send({ code: 'validation_error', errors: parsed.error.errors });
    }

    const { search, limit, offset } = parsed.data;
    const like = `%${search}%`;
    const where = search
      ? `WHERE u.name ILIKE $1 OR u.email ILIKE $1 OR COALESCE(u.username, '') ILIKE $1`
      : '';
    const userParams = search ? [like, limit, offset] : [limit, offset];
    const countParams = search ? [like] : [];

    const [usersResult, countResult, statsResult] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.email, u.username, u.role, u.created_at,
                tm.team_id, t.name AS team_name, tm.role AS team_role
         FROM users u
         LEFT JOIN team_members tm ON tm.user_id = u.id
         LEFT JOIN teams t ON t.id = tm.team_id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${search ? 2 : 1} OFFSET $${search ? 3 : 2}`,
        userParams
      ),
      query(`SELECT count(*)::int AS total FROM users u ${where}`, countParams),
      query(
        `SELECT
           (SELECT count(*)::int FROM users) AS total_users,
           (SELECT count(*)::int FROM users WHERE role = 'admin') AS admin_users,
           (SELECT count(DISTINCT user_id)::int FROM team_members) AS users_with_teams,
           (SELECT count(*)::int FROM teams) AS total_teams`
      ),
    ]);

    return reply.send({
      users: usersResult.rows,
      total: countResult.rows[0].total,
      limit,
      offset,
      stats: statsResult.rows[0],
    });
  });
};