import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { requireAuth } from '../middleware/auth.js';

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(100),
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
  skills: z.array(z.string()).default([]),
  interests: z.array(z.string()).default([]),
  timezoneOffsetMinutes: z.number().int().min(-720).max(720).default(0),
  discoveryEnabled: z.boolean().default(true),
});

const loginSchema = z.object({
  email: z.string().trim().min(1).optional(),
  username: z.string().trim().min(1).optional(),
  password: z.string(),
}).refine((value) => value.email || value.username, {
  message: 'Username or email is required',
});

export const authRoutes: FastPluginAsync = async (app: FastifyInstance) => {
  // Ensure role column exists (idempotent)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'`);

  const adminUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminUsername || adminPassword) {
    if (!adminUsername || !adminPassword) {
      throw new Error('Both ADMIN_USERNAME and ADMIN_PASSWORD must be configured together');
    }
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(adminUsername)) {
      throw new Error('ADMIN_USERNAME must be 3-32 characters: letters, numbers, dots, underscores, or hyphens');
    }
    if (adminPassword.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    }

    const passwordHash = await hashPassword(adminPassword);
    await query(
      `INSERT INTO users (email, username, password_hash, name, role)
       VALUES ($1, $2, $3, $2, 'admin')
       ON CONFLICT (username) WHERE username IS NOT NULL
       DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
      [`${adminUsername}@accounts.invalid`, adminUsername, passwordHash]
    );
  }

  // POST /api/auth/register
  app.post('/register', async (req, reply) => {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: 'validation_error',
        message: 'Invalid registration input',
        errors: parseResult.error.errors,
      });
    }

    const { email, password, name, avatarUrl, skills, interests, timezoneOffsetMinutes, discoveryEnabled } = parseResult.data;

    // Check email uniqueness
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.status(409).send({
        code: 'email_taken',
        message: 'An account with this email address already exists.',
      });
    }

    const passwordHash = await hashPassword(password);
    const result = await query(
      `INSERT INTO users (email, password_hash, name, avatar_url, skills, interests, timezone_offset_minutes, discovery_enabled, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, email, name, avatar_url, skills, interests, timezone_offset_minutes, discovery_enabled, created_at, role`,
      [email, passwordHash, name, avatarUrl || null, skills, interests, timezoneOffsetMinutes, discoveryEnabled, 'user']
    );
    const user = result.rows[0];
    const token = app.jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role });

    return reply.status(201).send({ user, token });
  });

  // POST /api/auth/login
  app.post('/login', async (req, reply) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: 'validation_error',
        message: 'Username or email and password are required',
      });
    }

    const { email, username, password } = parseResult.data;
    const identifier = username || email!;
    const result = await query(
      `SELECT id, email, username, password_hash, name, avatar_url, role, skills, interests, timezone_offset_minutes, discovery_enabled, created_at
       FROM users WHERE email = $1 OR username = $2`,
      [identifier, identifier.toLowerCase()]
    );

    if (result.rowCount === 0) {
      return reply.status(401).send({ code: 'invalid_credentials', message: 'Invalid username/email or password.' });
    }

    const userRow = result.rows[0];
    const isValid = await verifyPassword(password, userRow.password_hash);
    if (!isValid) {
      return reply.status(401).send({ code: 'invalid_credentials', message: 'Invalid username/email or password.' });
    }

    const token = app.jwt.sign({ id: userRow.id, email: userRow.email, name: userRow.name, role: userRow.role });
    const { password_hash, ...user } = userRow;

    return reply.send({ user, token });
  });

  // GET /api/auth/me
  app.get('/me', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as any).id;
    const userResult = await query(
      `SELECT id, email, username, name, avatar_url, role, skills, interests, timezone_offset_minutes, discovery_enabled, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rowCount === 0) {
      return reply.status(404).send({ code: 'user_not_found', message: 'User not found' });
    }

    const membershipResult = await query(
      `SELECT tm.team_id, tm.role, tm.joined_at, t.name as team_name, t.hackathon_id
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = $1`,
      [userId]
    );

    const pendingResult = await query(
      `SELECT jr.id, jr.team_id, jr.status, jr.created_at, t.name as team_name
       FROM join_requests jr
       JOIN teams t ON t.id = jr.team_id
       WHERE jr.user_id = $1 AND jr.status = 'pending'`,
      [userId]
    );

    return reply.send({
      user: userResult.rows[0],
      membership: membershipResult.rows[0] || null,
      pendingRequests: pendingResult.rows,
    });
  });
};

type FastPluginAsync = FastifyPluginAsync;
