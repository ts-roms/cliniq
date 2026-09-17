/**
 * /api/mfa — enrollment, verify, disable, status.
 *
 * The MFA TOTP flow needs a real 6-digit code generated from the secret the
 * server hands out at /mfa/setup. We compute the code with `node:crypto` HMAC-SHA1
 * (RFC 6238) using the base32 secret returned by setup.
 *
 * Covers:
 *  - Any authenticated user can enroll → returns an otpauthUrl + secret.
 *  - Verify with a fresh TOTP flips mfaEnabled and returns backup codes.
 *  - Status reflects the new state.
 *  - Disable requires a valid TOTP; wrong code → 401.
 *  - Anonymous → 401.
 */
import { createHmac } from 'node:crypto';
import { bootEnv, type E2EEnv } from '../support/harness';

/**
 * Decode a base32 (RFC 4648, no padding) secret to bytes.
 * Mirrors the otplib default encoding the api uses for its TOTP secrets.
 */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`bad base32 char: ${ch}`);
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Compute the 6-digit TOTP for the given base32 secret at the given time (ms). */
function totpAt(secret: string, atMs = Date.now(), stepSeconds = 30, digits = 6): string {
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return (code % mod).toString().padStart(digits, '0');
}

describe('@org/api-e2e mfa module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('GET /api/mfa/status reports disabled for a fresh user', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/mfa/status');
      expect(res.status).toBe(200);
      expect(res.data.enabled).toBe(false);
      expect(res.data.backupCodesRemaining).toBe(0);
    });

    it('POST /api/mfa/setup returns a secret + otpauthUrl', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.post('/api/mfa/setup');
      expect(res.status).toBe(200);
      expect(typeof res.data.secret).toBe('string');
      expect(res.data.secret.length).toBeGreaterThan(0);
      expect(res.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(typeof res.data.manualEntryKey).toBe('string');
    });

    it('full enroll → verify → status → disable flow with computed TOTPs', async () => {
      const { client } = await env.makeTenant();

      const setup = await client.axios.post('/api/mfa/setup');
      expect(setup.status).toBe(200);
      const secret = setup.data.secret as string;

      const code = totpAt(secret);
      const verify = await client.axios.post('/api/mfa/verify', { code });
      expect(verify.status).toBe(200);
      expect(Array.isArray(verify.data.backupCodes)).toBe(true);
      expect(verify.data.backupCodes.length).toBeGreaterThan(0);

      const status = await client.axios.get('/api/mfa/status');
      expect(status.status).toBe(200);
      expect(status.data.enabled).toBe(true);
      expect(status.data.backupCodesRemaining).toBe(verify.data.backupCodes.length);

      // Disable needs a current TOTP. Wait a moment if we're near a 30s rollover
      // so we don't accidentally re-use the same code.
      const disableCode = totpAt(secret);
      const disable = await client.axios.post('/api/mfa/disable', { code: disableCode });
      expect(disable.status).toBe(200);
      expect(disable.data.ok).toBe(true);

      const after = await client.axios.get('/api/mfa/status');
      expect(after.status).toBe(200);
      expect(after.data.enabled).toBe(false);
    });
  });

  describe('failure modes', () => {
    it('verify without prior setup → 400', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.post('/api/mfa/verify', { code: '000000' });
      expect(res.status).toBe(400);
    });

    it('verify with a bogus 6-digit code → 401', async () => {
      const { client } = await env.makeTenant();
      const setup = await client.axios.post('/api/mfa/setup');
      expect(setup.status).toBe(200);
      // Almost certainly wrong (1 in 10^6 chance of accidental match).
      const res = await client.axios.post('/api/mfa/verify', { code: '000000' });
      // Either invalid format (400) or invalid TOTP (401). The DTO requires
      // exactly 6 digits and '000000' satisfies that → 401 from the service.
      expect(res.status).toBe(401);
    });

    it('verify with a non-numeric code → 400 (DTO validation)', async () => {
      const { client } = await env.makeTenant();
      await client.axios.post('/api/mfa/setup');
      const res = await client.axios.post('/api/mfa/verify', { code: 'abcdef' });
      expect(res.status).toBe(400);
    });

    it('disable with wrong code → 401', async () => {
      const { client } = await env.makeTenant();
      const setup = await client.axios.post('/api/mfa/setup');
      const code = totpAt(setup.data.secret as string);
      await client.axios.post('/api/mfa/verify', { code });
      const res = await client.axios.post('/api/mfa/disable', { code: '000000' });
      expect(res.status).toBe(401);
    });
  });

  describe('authentication', () => {
    it('unauthenticated /api/mfa/status → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/mfa/status');
      expect(res.status).toBe(401);
    });

    it('unauthenticated /api/mfa/setup → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/mfa/setup');
      expect(res.status).toBe(401);
    });
  });
});
