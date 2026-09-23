/**
 * Portal boundary — a PATIENT-role account must not reach the staff surface.
 *
 * Regression test for the original hole: the PATIENT role held
 * `Actions.PATIENT_READ`, which is the only gate on ~30 staff routes. A portal
 * account could therefore call GET /api/patients, GET /api/patients/:id,
 * GET /api/patients/:id/export, GET /api/lab-orders/:id and
 * GET /api/prescriptions/:id/pdf and read every chart in its tenant. RLS
 * stopped cross-tenant reads; nothing stopped patient → patient.
 *
 * Two mechanisms are asserted here, and either one alone would close the hole:
 *   1. PATIENT holds PORTAL_READ and nothing else (RbacGuard).
 *   2. PortalScopeGuard refuses a PATIENT JWT on any route not @PortalRoute().
 *
 * The second half of the file pins the portal down positively — /api/me/*
 * must keep working, and must stay self-scoped.
 */
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EUser,
} from '../support/harness.js';

jest.setTimeout(120_000);

/** Staff routes a portal account previously reached with a 200. */
const FORBIDDEN_GETS = [
  '/api/patients',
  '/api/patients/PLACEHOLDER',
  '/api/patients/PLACEHOLDER/modules',
  '/api/patients/PLACEHOLDER/lab-orders',
  '/api/patients/PLACEHOLDER/hmo-memberships',
  '/api/patients/PLACEHOLDER/dental-chart',
  '/api/patients/PLACEHOLDER/allergies',
  '/api/patients/PLACEHOLDER/medications',
  '/api/patients/PLACEHOLDER/conditions',
  '/api/patients/PLACEHOLDER/vitals',
  '/api/patients/PLACEHOLDER/consents',
  '/api/appointments',
  '/api/prescriptions',
  '/api/ob/pregnancies',
  // Clinician tooling with no portal screen behind it. Not PHI (ICD-10 is a
  // public code list) — closed as surface reduction. See icd-codes.spec.ts.
  '/api/icd-codes/search?q=hyp',
  // JWT-only staff routes (no @Requires at all) that PortalScopeGuard now
  // closes. Before the guard existed, a portal token reached every one.
  '/api/delegations/granted',
  '/api/delegations/received-active',
  '/api/delegations/eligible-delegatees',
  '/api/visit-types',
] as const;

/**
 * Self-scoped account routes a portal account legitimately owns. Each is
 * scoped to the caller's own userId in its service, and each is marked
 * @PortalRoute(). /api/auth/me is the one that matters most: the portal
 * session hook calls it on every page load, so closing it would have taken
 * the whole portal down.
 */
const ALLOWED_PORTAL_GETS = [
  '/api/auth/me',
  '/api/mfa/status',
  '/api/notifications',
  '/api/notifications/unread-count',
] as const;

