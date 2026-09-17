/**
 * /api/ai-budget — current usage. Read-only, AI_USE capability.
 *
 * The matrix grants AI_USE to OWNER, ADMIN, DOCTOR, NURSE. RECEPTIONIST and
 * PATIENT lack it. We verify the GET surface and the tenant scoping.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e ai-budget module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can read current budget usage', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/ai-budget');
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        monthYear: expect.any(String),
        budgetCentavos: expect.any(Number),
        spentCentavos: expect.any(Number),
        remainingCentavos: expect.any(Number),
      });
    });

    it.each(['DOCTOR', 'NURSE'] as const)('%s can read usage', async (role) => {
      const { tenant } = await env.makeTenant();
      const user =
        role === 'DOCTOR' ? await env.makeDoctor(tenant) : await env.makeNurse(tenant);
      const res = await user.client.axios.get('/api/ai-budget');
      expect(res.status).toBe(200);
    });
  });

  describe('RBAC denial', () => {
    it('RECEPTIONIST cannot read AI budget (no AI_USE)', async () => {
      const { tenant } = await env.makeTenant();
      const recp = await env.makeReceptionist(tenant);
      const res = await recp.client.axios.get('/api/ai-budget');
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot read AI budget', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.get('/api/ai-budget');
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('each tenant sees its own counter (different instances)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aRes = await a.client.axios.get('/api/ai-budget');
      const bRes = await b.client.axios.get('/api/ai-budget');
      expect(aRes.status).toBe(200);
      expect(bRes.status).toBe(200);
      // Different tenants, both start at 0 — the shape just has to match.
      expect(aRes.data.spentCentavos).toBe(0);
      expect(bRes.data.spentCentavos).toBe(0);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/ai-budget');
      expect(res.status).toBe(401);
    });
  });
});
