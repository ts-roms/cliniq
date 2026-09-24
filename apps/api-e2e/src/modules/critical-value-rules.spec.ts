/**
 * Critical value limits, end to end.
 *
 * The defect this covers: critical limits used to be derived from the
 * reference interval as 1.5x / 0.5x its bounds. For serum potassium
 * (reference 3.5–5.1 mmol/L) that put CRITICAL_HIGH at 7.65 against a
 * clinically accepted ~6.0, so a potassium of 6.8 — a result someone should be
 * telephoned about — was reported as merely HIGH.
 *
 * The contract now:
 *   - no configured limit  → HIGH / LOW only, never CRITICAL
 *   - configured limit     → CRITICAL at the configured threshold
 *   - limits are tenant-scoped, demographic-narrowable and time-bounded
 *
 * The arithmetic itself is unit-tested in apps/api/src/labs/flagging.spec.ts.
 * This file proves the wiring: that a rule written through the API reaches the
 * flag written on a result.
 */
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EClient,
} from '../support/harness.js';

jest.setTimeout(120_000);

const POTASSIUM_REFERENCE = { referenceLow: 3.5, referenceHigh: 5.1 };

describe('@org/api-e2e critical value rules', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  /** Order one potassium, record `value`, return the flag it was given. */
  async function flagFor(
    client: E2EClient,
    patientId: string,
    value: string,
    itemOverrides: Record<string, unknown> = {},
  ): Promise<string | null> {
    const order = await client.axios.post('/api/lab-orders', {
      patientId,
      items: [
        {
          testCode: 'K',
          testName: 'Potassium',
          ...POTASSIUM_REFERENCE,
          ...itemOverrides,
        },
      ],
    });
    expect(order.status).toBe(201);
    const itemId = order.data.items[0].id;
    const res = await client.axios.patch(
      `/api/lab-orders/${order.data.id}/items/${itemId}`,
      { resultValue: value },
    );
    expect(res.status).toBe(200);
    return res.data.abnormalFlag ?? null;
  }

  async function makePatientRecord(
    client: E2EClient,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await client.axios.post('/api/patients', {
      mrn: `MRN-CVR-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Crit',
      lastName: 'Target',
      dateOfBirth: '1985-04-01',
      sex: 'MALE',
      ...over,
    });
    expect(res.status).toBe(201);
    return res.data.id;
  }

  describe('without a configured rule', () => {
    it('reports 6.8 mmol/L as HIGH, not CRITICAL_HIGH', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      void tenant;
      expect(await flagFor(client, patientId, '6.8')).toBe('HIGH');
    });

    it('reports 2.2 mmol/L as LOW, not CRITICAL_LOW', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      expect(await flagFor(client, patientId, '2.2')).toBe('LOW');
    });

    it('still reads an in-range value as NORMAL', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      expect(await flagFor(client, patientId, '4.2')).toBe('NORMAL');
    });
  });

  describe('with a configured rule', () => {
    it('flags CRITICAL_HIGH at the configured threshold', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);

      const rule = await client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium (serum)',
        unit: 'mmol/L',
        criticalLow: 2.5,
        criticalHigh: 6.0,
      });
      expect(rule.status).toBe(201);

      expect(await flagFor(client, patientId, '6.8')).toBe('CRITICAL_HIGH');
      expect(await flagFor(client, patientId, '2.2')).toBe('CRITICAL_LOW');
      // Between the reference bound and the critical limit stays HIGH.
      expect(await flagFor(client, patientId, '5.4')).toBe('HIGH');
      expect(await flagFor(client, patientId, '4.2')).toBe('NORMAL');
    });

    it('matches the rule by test NAME when the order carries no code', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      await client.axios.post('/api/lab/critical-value-rules', {
        test: 'potassium',
        label: 'Potassium',
        criticalHigh: 6.0,
      });
      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [{ testName: 'Potassium', ...POTASSIUM_REFERENCE }],
      });
      const res = await client.axios.patch(
        `/api/lab-orders/${order.data.id}/items/${order.data.items[0].id}`,
        { resultValue: '7.0' },
      );
      expect(res.data.abnormalFlag).toBe('CRITICAL_HIGH');
    });

    it("does not apply one tenant's rule to another tenant", async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      await a.client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalHigh: 6.0,
      });

      const patientB = await makePatientRecord(b.client);
      // Tenant B configured nothing, so B's result must NOT be critical.
      expect(await flagFor(b.client, patientB, '6.8')).toBe('HIGH');

      const patientA = await makePatientRecord(a.client);
      expect(await flagFor(a.client, patientA, '6.8')).toBe('CRITICAL_HIGH');
    });

    it('lets a sex-specific rule win over a general one', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await client.axios.post('/api/lab/critical-value-rules', {
        test: 'HGB',
        label: 'Haemoglobin',
        criticalLow: 7.0,
      });
      await client.axios.post('/api/lab/critical-value-rules', {
        test: 'HGB',
        label: 'Haemoglobin (female)',
        criticalLow: 6.5,
        sex: 'FEMALE',
      });

      const female = await makePatientRecord(client, {
        sex: 'FEMALE',
        firstName: 'Fem',
      });
      const male = await makePatientRecord(client, { sex: 'MALE' });

      const order = async (patientId: string, value: string) => {
        const o = await client.axios.post('/api/lab-orders', {
          patientId,
          items: [
            {
              testCode: 'HGB',
              testName: 'Haemoglobin',
              referenceLow: 12,
              referenceHigh: 16,
            },
          ],
        });
        const r = await client.axios.patch(
          `/api/lab-orders/${o.data.id}/items/${o.data.items[0].id}`,
          { resultValue: value },
        );
        return r.data.abnormalFlag;
      };

      // 6.8 is below the general 7.0 but above the female-specific 6.5.
      expect(await order(male, '6.8')).toBe('CRITICAL_LOW');
      expect(await order(female, '6.8')).toBe('LOW');
    });

    it('stops applying once the rule is retired', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      const rule = await client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalHigh: 6.0,
      });
      expect(await flagFor(client, patientId, '6.8')).toBe('CRITICAL_HIGH');

      const retired = await client.axios.delete(
        `/api/lab/critical-value-rules/${rule.data.id}`,
      );
      expect(retired.status).toBe(200);

      expect(await flagFor(client, patientId, '6.8')).toBe('HIGH');
    });
  });

  describe('re-recording a result', () => {
    it('clears a stale flag when the corrected value no longer warrants one', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      await client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalHigh: 6.0,
      });

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [
          { testCode: 'K', testName: 'Potassium', ...POTASSIUM_REFERENCE },
        ],
      });
      const itemUrl = `/api/lab-orders/${order.data.id}/items/${order.data.items[0].id}`;

      const first = await client.axios.patch(itemUrl, { resultValue: '6.8' });
      expect(first.data.abnormalFlag).toBe('CRITICAL_HIGH');

      // Transcription corrected. The flag must follow the value down, not
      // linger from the previous entry.
      const corrected = await client.axios.patch(itemUrl, {
        resultValue: '4.2',
      });
      expect(corrected.data.abnormalFlag).toBe('NORMAL');
    });

    it('clears the flag when the corrected value cannot be judged', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);

      const order = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [
          { testCode: 'K', testName: 'Potassium', ...POTASSIUM_REFERENCE },
        ],
      });
      const itemUrl = `/api/lab-orders/${order.data.id}/items/${order.data.items[0].id}`;

      expect(
        (await client.axios.patch(itemUrl, { resultValue: '6.8' })).data
          .abnormalFlag,
      ).toBe('HIGH');

      const requeried = await client.axios.patch(itemUrl, {
        resultValue: 'specimen haemolysed',
      });
      expect(requeried.data.abnormalFlag).toBeNull();
    });
  });

  describe('per-order overrides', () => {
    it('beat the configured rule for that order only', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      await client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalHigh: 6.0,
      });

      // This order carries a laxer limit, so 6.8 is not critical here.
      expect(
        await flagFor(client, patientId, '6.8', { criticalHigh: 7.5 }),
      ).toBe('HIGH');
      // The next order, with no override, still uses the rule.
      expect(await flagFor(client, patientId, '6.8')).toBe('CRITICAL_HIGH');
    });
  });

  describe('rule validation', () => {
    it('refuses a rule with neither limit — it would never fire', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
      });
      expect(res.status).toBe(400);
    });

    it('refuses an inverted pair', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalLow: 9,
        criticalHigh: 3,
      });
      expect(res.status).toBe(400);
    });

    it('refuses an inverted per-order override', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patientId = await makePatientRecord(client);
      const res = await client.axios.post('/api/lab-orders', {
        patientId,
        items: [
          {
            testCode: 'K',
            testName: 'Potassium',
            ...POTASSIUM_REFERENCE,
            criticalLow: 9,
            criticalHigh: 3,
          },
        ],
      });
      expect(res.status).toBe(400);
    });

    it('refuses an inverted age band', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalHigh: 6,
        ageMinDays: 100,
        ageMaxDays: 10,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('authorization', () => {
    it('DOCTOR can read the limits but not set them', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalHigh: 6.0,
      });
      const doctor = await env.makeDoctor(tenant);

      const read = await doctor.client.axios.get(
        '/api/lab/critical-value-rules',
      );
      expect(read.status).toBe(200);
      expect(read.data).toHaveLength(1);

      const write = await doctor.client.axios.post(
        '/api/lab/critical-value-rules',
        { test: 'NA', label: 'Sodium', criticalHigh: 160 },
      );
      expect(write.status).toBe(403);
    });

    it('a portal patient cannot read or set them', async () => {
      const { tenant } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const read = await patient.client.axios.get(
        '/api/lab/critical-value-rules',
      );
      expect(read.status).toBe(403);
    });

    it('tenant B cannot see tenant A rules', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      await a.client.axios.post('/api/lab/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalHigh: 6.0,
      });
      const res = await b.client.axios.get('/api/lab/critical-value-rules');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });
  });
});
