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
          branding: expect.objectContaining({
            primaryColor: '#1f6feb',
            tagline: 'Care closer.',
          }),
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
      const branding =
        (second.data.settings as { branding?: Record<string, unknown> })
          ?.branding ?? {};
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
      const taglineB = (
        getB.data.settings as { branding?: { tagline?: string } }
      )?.branding?.tagline;
      expect(taglineB).not.toBe('A-only');
    });
  });

  describe('clinical modules', () => {
    it('defaults come from the tenant type, narrowed by plan', async () => {
      // makeTenant() creates a GENERAL clinic; the harness puts it on PREMIUM,
      // so every module in the catalog resolves.
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/tenants/me/settings');
      expect(res.status).toBe(200);
      expect([...res.data.modules].sort()).toEqual(
        ['dental', 'hmo', 'lab_orders', 'ob', 'ultrasound'].sort(),
      );
    });

    it('an explicit selection replaces the defaults', async () => {
      const { client } = await env.makeTenant();
      const patch = await client.axios.patch('/api/tenants/me/settings', {
        modules: ['dental'],
      });
      expect(patch.status).toBe(200);
      const res = await client.axios.get('/api/tenants/me/settings');
      expect(res.data.modules).toEqual(['dental']);
    });

    it('an explicitly empty selection means none, not "use the defaults"', async () => {
      const { client } = await env.makeTenant();
      await client.axios.patch('/api/tenants/me/settings', { modules: [] });
      const res = await client.axios.get('/api/tenants/me/settings');
      expect(res.data.modules).toEqual([]);
    });

    it('rejects a module outside the catalog', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.patch('/api/tenants/me/settings', {
        modules: ['dental', 'telemedicine'],
      });
      expect(res.status).toBe(400);
    });

    it('saving unrelated settings does not wipe the module selection', async () => {
      // The settings PATCH shallow-merges, and the web's main settings form
      // submits without `modules` — that must not reset the clinic's choice.
      const { client } = await env.makeTenant();
      await client.axios.patch('/api/tenants/me/settings', {
        modules: ['dental', 'hmo'],
      });
      await client.axios.patch('/api/tenants/me/settings', {
        branding: { tagline: 'unrelated change' },
      });
      const res = await client.axios.get('/api/tenants/me/settings');
      expect([...res.data.modules].sort()).toEqual(['dental', 'hmo']);
    });

    it('another tenant’s selection does not leak', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      await a.client.axios.patch('/api/tenants/me/settings', {
        modules: ['dental'],
      });
      const res = await b.client.axios.get('/api/tenants/me/settings');
      expect(res.data.modules).not.toEqual(['dental']);
    });
  });

  describe('per-patient module data', () => {
    it('reports which modules hold records for a patient', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const created = await client.axios.post('/api/patients', {
        mrn: `MRN-${Date.now()}`,
        firstName: 'Mod',
        lastName: 'Probe',
        dateOfBirth: '1990-01-01',
        sex: 'FEMALE',
      });
      expect(created.status).toBe(201);
      const patientId = created.data.id;

      const before = await client.axios.get(
        `/api/patients/${patientId}/modules`,
      );
      expect(before.status).toBe(200);
      expect(before.data.dental).toBe(false);

      // A chart written now must flip the flag — that is what keeps the card
      // on the chart after the clinic switches dental off.
      const chart = await doctor.client.axios.post(
        `/api/patients/${patientId}/dental-chart`,
        {
          dentition: 'ADULT',
          teeth: [
            {
              toothCode: '11',
              status: 'PRESENT',
              surfaces: [{ surface: 'O', finding: 'CARIES' }],
            },
          ],
        },
      );
      expect(chart.status).toBe(201);

      const after = await client.axios.get(
        `/api/patients/${patientId}/modules`,
      );
      expect(after.data.dental).toBe(true);
      expect(after.data.ob).toBe(false);
    });

    it('404s for a patient in another tenant', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const created = await a.client.axios.post('/api/patients', {
        mrn: `MRN-${Date.now()}-x`,
        firstName: 'Cross',
        lastName: 'Tenant',
        dateOfBirth: '1990-01-01',
        sex: 'MALE',
      });
      expect(created.status).toBe(201);
      // Sanity: the owning tenant can read it, so a 404 for B is isolation
      // rather than a bad id.
      const own = await a.client.axios.get(
        `/api/patients/${created.data.id}/modules`,
      );
      expect(own.status).toBe(200);

      const res = await b.client.axios.get(
        `/api/patients/${created.data.id}/modules`,
      );
      expect(res.status).toBe(404);
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
      const res = await axiosBare.patch('/api/tenants/me/settings', {
        branding: { tagline: 'x' },
      });
      expect(res.status).toBe(401);
    });
  });
});
