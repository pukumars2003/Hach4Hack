import pg from 'pg';
import { config } from '../config.js';

const { Pool, Client } = pg;

export const pool = new Pool({
  connectionString: config.database.connectionString,
  max: config.database.max,
  idleTimeoutMillis: config.database.idleTimeoutMillis,
  connectionTimeoutMillis: config.database.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  console.error('[Postgres Pool Error]', err);
});

/**
 * Executes a single parameterized query on the pool.
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL === 'true') {
      console.log(`[SQL ${duration}ms]`, text.replace(/\s+/g, ' ').trim());
    }
    return res;
  } catch (error) {
    console.error(`[SQL Error in query]: ${text}`, error);
    throw error;
  }
}

/**
 * Wraps an operation in a strict PostgreSQL ACID transaction with bounded timeouts.
 * Standardizes lock_timeout (3s) and statement_timeout (5s) to prevent hung connections.
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN;');
    await client.query('SET LOCAL lock_timeout = 3000;');
    await client.query('SET LOCAL statement_timeout = 5000;');

    const result = await callback(client);

    await client.query('COMMIT;');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK;');
    } catch (rollbackError) {
      console.error('[Rollback Error]', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Creates a dedicated, non-pooled connection for LISTEN / NOTIFY streaming.
 */
export function createDedicatedClient(): pg.Client {
  return new Client({
    connectionString: config.database.connectionString,
  });
}
