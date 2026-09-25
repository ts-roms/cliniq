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
    it('RECEPTIONIST cannot start a consultation (lacks CONSULT_START)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CON-RBAC-001');
      const receptionist = await env.makeReceptionist(tenant);

      const res = await receptionist.client.axios.post('/api/consultations', {
        patientId,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("ADMIN starts a consult on a clinician's behalf", () => {
    it('must name the attending clinician', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CON-ADM-001');
      const admin = await env.makeAdmin(tenant);

      const bare = await admin.client.axios.post('/api/consultations', {
        patientId,
      });
      expect(bare.status).toBe(400);

      // Naming themselves is the same as naming nobody.
      const self = await admin.client.axios.post('/api/consultations', {
        patientId,
        providerId: admin.userId,
      });
      expect(self.status).toBe(400);
    });

    it('records the chosen doctor as provider, and cannot write the note', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CON-ADM-002');
      const admin = await env.makeAdmin(tenant);
      const doctor = await env.makeDoctor(tenant);

      const started = await admin.client.axios.post('/api/consultations', {
        patientId,
        providerId: doctor.userId,
      });
      expect(started.status).toBe(201);
      expect(started.data.providerId).toBe(doctor.userId);
      const id = started.data.id as string;

      // Detail and list both name the attending clinician, so the chart can
      // show who the consult is with rather than who opened it.
      const detail = await admin.client.axios.get(`/api/consultations/${id}`);
      expect(detail.status).toBe(200);
      expect(detail.data.provider?.id).toBe(doctor.userId);
      expect(typeof detail.data.provider?.name).toBe('string');
      const list = await admin.client.axios.get('/api/consultations', {
        params: { patientId },
      });
      expect(
        list.data.find((c: { id: string }) => c.id === id)?.provider?.id,
      ).toBe(doctor.userId);

      // Starting is the whole grant: the note and completion stay clinical.
      const write = await admin.client.axios.patch(`/api/consultations/${id}`, {
        subjective: { chiefComplaint: 'Cough' },
      });
      expect(write.status).toBe(403);
      const complete = await admin.client.axios.post(
        `/api/consultations/${id}/complete`,
      );
      expect(complete.status).toBe(403);

      // ...while the doctor it was opened for carries on as normal.
      const byDoctor = await doctor.client.axios.patch(
        `/api/consultations/${id}`,
        { subjective: { chiefComplaint: 'Cough' } },
      );
      expect(byDoctor.status).toBe(200);
    });

    it('rejects a provider who is not a clinician of this clinic', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const patientId = await seedPatient(a.client, 'CON-ADM-003');
      const admin = await env.makeAdmin(a.tenant);
      const receptionist = await env.makeReceptionist(a.tenant);
      const otherClinicDoctor = await env.makeDoctor(b.tenant);

      for (const providerId of [
        receptionist.userId,
        otherClinicDoctor.userId,
      ]) {
        const res = await admin.client.axios.post('/api/consultations', {
          patientId,
          providerId,
        });
        expect(res.status).toBe(400);
      }
    });

    it('a NURSE may open one for a doctor', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CON-ADM-004');
      const doctor = await env.makeDoctor(tenant);
      const nurse = await env.makeNurse(tenant);

      const res = await nurse.client.axios.post('/api/consultations', {
        patientId,
        providerId: doctor.userId,
      });
      expect(res.status).toBe(201);
      expect(res.data.providerId).toBe(doctor.userId);
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
