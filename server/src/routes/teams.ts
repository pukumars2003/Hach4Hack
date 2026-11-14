import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { withIdempotency, IdempotencyError } from '../middleware/idempotency.js';
import { generateInviteCode, hashInviteCode } from '../utils/crypto.js';
import { boardCache } from '../utils/singleFlight.js';
import { boardQuerySchema, boardCacheKey, fetchBoard, BOARD_RESPONSE_HEADERS } from '../services/board.js';
import { config } from '../config.js';

const createTeamSchema = z.object({
  hackathonId: z.string().uuid(),
  name: z.string().min(2).max(100),
  description: z.string().max(1000).default(''),
  neededSkills: z.array(z.string().max(50)).default([]),
  maxMembers: z.number().int().min(2).max(10).default(4),
});

const updateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional(),
  neededSkills: z.array(z.string().max(50)).optional(),
});

const joinByCodeSchema = z.object({
  code: z.string().min(8).max(30),
});

export const teamRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/teams/lab/batch-racers (Fast racer batch setup for Concurrency Lab)
  app.post('/lab/batch-racers', async (req, reply) => {
    const { count = 50 } = req.body as { count?: number };
    const racerCount = Math.min(Math.max(1, count), 100);
    const ts = Date.now();

    const emails: string[] = [];
    const names: string[] = [];
    const racers: { id: string; name: string; token: string }[] = [];

    for (let i = 0; i < racerCount; i++) {
      emails.push(`lab_racer_${i}_${ts}@hackathon.org`);
      names.push(`Racer #${i + 1}`);
    }

    // Batch insert users in 1 round trip
    const inserted = await query(
      `INSERT INTO users (email, password_hash, name)
       SELECT email, 'scrypt$hash', name
       FROM UNNEST($1::varchar[], $2::varchar[]) AS x(email, name)
       RETURNING id, name, email`,
      [emails, names]
    );

    for (const u of inserted.rows) {
      const token = app.jwt.sign({ id: u.id, email: u.email, name: u.name });
      racers.push({ id: u.id, name: u.name, token });
    }

    return reply.send({ racers });
  });

  // GET /api/teams (Board with Keyset Pagination + 1s Single-Flight Cache)
  app.get('/', async (req, reply) => {
    // Benchmark/diagnostic escape hatch: BOARD_CACHE_DISABLED=1 skips both cache
    // layers (the raw HTTP cache and the route-level serialized/single-flight
    // cache), so every read is served by PostgreSQL. Used by the cold benchmark.
    if (!config.boardCacheEnabled) {
      const parsedCold = boardQuerySchema.safeParse(req.query);
      if (!parsedCold.success) {
        return reply.status(400).send({ code: 'validation_error', errors: parsedCold.error.errors });
      }
      const data = await fetchBoard(parsedCold.data);
      return reply
        .header('X-Cache', 'BYPASS')
        .header('Cache-Control', 'no-store')
        .type('application/json')
        .send(JSON.stringify(data));
    }

    // ── Ultra-fast path ────────────────────────────────────────────────────
    // Serve the already-serialized response for this exact URL. This skips
    // Zod validation, the async single-flight lookup, and JSON.stringify on
    // every cache hit (the common case under real-time board polling/load).
    const fastKey = req.url;
    const cachedBody = boardCache.getSerialized(fastKey);
    if (cachedBody !== undefined) {
      return reply
        .header('X-Cache', 'HIT')
        .header('Cache-Control', 'no-store')
        .type('application/json')
        .send(cachedBody);
    }

    const parsed = boardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ code: 'validation_error', errors: parsed.error.errors });
    }

    const version = boardCache.getVersion();
    const data = await boardCache.do(boardCacheKey(parsed.data), () => fetchBoard(parsed.data));

    // Serialize once, then reuse across every request in the TTL window.
    const body = JSON.stringify(data);
    boardCache.setSerialized(fastKey, body, version, BOARD_RESPONSE_HEADERS);

    return reply
      .header('X-Cache', 'MISS')
      .header('Cache-Control', 'no-store')
      .type('application/json')
      .send(body);
  });

  // GET /api/teams/:id (Detailed View)
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const teamResult = await query(
      `SELECT t.id, t.hackathon_id, t.name, t.description, t.needed_skills,
              t.member_count, t.max_members, t.created_at, t.updated_at,
              t.leader_id, h.min_team_size, h.name as hackathon_name
       FROM teams t
       JOIN hackathons h ON h.id = t.hackathon_id
       WHERE t.id = $1`,
      [id]
    );

    if (teamResult.rowCount === 0) {
      return reply.status(404).send({ code: 'team_not_found', message: 'Team does not exist.' });
    }

    const team = teamResult.rows[0];

    // Get members
    const membersResult = await query(
      `SELECT tm.user_id, tm.role, tm.joined_at, u.name, u.email, u.avatar_url, u.skills, u.timezone_offset_minutes
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY tm.joined_at ASC`,
      [id]
    );

    // Check optional auth for private data
    let isMember = false;
    let isLeader = false;
    try {
      await req.jwtVerify();
      const currentUserId = (req.user as any)?.id;
      isMember = membersResult.rows.some((m) => m.user_id === currentUserId);
      isLeader = team.leader_id === currentUserId;
    } catch {}

    let pendingRequests: any[] = [];
    let inviteCodes: any[] = [];
    let auditLogs: any[] = [];

    if (isLeader) {
      const reqs = await query(
        `SELECT jr.id, jr.user_id, jr.status, jr.message, jr.created_at,
                u.name as user_name, u.email as user_email, u.skills as user_skills, u.timezone_offset_minutes
         FROM join_requests jr
         JOIN users u ON u.id = jr.user_id
         WHERE jr.team_id = $1 AND jr.status = 'pending'
         ORDER BY jr.created_at ASC`,
        [id]
      );
      pendingRequests = reqs.rows;

      const codes = await query(
        `SELECT id, created_at, expires_at, revoked_at
         FROM invite_codes
         WHERE team_id = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()
         ORDER BY created_at DESC`,
        [id]
      );
      inviteCodes = codes.rows;
    }

    if (isMember) {
      const logs = await query(
        `SELECT a.id, a.action, a.details, a.created_at, u.name as actor_name
         FROM audit_logs a
         JOIN users u ON u.id = a.actor_id
         WHERE a.team_id = $1
         ORDER BY a.created_at DESC
         LIMIT 50`,
        [id]
      );
      auditLogs = logs.rows;
    }

    return reply.send({
      ...team,
      status: team.member_count >= team.max_members ? 'full' : (team.member_count >= team.min_team_size ? 'ready' : 'forming'),
      members: membersResult.rows,
      pendingRequests,
      inviteCodes,
      auditLogs,
    });
  });

  // POST /api/teams (Create Team)
  app.post('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = createTeamSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ code: 'validation_error', errors: parse.error.errors });
    }

    const { hackathonId, name, description, neededSkills, maxMembers } = parse.data;
    const userId = (req.user as any).id;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    try {
      const outcome = await withTransaction(async (client) => {
        return withIdempotency(client, userId, idempotencyKey, '/api/teams', req.body, async () => {
          // 1. Check if user already on a team in this hackathon
          const memberCheck = await client.query(
            `SELECT team_id FROM team_members WHERE hackathon_id = $1 AND user_id = $2`,
            [hackathonId, userId]
          );
          if (memberCheck.rowCount && memberCheck.rowCount > 0) {
            throw new IdempotencyError(409, 'already_on_team', 'You are already a member of a team in this hackathon.');
          }

          // 2. Check team name uniqueness
          const nameCheck = await client.query(
            `SELECT id FROM teams WHERE hackathon_id = $1 AND name = $2`,
            [hackathonId, name]
          );
          if (nameCheck.rowCount && nameCheck.rowCount > 0) {
            throw new IdempotencyError(409, 'name_taken', 'A team with this name already exists in this hackathon.');
          }

          // 3. Insert team
          const teamInsert = await client.query(
            `INSERT INTO teams (hackathon_id, name, description, needed_skills, leader_id, member_count, max_members)
             VALUES ($1, $2, $3, $4, $5, 1, $6)
             RETURNING id, hackathon_id, name, description, needed_skills, leader_id, member_count, max_members, created_at`,
            [hackathonId, name, description, neededSkills, userId, maxMembers]
          );
          const newTeam = teamInsert.rows[0];

          // 4. Insert leader membership
          await client.query(
            `INSERT INTO team_members (team_id, user_id, hackathon_id, role)
             VALUES ($1, $2, $3, 'leader')`,
            [newTeam.id, userId, hackathonId]
          );

          // 5. Cancel any pending join requests by this user
          await client.query(
            `UPDATE join_requests 
             SET status = 'cancelled', updated_at = clock_timestamp() 
             WHERE user_id = $1 AND status = 'pending'`,
            [userId]
          );

          // 6. Append audit log
          await client.query(
            `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
             VALUES ($1, $2, $3, 'team_created', $4)`,
            [hackathonId, newTeam.id, userId, JSON.stringify({ teamName: name, maxMembers })]
          );

          // 7. Notify via PostgreSQL LISTEN/NOTIFY
          await client.query(
            `SELECT pg_notify('team_events', $1)`,
            [JSON.stringify({ type: 'team_created', teamId: newTeam.id, hackathonId, actorId: userId })]
          );

          return { statusCode: 201, body: newTeam };
        });
      });

      boardCache.invalidate();
      if (outcome.replayed) {
        reply.header('Idempotent-Replayed', 'true');
      }
      return reply.status(outcome.statusCode).send(outcome.body);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        return reply.status(err.statusCode).send({ code: err.code, message: err.message });
      }
      if (err.code === '23505') {
        // Unique violation
        return reply.status(409).send({ code: 'already_on_team', message: 'You are already on a team.' });
      }
      throw err;
    }
  });

  // POST /api/teams/join-by-code (THE RACE-PROOF LAST SEAT ENFORCER)
  app.post('/join-by-code', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = joinByCodeSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ code: 'validation_error', errors: parse.error.errors });
    }

    const { code } = parse.data;
    const userId = (req.user as any).id;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const codeHash = hashInviteCode(code);

    try {
      const outcome = await withTransaction(async (client) => {
        return withIdempotency(client, userId, idempotencyKey, '/api/teams/join-by-code', req.body, async () => {
          // 1. Validate invite code by hash and expiration against DB clock_timestamp()
          const codeQuery = await client.query(
            `SELECT id, team_id, expires_at, revoked_at
             FROM invite_codes
             WHERE code_hash = $1`,
            [codeHash]
          );

          if (codeQuery.rowCount === 0) {
            throw new IdempotencyError(404, 'invalid_code', 'The invite code is invalid, expired, or revoked.');
          }

          const invite = codeQuery.rows[0];
          if (invite.revoked_at !== null || new Date(invite.expires_at) <= new Date()) {
            throw new IdempotencyError(404, 'invalid_code', 'The invite code is invalid, expired, or revoked.');
          }

          const teamId = invite.team_id;

          // 2. Discover team's hackathonId & check if user is already on a team
          const teamLookup = await client.query(
            `SELECT hackathon_id FROM teams WHERE id = $1`,
            [teamId]
          );
          if (teamLookup.rowCount === 0) {
            throw new IdempotencyError(404, 'team_not_found', 'Target team does not exist.');
          }
          const hackathonId = teamLookup.rows[0].hackathon_id;

          const existingMember = await client.query(
            `SELECT team_id FROM team_members WHERE hackathon_id = $1 AND user_id = $2`,
            [hackathonId, userId]
          );
          if (existingMember.rowCount && existingMember.rowCount > 0) {
            throw new IdempotencyError(409, 'already_on_team', 'You are already a member of a team in this hackathon.');
          }

          // 3. GUARDED ROW-LOCKING UPDATE
          // In READ COMMITTED mode, this locks the team row and rejects any waiter once capacity is reached.
          const updateResult = await client.query(
            `UPDATE teams 
             SET member_count = member_count + 1, updated_at = clock_timestamp()
             WHERE id = $1 AND member_count < max_members
             RETURNING member_count, max_members, name`,
            [teamId]
          );

          if (updateResult.rowCount === 0) {
            // Team is full! Exactly one gets in; all 249 others land here!
            throw new IdempotencyError(409, 'team_full', 'This team has already reached its maximum member capacity.');
          }

          const updatedTeam = updateResult.rows[0];

          // 4. Insert membership (Unique constraint check serves as second line of defense)
          try {
            await client.query(
              `INSERT INTO team_members (team_id, user_id, hackathon_id, role)
               VALUES ($1, $2, $3, 'member')`,
              [teamId, userId, hackathonId]
            );
          } catch (insertErr: any) {
            if (insertErr.code === '23505') {
              throw new IdempotencyError(409, 'already_on_team', 'You are already a member of a team in this hackathon.');
            }
            throw insertErr;
          }

          // 5. Cancel any pending join requests by this user
          await client.query(
            `UPDATE join_requests 
             SET status = 'cancelled', updated_at = clock_timestamp()
             WHERE user_id = $1 AND status = 'pending'`,
            [userId]
          );

          // 6. Write immutable audit log
          await client.query(
            `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
             VALUES ($1, $2, $3, 'member_joined', $4)`,
            [hackathonId, teamId, userId, JSON.stringify({ method: 'invite_code', newMemberCount: updatedTeam.member_count })]
          );

          // 7. Emit pg_notify (delivers ONLY upon commit)
          await client.query(
            `SELECT pg_notify('team_events', $1)`,
            [JSON.stringify({ type: 'member_joined', teamId, hackathonId, userId })]
          );

          return {
            statusCode: 200,
            body: {
              success: true,
              teamId,
              teamName: updatedTeam.name,
              memberCount: updatedTeam.member_count,
              maxMembers: updatedTeam.max_members,
            },
          };
        });
      });

      boardCache.invalidate();
      if (outcome.replayed) {
        reply.header('Idempotent-Replayed', 'true');
      }
      return reply.status(outcome.statusCode).send(outcome.body);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        return reply.status(err.statusCode).send({ code: err.code, message: err.message });
      }
      throw err;
    }
  });

  // POST /api/teams/:id/leave (Leader Promotion & Cascading Deletion)
  app.post('/:id/leave', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: teamId } = req.params as { id: string };
    const userId = (req.user as any).id;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    try {
      const outcome = await withTransaction(async (client) => {
        return withIdempotency(client, userId, idempotencyKey, `/api/teams/${teamId}/leave`, {}, async () => {
          // 1. Lock team row first
          const teamRes = await client.query(
            `SELECT id, hackathon_id, leader_id, member_count, name
             FROM teams 
             WHERE id = $1 
             FOR UPDATE`,
            [teamId]
          );

          if (teamRes.rowCount === 0) {
            throw new IdempotencyError(404, 'team_not_found', 'Team does not exist.');
          }
          const team = teamRes.rows[0];

          // 2. Re-verify membership under lock
          const memRes = await client.query(
            `SELECT role, joined_at 
             FROM team_members 
             WHERE team_id = $1 AND user_id = $2`,
            [teamId, userId]
          );

          if (memRes.rowCount === 0) {
            throw new IdempotencyError(404, 'not_a_member', 'You are not a member of this team.');
          }

          // Case A: Last member leaves -> delete team entirely
          if (team.member_count <= 1) {
            // Delete team; foreign keys CASCADE member rows, codes, and requests
            await client.query(`DELETE FROM teams WHERE id = $1`, [teamId]);

            // Audit log persists because it has no FK constraint to teams!
            await client.query(
              `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
               VALUES ($1, $2, $3, 'team_deleted', $4)`,
              [team.hackathon_id, teamId, userId, JSON.stringify({ reason: 'last_member_left' })]
            );

            await client.query(
              `SELECT pg_notify('team_events', $1)`,
              [JSON.stringify({ type: 'team_deleted', teamId, hackathonId: team.hackathon_id, actorId: userId })]
            );

            return {
              statusCode: 200,
              body: { success: true, message: 'Team deleted as last member left.', teamDeleted: true },
            };
          }

          // Case B: More than 1 member left
          let newLeaderId = team.leader_id;
          if (team.leader_id === userId) {
            // Leader is leaving: promote longest-standing member (joined_at ASC, user_id ASC)
            const successorRes = await client.query(
              `SELECT user_id 
               FROM team_members 
               WHERE team_id = $1 AND user_id != $2 
               ORDER BY joined_at ASC, user_id ASC 
               LIMIT 1 
               FOR UPDATE`,
              [teamId, userId]
            );

            if (successorRes.rowCount && successorRes.rowCount > 0) {
              newLeaderId = successorRes.rows[0].user_id;

              // Update team leader
              await client.query(`UPDATE teams SET leader_id = $1 WHERE id = $2`, [newLeaderId, teamId]);
              // Update member role
              await client.query(
                `UPDATE team_members SET role = 'leader' WHERE team_id = $1 AND user_id = $2`,
                [teamId, newLeaderId]
              );

              await client.query(
                `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
                 VALUES ($1, $2, $3, 'leader_transferred', $4)`,
                [team.hackathon_id, teamId, userId, JSON.stringify({ newLeaderId, reason: 'leader_left' })]
              );
            }
          }

          // Delete leaving member
          await client.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);

          // Guarded member_count decrement
          const updateTeam = await client.query(
            `UPDATE teams 
             SET member_count = member_count - 1, updated_at = clock_timestamp() 
             WHERE id = $1 
             RETURNING member_count`,
            [teamId]
          );

          await client.query(
            `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
             VALUES ($1, $2, $3, 'member_left', $4)`,
            [team.hackathon_id, teamId, userId, JSON.stringify({ newLeaderId })]
          );

          await client.query(
            `SELECT pg_notify('team_events', $1)`,
            [JSON.stringify({ type: 'member_left', teamId, hackathonId: team.hackathon_id, userId, newLeaderId })]
          );

          return {
            statusCode: 200,
            body: {
              success: true,
              message: 'Successfully left the team.',
              teamDeleted: false,
              newLeaderId,
              remainingMembers: updateTeam.rows[0].member_count,
            },
          };
        });
      });

      boardCache.invalidate();
      return reply.status(outcome.statusCode).send(outcome.body);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        return reply.status(err.statusCode).send({ code: err.code, message: err.message });
      }
      throw err;
    }
  });

  // POST /api/teams/:id/remove-member (Leader Only)
  app.post('/:id/remove-member', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: teamId } = req.params as { id: string };
    const { targetUserId } = req.body as { targetUserId: string };
    const callerId = (req.user as any).id;

    if (!targetUserId) {
      return reply.status(400).send({ code: 'validation_error', message: 'targetUserId is required' });
    }

    try {
      const outcome = await withTransaction(async (client) => {
        // Lock team
        const teamRes = await client.query(
          `SELECT id, hackathon_id, leader_id, member_count FROM teams WHERE id = $1 FOR UPDATE`,
          [teamId]
        );
        if (teamRes.rowCount === 0) {
          throw new IdempotencyError(404, 'team_not_found', 'Team does not exist');
        }
        const team = teamRes.rows[0];

        if (team.leader_id !== callerId) {
          throw new IdempotencyError(403, 'not_leader', 'Only the team leader can remove members.');
        }

        if (targetUserId === callerId) {
          throw new IdempotencyError(409, 'cannot_remove_self', 'Leader cannot remove themselves; use leave instead.');
        }

        // Verify target is member
        const memRes = await client.query(
          `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING user_id`,
          [teamId, targetUserId]
        );

        if (memRes.rowCount === 0) {
          throw new IdempotencyError(404, 'target_not_member', 'Target user is not a member of this team.');
        }

        await client.query(
          `UPDATE teams SET member_count = member_count - 1, updated_at = clock_timestamp() WHERE id = $1`,
          [teamId]
        );

        await client.query(
          `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
           VALUES ($1, $2, $3, 'member_removed', $4)`,
          [team.hackathon_id, teamId, callerId, JSON.stringify({ targetUserId })]
        );

        await client.query(
          `SELECT pg_notify('team_events', $1)`,
          [JSON.stringify({ type: 'member_removed', teamId, hackathonId: team.hackathon_id, targetUserId })]
        );

        return { statusCode: 200, body: { success: true, removedUserId: targetUserId } };
      });

      boardCache.invalidate();
      return reply.status(outcome.statusCode).send(outcome.body);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        return reply.status(err.statusCode).send({ code: err.code, message: err.message });
      }
      throw err;
    }
  });

  // POST /api/teams/:id/invites (Leader Creates Invite Code)
  app.post('/:id/invites', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: teamId } = req.params as { id: string };
    const callerId = (req.user as any).id;
    const { expiresInHours = 24 } = req.body as { expiresInHours?: number };

    const hours = Math.min(Math.max(1, expiresInHours), 168); // 1h to 7d

    try {
      const outcome = await withTransaction(async (client) => {
        const teamRes = await client.query(`SELECT leader_id, hackathon_id FROM teams WHERE id = $1 FOR UPDATE`, [teamId]);
        if (teamRes.rowCount === 0) {
          throw new IdempotencyError(404, 'team_not_found', 'Team not found');
        }
        if (teamRes.rows[0].leader_id !== callerId) {
          throw new IdempotencyError(403, 'not_leader', 'Only the team leader can generate invite codes.');
        }

        const rawCode = generateInviteCode();
        const codeHash = hashInviteCode(rawCode);

        const insert = await client.query(
          `INSERT INTO invite_codes (team_id, code_hash, created_by, expires_at)
           VALUES ($1, $2, $3, clock_timestamp() + ($4 || ' hours')::interval)
           RETURNING id, expires_at, created_at`,
          [teamId, codeHash, callerId, hours]
        );

        await client.query(
          `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
           VALUES ($1, $2, $3, 'invite_created', $4)`,
          [teamRes.rows[0].hackathon_id, teamId, callerId, JSON.stringify({ inviteId: insert.rows[0].id, expiresInHours: hours })]
        );

        return {
          statusCode: 201,
          body: {
            id: insert.rows[0].id,
            code: rawCode, // RETURNED ONCE!
            expiresAt: insert.rows[0].expires_at,
          },
        };
      });

      return reply.status(outcome.statusCode).send(outcome.body);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        return reply.status(err.statusCode).send({ code: err.code, message: err.message });
      }
      throw err;
    }
  });

  // DELETE /api/teams/:id/invites/:inviteId (Leader Revokes Invite)
  app.delete('/:id/invites/:inviteId', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: teamId, inviteId } = req.params as { id: string; inviteId: string };
    const callerId = (req.user as any).id;

    const teamRes = await query(`SELECT leader_id, hackathon_id FROM teams WHERE id = $1`, [teamId]);
    if (teamRes.rowCount === 0) {
      return reply.status(404).send({ code: 'team_not_found', message: 'Team not found' });
    }
    if (teamRes.rows[0].leader_id !== callerId) {
      return reply.status(403).send({ code: 'not_leader', message: 'Only the team leader can revoke invite codes.' });
    }

    const revoke = await query(
      `UPDATE invite_codes SET revoked_at = clock_timestamp() WHERE id = $1 AND team_id = $2 RETURNING id`,
      [inviteId, teamId]
    );

    if (revoke.rowCount === 0) {
      return reply.status(404).send({ code: 'invite_not_found', message: 'Invite not found.' });
    }

    await query(
      `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
       VALUES ($1, $2, $3, 'invite_revoked', $4)`,
      [teamRes.rows[0].hackathon_id, teamId, callerId, JSON.stringify({ inviteId })]
    );

    return reply.send({ success: true, message: 'Invite code revoked.' });
  });

  // PATCH /api/teams/:id (Leader Edits Profile)
  app.patch('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: teamId } = req.params as { id: string };
    const callerId = (req.user as any).id;
    const parse = updateTeamSchema.safeParse(req.body);

    if (!parse.success) {
      return reply.status(400).send({ code: 'validation_error', errors: parse.error.errors });
    }

    const { name, description, neededSkills } = parse.data;

    try {
      const outcome = await withTransaction(async (client) => {
        const teamRes = await client.query(`SELECT leader_id, hackathon_id, name FROM teams WHERE id = $1 FOR UPDATE`, [teamId]);
        if (teamRes.rowCount === 0) {
          throw new IdempotencyError(404, 'team_not_found', 'Team not found');
        }
        if (teamRes.rows[0].leader_id !== callerId) {
          throw new IdempotencyError(403, 'not_leader', 'Only the team leader can edit team profile.');
        }

        if (name && name !== teamRes.rows[0].name) {
          const nameCheck = await client.query(
            `SELECT id FROM teams WHERE hackathon_id = $1 AND name = $2 AND id != $3`,
            [teamRes.rows[0].hackathon_id, name, teamId]
          );
          if (nameCheck.rowCount && nameCheck.rowCount > 0) {
            throw new IdempotencyError(409, 'name_taken', 'Team name already in use in this hackathon.');
          }
        }

        const updates: string[] = ['updated_at = clock_timestamp()'];
        const values: any[] = [];
        let idx = 1;

        if (name) { updates.push(`name = $${idx++}`); values.push(name); }
        if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
        if (neededSkills) { updates.push(`needed_skills = $${idx++}`); values.push(neededSkills); }

        values.push(teamId);
        const sql = `UPDATE teams SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await client.query(sql, values);

        await client.query(
          `SELECT pg_notify('team_events', $1)`,
          [JSON.stringify({ type: 'team_updated', teamId, hackathonId: teamRes.rows[0].hackathon_id })]
        );

        return { statusCode: 200, body: result.rows[0] };
      });

      boardCache.invalidate();
      return reply.status(outcome.statusCode).send(outcome.body);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        return reply.status(err.statusCode).send({ code: err.code, message: err.message });
      }
      throw err;
    }
  });
};

