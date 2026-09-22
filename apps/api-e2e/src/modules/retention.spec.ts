/**
 * /api/retention — manual purge trigger. The tenant route is gated by
 * CLINIC_ADMIN (OWNER/ADMIN only) and purges ONLY the caller's tenant; the
 * estate-wide sweep lives on /api/platform/retention/run-now for the nightly
 * scheduler. The retention daemon runs on a cron separately; these endpoints
 * are for on-demand invocation.
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

    it('a tenant run only ever covers the caller’s own tenant', async () => {
      // Regression guard: this route used to loop over every tenant on the
      // platform, so one clinic's ADMIN drove delete work across the whole
      // estate and the request timed out once the tenant count grew.
      const { client } = await env.makeTenant();
      await env.makeTenant(); // a sibling that must not be touched
      const res = await client.axios.post('/api/retention/run-now');
      expect(res.status).toBe(200);
      expect(res.data.tenantsScanned).toBe(1);
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

  describe('platform sweep', () => {
    it('platform admin can run a bounded estate-wide sweep', async () => {
      const admin = await env.makePlatformAdmin();
      const res = await admin.client.axios.post(
        '/api/platform/retention/run-now?limit=5',
      );
      expect(res.status).toBe(200);
      expect(res.data.tenantsScanned).toBeLessThanOrEqual(5);
      // More tenants than the limit exist (every spec makes some), so the
      // caller is handed a cursor to continue with.
      expect(res.data).toHaveProperty('nextCursor');
    });

    it('a tenant token cannot run the estate-wide sweep', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.post('/api/platform/retention/run-now');
      expect(res.status).toBe(401);
    });

    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/platform/retention/run-now');
      expect(res.status).toBe(401);
    });
  });
});
