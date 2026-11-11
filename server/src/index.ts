import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { pool, query } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { realtimeHub } from './realtime/sse.js';
import { authRoutes } from './routes/auth.js';
import { hackathonRoutes } from './routes/hackathons.js';
import { teamRoutes } from './routes/teams.js';
import { requestRoutes } from './routes/requests.js';
import { suggestionRoutes } from './routes/suggestions.js';
import { auditRoutes } from './routes/audit.js';
import { sseRoutes } from './routes/sse.js';

export async function buildApp() {
  const app = fastify({
    logger: process.env.NODE_ENV !== 'test',
    bodyLimit: 16 * 1024, // 16 KB body limit strictly enforced
  });

  // 1. CORS
  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['Idempotent-Replayed'],
  });

  // 2. JWT Authentication
  await app.register(jwt, {
    secret: config.jwtSecret,
  });

  // 3. Rate Limiting (Spec: uniform protection against brute-force)
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user ? user.id : req.ip;
    },
    errorResponseBuilder: (req, context) => ({
      code: 'rate_limit_exceeded',
      message: `Too many requests. Please retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });

  // 4. Global Error Handler
  app.setErrorHandler((error: any, req, reply) => {
    if (error.code === '57014' || error.message?.includes('statement timeout')) {
      return reply.status(503).header('Retry-After', '2').send({
        code: 'database_timeout',
        message: 'The operation timed out under heavy load. Please retry.',
      });
    }

    if (error.code === '40P01') {
      return reply.status(503).header('Retry-After', '1').send({
        code: 'deadlock_retry',
        message: 'Concurrency conflict detected. Please retry.',
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        code: 'validation_error',
        message: error.message,
        errors: error.validation,
      });
    }

    req.log.error(error);
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      code: error.code || 'internal_error',
      message: error.message || 'An internal server error occurred.',
    });
  });

  // 5. Health & Metrics Endpoint
  app.get('/health', async (req, reply) => {
    let dbStatus = 'healthy';
    let dbLatencyMs = 0;
    try {
      const start = Date.now();
      await query('SELECT 1;');
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'unreachable';
    }

    const memoryUsage = process.memoryUsage();

    return reply.send({
      status: dbStatus === 'healthy' ? 'pass' : 'fail',
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount,
      },
      system: {
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
    });
  });

  // 6. Register API Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(hackathonRoutes, { prefix: '/api/hackathons' });
  await app.register(teamRoutes, { prefix: '/api/teams' });
  await app.register(requestRoutes, { prefix: '/api/requests' });
  await app.register(suggestionRoutes, { prefix: '/api/teams' });
  await app.register(auditRoutes, { prefix: '/api/audit' });
  await app.register(sseRoutes, { prefix: '/api/realtime' });

  return app;
}

export async function startServer() {
  const app = await buildApp();

  try {
    // Auto-run schema migrations to ensure database tables are created
    try {
      await runMigrations();
    } catch (migErr: any) {
      console.warn('[Startup] Migration notice:', migErr.message);
    }

    // Start SSE listener
    await realtimeHub.startListener();

    await app.listen({ port: config.port, host: config.host });
    console.log(`[Fastify] Server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Fastify] Shutting down gracefully...');
    realtimeHub.destroy();
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js')) {
  startServer();
}
