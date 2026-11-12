import crypto from 'crypto';

// Crockford Base32 alphabet (excludes I, L, O, U)
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a 12-character Crockford Base32 code with format ABCD-EFGH-JKMN
 * (60 bits of cryptographic entropy)
 */
export function generateInviteCode(): string {
  // 60 bits = 12 characters (5 bits each)
  const bytes = crypto.randomBytes(8);
  let bits = 0n;
  for (let i = 0; i < 8; i++) {
    bits = (bits << 8n) | BigInt(bytes[i]);
  }
  // take top 60 bits
  bits = bits >> 4n;

  let raw = '';
  for (let i = 0; i < 12; i++) {
    const index = Number((bits >> BigInt(5 * (11 - i))) & 0x1fn);
    raw += CROCKFORD_ALPHABET[index];
  }

  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/**
 * Normalizes user-input invite code:
 * Strips dashes, spaces, uppercases, and translates ambiguous chars (O->0, I/L->1).
 */
export function normalizeInviteCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

/**
 * Computes SHA-256 hex digest of normalized invite code.
 */
export function hashInviteCode(rawCode: string): string {
  const normalized = normalizeInviteCode(rawCode);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Computes SHA-256 hex digest of a JSON request body for idempotency comparison.
 */
export function hashRequestBody(body: any): string {
  const normalized = typeof body === 'string' ? body : JSON.stringify(body || {});
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Scrypt-based password hashing (secure, standard, fast, zero native addons)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a password against the stored scrypt hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = parts[1];
  const expectedHash = parts[2];

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      const keyBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
      const expectedBuffer = Buffer.from(expectedHash, 'hex');
      if (keyBuffer.length !== expectedBuffer.length) return resolve(false);
      resolve(crypto.timingSafeEqual(keyBuffer, expectedBuffer));
    });
  });
}

// Precomputed password hash for "Demo@12345" so seeding 50k users takes < 2 seconds
export const PRECOMPUTED_SEED_PASSWORD_HASH = 
  'scrypt$d3a1f9e2b4c6e80a$6c1aabe0f266f5f0b6df33bdbd6a30c5a827411a41ed93ea9ca0918c3ab8f95c7d7b6b6b2d332dec2d33369785ac5ed90890a57b8ea413c9791f1e93057bbd2b';

