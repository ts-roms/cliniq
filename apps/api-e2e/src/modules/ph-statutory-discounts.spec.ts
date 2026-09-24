/**
 * RA 9994 (senior citizens) and RA 10754 (PWD).
 *
 * These are legal requirements, not features. A clinic billing a senior
 * citizen must give 20%, exempt the sale from VAT, show the VAT-exempt sale
 * and the discount separately, and record the ID number presented. Billing
 * had a single `discountCentavos` column and none of that, so every clinic
 * was doing it by hand or not at all.
 *
 * The arithmetic is unit-tested in ph-statutory.spec.ts; this asserts it
 * reaches the invoice, and that a patient with no entitlement is billed
 * exactly as before.
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

describe('PH statutory discounts', () => {
  let env: E2EEnv;
  let pg: PgClient;

  beforeAll(async () => {
    env = await bootEnv();
    pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
  });

  afterAll(async () => {
    await pg.end().catch(() => undefined);
    await env.cleanup();
  });

  async function makePatient(client: E2EClient) {
    const res = await client.axios.post('/api/patients', {
      mrn: `MRN-PH-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Lola',
      lastName: 'Remedios',
      dateOfBirth: '1950-02-02',
      sex: 'FEMALE',
    });
    expect(res.status).toBe(201);
    return res.data.id as string;
  }

  /** One line at ₱1,120.00 — ₱1,000 plus 12% VAT. */
  async function invoiceFor(client: E2EClient, patientId: string) {
    const res = await client.axios.post('/api/invoices', {
      patientId,
      items: [
        {
          description: 'Complete blood count',
          quantity: 1,
          unitPriceCentavos: 112_000,
        },
      ],
    });
    return res;
  }

  it('bills a patient with no entitlement exactly as before', async () => {
    // The regression that matters most: this path is every other patient.
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);

    const res = await invoiceFor(client, patientId);
    expect(res.status).toBe(201);
    expect(res.data.subtotalCentavos).toBe(112_000);
    expect(res.data.discountCentavos).toBe(0);
    expect(res.data.totalCentavos).toBe(112_000);
    expect(res.data.statutoryDiscountCentavos).toBe(0);
    expect(res.data.vatExemptSaleCentavos).toBe(0);
    expect(res.data.entitlementId).toBeNull();
  });

  it('applies RA 9994 to a senior citizen, with the BIR breakdown', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);

    const ent = await client.axios.post(
      `/api/patients/${patientId}/entitlements`,
      { type: 'SENIOR_CITIZEN', idNumber: 'OSCA-12345', verified: true },
    );
    expect(ent.status).toBe(200);
    expect(ent.data.verifiedAt).not.toBeNull();

    const res = await invoiceFor(client, patientId);
    expect(res.status).toBe(201);

    // ₱1,120 gross -> ₱1,000 VAT-exempt sale, ₱200 discount, ₱800 due.
    expect(res.data.vatExemptSaleCentavos).toBe(100_000);
    expect(res.data.subtotalCentavos).toBe(100_000);
    expect(res.data.statutoryDiscountCentavos).toBe(20_000);
    expect(res.data.discountCentavos).toBe(20_000);
    expect(res.data.taxCentavos).toBe(0);
    expect(res.data.totalCentavos).toBe(80_000);

    // The ID is snapshotted onto the invoice — a discount without one is not
    // a claim the BIR accepts.
    expect(res.data.statutoryIdNumber).toBe('OSCA-12345');
    expect(res.data.entitlementId).toBe(ent.data.id);
  });

  it('does not take 20% off the VAT-inclusive price', async () => {
    // 20% of ₱1,120 is ₱224. Both routes collect ₱800, but ₱224 is not the
    // deductible figure — claiming it overstates the deduction every time.
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'SENIOR_CITIZEN',
      idNumber: 'OSCA-1',
    });

    const res = await invoiceFor(client, patientId);
    expect(res.data.statutoryDiscountCentavos).not.toBe(22_400);
    expect(res.data.statutoryDiscountCentavos).toBe(20_000);
  });

  it('applies RA 10754 to a PWD identically', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'PWD',
      idNumber: 'PWD-98765',
    });

    const res = await invoiceFor(client, patientId);
    expect(res.data.statutoryDiscountCentavos).toBe(20_000);
    expect(res.data.totalCentavos).toBe(80_000);
    expect(res.data.statutoryIdNumber).toBe('PWD-98765');
  });

  it('gives a senior who is also a PWD ONE discount, not two', async () => {
    // RA 10754's IRR is explicit that the benefits are not cumulative for
    // the same purchase. 40% here would be the clinic's loss and a real one.
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'SENIOR_CITIZEN',
      idNumber: 'OSCA-1',
    });
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'PWD',
      idNumber: 'PWD-1',
    });

    const res = await invoiceFor(client, patientId);
    expect(res.data.statutoryDiscountCentavos).toBe(20_000);
    expect(res.data.totalCentavos).toBe(80_000);
  });

  it('ignores an expired entitlement', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'PWD',
      idNumber: 'PWD-OLD',
      validUntil: '2020-01-01T00:00:00.000Z',
    });

    const res = await invoiceFor(client, patientId);
    expect(res.data.statutoryDiscountCentavos).toBe(0);
    expect(res.data.totalCentavos).toBe(112_000);
  });

  it('stops discounting once the entitlement is withdrawn', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'SENIOR_CITIZEN',
      idNumber: 'OSCA-2',
    });
    const before = await invoiceFor(client, patientId);
    expect(before.data.statutoryDiscountCentavos).toBe(20_000);

    const removed = await client.axios.delete(
      `/api/patients/${patientId}/entitlements/SENIOR_CITIZEN`,
    );
    expect(removed.status).toBe(204);

    const after = await invoiceFor(client, patientId);
    expect(after.data.statutoryDiscountCentavos).toBe(0);
    expect(after.data.totalCentavos).toBe(112_000);
  });

  it('replaces a renewed ID rather than stacking a second row', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'PWD',
      idNumber: 'PWD-OLD',
    });
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'PWD',
      idNumber: 'PWD-NEW',
    });

    const list = await client.axios.get(
      `/api/patients/${patientId}/entitlements`,
    );
    expect(list.data).toHaveLength(1);
    expect(list.data[0].idNumber).toBe('PWD-NEW');
    // Two rows would leave two answers to "which ID did we discount against".
    const res = await invoiceFor(client, patientId);
    expect(res.data.statutoryIdNumber).toBe('PWD-NEW');
  });

  it('clears verification when the ID number changes', async () => {
    // A new number is a new claim; carrying the old sighting forward would
    // vouch for a document nobody has seen.
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'PWD',
      idNumber: 'PWD-OLD',
      verified: true,
    });
    const renewed = await client.axios.post(
      `/api/patients/${patientId}/entitlements`,
      { type: 'PWD', idNumber: 'PWD-NEW' },
    );
    expect(renewed.data.verifiedAt).toBeNull();
  });

  it('refuses an entitlement with no ID number', async () => {
    const { client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    for (const idNumber of ['', '   ']) {
      const res = await client.axios.post(
        `/api/patients/${patientId}/entitlements`,
        { type: 'SENIOR_CITIZEN', idNumber },
      );
      expect(res.status).toBe(400);
    }
  });

  it('honours a tenant rule that overrides the statutory default', async () => {
    // Configurable because the statutory rate is law but not eternal — RA
    // 9994 raised what RA 7432 set — and a clinic may run its own
    // concessions through the same machinery.
    const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    await client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'SENIOR_CITIZEN',
      idNumber: 'OSCA-3',
    });

    // No API for tenant rules yet — the back office for this is its own
    // slice. Inserted directly so the resolution path is still exercised.
    await pg.query(
      `INSERT INTO discount_rules ("id","tenantId","type","percent","vatExempt","effectiveFrom","updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'SENIOR_CITIZEN', 25, true, now() - interval '1 day', now())`,
      [tenant.id],
    );

    const res = await invoiceFor(client, patientId);
    expect(res.data.statutoryDiscountCentavos).toBe(25_000);
    expect(res.data.totalCentavos).toBe(75_000);
  });

  it('is closed to the patient portal', async () => {
    const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(client);
    const portal = await env.makePatient(tenant);
    const res = await portal.client.axios.get(
      `/api/patients/${patientId}/entitlements`,
    );
    expect(res.status).toBe(403);
  });

  it('does not leak entitlements across tenants', async () => {
    const a = await env.makeTenant({ plan: 'PREMIUM' });
    const b = await env.makeTenant({ plan: 'PREMIUM' });
    const patientId = await makePatient(a.client);
    await a.client.axios.post(`/api/patients/${patientId}/entitlements`, {
      type: 'SENIOR_CITIZEN',
      idNumber: 'OSCA-X',
    });

    const res = await b.client.axios.get(
      `/api/patients/${patientId}/entitlements`,
    );
    expect(res.status).toBe(404);
  });
});
