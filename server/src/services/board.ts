import { z } from 'zod';
import { query } from '../db/pool.js';
import { config } from '../config.js';

/**
 * Shared board query contract. Kept at module scope so both the Fastify route
 * and the HTTP-layer cache refresher validate queries with the same schema.
 */
export const boardQuerySchema = z.object({
  hackathonId: z.string().uuid().optional(),
  cursorCreatedAt: z.string().optional(),
  cursorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['all', 'forming', 'ready', 'full']).default('all'),
  skill: z.string().optional(),
});

export type BoardQuery = z.infer<typeof boardQuerySchema>;

/**
 * Headers shared by cached board responses. Both the Fastify handler (which
 * populates the cache) and the raw HTTP layer (which serves it) use this exact
 * set, so a cache hit is indistinguishable from the original response.
 * `content-length` and `x-cache` are appended per entry by the cache.
 */
export const BOARD_RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': config.corsOrigin,
  vary: 'Origin',
};

/** Stable key used by the single-flight cache for a validated query. */
export function boardCacheKey(q: BoardQuery): string {
  return `board:${q.hackathonId || 'all'}:${q.cursorCreatedAt || ''}:${q.cursorId || ''}:${q.limit}:${q.search || ''}:${q.status}:${q.skill || ''}`;
}

export interface BoardPage {
  teams: any[];
  nextCursor: { cursorCreatedAt: string; cursorId: string } | null;
  hasMore: boolean;
}

/**
 * Executes the keyset-paginated board query. This is the only place that builds
 * the board SQL, so both the request path and background stale refreshes use
 * exactly the same query plan and filters.
 */
export async function fetchBoard(q: BoardQuery): Promise<BoardPage> {
  const { hackathonId, cursorCreatedAt, cursorId, limit, search, status, skill } = q;

  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (hackathonId) {
    conditions.push(`t.hackathon_id = $${idx++}`);
    values.push(hackathonId);
  }

  if (cursorCreatedAt && cursorId) {
    conditions.push(`(t.created_at, t.id) < ($${idx++}, $${idx++})`);
    values.push(cursorCreatedAt, cursorId);
  }

  if (search && search.trim() !== '') {
    conditions.push(`(t.name ILIKE $${idx} OR t.description ILIKE $${idx})`);
    values.push(`%${search.trim()}%`);
    idx++;
  }

  if (skill && skill.trim() !== '') {
    conditions.push(`$${idx++} = ANY(t.needed_skills)`);
    values.push(skill.trim());
  }

  if (status === 'full') {
    conditions.push(`t.member_count >= t.max_members`);
  } else if (status === 'forming') {
    conditions.push(`t.member_count < h.min_team_size`);
  } else if (status === 'ready') {
    conditions.push(`t.member_count >= h.min_team_size AND t.member_count < t.max_members`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit + 1); // fetch 1 extra to determine hasMore

  const sql = `
    SELECT 
      t.id, t.hackathon_id, t.name, t.description, t.needed_skills,
      t.member_count, t.max_members, t.created_at, t.updated_at,
      u.id as leader_id, u.name as leader_name, u.avatar_url as leader_avatar,
      h.min_team_size,
      CASE 
        WHEN t.member_count >= t.max_members THEN 'full'
        WHEN t.member_count >= h.min_team_size THEN 'ready'
        ELSE 'forming'
      END as status
    FROM teams t
    JOIN users u ON u.id = t.leader_id
    JOIN hackathons h ON h.id = t.hackathon_id
    ${whereClause}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT $${idx};
  `;

  const result = await query(sql, values);
  const rows = result.rows;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem
    ? { cursorCreatedAt: lastItem.created_at.toISOString(), cursorId: lastItem.id }
    : null;

  return { teams: items, nextCursor, hasMore };
}
