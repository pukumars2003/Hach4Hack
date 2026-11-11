import pg from 'pg';
import { hashRequestBody } from '../utils/crypto.js';

export interface IdempotencyResult<T = any> {
  replayed: boolean;
  statusCode: number;
  body: T;
}

export class IdempotencyError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'IdempotencyError';
  }
}

/**
 * Runs a transactional operation protected by an Idempotency-Key.
 * Stored in the same PostgreSQL transaction as the state change.
 */
export async function withIdempotency<T>(
  client: pg.PoolClient,
  userId: string,
  key: string | undefined,
  endpoint: string,
  requestPayload: any,
  action: () => Promise<{ statusCode: number; body: T }>
): Promise<IdempotencyResult<T>> {
  // If no key is provided, run action directly
  if (!key) {
    const res = await action();
    return { replayed: false, statusCode: res.statusCode, body: res.body };
  }

  const reqHash = hashRequestBody(requestPayload);

  // 1. Check existing record
  const existing = await client.query(
    `SELECT request_hash, status_code, response_body 
     FROM idempotency_keys 
     WHERE user_id = $1 AND key = $2 AND endpoint = $3
     FOR UPDATE`,
    [userId, key, endpoint]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const row = existing.rows[0];
    if (row.request_hash !== reqHash) {
      throw new IdempotencyError(
        422,
        'idempotency_key_reuse',
        'Idempotency key was previously used with a different request payload.'
      );
    }

    if (row.status_code !== null) {
      // Return cached committed response
      return {
        replayed: true,
        statusCode: row.status_code,
        body: row.response_body,
      };
    }
  }

  // 2. Insert key record if it didn't exist
  if (!existing.rowCount || existing.rowCount === 0) {
    await client.query(
      `INSERT INTO idempotency_keys (user_id, key, endpoint, request_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, key, endpoint) DO NOTHING`,
      [userId, key, endpoint, reqHash]
    );
  }

  // 3. Execute business logic
  const res = await action();

  // 4. Update the idempotency record with final response status and payload
  await client.query(
    `UPDATE idempotency_keys 
     SET status_code = $1, response_body = $2 
     WHERE user_id = $3 AND key = $4 AND endpoint = $5`,
    [res.statusCode, JSON.stringify(res.body), userId, key, endpoint]
  );

  return {
    replayed: false,
    statusCode: res.statusCode,
    body: res.body,
  };
}
