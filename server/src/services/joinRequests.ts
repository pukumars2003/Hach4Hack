import pg from 'pg';

export async function cancelPendingJoinRequests(
  client: pg.PoolClient,
  userId: string,
  actorId: string,
  reason: string,
  excludedRequestId?: string
): Promise<void> {
  const cancelled = await client.query(
    `UPDATE join_requests
     SET status = 'cancelled', updated_at = clock_timestamp()
     WHERE user_id = $1
       AND status = 'pending'
       AND ($2::uuid IS NULL OR id <> $2)
     RETURNING id, team_id`,
    [userId, excludedRequestId ?? null]
  );
  if (cancelled.rowCount === 0) return;

  const teamIds = [...new Set(cancelled.rows.map((row) => row.team_id))];
  const teams = await client.query(
    `SELECT id, hackathon_id FROM teams WHERE id = ANY($1::uuid[])`,
    [teamIds]
  );
  const hackathonByTeam = new Map(teams.rows.map((team) => [team.id, team.hackathon_id]));

  for (const request of cancelled.rows) {
    const hackathonId = hackathonByTeam.get(request.team_id);
    if (!hackathonId) continue;

    await client.query(
      `INSERT INTO audit_logs (hackathon_id, team_id, actor_id, action, details)
       VALUES ($1, $2, $3, 'request_cancelled', $4)`,
      [hackathonId, request.team_id, actorId, JSON.stringify({ requestId: request.id, reason })]
    );
  }

  for (const team of teams.rows) {
    await client.query(
      `SELECT pg_notify('team_events', $1)`,
      [JSON.stringify({
        type: 'request_cancelled',
        teamId: team.id,
        hackathonId: team.hackathon_id,
        userId,
      })]
    );
  }
}
