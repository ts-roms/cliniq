/**
 * /api/icd-codes — read-only ICD-10 lookup.
 *
 * Single route: GET /api/icd-codes/search?q=...
 * The controller has no @Requires() decorator — authentication is the only
 * gate. Every authed role (including PATIENT) gets through. The catalog is
 * global (tenantId-less), so there's nothing to isolate per tenant; we still
 * assert that two tenants see consistent responses.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e icd-codes module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s can search ICD codes',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : await env.makeReceptionist(tenant);

        const res = await user.client.axios.get('/api/icd-codes/search?q=hyp');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
      },
    );

    it('OWNER can search ICD codes', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/icd-codes/search?q=cold');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('PATIENT can search ICD codes (no @Requires guard on route)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.get('/api/icd-codes/search?q=hyp');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('search with <2 chars returns empty list', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/icd-codes/search?q=a');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });
  });

  describe('multi-tenant isolation (catalog is global)', () => {
    it('two tenants get identical 200 responses', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const ra = await a.client.axios.get('/api/icd-codes/search?q=hyp');
      const rb = await b.client.axios.get('/api/icd-codes/search?q=hyp');
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      // Catalog is global, so the same query yields the same row count.
      expect(Array.isArray(ra.data)).toBe(true);
      expect(Array.isArray(rb.data)).toBe(true);
      expect(ra.data.length).toBe(rb.data.length);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/icd-codes/search?q=hyp');
      expect(res.status).toBe(401);
    });
  });
});
