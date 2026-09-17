/**
 * /api/prescriptions — sign Rx, RBAC, RLS.
 *
 * RBAC matrix:
 *   - DOCTOR has RX_WRITE + RX_SIGN ⇒ can sign
 *   - OWNER has RX_WRITE + RX_SIGN ⇒ can sign
 *   - NURSE has CONSULT_WRITE but NOT RX_SIGN ⇒ 403
 *   - RECEPTIONIST has no Rx capability ⇒ 403
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness';

async function seedPatient(client: E2EClient, mrn: string): Promise<string> {
  const res = await client.axios.post('/api/patients', {
    mrn,
    firstName: 'Rx',
    lastName: 'Patient',
    dateOfBirth: '1985-03-12',
    sex: 'MALE',
  });
  if (res.status !== 201) {
    throw new Error(
      `patient seed failed: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`,
    );
  }
  return res.data.id as string;
}

const RX_ITEMS = [
  { drugName: 'Paracetamol', dose: '500mg', frequency: 'BID', durationDays: 5 },
];

describe('@org/api-e2e prescriptions module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('DOCTOR can sign a prescription', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'RX-001');
      const doctor = await env.makeDoctor(tenant);

      const signed = await doctor.client.axios.post('/api/prescriptions', {
        patientId,
        items: RX_ITEMS,
      });
      expect(signed.status).toBe(201);
      expect(signed.data.id).toBeTruthy();
    });

    it('OWNER can run precheck (no signing)', async () => {
      const { client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'RX-PRECHECK');

      const res = await client.axios.post('/api/prescriptions/precheck', {
        patientId,
        items: RX_ITEMS,
      });
      expect(res.status).toBe(200);
    });
  });

  describe('RBAC denial', () => {
    it('NURSE cannot sign a prescription (lacks RX_SIGN)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'RX-NURSE-403');
      const nurse = await env.makeNurse(tenant);

      const res = await nurse.client.axios.post('/api/prescriptions', {
        patientId,
        items: RX_ITEMS,
      });
      expect(res.status).toBe(403);
    });

    it('RECEPTIONIST cannot sign or precheck (no Rx capability)', async () => {
      const { tenant, client } = await env.makeTenant();
      const patientId = await seedPatient(client, 'RX-RECP-403');
      const recp = await env.makeReceptionist(tenant);

      const signRes = await recp.client.axios.post('/api/prescriptions', {
        patientId,
        items: RX_ITEMS,
      });
      expect(signRes.status).toBe(403);

      const precheckRes = await recp.client.axios.post(
        '/api/prescriptions/precheck',
        {
          patientId,
          items: RX_ITEMS,
        },
      );
      expect(precheckRes.status).toBe(403);
    });
  });

  describe('multi-tenant isolation', () => {
    it('Tenant B cannot sign an Rx referencing a Tenant A patient (404)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();
      const aPatientId = await seedPatient(a.client, 'RX-RLS');

      // Tenant B's OWNER has RX_SIGN but the patientId is invisible to them.
      const res = await b.client.axios.post('/api/prescriptions', {
        patientId: aPatientId,
        items: RX_ITEMS,
      });
      expect([404, 403, 400]).toContain(res.status);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/prescriptions', {
        patientId: 'x',
        items: RX_ITEMS,
      });
      expect(res.status).toBe(401);
    });
  });
});
