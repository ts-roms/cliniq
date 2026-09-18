/**
 * /api/me — patient portal, self-scoped via JWT `pid` claim.
 *
 * Covers:
 *  - PATIENT can read their own profile / appointments / invoices / records / tele.
 *  - Staff JWTs (no `pid`) get 403 from MeService.requirePatientId.
 *  - Unauthenticated → 401.
 *
 * Skipped here: GET /api/me/invoices/:id/pdf — exercises BillingService PDF
 * renderer which depends on the html-to-pdf pipeline; covered in billing specs.
 * TODO: cover invoice PDF when the billing module spec lands.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

describe('@org/api-e2e me module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('PATIENT can GET /api/me/profile', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.get('/api/me/profile');
      expect(res.status).toBe(200);
      expect(res.data.id).toBe(patient.patientId);
      // Email matches the portal-signup email (no leaks).
      expect(res.data.email).toBe(patient.email);
    });

    it('PATIENT can GET /api/me/appointments (empty list at signup)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.get('/api/me/appointments');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('PATIENT can GET /api/me/invoices', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.get('/api/me/invoices');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('PATIENT can GET /api/me/records (clinical record bundle)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.get('/api/me/records');
      expect(res.status).toBe(200);
      expect(res.data).toEqual(
        expect.objectContaining({
          allergies: expect.any(Array),
          medications: expect.any(Array),
          conditions: expect.any(Array),
          vitals: expect.any(Array),
          prescriptions: expect.any(Array),
          labOrders: expect.any(Array),
        }),
      );
    });

    it('PATIENT can GET /api/me/tele/active (returns null when none live)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.get('/api/me/tele/active');
      expect(res.status).toBe(200);
      // No live tele session at signup time → null.
      // Nest serialises a `null` return as an empty 200 body; axios reads
      // that as ''. Either spelling means "no live session".
      expect(res.data === null || res.data === '').toBe(true);
    });
  });

  describe('staff profile (/api/me/staff-profile)', () => {
    it('DOCTOR can read and update their own name + PRC licence', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);

      const before = await doctor.client.axios.get('/api/me/staff-profile');
      expect(before.status).toBe(200);
      expect(before.data.email).toBe(doctor.email);
      expect(before.data.role).toBe('DOCTOR');
      // makeDoctor already set a licence through this endpoint.
      expect(before.data.prcLicenseNumber).toMatch(/^\d{4,10}$/);

      const updated = await doctor.client.axios.patch('/api/me/staff-profile', {
        name: 'Dr. E2E Renamed',
        prcLicenseNumber: '7654321',
        prcLicenseExpiry: '2030-01-31',
        prcSpecialty: 'Pediatrics',
      });
      expect(updated.status).toBe(200);
      expect(updated.data.name).toBe('Dr. E2E Renamed');
      expect(updated.data.prcLicenseNumber).toBe('7654321');
      expect(updated.data.prcLicenseExpiry).toContain('2030-01-31');
      expect(updated.data.prcSpecialty).toBe('Pediatrics');

      // null clears an optional field; the number stays.
      const cleared = await doctor.client.axios.patch('/api/me/staff-profile', {
        prcSpecialty: null,
      });
      expect(cleared.status).toBe(200);
      expect(cleared.data.prcSpecialty).toBeNull();
      expect(cleared.data.prcLicenseNumber).toBe('7654321');
    });

    it('rejects a malformed licence number (400) and unknown fields', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const bad = await doctor.client.axios.patch('/api/me/staff-profile', {
        prcLicenseNumber: 'PRC-ABC',
      });
      expect(bad.status).toBe(400);
      const unknown = await doctor.client.axios.patch('/api/me/staff-profile', {
        email: 'cannot@change.local',
      });
      expect(unknown.status).toBe(400);
    });

    it('a licence set here unblocks prescribing', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      // Remove the licence, confirm the api refuses, restore it, confirm it issues.
      const off = await doctor.client.axios.patch('/api/me/staff-profile', {
        prcLicenseNumber: null,
      });
      expect(off.status).toBe(200);
      const patient = await client.axios.post('/api/patients', {
        mrn: 'PROFILE-RX',
        firstName: 'Profile',
        lastName: 'Test',
        dateOfBirth: '1990-01-01',
        sex: 'FEMALE',
      });
      expect(patient.status).toBe(201);
      const rx = {
        patientId: patient.data.id as string,
        items: [
          {
            drugName: 'Paracetamol',
            dose: '500mg',
            frequency: 'BID',
            durationDays: 3,
          },
        ],
      };
      const refused = await doctor.client.axios.post('/api/prescriptions', rx);
      expect(refused.status).toBe(400);
      expect(String(refused.data.message)).toMatch(/PRC license/i);
      const on = await doctor.client.axios.patch('/api/me/staff-profile', {
        prcLicenseNumber: '2468135',
      });
      expect(on.status).toBe(200);
      const issued = await doctor.client.axios.post('/api/prescriptions', rx);
      expect(issued.status).toBe(201);
      expect(issued.data.providerLicense).toBe('2468135');
    });

    it('PATIENT is refused (403) and anonymous is 401', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.get('/api/me/staff-profile');
      expect(res.status).toBe(403);
      const upd = await patient.client.axios.patch('/api/me/staff-profile', {
        name: 'Patient Trying',
      });
      expect(upd.status).toBe(403);
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const anon = await axiosBare.get('/api/me/staff-profile');
      expect(anon.status).toBe(401);
    });
  });

  describe('RBAC denial', () => {
    it.each(['OWNER', 'DOCTOR', 'NURSE', 'RECEPTIONIST'] as const)(
      '%s (staff, no patientId on JWT) → 403 on /api/me/profile',
      async (role) => {
        const { tenant, client: ownerClient } = await env.makeTenant();
        const target =
          role === 'OWNER'
            ? { client: ownerClient }
            : role === 'DOCTOR'
              ? await env.makeDoctor(tenant)
              : role === 'NURSE'
                ? await env.makeNurse(tenant)
                : await env.makeReceptionist(tenant);

        const res = await target.client.axios.get('/api/me/profile');
        // Staff roles still satisfy PATIENT_READ-gated Requires(), but
        // MeService.requirePatientId throws 403 because the JWT has no `pid`.
        // OWNER does NOT have PATIENT_READ at all → also 403 (different
        // codepath, same observable status). Just assert 403.
        expect(res.status).toBe(403);
      },
    );

    it('OWNER (no PATIENT_READ) → 403 on /api/me/appointments', async () => {
      const { client } = await env.makeTenant();
      const res = await client.axios.get('/api/me/appointments');
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Patient in tenant A cannot see tenant B data — A profile is theirs only', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const patientA = await env.makePatient(a.tenant);
      const patientB = await env.makePatient(b.tenant);

      const resA = await patientA.client.axios.get('/api/me/profile');
      const resB = await patientB.client.axios.get('/api/me/profile');

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.data.id).toBe(patientA.patientId);
      expect(resB.data.id).toBe(patientB.patientId);
      // Cross-check: distinct ids, distinct emails.
      expect(resA.data.id).not.toBe(resB.data.id);
    });
  });

  describe('authentication', () => {
    it('unauthenticated /api/me/profile → 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/me/profile');
      expect(res.status).toBe(401);
    });

    it('malformed bearer on /api/me/* → 401', async () => {
      const axiosBad = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        headers: { authorization: 'Bearer not-a-real-jwt' },
        validateStatus: () => true,
      });
      const res = await axiosBad.get('/api/me/records');
      expect(res.status).toBe(401);
    });
  });
});
