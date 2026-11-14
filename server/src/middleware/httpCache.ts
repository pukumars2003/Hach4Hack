import { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { boardCache } from '../utils/singleFlight.js';
import { BOARD_RESPONSE_HEADERS, boardQuerySchema, fetchBoard } from '../services/board.js';

const BOARD_PATH = '/api/teams';

/**
 * Rebuilds a cached board response from the same query service used by the
 * Fastify route. Runs in the background when a stale entry is served.
 */
async function refreshBoard(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl, 'http://localhost');
  const rawQuery: Record<string, string> = {};
  for (const [key, value] of url.searchParams) rawQuery[key] = value;

  const parsed = boardQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return;

  const version = boardCache.getVersion();
  const data = await fetchBoard(parsed.data);
  boardCache.setSerialized(rawUrl, JSON.stringify(data), version, BOARD_RESPONSE_HEADERS);
}

/**
 * Installs an in-process HTTP response cache in front of Fastify.
 *
 * The board endpoint is a public, read-only, cacheable collection. Once the
 * normal Fastify handler has produced and serialized a response, subsequent
 * GETs for the exact same URL can be served directly from the Node HTTP layer.
 * This skips routing, validation, rate-limit bookkeeping, and JSON serialization
 * while preserving write-triggered invalidation.
 *
 * Expired entries are served immediately with `X-Cache: STALE` while a single
 * background refresh repopulates the cache (stale-while-revalidate). This
 * prevents the thundering-herd latency spike that occurs when a hot cache entry
 * expires under high concurrency.
 */
export function installBoardHttpCache(app: FastifyInstance): void {
  // Benchmark/diagnostic escape hatch: force every read through Fastify + Postgres.
  if (!config.boardCacheEnabled) return;

  const server = app.server;
  const fastifyListeners = server.listeners('request').slice();
  if (fastifyListeners.length === 0) return;

  const refreshing = new Set<string>();

  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (req.method === 'GET' && req.url) {
      const rawUrl = req.url;
      const queryIndex = rawUrl.indexOf('?');
      const path = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);

      // Only the board collection (never /api/teams/:id or sub-routes).
      if (path === BOARD_PATH || path === `${BOARD_PATH}/`) {
        const entry = boardCache.getSerializedEntry(rawUrl);
        if (entry) {
          const isStale = entry.expiresAt <= Date.now();

          if (isStale && !refreshing.has(rawUrl)) {
            refreshing.add(rawUrl);
            void refreshBoard(rawUrl)
              .catch(() => {})
              .finally(() => refreshing.delete(rawUrl));
          }

          res.writeHead(200, isStale ? entry.headersStale : entry.headersHit);
          res.end(entry.buffer);
          return;
        }
      }
    }

    for (const listener of fastifyListeners) {
      listener.call(server, req, res);
    }
  });
}
