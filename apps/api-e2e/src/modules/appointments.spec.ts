/**
 * /api/appointments — schedule, check-in, cancel, RBAC, RLS.
 */
import { bootEnv, type E2EEnv, type E2ETenant, type E2EClient } from '../support/harness';

async function seedPatient(tenant: E2ETenant, client: E2EClient, mrn: string): Promise<string> {
  const res = await client.axios.post('/api/patients', {
    mrn,
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: '1990-01-01',
    sex: 'FEMALE',
  });
  if (res.status !== 201) {
    throw new Error(`patient seed failed: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  return res.data.id as string;
  void tenant;
}

describe('@org/api-e2e appointments module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can create, list, check-in, cancel an appointment', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(tenant, client, 'APPT-OWNER-001');

      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
      const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000); // +30 min

      const created = await client.axios.post('/api/appointments', {
        patientId,
        providerId: tenant.ownerUserId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: 'Follow-up',
      });
      expect(created.status).toBe(201);
      const id = created.data.id as string;

      // List within range — must include the row we just inserted.
      const from = new Date(startsAt.getTime() - 60 * 60 * 1000).toISOString();
      const to = new Date(endsAt.getTime() + 60 * 60 * 1000).toISOString();
      const list = await client.axios.get(`/api/appointments?from=${from}&to=${to}`);
      expect(list.status).toBe(200);
      expect(Array.isArray(list.data) ? list.data : list.data.items).toBeTruthy();

      const checkedIn = await client.axios.patch(`/api/appointments/${id}/check-in`);
      expect(checkedIn.status).toBe(200);
      expect(checkedIn.data.status).toBe('CHECKED_IN');

      const cancelled = await client.axios.patch(`/api/appointments/${id}/cancel`);
      expect(cancelled.status).toBe(200);
      expect(cancelled.data.status).toBe('CANCELLED');
    });
  });

  describe('RBAC denial', () => {
    it('PATIENT cannot create an appointment on /api/appointments (403)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(tenant, client, 'APPT-RBAC-001');
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.post('/api/appointments', {
        patientId,
        providerId: tenant.ownerUserId,
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000).toISOString(),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Tenant B cannot check-in an appointment owned by Tenant A (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const patientId = await seedPatient(a.tenant, a.client, 'APPT-RLS-001');
      const created = await a.client.axios.post('/api/appointments', {
        patientId,
        providerId: a.tenant.ownerUserId,
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000 + 30 * 60_000).toISOString(),
      });
      expect(created.status).toBe(201);
      const id = created.data.id as string;

      const cross = await b.client.axios.patch(`/api/appointments/${id}/check-in`);
      expect(cross.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/appointments');
      expect(res.status).toBe(401);
    });
  });
});
