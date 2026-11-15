import fs from 'fs';
import path from 'path';
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
import { adminRoutes } from './routes/admin.js';
import { sseRoutes } from './routes/sse.js';
import { installBoardHttpCache } from './middleware/httpCache.js';

export async function buildApp() {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'warn', // Only log warnings/errors (avoids stdout terminal blocking)
    },
    disableRequestLogging: true, // Disables synchronous per-request terminal dumping
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

  // 3. High-Throughput Rate Limiting (configurable for extreme 100k+ load tests)
  const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '500000', 10);
  await app.register(rateLimit, {
    max: rateLimitMax,
    timeWindow: '1 minute',
    allowList: process.env.DISABLE_RATE_LIMIT === 'true' ? ['127.0.0.1', '::1', 'localhost'] : undefined,
    keyGenerator: (req) => {
      const user = (req as any).user;
      return user ? user.id : req.ip;
    },
    errorResponseBuilder: (req, context) => ({
      statusCode: 429,
      code: 'rate_limit_exceeded',
      message: `Too many requests. Please retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  });

  // 4. Global Error Handler
  app.setErrorHandler((error: any, req, reply) => {
    // Rate limit handling (HTTP 429)
    if (error.statusCode === 429 || error.code === 'rate_limit_exceeded') {
      return reply.status(429).header('Retry-After', String(error.retryAfter || 5)).send({
        code: 'rate_limit_exceeded',
        message: error.message || 'Rate limit exceeded. Please retry shortly.',
        retryAfter: error.retryAfter || 5,
      });
    }

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

  // Per-request server-side timing, so a slow client can be told apart from a
  // slow handler. `Server-Timing: app;dur=` is the handler time measured inside
  // Node; compare it with the client-observed TTFB to see where the time went.
  // onSend (not onResponse): by onResponse the headers are already flushed.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('Server-Timing', `app;dur=${reply.elapsedTime.toFixed(2)}`);
    return payload;
  });

  // Root Route: Serves React SPA when requested from browser, or JSON status info
  app.get('/', async (req, reply) => {
    const acceptsHtml = req.headers.accept?.includes('text/html');
    const p1 = path.resolve(process.cwd(), '../client/dist/index.html');
    const p2 = path.resolve(process.cwd(), 'client/dist/index.html');
    const indexPath = fs.existsSync(p1) ? p1 : fs.existsSync(p2) ? p2 : null;

    if (acceptsHtml && indexPath) {
      const html = fs.readFileSync(indexPath, 'utf-8');
      return reply.type('text/html').send(html);
    }

    return reply.send({
      service: 'Race-Proof Team Formation Platform (PS1)',
      version: '1.0.0',
      status: 'operational',
      health: '/health',
      endpoints: {
        hackathons: '/api/hackathons',
        teamsBoard: '/api/teams',
        auth: '/api/auth',
        requests: '/api/requests',
        suggestions: '/api/teams/:id/suggestions',
        audit: '/api/audit',
        realtimeStream: '/api/realtime/stream',
      },
      clientDevUrl: 'http://localhost:5173',
      message: 'Backend API is active. Open http://localhost:5173 for Vite dev or browse this server.',
    });
  });

  // Static Assets handler (serves React build chunks)
  app.get('/assets/*', async (req, reply) => {
    const assetRel = (req.params as any)['*'];
    const p1 = path.resolve(process.cwd(), '../client/dist/assets', assetRel);
    const p2 = path.resolve(process.cwd(), 'client/dist/assets', assetRel);
    const assetPath = fs.existsSync(p1) ? p1 : fs.existsSync(p2) ? p2 : null;

    if (assetPath) {
      if (assetPath.endsWith('.js')) reply.type('application/javascript');
      else if (assetPath.endsWith('.css')) reply.type('text/css');
      else if (assetPath.endsWith('.svg')) reply.type('image/svg+xml');
      return reply.send(fs.createReadStream(assetPath));
    }
    return reply.status(404).send({ error: 'Asset not found' });
  });

  // SPA Fallback Handler: Serves index.html for non-API web requests
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && req.headers.accept?.includes('text/html')) {
      const p1 = path.resolve(process.cwd(), '../client/dist/index.html');
      const p2 = path.resolve(process.cwd(), 'client/dist/index.html');
      const indexPath = fs.existsSync(p1) ? p1 : fs.existsSync(p2) ? p2 : null;
      if (indexPath) {
        const html = fs.readFileSync(indexPath, 'utf-8');
        return reply.type('text/html').send(html);
      }
    }
    return reply.status(404).send({
      code: 'not_found',
      message: `Route ${req.method}:${req.url} not found`,
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
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(sseRoutes, { prefix: '/api/realtime' });

  // 7. Serve cached board reads straight from the HTTP layer (in-process edge cache)
  installBoardHttpCache(app);

  return app;
}

export async function startServer() {
  try {
    await runMigrations();
  } catch (err) {
    console.error('[Startup] Database migrations failed; refusing to start:', err);
    process.exit(1);
  }

  const app = await buildApp();
  try {
    // Start SSE listener
    await realtimeHub.startListener();

    // Backlog raised from Node's 511 default: at high VU counts a burst of new
  // connections can otherwise overflow the accept queue and be refused outright.
  await app.listen({ port: config.port, host: config.host, backlog: 4096 });
    console.log(`[Fastify] Server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    console.error('[Startup] Failed to start server:', err);
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
