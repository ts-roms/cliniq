/**
 * /api/hmo + /api/patients/:id/hmo-memberships + /api/invoices/:id/hmo-claims
 *
 * HMO is gated by Features.HMO. PREMIUM (the harness default plan) includes
 * the feature. Routes per the controller:
 *   POST /api/hmo/providers                          — BILLING_WRITE
 *   GET  /api/hmo/providers                          — BILLING_READ
 *   POST /api/patients/:patientId/hmo-memberships    — PATIENT_WRITE
 *   POST /api/invoices/:id/hmo-claims                — BILLING_WRITE
 *   PATCH /api/hmo/claims/:id                        — BILLING_WRITE
 */
import { bootEnv, type E2EEnv } from '../support/harness';

const PATIENT_FIXTURE = (mrn: string) => ({
  mrn,
  firstName: 'Jose',
  lastName: 'Rizal',
  dateOfBirth: '1980-01-01',
  sex: 'MALE' as const,
  email: `${mrn.toLowerCase()}@e2e.local`,
});

describe('@org/api-e2e hmo module', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  describe('happy path', () => {
    it('OWNER can create provider, link membership, file claim against an invoice', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });

      // Provider catalog
      const provider = await client.axios.post('/api/hmo/providers', {
        name: 'Maxicare',
        payerCode: 'MAX',
        contactEmail: 'claims@maxicare.test',
      });
      expect(provider.status).toBe(201);
      const providerId = provider.data.id as string;

      const providers = await client.axios.get('/api/hmo/providers');
      expect(providers.status).toBe(200);
      expect(
        providers.data.some((p: { id: string }) => p.id === providerId),
      ).toBe(true);

      // Patient + invoice prerequisites
      const patient = await client.axios.post(
        '/api/patients',
        PATIENT_FIXTURE('HMO-001'),
      );
      const patientId = patient.data.id as string;
      const invoice = await client.axios.post('/api/invoices', {
        patientId,
        items: [
          { description: 'Consult', quantity: 1, unitPriceCentavos: 100_000 },
        ],
      });
      const invoiceId = invoice.data.id as string;

      // Membership tied to the provider
      const membership = await client.axios.post(
        `/api/patients/${patientId}/hmo-memberships`,
        {
          providerId,
          memberId: 'MX-12345',
        },
      );
      expect(membership.status).toBe(201);
      const membershipId = membership.data.id as string;

      // File a claim
      const claim = await client.axios.post(
        `/api/invoices/${invoiceId}/hmo-claims`,
        {
          membershipId,
          claimedCentavos: 100_000,
          notes: 'Routine consult',
        },
      );
      expect(claim.status).toBe(201);
      expect(claim.data.id).toBeTruthy();
      const claimId = claim.data.id as string;

      // Approve the claim
      const updated = await client.axios.patch(`/api/hmo/claims/${claimId}`, {
        status: 'APPROVED',
        approvedCentavos: 100_000,
        authNumber: 'AUTH-99',
      });
      expect(updated.status).toBe(200);
    });
  });

  describe('RBAC denial', () => {
    it('DOCTOR cannot create an HMO provider (no BILLING_WRITE)', async () => {
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });
      const doctor = await env.makeDoctor(tenant);

      const res = await doctor.client.axios.post('/api/hmo/providers', {
        name: 'No-go',
      });
      expect(res.status).toBe(403);
    });

    it('NURSE cannot file a claim (no BILLING_WRITE)', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const nurse = await env.makeNurse(tenant);

      const provider = await client.axios.post('/api/hmo/providers', {
        name: 'P',
      });
      const patient = await client.axios.post(
        '/api/patients',
        PATIENT_FIXTURE('N-HMO'),
      );
      const invoice = await client.axios.post('/api/invoices', {
        patientId: patient.data.id,
        items: [{ description: 'X', quantity: 1, unitPriceCentavos: 100 }],
      });
      const membership = await client.axios.post(
        `/api/patients/${patient.data.id}/hmo-memberships`,
        { providerId: provider.data.id, memberId: 'M1' },
      );

      const res = await nurse.client.axios.post(
        `/api/invoices/${invoice.data.id}/hmo-claims`,
        { membershipId: membership.data.id, claimedCentavos: 100 },
      );
      expect(res.status).toBe(403);
    });
  });

  describe('multi-tenant isolation (RLS)', () => {
    it('Tenant B does not see Tenant A providers', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });

      await a.client.axios.post('/api/hmo/providers', {
        name: 'Tenant-A-only',
      });
      const list = await b.client.axios.get('/api/hmo/providers');
      expect(list.status).toBe(200);
      expect(
        list.data.some((p: { name: string }) => p.name === 'Tenant-A-only'),
      ).toBe(false);
    });

    it('Tenant B cannot file a claim against Tenant A invoice (404)', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });

      // Set up A's invoice + membership
      const provider = await a.client.axios.post('/api/hmo/providers', {
        name: 'P',
      });
      const patient = await a.client.axios.post(
        '/api/patients',
        PATIENT_FIXTURE('RLS-HMO'),
      );
      const invoice = await a.client.axios.post('/api/invoices', {
        patientId: patient.data.id,
        items: [{ description: 'X', quantity: 1, unitPriceCentavos: 100 }],
      });
      const membership = await a.client.axios.post(
        `/api/patients/${patient.data.id}/hmo-memberships`,
        { providerId: provider.data.id, memberId: 'M1' },
      );

      const cross = await b.client.axios.post(
        `/api/invoices/${invoice.data.id}/hmo-claims`,
        { membershipId: membership.data.id, claimedCentavos: 100 },
      );
      // Either the invoice or the membership is invisible — both produce 404.
      expect(cross.status).toBe(404);
    });
  });

  describe('authentication', () => {
    it('unauthenticated returns 401', async () => {
      const axiosBare = (await import('axios')).default.create({
        baseURL: env.baseUrl,
        validateStatus: () => true,
      });
      const res = await axiosBare.get('/api/hmo/providers');
      expect(res.status).toBe(401);
    });
  });
});
