import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';

export const hackathonRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/hackathons
  app.get('/', async (req, reply) => {
    let result = await query(
      `SELECT id, name, slug, min_team_size, max_team_size, is_active, created_at 
       FROM hackathons 
       ORDER BY created_at DESC`
    );

    // Auto-seed default hackathon if database is fresh
    if (result.rowCount === 0) {
      const seeded = await query(
        `INSERT INTO hackathons (name, slug, min_team_size, max_team_size, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, slug, min_team_size, max_team_size, is_active, created_at`,
        ['Hach4Hack Concurrency Championship 2026', 'hack4hack-2026', 2, 4, true]
      );
      result = seeded;
    }

    return reply.send(result.rows);
  });

  // GET /api/hackathons/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await query(
      `SELECT id, name, slug, min_team_size, max_team_size, is_active, created_at 
       FROM hackathons 
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({
        code: 'hackathon_not_found',
        message: 'Hackathon does not exist.',
      });
    }

    return reply.send(result.rows[0]);
  });
};

