// RFC 6238 / RFC 4226 — minimal TOTP (HOTP-30s window) implementation.
// HMAC-SHA1, 6 digits, 30s step. Compatible with Google Authenticator,
// Authy, 1Password, Microsoft Authenticator out of the box.
//
// Why not pull in `otplib`? Spec is short, code is auditable, no deps.

import { createHmac, randomBytes } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALGO = 'sha1';

// RFC 4648 base32 (no padding) alphabet — Authenticator apps expect this.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a fresh shared secret. 20 bytes of entropy = 160 bits, encoded
 * as base32 = 32 chars. Strong enough for TOTP (RFC 4226 §4 recommends
 * ≥128 bits).
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * Build the otpauth:// URL the authenticator app reads from a QR code.
 *
 *   otpauth://totp/<issuer>:<account>?secret=<base32>&issuer=<issuer>&period=30&digits=6
 */
export function buildOtpAuthUrl(opts: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.accountName}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Verify a 6-digit code with ±1 step tolerance (covers user-typing latency
 * and small clock skew). Returns true if any of {now-1, now, now+1} matches.
 */
export function verifyTotp(
  code: string,
  secret: string,
  options?: { atTime?: Date; window?: number },
): boolean {
  const cleaned = code.trim().replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const at = options?.atTime ?? new Date();
  const window = options?.window ?? 1;
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS);
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, counter + i) === cleaned) return true;
  }
  return false;
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  // 64-bit big-endian. JS bitwise ops are 32-bit, so split.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac(ALGO, key).update(counterBuf).digest();
  // Dynamic truncation per RFC 4226 §5.4.
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character: ' + ch);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
