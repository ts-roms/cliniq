/**
 * /api/ob — pregnancies, visits, ultrasound. More comprehensive than the legacy
 * happy-path-only spec at apps/api-e2e/src/ob.spec.ts: this covers all roles +
 * explicit tenant isolation + auth.
 *
 * RBAC (from libs/auth/src/lib/roles.ts):
 *   - OWNER/DOCTOR/NURSE/ADMIN/RECEPTIONIST hold PATIENT_WRITE so they can
 *     create pregnancies/visits/ultrasounds in theory. We focus on DOCTOR
 *     (the realistic actor) and assert PATIENT is denied (only PATIENT_READ).
 *   - Pregnancy/Visit gated by Features.OBSTETRICS — included in PREMIUM plan
 *     by default for tenants created via env.makeTenant().
 *   - Ultrasound 2D gated by Features.ULTRASOUND_2D — also in PREMIUM.
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness';

async function seedFemalePatient(
  client: E2EClient,
  mrn: string,
): Promise<string> {
  const res = await client.axios.post('/api/patients', {
    mrn,
    firstName: 'Ana',
    lastName: 'Cruz',
    dateOfBirth: '1992-04-12',
    sex: 'FEMALE',
  });
  if (res.status !== 201) {
    throw new Error(
      `patient seed failed: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`,
    );
  }
  return res.data.id as string;
}

describe('@org/api-e2e ob module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('DOCTOR can create a pregnancy with auto-EDD via Naegele', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedFemalePatient(client, 'OB-DOC-001');
      const doctor = await env.makeDoctor(tenant);

      const preg = await doctor.client.axios.post('/api/ob/pregnancies', {
        patientId,
        lmp: '2026-01-01',
        gravida: 1,
        para: 0,
      });
      expect(preg.status).toBe(201);
      expect(String(preg.data.edd).slice(0, 10)).toBe('2026-10-08');
      expect(preg.data.status).toBe('ACTIVE');
    });

    it('DOCTOR can record a visit with GA auto-computed', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedFemalePatient(client, 'OB-DOC-VIS');
      const doctor = await env.makeDoctor(tenant);

      // LMP 84 days (12 weeks) ago.
      const lmpDate = new Date();
      lmpDate.setDate(lmpDate.getDate() - 84);
      const preg = await doctor.client.axios.post('/api/ob/pregnancies', {
        patientId,
        lmp: lmpDate.toISOString().slice(0, 10),
      });
      expect(preg.status).toBe(201);

      const visit = await doctor.client.axios.post('/api/ob/visits', {
        pregnancyId: preg.data.id,
        fundalHeightCm: 12.0,
        fetalHeartRate: 145,
      });
      expect(visit.status).toBe(201);
      expect(visit.data.gaWeeks).toBe(12);
    });

    it('DOCTOR can create a 2D OB ultrasound report', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedFemalePatient(client, 'OB-DOC-US');
      const doctor = await env.makeDoctor(tenant);

      const preg = await doctor.client.axios.post('/api/ob/pregnancies', {
        patientId,
        lmp: '2026-01-15',
      });
      expect(preg.status).toBe(201);

      const us = await doctor.client.axios.post('/api/ob/ultrasound', {
        patientId,
        pregnancyId: preg.data.id,
        kind: 'OB_2D',
        indication: 'Anomaly scan',
        bpdMm: 65.2,
        estimatedFetalWeightG: 850,
      });
      expect(us.status).toBe(201);
      expect(us.data.kind).toBe('OB_2D');
    });

    it('NURSE can record an OB visit (PATIENT_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedFemalePatient(client, 'OB-NURSE-001');

      const preg = await client.axios.post('/api/ob/pregnancies', {
        patientId,
        lmp: '2026-01-10',
      });
      expect(preg.status).toBe(201);

      const nurse = await env.makeNurse(tenant);
      const visit = await nurse.client.axios.post('/api/ob/visits', {
        pregnancyId: preg.data.id,
        fundalHeightCm: 22.5,
      });
      expect(visit.status).toBe(201);
    });

    it('OWNER can list pregnancies for a patient', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedFemalePatient(client, 'OB-LIST-001');
      await client.axios.post('/api/ob/pregnancies', {
        patientId,
        lmp: '2026-02-15',
      });

      const list = await client.axios.get(
        `/api/ob/pregnancies?patientId=${patientId}`,
      );
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data)).toBe(true);
      expect(list.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('RBAC denial', () => {
    it('PATIENT cannot create a pregnancy (lacks PATIENT_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedFemalePatient(client, 'OB-PAT-403');
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.post('/api/ob/pregnancies', {
        patientId,
        lmp: '2026-03-01',
      });
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot create an ultrasound (lacks PATIENT_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedFemalePatient(client, 'OB-PAT-US-403');
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.post('/api/ob/ultrasound', {
        patientId,
        kind: 'OB_2D',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B cannot list Tenant A pregnancies', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const aPatientId = await seedFemalePatient(a.client, 'OB-RLS-001');
      await a.client.axios.post('/api/ob/pregnancies', {
        patientId: aPatientId,
        lmp: '2026-01-01',
      });

      // From Tenant B, the patientId is invisible — list returns empty or 404.
      const cross = await b.client.axios.get(
        `/api/ob/pregnancies?patientId=${aPatientId}`,
      );
      // Service may return [] (RLS hides) or 404 (patient resolution fails).
      if (cross.status === 200) {
        expect(cross.data.length).toBe(0);
      } else {
        expect([403, 404]).toContain(cross.status);
      }
    });

    it('Tenant B cannot fetch a Tenant A ultrasound by id (404)', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const aPatientId = await seedFemalePatient(a.client, 'OB-RLS-002');

      const us = await a.client.axios.post('/api/ob/ultrasound', {
        patientId: aPatientId,
        kind: 'GENERAL',
      });
      expect(us.status).toBe(201);

      const cross = await b.client.axios.get(
        `/api/ob/ultrasound/${us.data.id}`,
      );
      expect([403, 404]).toContain(cross.status);
    });

    it('Tenant B cannot create a pregnancy on a Tenant A patient', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const aPatientId = await seedFemalePatient(a.client, 'OB-RLS-003');

      const cross = await b.client.axios.post('/api/ob/pregnancies', {
        patientId: aPatientId,
        lmp: '2026-01-01',
      });
      expect([400, 403, 404]).toContain(cross.status);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/ob/pregnancies?patientId=x');
      expect(res.status).toBe(401);
    });
  });
});
