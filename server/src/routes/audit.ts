import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

export const auditRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/audit
  app.get('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const qSchema = z.object({
      teamId: z.string().uuid().optional(),
      hackathonId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    });

    const parsed = qSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ code: 'validation_error', errors: parsed.error.errors });
    }

    const { teamId, hackathonId, limit } = parsed.data;
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (teamId) {
      conditions.push(`a.team_id = $${idx++}`);
      values.push(teamId);
    }
    if (hackathonId) {
      conditions.push(`a.hackathon_id = $${idx++}`);
      values.push(hackathonId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit);

    const sql = `
      SELECT a.id, a.hackathon_id, a.team_id, a.action, a.details, a.created_at,
             u.id as actor_id, u.name as actor_name, u.email as actor_email
      FROM audit_logs a
      JOIN users u ON u.id = a.actor_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${idx};
    `;

    const result = await query(sql, values);
    return reply.send(result.rows);
  });
};

