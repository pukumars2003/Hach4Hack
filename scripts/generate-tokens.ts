/**
 * Pre-generate JWT tokens for k6 load testing.
 * Uses Node.js built-in crypto — no extra dependencies needed.
 *
 * Usage:
 *   cd d:\Prj\Hach4Hack
 *   npx tsx scripts/generate-tokens.ts
 *   npx tsx scripts/generate-tokens.ts --count=50000
 *
 * Output: scripts/tokens.json  (gitignored)
 *
 * k6 SharedArray usage:
 *   import { SharedArray } from 'k6/data';
 *   const tokens = new SharedArray('t', () => JSON.parse(open('./tokens.json')));
 *   export default function() { const t = tokens[__VU % tokens.length]; ... }
 */

import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from workspace root and server/
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/team_formation';
const JWT_SECRET =
  process.env.JWT_SECRET || 'hackathon-race-proof-secret-jwt-key-2026';

const args = process.argv.slice(2);
const countArg = args.find((a) => a.startsWith('--count='));
const COUNT = countArg ? parseInt(countArg.split('=')[1], 10) : 50000;
const OUTPUT_FILE = path.resolve(__dirname, 'tokens.json');

// ── Minimal HS256 JWT implementation (no external dep) ─────────────────────
function base64urlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(payload: Record<string, unknown>, secret: string, expiresInSecs = 7 * 24 * 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + expiresInSecs;
  const h = base64urlEncode(JSON.stringify(header));
  const p = base64urlEncode(JSON.stringify({ ...payload, iat, exp }));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${h}.${p}`)
    .digest();
  return `${h}.${p}.${base64urlEncode(sig)}`;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[TokenGen] Connecting to: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

  try {
    const result = await pool.query(
      `SELECT id, email, name FROM users ORDER BY created_at LIMIT $1`,
      [COUNT]
    );

    if (result.rows.length === 0) {
      console.error('[TokenGen] ❌ No users found! Run:  npm run seed --workspace=server');
      process.exit(1);
    }

    console.log(`[TokenGen] Signing ${result.rows.length} tokens (HS256)...`);
    const start = Date.now();

    const tokens = result.rows.map((u) => ({
      userId: u.id,
      email: u.email,
      name: u.name,
      token: signJwt({ id: u.id, email: u.email, name: u.name }, JWT_SECRET),
    }));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tokens));
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    console.log(`[TokenGen] ✅ ${tokens.length} tokens generated in ${elapsed}s`);
    console.log(`[TokenGen] ✅ Written to: ${OUTPUT_FILE}`);
    console.log(`[TokenGen] ✅ Ready for k6 SharedArray load:`);
    console.log(`\n  k6 run scripts/load-test.js --out json=docs/k6-results.json\n`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[TokenGen] Fatal:', err.message);
  process.exit(1);
});
