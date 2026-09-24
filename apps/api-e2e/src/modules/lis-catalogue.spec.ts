/**
 * The laboratory test catalogue.
 *
 * An order item used to carry `testName` as free text with an optional
 * `testCode`. Three clinics spelled "CBC with platelet count" three ways,
 * nothing could be reported on, and a panel had no identity at all — the
 * schema's own comment admitted a CBC was entered as ~7 sibling order items
 * with no parent and no shared reference set. That is the inversion of the
 * rule "don't store a CBC as one simple result": it stored a CBC as seven
 * unrelated ones.
 *
 * The contract:
 *   - a panel is ONE test with many components, derived from what it reports
 *   - ordering from the catalogue SNAPSHOTS code/name/unit onto the item, so
 *     a historical order reads as placed even after the catalogue changes
 *   - ad-hoc ordering still works, because not everything is in a catalogue
 *   - the catalogue is tenant-scoped, and writes are governance-gated
 */
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EClient,
} from '../support/harness.js';

jest.setTimeout(120_000);

describe('@org/api-e2e LIS test catalogue', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  async function section(client: E2EClient, code = 'HEMATOLOGY') {
    const res = await client.axios.post('/api/lis/sections', {
      code,
      name: code === 'HEMATOLOGY' ? 'Hematology' : code,
    });
    expect(res.status).toBe(201);
    return res.data.id;
  }

  /** A CBC: one test, five analytes. */
  async function cbc(client: E2EClient, sectionId: string) {
    const res = await client.axios.post('/api/lis/tests', {
      code: 'CBC',
      name: 'Complete Blood Count',
      sectionId,
      specimenType: 'Whole blood (EDTA)',
      container: 'Lavender top',
      minVolumeMl: 3,
      targetTatMinutes: 240,
      statTatMinutes: 60,
      components: [
        { code: 'HGB', name: 'Haemoglobin', unit: 'g/dL', decimals: 1 },
        { code: 'HCT', name: 'Haematocrit', unit: '%', decimals: 1 },
        { code: 'RBC', name: 'Red cell count', unit: 'x10^12/L', decimals: 2 },
        { code: 'WBC', name: 'White cell count', unit: 'x10^9/L', decimals: 1 },
        { code: 'PLT', name: 'Platelet count', unit: 'x10^9/L', decimals: 0 },
      ],
    });
    expect(res.status).toBe(201);
    return res.data;
  }

  async function makePatientRecord(client: E2EClient) {
    const res = await client.axios.post('/api/patients', {
      mrn: `MRN-CAT-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Cat',
      lastName: 'Alogue',
      dateOfBirth: '1984-04-04',
      sex: 'MALE',
    });
    expect(res.status).toBe(201);
    return res.data.id;
  }

  describe('a panel is one test with many components', () => {
    it('stores a CBC as ONE test reporting five analytes', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const test = await cbc(client, await section(client));

      expect(test.code).toBe('CBC');
      expect(test.isPanel).toBe(true);
      expect(test.components).toHaveLength(5);
      expect(test.components.map((c: { code: string }) => c.code)).toEqual([
        'HGB',
        'HCT',
        'RBC',
        'WBC',
        'PLT',
      ]);
    });

    it('derives isPanel rather than trusting a flag', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionId = await section(client, 'CHEMISTRY');
      const res = await client.axios.post('/api/lis/tests', {
        code: 'K',
        name: 'Potassium',
        sectionId,
        components: [{ code: 'K', name: 'Potassium', unit: 'mmol/L' }],
      });
      expect(res.status).toBe(201);
      // One analyte, so not a panel — the two cannot disagree.
      expect(res.data.isPanel).toBe(false);
    });

    it('refuses a test that reports nothing', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionId = await section(client);
      const res = await client.axios.post('/api/lis/tests', {
        code: 'EMPTY',
        name: 'Reports nothing',
        sectionId,
        components: [],
      });
      expect(res.status).toBe(400);
    });

    it('refuses duplicate component codes within a test', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionId = await section(client);
      const res = await client.axios.post('/api/lis/tests', {
        code: 'DUP',
        name: 'Duplicated',
        sectionId,
        components: [
          { code: 'HGB', name: 'Haemoglobin' },
          { code: 'hgb', name: 'Haemoglobin again' },
        ],
      });
      expect(res.status).toBe(400);
    });

    it('refuses a STAT target slower than the routine one', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionId = await section(client);
      const res = await client.axios.post('/api/lis/tests', {
        code: 'SLOWSTAT',
        name: 'Transposed targets',
        sectionId,
        targetTatMinutes: 60,
        statTatMinutes: 240,
        components: [{ code: 'X', name: 'X' }],
      });
      expect(res.status).toBe(400);
    });

    it('refuses a duplicate test code in the same tenant', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionId = await section(client);
      await cbc(client, sectionId);
      const again = await client.axios.post('/api/lis/tests', {
        code: 'CBC',
        name: 'Another CBC',
        sectionId,
        components: [{ code: 'HGB', name: 'Haemoglobin' }],
      });
      expect(again.status).toBe(409);
    });

    it('refuses a section from another tenant', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionInA = await section(a.client);

      const res = await b.client.axios.post('/api/lis/tests', {
        code: 'X',
        name: 'Cross tenant',
        sectionId: sectionInA,
        components: [{ code: 'X', name: 'X' }],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('ordering from the catalogue', () => {
    it('snapshots code, name and unit onto the order item', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionId = await section(client, 'CHEMISTRY');
      const test = (
        await client.axios.post('/api/lis/tests', {
          code: 'K',
          name: 'Potassium (serum)',
          sectionId,
          components: [{ code: 'K', name: 'Potassium', unit: 'mmol/L' }],
        })
      ).data;
      const patientId = await makePatientRecord(client);

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: test.id }],
      });
      expect(order.status).toBe(201);

      const item = order.data.items[0];
      expect(item.testId).toBe(test.id);
      expect(item.testCode).toBe('K');
      expect(item.testName).toBe('Potassium (serum)');
      // Single-component test, so its unit is unambiguous.
      expect(item.resultUnit).toBe('mmol/L');
    });

    it('does not copy a unit for a panel — there is no single one', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const test = await cbc(client, await section(client));
      const patientId = await makePatientRecord(client);

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: test.id }],
      });
      expect(order.data.items[0].testName).toBe('Complete Blood Count');
      expect(order.data.items[0].resultUnit).toBeNull();
    });

    it('keeps the snapshot after the catalogue entry is renamed', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionId = await section(client, 'CHEMISTRY');
      const test = (
        await client.axios.post('/api/lis/tests', {
          code: 'NA',
          name: 'Sodium',
          sectionId,
          components: [{ code: 'NA', name: 'Sodium', unit: 'mmol/L' }],
        })
      ).data;
      const patientId = await makePatientRecord(client);
      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: test.id }],
      });

      const renamed = await client.axios.patch(`/api/lis/tests/${test.id}`, {
        name: 'Sodium, serum (renamed)',
      });
      expect(renamed.status).toBe(200);

      // The order still reads as it was placed.
      const fetched = await client.axios.get(
        `/api/lab-orders/${order.data.id}`,
      );
      expect(fetched.data.items[0].testName).toBe('Sodium');
    });

    it('an explicit name still overrides the catalogue', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const test = await cbc(client, await section(client));
      const patientId = await makePatientRecord(client);

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: test.id, testName: 'CBC (manual differential)' }],
      });
      expect(order.data.items[0].testName).toBe('CBC (manual differential)');
      expect(order.data.items[0].testId).toBe(test.id);
    });

    it('still allows ad-hoc ordering with no catalogue entry', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testName: 'Send-out, special assay' }],
      });
      expect(order.status).toBe(201);
      expect(order.data.items[0].testId).toBeNull();
      expect(order.data.items[0].testName).toBe('Send-out, special assay');
    });

    it('refuses an item with neither testId nor testName', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      const res = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ category: 'Chem' }],
      });
      expect(res.status).toBe(400);
    });

    it("refuses a test from another tenant's catalogue", async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const testInA = await cbc(a.client, await section(a.client));

      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(b.client);
      const res = await b.client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: testInA.id }],
      });
      expect(res.status).toBe(400);
    });
  });

  describe('retiring', () => {
    it('drops the test from the active catalogue but keeps the order readable', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const test = await cbc(client, await section(client));
      const patientId = await makePatientRecord(client);
      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testId: test.id }],
      });

      const retired = await client.axios.delete(`/api/lis/tests/${test.id}`);
      expect(retired.status).toBe(200);

      const active = await client.axios.get('/api/lis/tests');
      expect(active.data.map((t: { id: string }) => t.id)).not.toContain(
        test.id,
      );

      const fetched = await client.axios.get(
        `/api/lab-orders/${order.data.id}`,
      );
      expect(fetched.data.items[0].testName).toBe('Complete Blood Count');
    });
  });

  describe('isolation and authorization', () => {
    it('is tenant-scoped', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      await cbc(a.client, await section(a.client));

      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await b.client.axios.get('/api/lis/tests');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });

    it('DOCTOR can read the catalogue but not change it', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const sectionId = await section(client);
      await cbc(client, sectionId);
      const doctor = await env.makeDoctor(tenant);

      const read = await doctor.client.axios.get('/api/lis/tests');
      expect(read.status).toBe(200);
      expect(read.data).toHaveLength(1);

      const write = await doctor.client.axios.post('/api/lis/tests', {
        code: 'NOPE',
        name: 'Not allowed',
        sectionId,
        components: [{ code: 'X', name: 'X' }],
      });
      expect(write.status).toBe(403);
    });

    it('a portal patient cannot read it', async () => {
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const res = await patient.client.axios.get('/api/lis/tests');
      expect(res.status).toBe(403);
    });
  });
});
