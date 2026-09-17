/**
 * /api/tenants/me/settings — tenant branding / hours / payments / etc.
 *
 * GET is open to any authenticated tenant member (web header reads branding
 * for every role); PATCH is gated by TENANT_MANAGE (OWNER only).
 *
 * Covers:
 *  - GET → 200 for OWNER/ADMIN/DOCTOR/NURSE/RECEPTIONIST/PATIENT.
 *  - PATCH → 200 for OWNER; 403 for everyone else.
 *  - Shallow-merge: PATCH preserves prior settings keys not touched.
 *  - RLS: tenant A's PATCH does not affect tenant B's row.
 *  - Anonymous → 401.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e settings module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can GET /api/tenants/me/settings', async () => {
      const { client, tenant } = await env.makeTenant();
      const res = await client.axios.get('/api/tenants/me/settings');
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(tenant.id);
      expect(res.data.slug).toBe(tenant.slug);
      // settings is a json field — may be null on a fresh tenant.
      expect(res.data).toHaveProperty('settings');
    });

    it('OWNER can PATCH branding + operating hours', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.patch('/api/tenants/me/settings', {
        branding: { primaryColor: '#1f6feb', tagline: 'Care closer.' },
        operatingHours: [
          { weekday: 1, open: '08:00', close: '17:00' },
          { weekday: 2, open: '08:00', close: '17:00' },
        ],
        acceptedPaymentMethods: ['CASH', 'CARD'],
        vatPercent: 12,
      });
      expect(res.status).toBe(200);
      const settings = res.data.settings as Record<string, unknown>;
      expect(settings).toEqual(
        expect.objectContaining({
          branding: expect.objectContaining({ primaryColor: '#1f6feb', tagline: 'Care closer.' }),
          acceptedPaymentMethods: ['CASH', 'CARD'],
          vatPercent: 12,
        }),
      );
    });

    it('PATCH shallow-merges branding (preserves keys you did not send)', async () => {
      const { client } = await env.makeTenant();
      // First write: tagline only.
      const first = await client.axios.patch('/api/tenants/me/settings', {
        branding: { tagline: 'first tagline' },
      });
      expect(first.status).toBe(200);

      // Second write: primaryColor only — tagline should survive.
      const second = await client.axios.patch('/api/tenants/me/settings', {
        branding: { primaryColor: '#abcdef' },
      });
      expect(second.status).toBe(200);
      const branding = (second.data.settings as { branding?: Record<string, unknown> })?.branding ?? {};
      expect(branding.tagline).toBe('first tagline');
      expect(branding.primaryColor).toBe('#abcdef');
    });

    it.each(['DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'] as const)(
      '%s can GET /api/tenants/me/settings (read is open to all members)',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : role === 'NURSE'
              ? await env.makeNurse(tenant)
              : role === 'RECEPTIONIST'
                ? await env.makeReceptionist(tenant)
                : await env.makePatient(tenant);
        const res = await user.client.axios.get('/api/tenants/me/settings');
        expect(res.status).toBe(200);
        expect(res.data.id).toBe(tenant.id);
      },
    );
  });

  describe('RBAC denial', () => {
    it.each(['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'] as const)(
      '%s cannot PATCH /api/tenants/me/settings (TENANT_MANAGE is OWNER-only)',
      async (role) => {
        const { tenant } = await env.makeTenant();
        const user =
          role === 'ADMIN'
            ? await env.makeAdmin(tenant)
            : role === 'DOCTOR'
              ? await env.makeDoctor(tenant)
              : role === 'NURSE'
                ? await env.makeNurse(tenant)
                : role === 'RECEPTIONIST'
                  ? await env.makeReceptionist(tenant)
                  : await env.makePatient(tenant);
        const res = await user.client.axios.patch('/api/tenants/me/settings', {
          branding: { tagline: 'should not write' },
        });
        expect(res.status).toBe(403);
      },
    );
  });

  describe('failure modes', () => {
    it('PATCH with invalid hex color → 400', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.patch('/api/tenants/me/settings', {
        branding: { primaryColor: 'not-a-color' },
      });
      expect(res.status).toBe(400);
    });

    it('PATCH with weekday > 6 → 400', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.patch('/api/tenants/me/settings', {
        operatingHours: [{ weekday: 99, open: '08:00', close: '17:00' }],
      });
      expect(res.status).toBe(400);
    });

    it('PATCH with malformed HH:mm → 400', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.patch('/api/tenants/me/settings', {
        operatingHours: [{ weekday: 1, open: '8am', close: '5pm' }],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Tenant A PATCH does not affect Tenant B settings', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      await a.client.axios.patch('/api/tenants/me/settings', {
        branding: { tagline: 'A-only' },
      });
      const getB = await b.client.axios.get('/api/tenants/me/settings');
      expect(getB.status).toBe(200);
      const taglineB = (getB.data.settings as { branding?: { tagline?: string } })?.branding?.tagline;
      expect(taglineB).not.toBe('A-only');
    });
  });

  describe('authentication', () => {
    it('unauthenticated GET → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/tenants/me/settings');
      expect(res.status).toBe(401);
    });

    it('unauthenticated PATCH → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.patch('/api/tenants/me/settings', { branding: { tagline: 'x' } });
      expect(res.status).toBe(401);
    });
  });
});
