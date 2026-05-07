/**
 * Lab module happy path: a CLINIC sends a case to a LAB, the lab transitions
 * it through manufacturing, and the lab generates an invoice when delivered.
 *
 * This exercises the cross-tenant relationship logic that's central to the
 * lab module — RLS allows both sides to read the same LabCase, but only
 * the right side can mutate at each step.
 */
import { bootEnv, type E2EEnv } from './support/harness';

let env: E2EEnv;

beforeAll(async () => {
  env = await bootEnv();
});

afterAll(async () => {
  await env?.cleanup();
});

describe('Lab module e2e', () => {
  it('clinic + lab pair — invite, accept, submit case, invoice', async () => {
    const lab = await env.makeTenant({ kind: 'LAB', labPlan: 'LAB_PREMIUM' });
    const clinic = await env.makeTenant({ kind: 'CLINIC', plan: 'PRO' });

    // 1. Lab catalog: create one product so cases have something to bill.
    const cat = await lab.client.axios.post('/api/lab/categories', {
      name: 'Crowns',
    });
    expect(cat.status).toBe(201);

    const product = await lab.client.axios.post('/api/lab/products', {
      name: 'PFM crown',
      categoryId: cat.data.id,
      defaultPrice: 350000, // 3500.00
      currency: 'PHP',
      pricingMode: 'FIXED',
      phases: ['Wax-up', 'Casting', 'Porcelain'],
    });
    expect(product.status).toBe(201);

    // 2. Lab invites the clinic by slug.
    const invite = await lab.client.axios.post('/api/lab/clinic-links/invite', {
      clinicSlug: clinic.tenant.slug,
    });
    expect(invite.status).toBe(201);
    expect(invite.data.status).toBe('PENDING');

    // 3. Clinic accepts.
    const accept = await clinic.client.axios.post(
      `/api/clinic/lab-invitations/${invite.data.id}/accept`,
      {},
    );
    expect(accept.status).toBe(200);
    expect(accept.data.status).toBe('ACTIVE');

    // 4. Clinic creates a draft case + submits it.
    const draft = await clinic.client.axios.post('/api/clinic/lab-cases', {
      labTenantId: lab.tenant.id,
      productId: product.data.id,
      patientLabel: 'Maria Cruz',
      doctorLabel: 'Dr. Reyes',
      urgency: 'STANDARD',
    });
    expect(draft.status).toBe(201);

    const submit = await clinic.client.axios.post(
      `/api/clinic/lab-cases/${draft.data.id}/transitions`,
      { status: 'SUBMITTED' },
    );
    expect(submit.status).toBe(200);
    expect(submit.data.status).toBe('SUBMITTED');
    expect(submit.data.refNumber).toBeGreaterThanOrEqual(1);

    // 5. Lab accepts → IN_PROGRESS.
    const accept2 = await lab.client.axios.post(
      `/api/lab/cases/${draft.data.id}/transitions`,
      { status: 'IN_PROGRESS' },
    );
    expect(accept2.status).toBe(200);

    // 6. Lab marks completed → AWAITING_PICKUP → DELIVERED.
    await lab.client.axios.post(
      `/api/lab/cases/${draft.data.id}/transitions`,
      { status: 'AWAITING_PICKUP' },
    );
    await lab.client.axios.post(
      `/api/lab/cases/${draft.data.id}/transitions`,
      { status: 'DELIVERED' },
    );

    // 7. Lab generates an invoice from the delivered case.
    const inv = await lab.client.axios.post('/api/lab/invoices/generate-from-cases', {
      clinicTenantId: clinic.tenant.id,
      caseIds: [draft.data.id],
    });
    expect(inv.status).toBe(201);
    expect(inv.data.status).toBe('DRAFT');
    expect(inv.data.totalCents).toBe(350000);
    expect(inv.data.items.length).toBe(1);

    // 8. Lab issues it. RefNumber allocated.
    const issued = await lab.client.axios.post(
      `/api/lab/invoices/${inv.data.id}/issue`,
      {},
    );
    expect(issued.status).toBe(200);
    expect(issued.data.status).toBe('ISSUED');
    expect(issued.data.refNumber).toBeGreaterThanOrEqual(1);
    expect(issued.data.issuedAt).toBeTruthy();

    // 9. Clinic side now sees the invoice (drafts are hidden from clinic
    //    but ISSUED ones are not).
    const clinicList = await clinic.client.axios.get('/api/clinic/lab-invoices');
    expect(clinicList.status).toBe(200);
    expect(clinicList.data.length).toBeGreaterThanOrEqual(1);

    // 10. Lab records full payment.
    const pay = await lab.client.axios.post(
      `/api/lab/invoices/${inv.data.id}/payments`,
      { amountCents: 350000, reference: 'BPI-12345' },
    );
    expect(pay.status).toBe(200);
    expect(pay.data.status).toBe('PAID');
    expect(pay.data.paidCents).toBe(350000);
  });

  it('blocks clinic from issuing an invoice (lab-only)', async () => {
    const lab = await env.makeTenant({ kind: 'LAB', labPlan: 'LAB_PREMIUM' });
    const clinic = await env.makeTenant({ kind: 'CLINIC', plan: 'PRO' });

    // The /api/lab/invoices route requires the CLINIC tenant to even
    // hit it — but they should fail the LAB-only assertion in
    // createDraft. Forbidden / NotFound is acceptable; what matters is
    // they don't successfully create an invoice.
    const res = await clinic.client.axios.post('/api/lab/invoices', {
      clinicTenantId: clinic.tenant.id,
    });
    expect([400, 401, 403, 404]).toContain(res.status);
  });
});
