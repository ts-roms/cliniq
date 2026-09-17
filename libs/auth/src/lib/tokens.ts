// Opaque single-use tokens (invites, password resets, refresh sessions).
//
// The raw token is 32 bytes of CSPRNG output, base64url-encoded, and is
// handed to exactly one party (an email link, or the client that owns the
// refresh session). The database only ever stores sha256(token) — a DB
// leak yields nothing usable, and we don't need bcrypt's cost because the
// input already has 256 bits of entropy.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time string compare for shared secrets (service tokens etc.). */
export function secretsEqual(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
