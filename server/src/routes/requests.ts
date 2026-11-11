import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { IdempotencyError } from '../middleware/idempotency.js';
import { boardCache } from '../utils/singleFlight.js';

const createRequestSchema = z.object({
  teamId: z.string().uuid(),
  message: z.string().max(280).default(''),
});

export const requestRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/requests (Request to join a team)
  app.post('/', { preHandler: [requireAuth] }, async (req, reply) => {
    const parse = createRequestSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ code: 'validation_error', errors: parse.error.errors });
    }

    const { teamId, message } = parse.data;
    const userId = (req.user as any).id;

    const teamLookup = await query(`SELECT hackathon_id, member_count, max_members FROM teams WHERE id = $1`, [teamId]);
    if (teamLookup.rowCount === 0) {
      return reply.status(404).send({ code: 'team_not_found', message: 'Team does not exist.' });
    }
    const team = teamLookup.rows[0];

    // Check if user already on a team
    const memberCheck = await query(
      `SELECT team_id FROM team_members WHERE hackathon_id = $1 AND user_id = $2`,
      [team.hackathon_id, userId]
    );
    if (memberCheck.rowCount && memberCheck.rowCount > 0) {
      return reply.status(409).send({ code: 'already_on_team', message: 'You are already a member of a team in this hackathon.' });
    }

    // Check if team is already full
    if (team.member_count >= team.max_members) {
      return reply.status(409).send({ code: 'team_full', message: 'Team is already at maximum capacity.' });
    }

    // Insert pending request
    try {
      const result = await query(
        `INSERT INTO join_requests (team_id, user_id, message, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id, team_id, user_id, message, status, created_at`,
        [teamId, userId, message]
      );

      await query(
        `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
         VALUES ($1, $2, $3, 'request_created', $4)`,
        [team.hackathon_id, teamId, userId, JSON.stringify({ requestId: result.rows[0].id })]
      );

      await query(
        `SELECT pg_notify('team_events', $1)`,
        [JSON.stringify({ type: 'request_created', teamId, hackathonId: team.hackathon_id, userId })]
      );

      return reply.status(201).send(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({
          code: 'request_exists',
          message: 'You already have a pending join request for this team.',
        });
      }
      throw err;
    }
  });

  // POST /api/requests/:id/accept (Leader Only)
  app.post('/:id/accept', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: requestId } = req.params as { id: string };
    const callerId = (req.user as any).id;

    try {
      const outcome = await withTransaction(async (client) => {
        // 1. Lock the request row
        const reqRes = await client.query(
          `SELECT id, team_id, user_id, status FROM join_requests WHERE id = $1 FOR UPDATE`,
          [requestId]
        );
        if (reqRes.rowCount === 0) {
          throw new IdempotencyError(404, 'request_not_found', 'Join request not found.');
        }
        const request = reqRes.rows[0];

        if (request.status !== 'pending') {
          throw new IdempotencyError(409, 'request_not_pending', `Request is already ${request.status}.`);
        }

        // 2. Lock the team row
        const teamRes = await client.query(
          `SELECT id, hackathon_id, leader_id, member_count, max_members 
           FROM teams 
           WHERE id = $1 
           FOR UPDATE`,
          [request.team_id]
        );
        if (teamRes.rowCount === 0) {
          throw new IdempotencyError(404, 'team_not_found', 'Team not found.');
        }
        const team = teamRes.rows[0];

        if (team.leader_id !== callerId) {
          throw new IdempotencyError(403, 'not_leader', 'Only the team leader can accept join requests.');
        }

        // 3. Verify team capacity
        if (team.member_count >= team.max_members) {
          throw new IdempotencyError(409, 'team_full', 'Cannot accept: team is at maximum capacity.');
        }

        // 4. Verify requester hasn't joined another team in the meantime
        const requesterMem = await client.query(
          `SELECT team_id FROM team_members WHERE hackathon_id = $1 AND user_id = $2`,
          [team.hackathon_id, request.user_id]
        );
        if (requesterMem.rowCount && requesterMem.rowCount > 0) {
          // Requester joined elsewhere: cancel this request
          await client.query(`UPDATE join_requests SET status = 'cancelled' WHERE id = $1`, [requestId]);
          throw new IdempotencyError(409, 'already_on_team', 'Requester has already joined another team in this hackathon.');
        }

        // 5. Update team member_count
        const updateTeam = await client.query(
          `UPDATE teams 
           SET member_count = member_count + 1, updated_at = clock_timestamp() 
           WHERE id = $1 AND member_count < max_members 
           RETURNING member_count`,
          [team.id]
        );
        if (updateTeam.rowCount === 0) {
          throw new IdempotencyError(409, 'team_full', 'Team capacity reached.');
        }

        // 6. Insert new member
        await client.query(
          `INSERT INTO team_members (team_id, user_id, hackathon_id, role)
           VALUES ($1, $2, $3, 'member')`,
          [team.id, request.user_id, team.hackathon_id]
        );

        // 7. Mark request accepted
        await client.query(
          `UPDATE join_requests SET status = 'accepted', updated_at = clock_timestamp() WHERE id = $1`,
          [requestId]
        );

        // 8. Cancel requester's other pending requests
        await client.query(
          `UPDATE join_requests 
           SET status = 'cancelled', updated_at = clock_timestamp() 
           WHERE user_id = $1 AND id != $2 AND status = 'pending'`,
          [request.user_id, requestId]
        );

        // 9. Write audit log
        await client.query(
          `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
           VALUES ($1, $2, $3, 'request_accepted', $4)`,
          [team.hackathon_id, team.id, callerId, JSON.stringify({ requestId, acceptedUserId: request.user_id })]
        );

        // 10. Emit pg_notify
        await client.query(
          `SELECT pg_notify('team_events', $1)`,
          [JSON.stringify({ type: 'member_joined', teamId: team.id, hackathonId: team.hackathon_id, userId: request.user_id })]
        );

        return {
          statusCode: 200,
          body: { success: true, message: 'Join request accepted.', memberCount: updateTeam.rows[0].member_count },
        };
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

  // POST /api/requests/:id/decline (Leader Only)
  app.post('/:id/decline', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: requestId } = req.params as { id: string };
    const callerId = (req.user as any).id;

    try {
      const outcome = await withTransaction(async (client) => {
        const reqRes = await client.query(
          `SELECT id, team_id, user_id, status FROM join_requests WHERE id = $1 FOR UPDATE`,
          [requestId]
        );
        if (reqRes.rowCount === 0) {
          throw new IdempotencyError(404, 'request_not_found', 'Join request not found.');
        }
        const request = reqRes.rows[0];

        if (request.status !== 'pending') {
          throw new IdempotencyError(409, 'request_not_pending', `Request is already ${request.status}.`);
        }

        const teamRes = await client.query(`SELECT leader_id, hackathon_id FROM teams WHERE id = $1 FOR UPDATE`, [request.team_id]);
        if (teamRes.rowCount === 0) {
          throw new IdempotencyError(404, 'team_not_found', 'Team not found.');
        }
        if (teamRes.rows[0].leader_id !== callerId) {
          throw new IdempotencyError(403, 'not_leader', 'Only the team leader can decline join requests.');
        }

        await client.query(
          `UPDATE join_requests SET status = 'declined', updated_at = clock_timestamp() WHERE id = $1`,
          [requestId]
        );

        await client.query(
          `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
           VALUES ($1, $2, $3, 'request_declined', $4)`,
          [teamRes.rows[0].hackathon_id, request.team_id, callerId, JSON.stringify({ requestId, declinedUserId: request.user_id })]
        );

        await client.query(
          `SELECT pg_notify('team_events', $1)`,
          [JSON.stringify({ type: 'request_declined', teamId: request.team_id, userId: request.user_id })]
        );

        return { statusCode: 200, body: { success: true, message: 'Request declined.' } };
      });

      return reply.status(outcome.statusCode).send(outcome.body);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        return reply.status(err.statusCode).send({ code: err.code, message: err.message });
      }
      throw err;
    }
  });

  // DELETE /api/requests/:id (Requester cancels their own request)
  app.delete('/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id: requestId } = req.params as { id: string };
    const callerId = (req.user as any).id;

    const res = await query(
      `UPDATE join_requests 
       SET status = 'cancelled', updated_at = clock_timestamp() 
       WHERE id = $1 AND user_id = $2 AND status = 'pending' 
       RETURNING team_id`,
      [requestId, callerId]
    );

    if (res.rowCount === 0) {
      return reply.status(409).send({
        code: 'cannot_cancel',
        message: 'Request could not be cancelled (either not found, not yours, or no longer pending).',
      });
    }

    return reply.send({ success: true, message: 'Join request cancelled.' });
  });
};

