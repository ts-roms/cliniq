/**
 * /api/consultations — start, update, complete, RBAC, RLS.
 *
 * Skipped here: the AI-draft endpoints (/generate/soap, /generate/derm) —
 * those need a stub ai-service running. They live in the ai-service contract
 * spec instead (Phase 3 of the e2e plan).
 */
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EClient,
} from '../support/harness';

async function seedPatient(client: E2EClient, mrn: string): Promise<string> {
  const res = await client.axios.post('/api/patients', {
    mrn,
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: '1990-01-01',
    sex: 'FEMALE',
  });
  if (res.status !== 201) {
    throw new Error(
      `patient seed failed: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`,
    );
  }
  return res.data.id as string;
}

describe('@org/api-e2e consultations module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('DOCTOR can start, update SOAP, complete a consultation', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CON-001');
      const doctor = await env.makeDoctor(tenant);

      const started = await doctor.client.axios.post('/api/consultations', {
        patientId,
      });
      expect(started.status).toBe(201);
      const id = started.data.id as string;

      const updated = await doctor.client.axios.patch(
        `/api/consultations/${id}`,
        {
          subjective: {
            chiefComplaint: 'Headache',
            onset: 'this morning',
            severity: 6,
          },
          objective: { vitals: { bp: '120/80' } },
          assessment: {
            problems: [{ problem: 'Tension headache', icd10: 'G44.2' }],
          },
          plan: {
            items: [
              {
                problem: 'Tension headache',
                actions: ['paracetamol 500mg PO'],
              },
            ],
          },
        },
      );
      expect(updated.status).toBe(200);

      const completed = await doctor.client.axios.post(
        `/api/consultations/${id}/complete`,
      );
      expect(completed.status).toBe(201);
    });
  });

  describe('RBAC denial', () => {
    it('RECEPTIONIST cannot start a consultation (lacks CONSULT_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CON-RBAC-001');
      const receptionist = await env.makeReceptionist(tenant);

      const res = await receptionist.client.axios.post('/api/consultations', {
        patientId,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Tenant B cannot fetch a Tenant A consultation by id (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const patientId = await seedPatient(a.client, 'CON-RLS-001');

      const started = await a.client.axios.post('/api/consultations', {
        patientId,
      });
      expect(started.status).toBe(201);
      const id = started.data.id as string;

      const cross = await b.client.axios.get(`/api/consultations/${id}`);
      expect(cross.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/consultations', {
        patientId: 'x',
      });
      expect(res.status).toBe(401);
    });
  });
});
