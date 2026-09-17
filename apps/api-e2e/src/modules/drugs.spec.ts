/**
 * /api/drugs — formulary search.
 *
 * Single route: GET /api/drugs/search?q=...
 * Gated by Actions.RX_WRITE — DOCTOR + OWNER hold it; NURSE / RECEPTIONIST /
 * PATIENT do not.
 *
 * The catalog query returns global rows plus tenant-scoped overrides, so the
 * isolation check verifies that searching from Tenant B doesn't see Tenant A's
 * private drug entries. We can't seed tenant-scoped drugs through the public
 * API today (no admin route exists), so the isolation test asserts the
 * cross-tenant search at least doesn't 5xx and the global catalog response
 * shape is identical from both sides.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e drugs module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('DOCTOR can search the formulary', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);

      const res = await doctor.client.axios.get('/api/drugs/search?q=par');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('OWNER can search the formulary', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/drugs/search?q=amox');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('search with <2 chars returns empty list', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/drugs/search?q=a');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });

    it('search with no query returns empty list', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/drugs/search');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });
  });

  describe('RBAC denial', () => {
    it('NURSE cannot search the formulary (lacks RX_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.get('/api/drugs/search?q=par');
      expect(res.status).toBe(403);
    });

    it('RECEPTIONIST cannot search the formulary (lacks RX_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const recp = await env.makeReceptionist(tenant);
      const res = await recp.client.axios.get('/api/drugs/search?q=par');
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot search the formulary (lacks RX_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.get('/api/drugs/search?q=par');
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('both tenants get a 200 response shape for the global catalog', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const ra = await a.client.axios.get('/api/drugs/search?q=par');
      const rb = await b.client.axios.get('/api/drugs/search?q=par');
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      expect(Array.isArray(ra.data)).toBe(true);
      expect(Array.isArray(rb.data)).toBe(true);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/drugs/search?q=par');
      expect(res.status).toBe(401);
    });
  });
});
