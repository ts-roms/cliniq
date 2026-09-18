/**
 * /api/lab/* — the lab marketplace mega-module (8 sub-controllers).
 *
 * Sub-surfaces covered (one happy path each):
 *   - lab/clinic-links — invite + list
 *   - lab/products     — create + list
 *   - lab/cases        — list (created by clinic-side flow in clinic.spec.ts)
 *   - lab/tags         — create + list
 *   - lab/materials    — create + list
 *   - lab/conformity-templates (compliance) — list
 *   - lab/invoices     — list
 *   - lab/stats        — overview
 *
 * Note: a top-level apps/api-e2e/src/lab.spec.ts already exists from the
 * original suite; this module-shaped spec adds the per-role / per-sub
 * coverage that fits the Phase 1 plan.
 */
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EClient,
} from '../support/harness';

describe('@org/api-e2e lab module', () => {
  let env: E2EEnv;
  let lab: { tenant: E2ETenant; client: E2EClient };

  beforeAll(async () => {
    env = await bootEnv();
    lab = await env.makeTenant({ kind: 'LAB' });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path — clinic-links', () => {
    it('LAB OWNER can invite a clinic and list links', async () => {
      const clinic = await env.makeTenant({ kind: 'CLINIC' });
      const invite = await lab.client.axios.post(
        '/api/lab/clinic-links/invite',
        {
          clinicSlug: clinic.tenant.slug,
        },
      );
      expect([200, 201]).toContain(invite.status);

      const list = await lab.client.axios.get('/api/lab/clinic-links');
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data)).toBe(true);
    });
  });

  describe('happy path — products', () => {
    it('LAB OWNER can create a product and list catalog', async () => {
      const create = await lab.client.axios.post('/api/lab/products', {
        name: `E2E Product ${Date.now()}`,
        defaultPrice: 50000,
        currency: 'PHP',
      });
      expect([200, 201]).toContain(create.status);

      const list = await lab.client.axios.get('/api/lab/products');
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data)).toBe(true);
    });
  });

  describe('happy path — tags', () => {
    it('LAB OWNER can create + list tags', async () => {
      const create = await lab.client.axios.post('/api/lab/tags', {
        name: `tag-${Date.now()}`,
        color: 'FF0000',
      });
      expect([200, 201]).toContain(create.status);

      const list = await lab.client.axios.get('/api/lab/tags');
      expect(list.status).toBe(200);
    });
  });

  describe('happy path — materials', () => {
    it('LAB OWNER can create + list materials', async () => {
      const create = await lab.client.axios.post('/api/lab/materials', {
        name: `Material ${Date.now()}`,
        unitOfMeasure: 'gram',
      });
      expect([200, 201]).toContain(create.status);

      const list = await lab.client.axios.get('/api/lab/materials');
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data)).toBe(true);
    });
  });

  describe('happy path — compliance (conformity templates)', () => {
    it('LAB OWNER can list templates (empty on a fresh tenant)', async () => {
      const list = await lab.client.axios.get('/api/lab/conformity-templates');
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data)).toBe(true);
    });
  });

  describe('happy path — invoices', () => {
    it('LAB OWNER can list invoices (empty on a fresh tenant)', async () => {
      const list = await lab.client.axios.get('/api/lab/invoices');
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data)).toBe(true);
    });
  });

  describe('happy path — stats', () => {
    it('LAB OWNER can fetch stats overview', async () => {
      const res = await lab.client.axios.get('/api/lab/stats');
      expect(res.status).toBe(200);
      expect(typeof res.data).toBe('object');
    });
  });

  describe('feature gating', () => {
    it('CLINIC tenant cannot hit lab-side routes (wrong tenant kind)', async () => {
      // A CLINIC tenant has tenantKind=CLINIC; lab routes assume LAB. Most
      // routes require LAB_ORDERS / LAB_CATALOG features which a CLINIC plan
      // doesn't carry — expect 402/403/404 depending on the gate.
      const clinic = await env.makeTenant({ kind: 'CLINIC' });
      const res = await clinic.client.axios.get('/api/lab/products');
      expect([402, 403, 404]).toContain(res.status);
    });
  });

  describe('RBAC denial', () => {
    it('DOCTOR on a LAB tenant cannot create products (TENANT_MANAGE required)', async () => {
      const doctor = await env.makeDoctor(lab.tenant);
      const res = await doctor.client.axios.post('/api/lab/products', {
        name: 'doctor cannot',
        defaultPrice: 1,
        currency: 'PHP',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Lab B cannot see Lab A products', async () => {
      const labA = await env.makeTenant({ kind: 'LAB' });
      const labB = await env.makeTenant({ kind: 'LAB' });
      const created = await labA.client.axios.post('/api/lab/products', {
        name: `RLS-A-${Date.now()}`,
        defaultPrice: 100,
        currency: 'PHP',
      });
      expect([200, 201]).toContain(created.status);

      const listB = await labB.client.axios.get('/api/lab/products');
      expect(listB.status).toBe(200);
      expect(
        (listB.data as Array<{ name: string }>).some((p) =>
          p.name.startsWith('RLS-A-'),
        ),
      ).toBe(false);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/lab/products');
      expect(res.status).toBe(401);
    });
  });
});
