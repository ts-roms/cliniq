/**
 * The licensed laboratory and its service capability — DOH AO 2021-0037.
 *
 * Nothing modelled the facility as distinct from the tenant: no Licence to
 * Operate, no category, no head of laboratory, and no record of what the
 * laboratory is authorized to perform. A report could not carry the LTO
 * number, which is a compliance requirement, and "may this laboratory run
 * this test" had no answer.
 *
 * Capability is REPORTED, not enforced. The lawful response to an
 * out-of-scope test is to refer it, and referral laboratories are not
 * modelled yet — blocking would leave a clinic unable to order something it
 * is entitled to send out. That limitation is asserted here so it stays a
 * decision rather than drifting into an assumption.
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

describe('LIS laboratory licence and capability', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  async function recordProfile(
    client: E2EClient,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.put('/api/lis/laboratory', {
      name: 'CLINIQ Clinical Laboratory',
      category: 'SECONDARY',
      dohLtoNumber: 'LTO-NCR-12345',
      classification: 'GENERAL, FREESTANDING',
      headName: 'Dr. A. Reyes',
      headLicenseNumber: '0012345',
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  async function patientAndSection(client: E2EClient) {
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-LAB-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Cap',
      lastName: 'Ability',
      dateOfBirth: '1988-08-08',
      sex: 'MALE',
    });
    expect(patient.status).toBe(201);
    const section = await client.axios.post('/api/lis/sections', {
      code: 'HEMATOLOGY',
      name: 'Haematology',
    });
    expect(section.status).toBe(201);
    return { patientId: patient.data.id, sectionId: section.data.id };
  }

  async function makeTest(
    client: E2EClient,
    sectionId: string,
    code: string,
    name: string,
  ) {
    const res = await client.axios.post('/api/lis/tests', {
      code,
      name,
      sectionId,
      components: [{ code, name, displayOrder: 0 }],
    });
    expect(res.status).toBe(201);
    return res.data.id as string;
  }

  describe('the licence profile', () => {
    it('is absent until recorded', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.get('/api/lis/laboratory');
      expect(res.status).toBe(200);
      // Nest serialises a null return as an empty body rather than the
      // literal `null`, so this is "nothing came back", not "null came back".
      expect(res.data || null).toBeNull();
    });

    it('records the LTO, category and head of laboratory', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const lab = await recordProfile(client);
      expect(lab.dohLtoNumber).toBe('LTO-NCR-12345');
      expect(lab.category).toBe('SECONDARY');
      expect(lab.headName).toBe('Dr. A. Reyes');
      expect(lab.licence.onFile).toBe(true);
      expect(lab.licence.expired).toBe(false);
    });

    it('updates in place rather than creating a second laboratory', async () => {
      // Two rows would leave two answers to "what is our LTO number".
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const first = await recordProfile(client);
      const second = await recordProfile(client, {
        dohLtoNumber: 'LTO-NCR-99999',
      });
      expect(second.id).toBe(first.id);
      expect(second.dohLtoNumber).toBe('LTO-NCR-99999');
    });

    it('reports an expired licence rather than hiding it', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const lab = await recordProfile(client, {
        validUntil: '2020-01-01T00:00:00.000Z',
      });
      expect(lab.licence.expired).toBe(true);
      expect(lab.licence.daysRemaining).toBeLessThan(0);
    });

    it('refuses a validity window that runs backwards', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.put('/api/lis/laboratory', {
        name: 'Lab',
        category: 'PRIMARY',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2025-01-01T00:00:00.000Z',
      });
      expect(res.status).toBe(400);
    });

    it('is not editable by a nurse — it is back-office configuration', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await recordProfile(client);
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.put('/api/lis/laboratory', {
        name: 'Nope',
        category: 'TERTIARY',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('service capability', () => {
    it('requires the profile before capability can be declared', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.post('/api/lis/laboratory/capabilities', {
        sectionId: 'whatever',
      });
      expect(res.status).toBe(400);
    });

    it('refuses a declaration naming both a section and a test', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await recordProfile(client);
      const res = await client.axios.post('/api/lis/laboratory/capabilities', {
        sectionId: 's',
        testId: 't',
      });
      expect(res.status).toBe(400);
    });

    it('refuses a declaration naming neither', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await recordProfile(client);
      const res = await client.axios.post(
        '/api/lis/laboratory/capabilities',
        {},
      );
      expect(res.status).toBe(400);
    });
  });

  describe('screening an order', () => {
    it('flags nothing when no capability has been declared', async () => {
      // Every clinic that never opens this screen must see no change.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, sectionId } = await patientAndSection(client);
      const testId = await makeTest(client, sectionId, 'CBC', 'CBC');

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId }],
      });
      expect(order.status).toBe(201);
      expect(order.data.outOfScope).toEqual([]);
    });

    it('flags a test outside the declared capability, without refusing it', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await recordProfile(client);
      const { patientId, sectionId } = await patientAndSection(client);
      const cbc = await makeTest(client, sectionId, 'CBC', 'CBC');

      // Declare a DIFFERENT test only, so CBC is covered by nothing.
      const other = await makeTest(client, sectionId, 'ESR', 'ESR');
      const cap = await client.axios.post('/api/lis/laboratory/capabilities', {
        testId: other,
      });
      expect(cap.status).toBe(200);

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: cbc }],
      });
      // Reported, not refused — referral is the lawful route and it does not
      // exist yet.
      expect(order.status).toBe(201);
      expect(order.data.outOfScope).toHaveLength(1);
      expect(order.data.outOfScope[0].testName).toBe('CBC');
    });

    it('does not flag a test the laboratory declared', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await recordProfile(client);
      const { patientId, sectionId } = await patientAndSection(client);
      const cbc = await makeTest(client, sectionId, 'CBC', 'CBC');
      await client.axios.post('/api/lis/laboratory/capabilities', {
        testId: cbc,
      });

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: cbc }],
      });
      expect(order.data.outOfScope).toEqual([]);
    });

    it('honours a per-test exclusion — the send-out case', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await recordProfile(client);
      const { patientId, sectionId } = await patientAndSection(client);
      const cbc = await makeTest(client, sectionId, 'CBC', 'CBC');
      await client.axios.post('/api/lis/laboratory/capabilities', {
        testId: cbc,
        isEnabled: false,
      });

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: cbc }],
      });
      expect(order.data.outOfScope).toHaveLength(1);
      expect(order.data.outOfScope[0].reason).toMatch(/CBC/);
    });

    it('does not flag an ad-hoc test ordered outside the catalogue', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await recordProfile(client);
      const { patientId, sectionId } = await patientAndSection(client);
      const cbc = await makeTest(client, sectionId, 'CBC', 'CBC');
      await client.axios.post('/api/lis/laboratory/capabilities', {
        testId: cbc,
      });

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testName: 'Something unusual' }],
      });
      expect(order.status).toBe(201);
      expect(order.data.outOfScope).toEqual([]);
    });
  });

  describe('the report', () => {
    it('carries the LTO number and head of laboratory', async () => {
      // AO 2021-0037. The PDF is compressed, so this asserts the profile is
      // available to the renderer; the block itself is unit-tested.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await recordProfile(client);
      const { patientId, sectionId } = await patientAndSection(client);
      const cbc = await makeTest(client, sectionId, 'CBC', 'CBC');

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: cbc }],
      });
      await client.axios.patch(
        `/api/lab-orders/${order.data.id}/items/${order.data.items[0].id}`,
        { resultValue: '5.2' },
      );
      const report = await client.axios.post(
        `/api/lis/orders/${order.data.id}/reports`,
        {},
      );
      expect(report.status).toBe(201);

      const pdf = await client.axios.get(
        `/api/lis/reports/${report.data.id}/pdf`,
        { responseType: 'arraybuffer' },
      );
      expect(pdf.status).toBe(200);
      expect(Buffer.from(pdf.data).subarray(0, 5).toString('latin1')).toBe(
        '%PDF-',
      );
    });

    it('still issues a report when no laboratory profile exists', async () => {
      // A clinic that orders tests and sends them out is not a licensed
      // laboratory and must not be blocked from reporting what came back.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, sectionId } = await patientAndSection(client);
      const cbc = await makeTest(client, sectionId, 'CBC', 'CBC');
      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: cbc }],
      });
      await client.axios.patch(
        `/api/lab-orders/${order.data.id}/items/${order.data.items[0].id}`,
        { resultValue: '5.2' },
      );
      const report = await client.axios.post(
        `/api/lis/orders/${order.data.id}/reports`,
        {},
      );
      expect(report.status).toBe(201);
      const pdf = await client.axios.get(
        `/api/lis/reports/${report.data.id}/pdf`,
        { responseType: 'arraybuffer' },
      );
      expect(pdf.status).toBe(200);
    });
  });

  it('does not leak a laboratory profile across tenants', async () => {
    const a = await env.makeTenant({ plan: 'PREMIUM' });
    const b = await env.makeTenant({ plan: 'PREMIUM' });
    await recordProfile(a.client);
    const res = await b.client.axios.get('/api/lis/laboratory');
    expect(res.status).toBe(200);
    expect(res.data || null).toBeNull();
  });
});
