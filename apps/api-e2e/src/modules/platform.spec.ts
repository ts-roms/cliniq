/**
 * /api/platform/* — platform admin surface for tenant ops.
 *
 * Covers:
 *  - GET /api/platform/tenants list / detail.
 *  - PATCH /api/platform/tenants/:id plan + status update.
 *  - GET /api/platform/tenants/catalog returns clinic + lab plan metadata.
 *  - A regular tenant JWT (OWNER even) is rejected by PlatformAuthGuard.
 *  - Unauthenticated → 401.
 *
 * Skipped here: platform-auth login is exercised implicitly by
 * env.makePlatformAdmin(). The /platform/auth/refresh + /logout cookie
 * mechanics are covered by the auth spec's general refresh tests; mirroring
 * them here would just duplicate that contract.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e platform module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('platform admin can GET /api/platform/tenants (cursor-paginated)', async () => {
      const admin = await env.makePlatformAdmin();
      // Seed one tenant so the list isn't empty.
      const { tenant } = await env.makeTenant();

      const res = await admin.client.axios.get('/api/platform/tenants');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.items)).toBe(true);
      // Shape check on a list item.
      expect(res.data).toHaveProperty('nextCursor');
      expect(
        res.data.items.some((t: { id: string }) => t.id === tenant.id),
      ).toBe(true);
      const row = res.data.items.find(
        (t: { id: string }) => t.id === tenant.id,
      );
      expect(row).toEqual(
        expect.objectContaining({
          slug: tenant.slug,
          userCount: expect.any(Number),
          patientCount: expect.any(Number),
        }),
      );
    });

    it('platform admin can GET /api/platform/tenants/:id with planMeta', async () => {
      const admin = await env.makePlatformAdmin();
      const { tenant } = await env.makeTenant();
      const res = await admin.client.axios.get(
        `/api/platform/tenants/${tenant.id}`,
      );
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(tenant.id);
      expect(res.data.slug).toBe(tenant.slug);
      expect(res.data).toHaveProperty('planMeta');
    });

    it('platform admin can PATCH /api/platform/tenants/:id to change plan + status', async () => {
      const admin = await env.makePlatformAdmin();
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });

      const res = await admin.client.axios.patch(
        `/api/platform/tenants/${tenant.id}`,
        {
          plan: 'STARTER',
          status: 'ACTIVE',
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.plan).toBe('STARTER');
      expect(res.data.status).toBe('ACTIVE');
    });

    it('platform admin can GET /api/platform/tenants/catalog (clinic + lab plans)', async () => {
      const admin = await env.makePlatformAdmin();
      const res = await admin.client.axios.get('/api/platform/tenants/catalog');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.clinicPlans)).toBe(true);
      expect(Array.isArray(res.data.labPlans)).toBe(true);
      expect(res.data.clinicPlans.length).toBeGreaterThan(0);
    });

    it('search filter narrows the list to matching slugs', async () => {
      const admin = await env.makePlatformAdmin();
      const { tenant } = await env.makeTenant();
      // Look up by the unique random slug — should return exactly one row.
      const res = await admin.client.axios.get('/api/platform/tenants', {
        params: { search: tenant.slug },
      });
      expect(res.status).toBe(200);
      expect(res.data.items.length).toBe(1);
      expect(res.data.items[0].slug).toBe(tenant.slug);
    });
  });

  describe('RBAC denial', () => {
    it('a tenant OWNER token (non-platform) → 401 on /api/platform/tenants', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/platform/tenants');
      // PlatformAuthGuard rejects tenant-audience tokens — observable as 401.
      expect(res.status).toBe(401);
    });

    it('a DOCTOR token → 401 on /api/platform/tenants/:id', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.get(
        `/api/platform/tenants/${tenant.id}`,
      );
      expect(res.status).toBe(401);
    });

    it('a PATIENT token → 401 on /api/platform/tenants', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.get('/api/platform/tenants');
      expect(res.status).toBe(401);
    });
  });

  describe('failure modes', () => {
    it('GET /api/platform/tenants/:id for unknown id → 404', async () => {
      const admin = await env.makePlatformAdmin();
      const res = await admin.client.axios.get(
        '/api/platform/tenants/no-such-id-xyz',
      );
      expect(res.status).toBe(404);
    });

    it('platform admin can change a LAB tenant plan via labPlan', async () => {
      const admin = await env.makePlatformAdmin();
      const { tenant } = await env.makeTenant({
        kind: 'LAB',
        labPlan: 'LAB_BASIC',
      });
      const res = await admin.client.axios.patch(
        `/api/platform/tenants/${tenant.id}`,
        { labPlan: 'LAB_STANDARD' },
      );
      expect(res.status).toBe(200);
      expect(res.data.labPlan).toBe('LAB_STANDARD');
      expect(res.data.plan).toBeNull();
      const detail = await admin.client.axios.get(
        `/api/platform/tenants/${tenant.id}`,
      );
      expect(detail.data.planMeta?.id).toBe('LAB_STANDARD');
    });

    it('PATCH plan on a LAB tenant, or labPlan on a CLINIC → 400', async () => {
      const admin = await env.makePlatformAdmin();
      const lab = await env.makeTenant({ kind: 'LAB', labPlan: 'LAB_BASIC' });
      const clinic = await env.makeTenant({ plan: 'STARTER' });
      const a = await admin.client.axios.patch(
        `/api/platform/tenants/${lab.tenant.id}`,
        { plan: 'PRO' },
      );
      expect(a.status).toBe(400);
      const b = await admin.client.axios.patch(
        `/api/platform/tenants/${clinic.tenant.id}`,
        { labPlan: 'LAB_PREMIUM' },
      );
      expect(b.status).toBe(400);
    });

    it('PATCH with an invalid Plan value → 400', async () => {
      const admin = await env.makePlatformAdmin();
      const { tenant } = await env.makeTenant();
      const res = await admin.client.axios.patch(
        `/api/platform/tenants/${tenant.id}`,
        {
          plan: 'NOT_A_REAL_PLAN',
        },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('authentication', () => {
    it('unauthenticated GET /api/platform/tenants → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/platform/tenants');
      expect(res.status).toBe(401);
    });

    it('malformed bearer on /api/platform/* → 401', async () => {
      const axiosBad = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        headers: { authorization: 'Bearer not-a-real-jwt' },
        validateStatus: () => true,
      });
      const res = await axiosBad.get('/api/platform/tenants');
      expect(res.status).toBe(401);
    });
  });
});
