/**
 * /api/patients/:patientId/consents — set + get patient consents, plus the
 * cross-route ConsentsInterceptor enforcement.
 *
 * Routes:
 *   - GET  /api/patients/:patientId/consents          (PATIENT_READ)
 *   - PUT  /api/patients/:patientId/consents          (PATIENT_WRITE)
 *
 * ConsentsInterceptor: registered globally in consents.module. Routes
 * decorated with @RequiresConsent(type, patientIdFrom) call into
 * ConsentsService.hasGranted at request time and throw 403 if the patient
 * hasn't granted that consent type.
 *
 * We use POST /api/consultations/:id/drafts/soap as the canonical
 * @RequiresConsent route — it's decorated with
 * @RequiresConsent(ConsentTypeDto.AI_PROCESSING, 'param:id-consultation').
 * Without AI_PROCESSING consent on the patient, the interceptor throws 403
 * BEFORE the service ever runs. With consent, the route progresses (may then
 * fail downstream — Bedrock is unreachable in CI — but that's a different
 * failure mode than 403).
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness';

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

describe('@org/api-e2e consents module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can set + read back a patient consent', async () => {
      const { client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CONSENT-OWN-001');

      const setRes = await client.axios.put(
        `/api/patients/${patientId}/consents`,
        {
          type: 'AI_PROCESSING',
          granted: true,
        },
      );
      expect(setRes.status).toBe(200);
      expect(setRes.data.granted).toBe(true);
      expect(setRes.data.type).toBe('AI_PROCESSING');

      const list = await client.axios.get(
        `/api/patients/${patientId}/consents`,
      );
      expect(list.status).toBe(200);
      const ai = list.data.find(
        (c: { type: string }) => c.type === 'AI_PROCESSING',
      );
      expect(ai).toBeTruthy();
      expect(ai.granted).toBe(true);
    });

    it('DOCTOR can withdraw a non-TREATMENT consent with a reason', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CONSENT-DOC-001');
      const doctor = await env.makeDoctor(tenant);

      const grant = await doctor.client.axios.put(
        `/api/patients/${patientId}/consents`,
        { type: 'MARKETING', granted: true },
      );
      expect(grant.status).toBe(200);

      const withdraw = await doctor.client.axios.put(
        `/api/patients/${patientId}/consents`,
        {
          type: 'MARKETING',
          granted: false,
          withdrawalReason: 'patient unsubscribed',
        },
      );
      expect(withdraw.status).toBe(200);
      expect(withdraw.data.granted).toBe(false);
      expect(withdraw.data.withdrawalReason).toBe('patient unsubscribed');
    });

    it('rejects withdrawing a non-TREATMENT consent without a reason (400)', async () => {
      const { client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CONSENT-VAL-001');
      // Grant first so withdrawal has a target.
      await client.axios.put(`/api/patients/${patientId}/consents`, {
        type: 'AI_PROCESSING',
        granted: true,
      });

      const bad = await client.axios.put(
        `/api/patients/${patientId}/consents`,
        {
          type: 'AI_PROCESSING',
          granted: false,
        },
      );
      expect(bad.status).toBe(400);
    });

    it('rejects withdrawing TREATMENT consent entirely (400)', async () => {
      const { client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'CONSENT-TR-001');
      await client.axios.put(`/api/patients/${patientId}/consents`, {
        type: 'TREATMENT',
        granted: true,
      });

      const bad = await client.axios.put(
        `/api/patients/${patientId}/consents`,
        {
          type: 'TREATMENT',
          granted: false,
          withdrawalReason: 'changed mind',
        },
      );
      expect(bad.status).toBe(400);
    });
  });

  describe('ConsentsInterceptor enforcement', () => {
    it('AI SOAP draft is BLOCKED without AI_PROCESSING consent (403)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedPatient(client, 'CONSENT-INT-001');
      const doctor = await env.makeDoctor(tenant);

      const consult = await doctor.client.axios.post('/api/consultations', {
        patientId,
      });
      expect(consult.status).toBe(201);
      const consultId = consult.data.id as string;

      // No AI_PROCESSING consent yet — interceptor must 403 before reaching
      // the service (so no Bedrock call is made).
      const draft = await doctor.client.axios.post(
        `/api/consultations/${consultId}/drafts/soap`,
      );
      expect(draft.status).toBe(403);
      expect(String(draft.data.message ?? '')).toMatch(/AI_PROCESSING/i);
    });

    it('AI SOAP draft progresses past the interceptor WITH AI_PROCESSING consent (not 403)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedPatient(client, 'CONSENT-INT-002');
      const doctor = await env.makeDoctor(tenant);

      // Grant AI_PROCESSING up front.
      const grant = await client.axios.put(
        `/api/patients/${patientId}/consents`,
        { type: 'AI_PROCESSING', granted: true },
      );
      expect(grant.status).toBe(200);

      const consult = await doctor.client.axios.post('/api/consultations', {
        patientId,
      });
      expect(consult.status).toBe(201);
      const consultId = consult.data.id as string;

      const draft = await doctor.client.axios.post(
        `/api/consultations/${consultId}/drafts/soap`,
      );
      // The interceptor passes — the actual call may then fail because
      // Bedrock/ai-service isn't running in CI. We only assert "not 403 for
      // the consent reason". Any 2xx or non-403 4xx/5xx proves the
      // interceptor let us through.
      expect(draft.status).not.toBe(403);
    });

    it('AI SOAP draft is BLOCKED after AI_PROCESSING is withdrawn (403)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await seedPatient(client, 'CONSENT-INT-003');
      const doctor = await env.makeDoctor(tenant);

      await client.axios.put(`/api/patients/${patientId}/consents`, {
        type: 'AI_PROCESSING',
        granted: true,
      });

      const consult = await doctor.client.axios.post('/api/consultations', {
        patientId,
      });
      expect(consult.status).toBe(201);
      const consultId = consult.data.id as string;

      // Withdraw consent — interceptor must now block again.
      const withdraw = await client.axios.put(
        `/api/patients/${patientId}/consents`,
        {
          type: 'AI_PROCESSING',
          granted: false,
          withdrawalReason: 'opted out',
        },
      );
      expect(withdraw.status).toBe(200);

      const draft = await doctor.client.axios.post(
        `/api/consultations/${consultId}/drafts/soap`,
      );
      expect(draft.status).toBe(403);
    });
  });

  describe('RBAC denial', () => {
    it('PATIENT cannot set their own consent via this admin route (403)', async () => {
      const { tenant } = await env.makeTenant();
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.put(
        `/api/patients/${patient.patientId}/consents`,
        { type: 'MARKETING', granted: true },
      );
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B cannot set a consent on a Tenant A patient (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aPatientId = await seedPatient(a.client, 'CONSENT-RLS-001');

      const cross = await b.client.axios.put(
        `/api/patients/${aPatientId}/consents`,
        { type: 'AI_PROCESSING', granted: true },
      );
      expect([403, 404]).toContain(cross.status);
    });

    it('Tenant B cannot list Tenant A consents (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aPatientId = await seedPatient(a.client, 'CONSENT-RLS-002');
      await a.client.axios.put(`/api/patients/${aPatientId}/consents`, {
        type: 'AI_PROCESSING',
        granted: true,
      });

      const cross = await b.client.axios.get(
        `/api/patients/${aPatientId}/consents`,
      );
      expect([403, 404]).toContain(cross.status);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/patients/x/consents');
      expect(res.status).toBe(401);
    });
  });
});