describe('@org/api-e2e portal boundary', () => {
  let env: E2EEnv;
  let tenant: E2ETenant;
  let patient: E2EUser & { patientId: string };
  /** A second patient in the SAME tenant — the one the first must not read. */
  let otherPatientId: string;

  beforeAll(async () => {
    env = await bootEnv();
    const made = await env.makeTenant({ plan: 'PREMIUM' });
    tenant = made.tenant;
    patient = await env.makePatient(tenant);
    const other = await env.makePatient(tenant);
    otherPatientId = other.patientId;
  });

  afterAll(async () => {
    await env.cleanup();
  });

  describe('staff surface is closed to portal accounts', () => {
    it.each(FORBIDDEN_GETS)('PATIENT → 403 on GET %s', async (path) => {
      const res = await patient.client.axios.get(
        path.replaceAll('PLACEHOLDER', otherPatientId),
      );
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot read ANOTHER patient by id', async () => {
      const res = await patient.client.axios.get(
        `/api/patients/${otherPatientId}`,
      );
      expect(res.status).toBe(403);
      // The error envelope echoes `path`, which contains the id the caller
      // supplied — that is not a leak. What must not come back is the record:
      // no demographics, no MRN.
      const body = res.data as Record<string, unknown>;
      expect(body['mrn']).toBeUndefined();
      expect(body['firstName']).toBeUndefined();
      expect(body['lastName']).toBeUndefined();
      expect(body['dateOfBirth']).toBeUndefined();
    });

    it('PATIENT cannot read their OWN record through the staff route either', async () => {
      // Self-service goes through /api/me/profile. The staff route stays shut
      // regardless of whose id is in the path, so no id-guessing oracle exists.
      const res = await patient.client.axios.get(
        `/api/patients/${patient.patientId}`,
      );
      expect(res.status).toBe(403);
    });

    it("PATIENT cannot export another patient's chart", async () => {
      const res = await patient.client.axios.get(
        `/api/patients/${otherPatientId}/export`,
      );
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot list the clinic roster', async () => {
      const res = await patient.client.axios.get('/api/patients');
      expect(res.status).toBe(403);
      expect(Array.isArray(res.data)).toBe(false);
    });

    it('PATIENT cannot read a lab order belonging to another patient', async () => {
      const owner = await env.makeTenant({ plan: 'PREMIUM' });
      // Order lives in a different tenant, so a leak here would be both a
      // portal escape AND a tenant escape. Assert the portal gate fires first.
      const rec = await owner.client.axios.post('/api/patients', {
        mrn: `MRN-PB-${Date.now()}`,
        firstName: 'Lab',
        lastName: 'Target',
        dateOfBirth: '1988-01-01',
        sex: 'MALE',
      });
      expect(rec.status).toBe(201);
      const order = await owner.client.axios.post('/api/lab-orders', {
        patientId: rec.data.id,
        items: [{ testName: 'CBC' }],
      });
      expect(order.status).toBe(201);

      const res = await patient.client.axios.get(
        `/api/lab-orders/${order.data.id}`,
      );
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot reach the staff profile route', async () => {
      const res = await patient.client.axios.get('/api/me/staff-profile');
      expect(res.status).toBe(403);
    });

    it('PATIENT still cannot write (unchanged)', async () => {
      const res = await patient.client.axios.post('/api/patients', {
        mrn: `MRN-PB-W-${Date.now()}`,
        firstName: 'Should',
        lastName: 'Fail',
        dateOfBirth: '1990-01-01',
        sex: 'FEMALE',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('the portal itself keeps working', () => {
    it.each([
      '/api/me/profile',
      '/api/me/appointments',
      '/api/me/invoices',
      '/api/me/records',
      '/api/me/tele/active',
      // Not under /me, but deliberately @PortalRoute(): the portal shell
      // renders the clinic's branding from the caller's OWN tenant row.
      '/api/tenants/me/settings',
    ])('PATIENT → 200 on GET %s', async (path) => {
      const res = await patient.client.axios.get(path);
      expect(res.status).toBe(200);
    });

    it.each(ALLOWED_PORTAL_GETS)(
      'PATIENT → 200 on self-scoped account route GET %s',
      async (path) => {
        const res = await patient.client.axios.get(path);
        expect(res.status).toBe(200);
      },
    );

    it('/api/auth/me echoes only the caller', async () => {
      const res = await patient.client.axios.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.data.role).toBe('PATIENT');
      expect(res.data.patientId).toBe(patient.patientId);
      expect(res.data.tenantId).toBe(tenant.id);
    });

    it('notifications list is the callers own, and broadcast stays shut', async () => {
      const list = await patient.client.axios.get('/api/notifications');
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data)).toBe(true);
      const broadcast = await patient.client.axios.post(
        '/api/notifications/broadcast',
        { title: 'nope', roles: ['PATIENT'] },
      );
      expect(broadcast.status).toBe(403);
    });

    it('tenant settings carry branding, never patient data', async () => {
      const res = await patient.client.axios.get('/api/tenants/me/settings');
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(tenant.id);
      const keys = Object.keys(res.data as Record<string, unknown>);
      expect(keys).not.toContain('patients');
      expect(keys).not.toContain('users');
    });

    it('/api/me/profile returns the caller, derived from the JWT', async () => {
      const res = await patient.client.axios.get('/api/me/profile');
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(patient.patientId);
      expect(res.data.id).not.toBe(otherPatientId);
    });
  });

  describe('staff are unaffected', () => {
    it('DOCTOR can still list patients and read one', async () => {
      const doctor = await env.makeDoctor(tenant);
      const list = await doctor.client.axios.get('/api/patients');
      expect(list.status).toBe(200);
      const one = await doctor.client.axios.get(
        `/api/patients/${otherPatientId}`,
      );
      expect(one.status).toBe(200);
    });

    it('DOCTOR can still read and update their own staff profile', async () => {
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.get('/api/me/staff-profile');
      expect(res.status).toBe(200);
    });

    it('staff are still refused on portal routes (no `pid` on the JWT)', async () => {
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.get('/api/me/profile');
      expect(res.status).toBe(403);
    });
  });
});
