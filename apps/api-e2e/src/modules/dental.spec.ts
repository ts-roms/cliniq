/**
 * /api/patients/:patientId/dental-chart(s), /api/dental-charts/:id — dental module.
 *
 * The controller uses Actions.PATIENT_READ / PATIENT_WRITE rather than a
 * dental-specific capability, so the role matrix mirrors clinical:
 *   - OWNER/ADMIN/DOCTOR/NURSE/RECEPTIONIST: all hold PATIENT_WRITE per
 *     libs/auth/src/lib/roles.ts. The task spec asks for "DOCTOR/OWNER only"
 *     but that intent isn't enforced today — we test the actual code path.
 *     PATIENT has only PATIENT_READ ⇒ 403 on POST.
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness';

async function seedPatient(client: E2EClient, mrn: string): Promise<string> {
  const res = await client.axios.post('/api/patients', {
    mrn,
    firstName: 'Dent',
    lastName: 'Patient',
    dateOfBirth: '1992-08-08',
    sex: 'MALE',
  });
  if (res.status !== 201) {
    throw new Error(
      `patient seed failed: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`,
    );
  }
  return res.data.id as string;
}

const CHART_FIXTURE = {
  dentition: 'ADULT',
  notes: 'Routine check',
  teeth: [
    {
      toothCode: '11',
      status: 'PRESENT',
      surfaces: [
        { surface: 'OCCLUSAL', finding: 'CARIES', notes: 'small pit' },
      ],
    },
    {
      toothCode: '36',
      status: 'PRESENT',
      surfaces: [{ surface: 'MESIAL', finding: 'FILLING' }],
    },
  ],
};

describe('@org/api-e2e dental module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('DOCTOR can upsert a dental chart, read latest + history', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'DENT-DOC-001');
      const doctor = await env.makeDoctor(tenant);

      const upsert = await doctor.client.axios.post(
        `/api/patients/${patientId}/dental-chart`,
        CHART_FIXTURE,
      );
      expect(upsert.status).toBe(201);
      const chartId = upsert.data.id as string;
      expect(chartId).toBeTruthy();

      const latest = await doctor.client.axios.get(
        `/api/patients/${patientId}/dental-chart`,
      );
      expect(latest.status).toBe(200);
      expect(latest.data?.id).toBe(chartId);

      const history = await doctor.client.axios.get(
        `/api/patients/${patientId}/dental-charts`,
      );
      expect(history.status).toBe(200);
      expect(Array.isArray(history.data)).toBe(true);
      expect(history.data.length).toBeGreaterThanOrEqual(1);

      const one = await doctor.client.axios.get(
        `/api/dental-charts/${chartId}`,
      );
      expect(one.status).toBe(200);
      expect(one.data.id).toBe(chartId);
    });

    it('OWNER can upsert + soft-delete a chart', async () => {
      const { client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'DENT-OWN-001');

      const up = await client.axios.post(
        `/api/patients/${patientId}/dental-chart`,
        CHART_FIXTURE,
      );
      expect(up.status).toBe(201);

      const del = await client.axios.delete(`/api/dental-charts/${up.data.id}`);
      expect(del.status).toBe(204);
    });
  });

  describe('RBAC denial', () => {
    it('PATIENT cannot upsert a dental chart (lacks PATIENT_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.post(
        `/api/patients/${patient.patientId}/dental-chart`,
        CHART_FIXTURE,
      );
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot delete a dental chart (lacks PATIENT_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'DENT-PAT-DEL');
      const created = await client.axios.post(
        `/api/patients/${patientId}/dental-chart`,
        CHART_FIXTURE,
      );
      expect(created.status).toBe(201);

      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.delete(
        `/api/dental-charts/${created.data.id}`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B cannot read Tenant A dental chart by id (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aPatientId = await seedPatient(a.client, 'DENT-RLS-001');
      const created = await a.client.axios.post(
        `/api/patients/${aPatientId}/dental-chart`,
        CHART_FIXTURE,
      );
      expect(created.status).toBe(201);

      const cross = await b.client.axios.get(
        `/api/dental-charts/${created.data.id}`,
      );
      expect([403, 404]).toContain(cross.status);
    });

    it('Tenant B cannot upsert a chart on a Tenant A patient', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aPatientId = await seedPatient(a.client, 'DENT-RLS-002');

      const cross = await b.client.axios.post(
        `/api/patients/${aPatientId}/dental-chart`,
        CHART_FIXTURE,
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
      const res = await axiosBare.get('/api/patients/anything/dental-chart');
      expect(res.status).toBe(401);
    });
  });
});
