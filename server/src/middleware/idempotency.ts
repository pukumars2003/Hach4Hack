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
  if (key.trim().length === 0 || key.length > 128) {
    throw new IdempotencyError(400, 'invalid_idempotency_key', 'Idempotency-Key must be 1 to 128 characters.');
  }

  const reqHash = hashRequestBody(requestPayload);

  // The unique insert serializes simultaneous retries before they can run the action.
  const inserted = await client.query(
    `INSERT INTO idempotency_keys (user_id, key, endpoint, request_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, key, endpoint) DO NOTHING
     RETURNING user_id`,
    [userId, key, endpoint, reqHash]
  );

  if (inserted.rowCount === 0) {
    const existing = await client.query(
      `SELECT request_hash, status_code, response_body
       FROM idempotency_keys
       WHERE user_id = $1 AND key = $2 AND endpoint = $3
       FOR UPDATE`,
      [userId, key, endpoint]
    );
    if (existing.rowCount === 0) {
      throw new IdempotencyError(
        503,
        'idempotency_retry_required',
        'The request could not be replayed safely; retry with the same idempotency key.'
      );
    }

    const row = existing.rows[0];
    if (row.request_hash !== reqHash) {
      throw new IdempotencyError(
        422,
        'idempotency_key_reuse',
        'Idempotency key was previously used with a different request payload.'
      );
    }

    if (row.status_code !== null) {
      return {
        replayed: true,
        statusCode: row.status_code,
        body: row.response_body,
      };
    }
    throw new IdempotencyError(409, 'idempotency_in_progress', 'An identical request is still in progress.');
  }

  const res = await action();

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

