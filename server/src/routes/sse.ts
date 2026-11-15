import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { realtimeHub } from '../realtime/sse.js';
import { query } from '../db/pool.js';
import { z } from 'zod';

const streamQuerySchema = z.object({
  hackathonId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
}).refine((value) => value.hackathonId || value.teamId, {
  message: 'hackathonId or teamId is required',
});

export const sseRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/realtime/stream
  app.get('/stream', async (req, reply) => {
    const parsed = streamQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ code: 'validation_error', errors: parsed.error.errors });
    }
    const { hackathonId, teamId } = parsed.data;

    let authenticatedUserId: string | null = null;
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (teamId && !bearer) {
      return reply.status(401).send({ code: 'unauthorized', message: 'Authentication is required for team updates.' });
    }
    if (bearer) {
      try {
        const decoded: any = app.jwt.verify(bearer);
        if (typeof decoded.id !== 'string') {
          throw new Error('Access token has no user identity.');
        }
        authenticatedUserId = decoded.id;
      } catch {
        if (teamId) {
          return reply.status(401).send({ code: 'unauthorized', message: 'The access token is invalid or expired.' });
        }
      }
    }

    if (teamId && authenticatedUserId) {
      const membership = await query(
        `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`,
        [teamId, authenticatedUserId]
      );
      if (membership.rowCount === 0) {
        return reply.status(403).send({ code: 'not_a_member', message: 'Only team members can subscribe to team updates.' });
      }
    }

    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    // Initial greeting
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: Date.now() })}\n\n`);

    // Subscribe to board channel
    if (hackathonId) {
      realtimeHub.subscribeBoard(hackathonId, reply);
    }

    // Subscribe to team channel (if user is authenticated)
    if (teamId && authenticatedUserId) {
      realtimeHub.subscribeTeam(teamId, authenticatedUserId, reply);
    }

    // Keep stream open
    return new Promise(() => {});
  });
};

