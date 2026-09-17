/**
 * /api/services + /api/invoices + payments — RBAC, RLS.
 *
 * BillingController mounts at the root (`@Controller()`), so routes live at:
 *   POST /api/services                      — BILLING_WRITE (OWNER, ADMIN, RECEPTIONIST)
 *   GET  /api/services                      — BILLING_READ
 *   POST /api/invoices                      — BILLING_WRITE
 *   GET  /api/invoices?patientId=…          — BILLING_READ
 *   POST /api/invoices/:id/payments         — BILLING_WRITE
 *   GET  /api/invoices/:id/pdf              — BILLING_READ (binary; skipped here)
 *
 * Note: there is no `void` / `cancel` invoice endpoint exposed by the
 * controller (the service silently blocks pay-after-cancel but no public
 * route mutates status). That branch is intentionally not covered.
 */
import { bootEnv, type E2EEnv } from '../support/harness';

const PATIENT_FIXTURE = (mrn: string) => ({
  mrn,
  firstName: 'Maria',
  lastName: 'Santos',
  dateOfBirth: '1985-04-12',
  sex: 'FEMALE' as const,
  email: `${mrn.toLowerCase()}@e2e.local`,
});

describe('@org/api-e2e billing module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can create service, create invoice with items, record payment, fetch PDF metadata', async () => {
      const { client } = await env.makeTenant();

      // Patient prerequisite — invoice needs a real patient row.
      const patient = await client.axios.post('/api/patients', PATIENT_FIXTURE('BILL-001'));
      expect(patient.status).toBe(201);
      const patientId = patient.data.id as string;

      // Service catalog entry
      const svc = await client.axios.post('/api/services', {
        name: 'Consultation',
        code: 'CONS',
        priceCentavos: 50_000,
      });
      expect(svc.status).toBe(201);
      const serviceId = svc.data.id as string;

      // Invoice with one priced line
      const inv = await client.axios.post('/api/invoices', {
        patientId,
        items: [
          { serviceId, description: 'Consultation', quantity: 1, unitPriceCentavos: 50_000 },
        ],
      });
      expect(inv.status).toBe(201);
      expect(inv.data.totalCentavos).toBe(50_000);
      const invoiceId = inv.data.id as string;

      // Partial then full payment — last one should flip status to PAID
      const half = await client.axios.post(`/api/invoices/${invoiceId}/payments`, {
        amountCentavos: 25_000,
        method: 'CASH',
      });
      expect(half.status).toBe(201);

      const rest = await client.axios.post(`/api/invoices/${invoiceId}/payments`, {
        amountCentavos: 25_000,
        method: 'CASH',
      });
      expect(rest.status).toBe(201);

      // GET PDF — only assert the response is a 200 with PDF headers; we
      // deliberately don't decode the binary (would couple this spec to
      // the renderer's output format).
      const pdf = await client.axios.get(`/api/invoices/${invoiceId}/pdf`, {
        responseType: 'arraybuffer',
      });
      expect(pdf.status).toBe(200);
      expect(String(pdf.headers['content-type'] ?? '')).toContain('application/pdf');

      const list = await client.axios.get(`/api/invoices?patientId=${patientId}`);
      expect(list.status).toBe(200);
      expect(list.data.some((i: { id: string }) => i.id === invoiceId)).toBe(true);
    });

    it.each(['ADMIN', 'RECEPTIONIST'] as const)(
      '%s can create an invoice (BILLING_WRITE)',
      async (role) => {
        const { tenant, client } = await env.makeTenant();
        const user =
          role === 'ADMIN'
            ? await env.makeAdmin(tenant)
            : await env.makeReceptionist(tenant);

        const patient = await client.axios.post('/api/patients', PATIENT_FIXTURE(`BW-${role}`));
        expect(patient.status).toBe(201);
        const patientId = patient.data.id as string;

        const inv = await user.client.axios.post('/api/invoices', {
          patientId,
          items: [{ description: 'Item', quantity: 1, unitPriceCentavos: 1000 }],
        });
        expect(inv.status).toBe(201);
      },
    );
  });

  describe('RBAC denial', () => {
    it('DOCTOR has BILLING_READ but not BILLING_WRITE — POST /api/invoices is 403', async () => {
      const { tenant, client } = await env.makeTenant();
      const doctor = await env.makeDoctor(tenant);

      const patient = await client.axios.post('/api/patients', PATIENT_FIXTURE('DOC-BILL'));
      const patientId = patient.data.id as string;

      const res = await doctor.client.axios.post('/api/invoices', {
        patientId,
        items: [{ description: 'X', quantity: 1, unitPriceCentavos: 100 }],
      });
      expect(res.status).toBe(403);

      // Read should succeed because DOCTOR has BILLING_READ.
      const list = await doctor.client.axios.get(`/api/invoices?patientId=${patientId}`);
      expect(list.status).toBe(200);
    });

    it('NURSE cannot create a service (no BILLING_WRITE)', async () => {
      const { tenant } = await env.makeTenant();
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.post('/api/services', {
        name: 'No-go',
        priceCentavos: 1,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B cannot fetch Tenant A invoice by id (404 via patient filter)', async () => {
      const a = await env.makeTenant();
      const b = await env.makeTenant();

      const patient = await a.client.axios.post('/api/patients', PATIENT_FIXTURE('RLS-BILL'));
      const patientId = patient.data.id as string;
      const inv = await a.client.axios.post('/api/invoices', {
        patientId,
        items: [{ description: 'X', quantity: 1, unitPriceCentavos: 100 }],
      });
      expect(inv.status).toBe(201);
      const invoiceId = inv.data.id as string;

      // Try to pay it from Tenant B — should 404 (invoice not visible).
      const cross = await b.client.axios.post(`/api/invoices/${invoiceId}/payments`, {
        amountCentavos: 100,
        method: 'CASH',
      });
      expect(cross.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('unauthenticated request returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/services');
      expect(res.status).toBe(401);
    });
  });
});
