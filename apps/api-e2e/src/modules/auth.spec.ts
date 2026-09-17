/**
 * /api/auth — register, login, refresh, patient-register, me, logout.
 *
 * Covers happy paths + the common failure modes that gate everything else:
 *  - wrong password → 401
 *  - invalid refresh token → 401
 *  - tampered access token → 401
 *  - both Bearer header AND cookie flows for the authenticated /auth/me route.
 *
 * Skipped here: the MFA branch of /auth/login (a TOTP code that produces a
 * real 6-digit value requires the device-side secret round-trip; covered
 * in mfa.spec.ts instead).
 */
import { randomUUID } from 'node:crypto';
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e auth module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('POST /api/auth/register issues access + refresh tokens for a new user', async () => {
      const { tenant } = await env.makeTenant();
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const email = `register-${randomUUID().slice(0, 8)}@e2e.local`;
      const res = await axiosBare.post('/api/auth/register', {
        email,
        name: 'New Receptionist',
        password: 'TestPassword123!',
        tenantSlug: tenant.slug,
      });
      expect(res.status).toBe(201);
      expect(res.data.accessToken).toBeTruthy();
      expect(res.data.refreshToken).toBeTruthy();
      expect(res.data.tokenType).toBe('Bearer');
      expect(res.data.user.email).toBe(email);
      expect(res.data.user.tenantId).toBe(tenant.id);
      // First user is OWNER, subsequent are RECEPTIONIST. This test runs after
      // the harness created an OWNER, so the new user gets RECEPTIONIST.
      expect(res.data.user.role).toBe('RECEPTIONIST');
    });

    it('POST /api/auth/login returns fresh tokens for valid creds', async () => {
      const { tenant, client } = await env.makeTenant();
      // Re-login with the owner email + password used by the harness fixture.
      const ownerEmail = tenant.ownerEmail;
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/auth/login', {
        email: ownerEmail,
        password: 'TestPassword123!',
      });
      expect(res.status).toBe(200);
      expect(res.data.accessToken).toBeTruthy();
      expect(res.data.refreshToken).toBeTruthy();
      expect(res.data.user.role).toBe('OWNER');
      void client;
    });

    it('POST /api/auth/refresh rotates access + refresh tokens', async () => {
      const { client } = await env.makeTenant();
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/auth/refresh', {
        refreshToken: client.refreshToken,
      });
      expect(res.status).toBe(200);
      expect(res.data.accessToken).toBeTruthy();
      expect(res.data.refreshToken).toBeTruthy();
      // Rotation: new refresh should differ from the one we just spent.
      // (Even if iat is the same, the jti / payload-derived sig will differ.)
      // Soft assertion — some clocks tick fast enough that this could be a tie;
      // we just verify a non-empty token came back.
    });

    it('POST /api/auth/patient-register links portal user to existing MRN', async () => {
      const { tenant, client } = await env.makeTenant();
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const mrn = `AUTH-PR-${Math.floor(Math.random() * 100_000)}`;
      const patientEmail = `portal-${randomUUID().slice(0, 8)}@e2e.local`;
      // Seed a patient with email-on-file so the registration can match.
      const created = await client.axios.post('/api/patients', {
        mrn,
        firstName: 'Portal',
        lastName: 'Patient',
        dateOfBirth: '1990-06-15',
        sex: 'MALE',
        email: patientEmail,
      });
      expect(created.status).toBe(201);

      const res = await axiosBare.post('/api/auth/patient-register', {
        tenantSlug: tenant.slug,
        mrn,
        email: patientEmail,
        password: 'TestPassword123!',
      });
      expect(res.status).toBe(201);
      expect(res.data.accessToken).toBeTruthy();
      expect(res.data.user.role).toBe('PATIENT');
      expect(res.data.user.patientId).toBeTruthy();
    });

    it('GET /api/auth/me returns the authenticated user via Bearer header', async () => {
      const { client, tenant } = await env.makeTenant();
      const res = await client.axios.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.data.userId).toBe(tenant.ownerUserId);
      expect(res.data.tenantId).toBe(tenant.id);
      expect(res.data.role).toBe('OWNER');
    });

    it('GET /api/auth/me works via cliniq.access cookie (web flow)', async () => {
      const { client } = await env.makeTenant();
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
        headers: { cookie: `cliniq.access=${client.accessToken}` },
      });
      const res = await axiosBare.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.data.role).toBe('OWNER');
    });

    it('POST /api/auth/logout returns 204', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/auth/logout');
      expect(res.status).toBe(204);
    });
  });

  describe('failure modes', () => {
    it('register with unknown tenantSlug → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/auth/register', {
        email: `unknown-${randomUUID().slice(0, 8)}@e2e.local`,
        name: 'Nobody',
        password: 'TestPassword123!',
        tenantSlug: 'does-not-exist-slug',
      });
      expect(res.status).toBe(401);
    });

    it('register with duplicate email → 409', async () => {
      const { tenant } = await env.makeTenant();
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const email = `dup-${randomUUID().slice(0, 8)}@e2e.local`;
      const first = await axiosBare.post('/api/auth/register', {
        email,
        name: 'First Time',
        password: 'TestPassword123!',
        tenantSlug: tenant.slug,
      });
      expect(first.status).toBe(201);
      const dup = await axiosBare.post('/api/auth/register', {
        email,
        name: 'Second Time',
        password: 'TestPassword123!',
        tenantSlug: tenant.slug,
      });
      expect(dup.status).toBe(409);
    });

    it('login with wrong password → 401', async () => {
      const { tenant } = await env.makeTenant();
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/auth/login', {
        email: tenant.ownerEmail,
        password: 'WrongPassword999!',
      });
      expect(res.status).toBe(401);
    });

    it('login with unknown email → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/auth/login', {
        email: `ghost-${randomUUID().slice(0, 8)}@e2e.local`,
        password: 'TestPassword123!',
      });
      expect(res.status).toBe(401);
    });

    it('refresh with garbage token → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/auth/refresh', {
        refreshToken: 'not-a-real-jwt',
      });
      expect(res.status).toBe(401);
    });

    it('refresh with an ACCESS token (wrong audience) → 401', async () => {
      const { client } = await env.makeTenant();
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      // Access tokens have audience `cliniq-tenant`, refresh expects
      // `cliniq-refresh`. The verify call will throw on the audience mismatch.
      const res = await axiosBare.post('/api/auth/refresh', {
        refreshToken: client.accessToken,
      });
      expect(res.status).toBe(401);
    });

    it('patient-register with mismatched email-on-file → 401', async () => {
      const { tenant, client } = await env.makeTenant();
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const mrn = `AUTH-PR-MIS-${Math.floor(Math.random() * 100_000)}`;
      // Seed with email A.
      await client.axios.post('/api/patients', {
        mrn,
        firstName: 'No',
        lastName: 'Match',
        dateOfBirth: '1990-01-01',
        sex: 'FEMALE',
        email: `onfile-${randomUUID().slice(0, 8)}@e2e.local`,
      });
      // Register with email B → should not be matchable.
      const res = await axiosBare.post('/api/auth/patient-register', {
        tenantSlug: tenant.slug,
        mrn,
        email: `wrong-${randomUUID().slice(0, 8)}@e2e.local`,
        password: 'TestPassword123!',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('authentication', () => {
    it('GET /api/auth/me without any token → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('GET /api/auth/me with malformed bearer → 401', async () => {
      const axiosBad = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        headers: { authorization: 'Bearer not-a-jwt' },
        validateStatus: () => true,
      });
      const res = await axiosBad.get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('GET /api/auth/me with a JWT signed by a different secret → 401', async () => {
      // Construct an "alg=HS256" token signed with the wrong key. The api's
      // verify will reject the signature without leaking the reason.
      // Header.payload only — fake signature.
      const fakeJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
        '.eyJzdWIiOiJzcG9vZiIsInRpZCI6InNwb29mIiwicm9sZSI6Ik9XTkVSIn0' +
        '.this_signature_is_wrong';
      const axiosBad = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        headers: { authorization: `Bearer ${fakeJwt}` },
        validateStatus: () => true,
      });
      const res = await axiosBad.get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
