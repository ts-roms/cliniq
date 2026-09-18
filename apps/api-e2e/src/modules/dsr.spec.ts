/**
 * /api/dsr — Data Subject Requests (DPA §16).
 *
 * Any role with PATIENT_WRITE can FILE a DSR (clinic staff filing on behalf
 * of a patient). Only roles with AUDIT_READ (OWNER/ADMIN) can list or
 * resolve.
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness';

async function seedPatient(client: E2EClient, mrn: string): Promise<string> {
  const res = await client.axios.post('/api/patients', {
    mrn,
    firstName: 'Subject',
    lastName: 'Rights',
    dateOfBirth: '1980-01-01',
    sex: 'MALE',
  });
  if (res.status !== 201) {
    throw new Error(`patient seed failed: ${res.status}`);
  }
  return res.data.id as string;
}

describe('@org/api-e2e dsr module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can file, list, resolve a DSR', async () => {
      const { client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'DSR-001');

      const filed = await client.axios.post('/api/dsr', {
        patientId,
        type: 'ACCESS',
        details: 'Patient requests a copy of their record.',
      });
      expect(filed.status).toBe(201);
      const id = filed.data.id as string;

      const list = await client.axios.get('/api/dsr');
      expect(list.status).toBe(200);
      expect(
        Array.isArray(list.data) ? list.data : list.data.items,
      ).toBeTruthy();

      const resolved = await client.axios.patch(`/api/dsr/${id}/resolve`, {
        status: 'RESOLVED',
        resolution: 'Record exported and sent via secure mail.',
      });
      expect(resolved.status).toBe(200);
    });
  });

  describe('RBAC denial', () => {
    it('RECEPTIONIST can FILE a DSR (PATIENT_WRITE) but cannot list/resolve (AUDIT_READ)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'DSR-RBAC');
      const recp = await env.makeReceptionist(tenant);

      // PATIENT_WRITE allows filing.
      const filed = await recp.client.axios.post('/api/dsr', {
        patientId,
        type: 'ACCESS',
      });
      expect(filed.status).toBe(201);

      const list = await recp.client.axios.get('/api/dsr');
      expect(list.status).toBe(403);
    });

    it('DOCTOR cannot list DSRs (lacks AUDIT_READ)', async () => {
      const { tenant } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);
      const res = await doctor.client.axios.get('/api/dsr');
      expect(res.status).toBe(403);
    });

    it('PATIENT cannot file via /api/dsr (lacks PATIENT_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'DSR-PAT');
      const patient = await env.makePatient(tenant);

      const res = await patient.client.axios.post('/api/dsr', {
        patientId,
        type: 'ACCESS',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Tenant B cannot see Tenant A DSRs in list', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const patientId = await seedPatient(a.client, 'DSR-RLS');

      await a.client.axios.post('/api/dsr', { patientId, type: 'ACCESS' });

      const listB = await b.client.axios.get('/api/dsr');
      expect(listB.status).toBe(200);
      const items = Array.isArray(listB.data) ? listB.data : listB.data.items;
      expect(
        (items as Array<{ patientId: string }>).every(
          (r) => r.patientId !== patientId,
        ),
      ).toBe(true);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/dsr');
      expect(res.status).toBe(401);
    });
  });
});
