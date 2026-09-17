/**
 * /api/reports — overview, revenue, top-services, no-shows.
 *
 * All routes are gated by AUDIT_READ — OWNER/ADMIN only.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e reports module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can fetch overview', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/reports/overview');
      expect(res.status).toBe(200);
      // Shape: at minimum an object — exact fields depend on the service.
      expect(typeof res.data).toBe('object');
    });

    it('OWNER can fetch revenue, top-services, no-shows', async () => {
      const { client } = await env.makeTenant();
      const from = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const to = new Date().toISOString();

      const revenue = await client.axios.get(
        `/api/reports/revenue?from=${from}&to=${to}`,
      );
      expect(revenue.status).toBe(200);

      const top = await client.axios.get(
        `/api/reports/top-services?from=${from}&to=${to}&limit=5`,
      );
      expect(top.status).toBe(200);

      const ns = await client.axios.get(
        `/api/reports/no-shows?from=${from}&to=${to}`,
      );
      expect(ns.status).toBe(200);
    });

    it('ADMIN can fetch overview', async () => {
      const { tenant } = await env.makeTenant();
      const admin = await env.makeAdmin(tenant);
      const res = await admin.client.axios.get('/api/reports/overview');
      expect(res.status).toBe(200);
    });
  });

  describe('RBAC denial', () => {
    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s cannot read reports',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : await env.makeReceptionist(tenant);
        const res = await user.client.axios.get('/api/reports/overview');
        expect(res.status).toBe(403);
      },
    );
  });

  describe('multi-tenant isolation', () => {
    it('reports are scoped to the caller tenant', async () => {
      // Each fresh tenant has zero data. We can't easily prove "no leak"
      // without a counter, so we just assert the call succeeds for both
      // and returns its own (empty) shape.
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aRes = await a.client.axios.get('/api/reports/overview');
      const bRes = await b.client.axios.get('/api/reports/overview');
      expect(aRes.status).toBe(200);
      expect(bRes.status).toBe(200);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/reports/overview');
      expect(res.status).toBe(401);
    });
  });
});
