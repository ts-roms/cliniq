/**
 * /api/lab-orders — in-clinic lab orders (NOT the marketplace `/api/lab/*`).
 *
 * Gated by Features.LABS (included in PREMIUM). RBAC matrix:
 *   POST   /api/lab-orders                          — CONSULT_WRITE
 *   PATCH  /api/lab-orders/:id                      — CONSULT_WRITE
 *   PATCH  /api/lab-orders/:id/cancel               — CONSULT_WRITE
 *   PATCH  /api/lab-orders/:id/items/:itemId        — CONSULT_WRITE (record result)
 *   GET    /api/lab-orders/:id                      — PATIENT_READ
 *   GET    /api/patients/:patientId/lab-orders      — PATIENT_READ
 *
 * CONSULT_WRITE: OWNER, DOCTOR, NURSE. Receptionist/Patient denied.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

const PATIENT_FIXTURE = (mrn: string) => ({
  mrn,
  firstName: 'Andres',
  lastName: 'Bonifacio',
  dateOfBirth: '1990-11-30',
  sex: 'MALE' as const,
  email: `${mrn.toLowerCase()}@e2e.local`,
});

describe('@org/api-e2e labs module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can create order, list for patient, record a result, cancel', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });

      const patient = await client.axios.post(
        '/api/patients',
        PATIENT_FIXTURE('LAB-001'),
      );
      const patientId = patient.data.id as string;

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        vendor: 'Hi-Precision',
        notes: 'Pre-surgical workup',
        items: [
          {
            testCode: 'CBC',
            testName: 'Complete Blood Count',
            category: 'Hematology',
            resultUnit: '10^9/L',
            referenceLow: 4,
            referenceHigh: 10,
          },
        ],
      });
      expect(order.status).toBe(201);
      const orderId = order.data.id as string;
      const itemId = order.data.items[0].id as string;

      const list = await client.axios.get(
        `/api/patients/${patientId}/lab-orders`,
      );
      expect(list.status).toBe(200);
      expect(list.data.some((o: { id: string }) => o.id === orderId)).toBe(
        true,
      );

      const detail = await client.axios.get(`/api/lab-orders/${orderId}`);
      expect(detail.status).toBe(200);

      const result = await client.axios.patch(
        `/api/lab-orders/${orderId}/items/${itemId}`,
        {
          resultValue: '7.5',
          resultUnit: '10^9/L',
          abnormalFlag: 'NORMAL',
        },
      );
      expect(result.status).toBe(200);

      const cancelled = await client.axios.patch(
        `/api/lab-orders/${orderId}/cancel`,
      );
      expect(cancelled.status).toBe(200);
    });

    it.each(['DOCTOR', 'NURSE'] as const)(
      '%s can create a lab order (CONSULT_WRITE)',
      async (role) => {
        const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
        const user =
          role === 'DOCTOR'
            ? await env.makeDoctor(tenant)
            : await env.makeNurse(tenant);

        const patient = await client.axios.post(
          '/api/patients',
          PATIENT_FIXTURE(`CW-${role}`),
        );
        const order = await user.client.axios.post('/api/lab-orders', {
          patientId: patient.data.id,
          items: [{ testName: 'Urinalysis' }],
        });
        expect(order.status).toBe(201);
      },
    );
  });

  describe('RBAC denial', () => {
    it('RECEPTIONIST cannot create a lab order (no CONSULT_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const recep = await env.makeReceptionist(tenant);

      const patient = await client.axios.post(
        '/api/patients',
        PATIENT_FIXTURE('REC-LAB'),
      );
      const res = await recep.client.axios.post('/api/lab-orders', {
        patientId: patient.data.id,
        items: [{ testName: 'X' }],
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B cannot fetch Tenant A lab order (404)', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });

      const patient = await a.client.axios.post(
        '/api/patients',
        PATIENT_FIXTURE('RLS-LAB'),
      );
      const order = await a.client.axios.post('/api/lab-orders', {
        patientId: patient.data.id,
        items: [{ testName: 'CBC' }],
      });
      expect(order.status).toBe(201);

      const cross = await b.client.axios.get(
        `/api/lab-orders/${order.data.id}`,
      );
      expect(cross.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.post('/api/lab-orders', {});
      expect(res.status).toBe(401);
    });
  });
});
