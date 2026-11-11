import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { realtimeHub } from '../realtime/sse.js';

export const sseRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/realtime/stream
  app.get('/stream', async (req, reply) => {
    const { hackathonId, teamId, token } = req.query as {
      hackathonId?: string;
      teamId?: string;
      token?: string;
    };

    // Authenticate token if present (or via header)
    let authenticatedUserId: string | null = null;
    const authHeader = req.headers.authorization;
    const bearer = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : token;

    if (bearer) {
      try {
        const decoded: any = app.jwt.verify(bearer);
        authenticatedUserId = decoded.id;
      } catch {}
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
