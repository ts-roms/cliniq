/**
 * /api/calendars — provider iCal feed.
 *
 * Covers:
 *  - OWNER can issue a feed token for themselves.
 *  - The signed token successfully fetches the .ics (public route).
 *  - Missing/invalid token → 400 / 401.
 *  - Cross-tenant: token issued by tenant A cannot fetch tenant B's events
 *    (different tenantId → HMAC verification fails).
 */
import axios from 'axios';
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e calendars module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER issues a feed token and the .ics URL renders 200', async () => {
      const { tenant, client } = await env.makeTenant();

      const issued = await client.axios.get(
        `/api/calendars/providers/${tenant.ownerUserId}/feed-token`,
      );
      expect(issued.status).toBe(200);
      expect(issued.data.token).toBeTruthy();
      expect(issued.data.providerId).toBe(tenant.ownerUserId);

      const token = issued.data.token as string;
      // Public route — fetch without auth header.
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const ics = await bare.get(
        `/api/calendars/providers/${tenant.id}/${tenant.ownerUserId}.ics`,
        { params: { t: token } },
      );
      expect(ics.status).toBe(200);
      expect(String(ics.headers['content-type'] ?? '')).toContain('text/calendar');
      expect(String(ics.data)).toContain('BEGIN:VCALENDAR');
      expect(String(ics.data)).toContain('END:VCALENDAR');
    });
  });

  describe('authentication', () => {
    it('issue-token endpoint requires a JWT (401 without auth)', async () => {
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const res = await bare.get(
        '/api/calendars/providers/some-provider-id/feed-token',
      );
      expect(res.status).toBe(401);
    });

    it('.ics with missing token returns 400', async () => {
      const { tenant } = await env.makeTenant();
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const res = await bare.get(
        `/api/calendars/providers/${tenant.id}/${tenant.ownerUserId}.ics`,
      );
      expect(res.status).toBe(400);
    });

    it('.ics with bogus token returns 401', async () => {
      const { tenant } = await env.makeTenant();
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const res = await bare.get(
        `/api/calendars/providers/${tenant.id}/${tenant.ownerUserId}.ics`,
        { params: { t: 'v1.not-a-real-signature' } },
      );
      expect(res.status).toBe(401);
    });
  });

  describe('multi-tenant isolation', () => {
    it('token issued by tenant A cannot be used to fetch tenant B events', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      // Tenant A issues a token for their own provider (the owner).
      const issuedA = await a.client.axios.get(
        `/api/calendars/providers/${a.tenant.ownerUserId}/feed-token`,
      );
      expect(issuedA.status).toBe(200);
      const tokenA = issuedA.data.token as string;

      // Try to point the public ICS at tenant B's tenantId and providerId
      // using tenant A's token — HMAC includes tenantId+providerId so this
      // must fail verification.
      const bare = axios.create({ baseURL: env.baseUrl, validateStatus: () => true });
      const cross = await bare.get(
        `/api/calendars/providers/${b.tenant.id}/${b.tenant.ownerUserId}.ics`,
        { params: { t: tokenA } },
      );
      expect(cross.status).toBe(401);
    });

    it('OWNER cannot issue a feed for a provider in a different tenant', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const cross = await a.client.axios.get(
        `/api/calendars/providers/${b.tenant.ownerUserId}/feed-token`,
      );
      // 404 (provider not in this tenant) per service contract.
      expect(cross.status).toBe(404);
    });
  });
});
