/**
 * /api/retention — manual purge trigger. Single POST route gated by
 * TENANT_MANAGE (OWNER/ADMIN only). The retention daemon runs on a cron
 * separately; this endpoint is for on-demand invocation.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e retention module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can trigger a retention run', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.post('/api/retention/run-now');
      expect(res.status).toBe(200);
      // Service returns a summary object; shape isn't contractually tight,
      // just assert we got JSON back.
      expect(typeof res.data).toBe('object');
    });

    it('ADMIN can trigger a retention run', async () => {
      const { tenant } = await env.makeTenant();
      const admin = await env.makeAdmin(tenant);
      const res = await admin.client.axios.post('/api/retention/run-now');
      expect(res.status).toBe(200);
    });
  });

  describe('RBAC denial', () => {
    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s cannot trigger retention',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : await env.makeReceptionist(tenant);
        const res = await user.client.axios.post('/api/retention/run-now');
        expect(res.status).toBe(403);
      },
    );
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/retention/run-now');
      expect(res.status).toBe(401);
    });
  });
});
