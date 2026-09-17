/**
 * /api/patients/:patientId/(allergies|medications|conditions|vitals) — clinical module.
 *
 * RBAC matrix (from libs/auth/src/lib/roles.ts):
 *  - DOCTOR / NURSE / OWNER / ADMIN have PATIENT_READ + PATIENT_WRITE ⇒ full read/write.
 *  - RECEPTIONIST has PATIENT_READ + PATIENT_WRITE too (per roles matrix) — but
 *    in clinical practice they're not expected to *write* clinical facts. The
 *    capability check at the API level lets them through, so we assert what the
 *    code actually does, not the policy intent. If/when the matrix is tightened
 *    to make Receptionist read-only for clinical, flip this expectation.
 *  - PATIENT only has PATIENT_READ ⇒ 403 on POST. GET on someone else's record
 *    is blocked at the patient-resolution layer (404/403).
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness';

async function seedPatient(client: E2EClient, mrn: string): Promise<string> {
  const res = await client.axios.post('/api/patients', {
    mrn,
    firstName: 'Clin',
    lastName: 'Patient',
    dateOfBirth: '1980-04-22',
    sex: 'FEMALE',
  });
  if (res.status !== 201) {
    throw new Error(`patient seed failed: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  return res.data.id as string;
}

const ALLERGY_FIXTURE = {
  substance: 'Penicillin',
  type: 'DRUG',
  severity: 'MODERATE',
  reaction: 'rash',
};

const VITAL_FIXTURE = {
  systolic: 120,
  diastolic: 80,
  heartRate: 72,
  tempC: 36.8,
  spo2: 98,
};

const CONDITION_FIXTURE = {
  name: 'Hypertension',
  icd10Code: 'I10',
  status: 'ACTIVE',
};

describe('@org/api-e2e clinical module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('DOCTOR can record + list allergies, vitals, conditions', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CLIN-DOC-001');
      const doctor = await env.makeDoctor(tenant);

      const allergy = await doctor.client.axios.post(
        `/api/patients/${patientId}/allergies`,
        ALLERGY_FIXTURE,
      );
      expect(allergy.status).toBe(201);
      expect(allergy.data.id).toBeTruthy();

      const listAllergies = await doctor.client.axios.get(
        `/api/patients/${patientId}/allergies`,
      );
      expect(listAllergies.status).toBe(200);
      expect(Array.isArray(listAllergies.data)).toBe(true);
      expect(listAllergies.data.length).toBeGreaterThanOrEqual(1);

      const vital = await doctor.client.axios.post(
        `/api/patients/${patientId}/vitals`,
        VITAL_FIXTURE,
      );
      expect(vital.status).toBe(201);

      const cond = await doctor.client.axios.post(
        `/api/patients/${patientId}/conditions`,
        CONDITION_FIXTURE,
      );
      expect(cond.status).toBe(201);

      const listConditions = await doctor.client.axios.get(
        `/api/patients/${patientId}/conditions`,
      );
      expect(listConditions.status).toBe(200);
      expect(listConditions.data.length).toBeGreaterThanOrEqual(1);
    });

    it('NURSE can record + list vitals (PATIENT_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CLIN-NURSE-001');
      const nurse = await env.makeNurse(tenant);

      const vital = await nurse.client.axios.post(
        `/api/patients/${patientId}/vitals`,
        VITAL_FIXTURE,
      );
      expect(vital.status).toBe(201);

      const list = await nurse.client.axios.get(`/api/patients/${patientId}/vitals`);
      expect(list.status).toBe(200);
      expect(list.data.length).toBeGreaterThanOrEqual(1);
    });

    it('RECEPTIONIST can read allergies (PATIENT_READ)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CLIN-RECP-READ');
      // Seed an allergy as OWNER so the list isn't empty.
      const seed = await client.axios.post(
        `/api/patients/${patientId}/allergies`,
        ALLERGY_FIXTURE,
      );
      expect(seed.status).toBe(201);

      const recp = await env.makeReceptionist(tenant);
      const list = await recp.client.axios.get(`/api/patients/${patientId}/allergies`);
      expect(list.status).toBe(200);
      expect(list.data.length).toBeGreaterThanOrEqual(1);
    });

    it('removing an allergy as DOCTOR returns 204', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CLIN-DEL-001');
      const doctor = await env.makeDoctor(tenant);

      const created = await doctor.client.axios.post(
        `/api/patients/${patientId}/allergies`,
        ALLERGY_FIXTURE,
      );
      expect(created.status).toBe(201);

      const del = await doctor.client.axios.delete(
        `/api/patients/${patientId}/allergies/${created.data.id}`,
      );
      expect(del.status).toBe(204);
    });
  });

  describe('RBAC denial', () => {
    it('PATIENT cannot POST a vital on themselves (lacks PATIENT_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.post(
        `/api/patients/${patient.patientId}/vitals`,
        VITAL_FIXTURE,
      );
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot POST an allergy (403)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post(
        `/api/patients/${patient.patientId}/allergies`,
        ALLERGY_FIXTURE,
      );
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot POST a condition (403)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.post(
        `/api/patients/${patient.patientId}/conditions`,
        CONDITION_FIXTURE,
      );
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B cannot list Tenant A allergies (404 on patient lookup)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aPatientId = await seedPatient(a.client, 'CLIN-RLS-001');
      await a.client.axios.post(
        `/api/patients/${aPatientId}/allergies`,
        ALLERGY_FIXTURE,
      );

      const cross = await b.client.axios.get(`/api/patients/${aPatientId}/allergies`);
      expect([403, 404]).toContain(cross.status);
    });

    it('Tenant B cannot POST a vital onto a Tenant A patient (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aPatientId = await seedPatient(a.client, 'CLIN-RLS-002');

      const cross = await b.client.axios.post(
        `/api/patients/${aPatientId}/vitals`,
        VITAL_FIXTURE,
      );
      expect([403, 404]).toContain(cross.status);
    });
  });

  describe('authentication', () => {
    it('unauthenticated request returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/patients/anything/allergies');
      expect(res.status).toBe(401);
    });
  });
});
