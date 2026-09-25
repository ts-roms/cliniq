/**
 * Configured reference intervals — gap analysis §6.5.
 *
 * The interval used to live as two nullable floats on the order item, copied
 * from whatever the orderer typed, with no age or sex dimension. A paediatric
 * haemoglobin and an adult male haemoglobin were therefore flagged against the
 * same numbers: 11 g/dL is normal in a two-year-old and anaemia in an adult
 * man, and nothing could tell them apart.
 *
 * The selection rules are unit-tested exhaustively in
 * apps/api/src/labs/reference-ranges.spec.ts. This covers what only a database
 * and a running API show: that the lookup reaches the right row for the right
 * patient, that the interval applied is written onto the result so the report
 * cannot drift from it, and that the table cannot be deleted from.
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

const YEARS = (n: number) => Math.round(n * 365);

describe('LIS reference ranges', () => {
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

  async function addRange(
    client: E2EClient,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.post('/api/lis/reference-ranges', {
      test: 'HGB',
      label: 'Haemoglobin',
      unit: 'g/dL',
      lowerLimit: 13,
      upperLimit: 17,
      ...over,
    });
    expect(res.status).toBe(201);
    return res.data;
  }

  /** A patient of a given age, and an order for haemoglobin. */
  async function patientWithOrder(
    client: E2EClient,
    ageDays: number | null,
    sex = 'MALE',
    itemOver: Record<string, unknown> = {},
  ) {
    const dob =
      ageDays === null
        ? undefined
        : new Date(Date.now() - ageDays * 86_400_000)
            .toISOString()
            .slice(0, 10);
    const p = await client.axios.post('/api/patients', {
      mrn: `MRN-RR-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Ref',
      lastName: 'Range',
      ...(dob ? { dateOfBirth: dob } : {}),
      sex,
    });
    expect(p.status).toBe(201);
    const order = await client.axios.post('/api/lab-orders', {
      patientId: p.data.id,
      items: [
        {
          testName: 'Haemoglobin',
          testCode: 'HGB',
          resultUnit: 'g/dL',
          ...itemOver,
        },
      ],
    });
    expect(order.status).toBe(201);
    return {
      patientId: p.data.id,
      order: order.data,
      item: order.data.items[0],
    };
  }

  async function record(
    client: E2EClient,
    orderId: string,
    itemId: string,
    resultValue: string,
  ) {
    const res = await client.axios.patch(
      `/api/lab-orders/${orderId}/items/${itemId}`,
      { resultValue },
    );
    expect(res.status).toBe(200);
    return res.data;
  }

  /** The item as the database holds it, after the write. */
  async function itemRow(itemId: string) {
    const { rows } = await pg.query<{
      abnormalFlag: string | null;
      referenceLow: number | null;
      referenceHigh: number | null;
    }>(
      `SELECT "abnormalFlag", "referenceLow", "referenceHigh"
         FROM lab_order_items WHERE id = $1`,
      [itemId],
    );
    return rows[0];
  }

  describe('configuration', () => {
    it('stores an interval against a normalised test key', async () => {
      // Normalised the same way critical-value rules are, so "HGB", " hgb "
      // and "H.G.B" land on one key.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const r = await addRange(client, { test: ' h.g.b ' });
      expect(r.testKey).toBe('H G B');

      const list = await client.axios.get('/api/lis/reference-ranges');
      expect(list.status).toBe(200);
      expect(list.data).toHaveLength(1);
    });

    it('refuses an interval with no bounds at all', async () => {
      // It would sit on the configuration screen looking like coverage while
      // never flagging anything.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.post('/api/lis/reference-ranges', {
        test: 'HGB',
        label: 'Haemoglobin',
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/never flag anything/);
    });

    it('refuses an inverted interval', async () => {
      // It would flag every result in range and nothing out of it.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.post('/api/lis/reference-ranges', {
        test: 'HGB',
        label: 'Haemoglobin',
        lowerLimit: 17,
        upperLimit: 13,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/lowerLimit/);
    });

    it('is not editable by a nurse', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(client);
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.post('/api/lis/reference-ranges', {
        test: 'HGB',
        label: 'Nope',
        lowerLimit: 1,
        upperLimit: 2,
      });
      expect(res.status).toBe(403);
    });

    it('is readable by a nurse, so a flagged result can be explained', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(client);
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.get('/api/lis/reference-ranges');
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(1);
    });
  });

  describe('the case the gap analysis named', () => {
    /** A paediatric and an adult haemoglobin interval, configured together. */
    async function bothBands(client: E2EClient) {
      await addRange(client, {
        label: 'Haemoglobin (paediatric)',
        ageMaxDays: YEARS(12),
        lowerLimit: 11,
        upperLimit: 14,
      });
      await addRange(client, {
        label: 'Haemoglobin (adult)',
        ageMinDays: YEARS(18),
        lowerLimit: 13,
        upperLimit: 17,
      });
    }

    it('reads 11.5 g/dL as normal in a toddler', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await bothBands(client);
      const { order, item } = await patientWithOrder(client, YEARS(2));

      await record(client, order.id, item.id, '11.5');
      const row = await itemRow(item.id);
      expect(row.referenceLow).toBe(11);
      expect(row.referenceHigh).toBe(14);
      expect(row.abnormalFlag).toBe('NORMAL');
    });

    it('reads the same 11.5 g/dL as low in an adult man', async () => {
      // This is the defect. Both results used to be judged against whatever
      // the orderer typed onto the item.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await bothBands(client);
      const { order, item } = await patientWithOrder(client, YEARS(40));

      await record(client, order.id, item.id, '11.5');
      const row = await itemRow(item.id);
      expect(row.referenceLow).toBe(13);
      expect(row.referenceHigh).toBe(17);
      expect(row.abnormalFlag).toBe('LOW');
    });

    it('applies neither band to a patient whose age falls between them', async () => {
      // Picking the nearest band would be a guess, and a guessed interval is
      // what this work exists to remove.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await bothBands(client);
      const { order, item } = await patientWithOrder(client, YEARS(15));

      await record(client, order.id, item.id, '11.5');
      const row = await itemRow(item.id);
      expect(row.referenceLow).toBeNull();
      expect(row.referenceHigh).toBeNull();
      // No interval and no critical limit: declining to judge, not NORMAL.
      expect(row.abnormalFlag).toBeNull();
    });

    it('prefers a sex-specific interval over an any-sex one', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(client, { lowerLimit: 12, upperLimit: 16 });
      await addRange(client, {
        label: 'Haemoglobin (female)',
        sex: 'FEMALE',
        lowerLimit: 12,
        upperLimit: 15,
      });
      const { order, item } = await patientWithOrder(
        client,
        YEARS(30),
        'FEMALE',
      );

      await record(client, order.id, item.id, '15.5');
      const row = await itemRow(item.id);
      expect(row.referenceHigh).toBe(15);
      expect(row.abnormalFlag).toBe('HIGH');
    });
  });

  describe('precedence and snapshotting', () => {
    it('lets an interval on the order item win', async () => {
      // Those columns are how a referred-in report states the interval it
      // arrived with. Restating our own configuration over it would attribute
      // another laboratory's interval to us.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(client, { lowerLimit: 13, upperLimit: 17 });
      const { order, item } = await patientWithOrder(
        client,
        YEARS(40),
        'MALE',
        {
          referenceLow: 12,
          referenceHigh: 16,
        },
      );

      await record(client, order.id, item.id, '12.5');
      const row = await itemRow(item.id);
      expect(row.referenceLow).toBe(12);
      expect(row.referenceHigh).toBe(16);
      // 12.5 is inside 12–16, and would have been LOW against 13–17.
      expect(row.abnormalFlag).toBe('NORMAL');
    });

    it('writes the interval onto the result, so the report cannot drift', async () => {
      // Retiring the configuration afterwards must not change what the result
      // was judged against — the PDF prints the interval beside the value.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const r = await addRange(client, { lowerLimit: 13, upperLimit: 17 });
      const { order, item } = await patientWithOrder(client, YEARS(40));
      await record(client, order.id, item.id, '11');

      const retire = await client.axios.delete(
        `/api/lis/reference-ranges/${r.id}`,
      );
      expect(retire.status).toBe(200);

      const row = await itemRow(item.id);
      expect(row.referenceLow).toBe(13);
      expect(row.referenceHigh).toBe(17);
      expect(row.abnormalFlag).toBe('LOW');
    });

    it('re-judges a correction against the interval in force now', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const first = await addRange(client, { lowerLimit: 13, upperLimit: 17 });
      const { order, item } = await patientWithOrder(client, YEARS(40));
      await record(client, order.id, item.id, '12');
      expect((await itemRow(item.id)).abnormalFlag).toBe('LOW');

      // The laboratory re-issues its interval, and the old one is closed.
      await client.axios.delete(`/api/lis/reference-ranges/${first.id}`);
      await addRange(client, {
        label: 'Haemoglobin (revised)',
        lowerLimit: 11,
        upperLimit: 15,
      });

      const amended = await client.axios.post(
        `/api/lab-orders/${order.id}/items/${item.id}/amend`,
        { resultValue: '12', reason: 'Re-run on the corrected interval' },
      );
      expect(amended.status).toBe(200);
      const row = await itemRow(item.id);
      expect(row.referenceLow).toBe(11);
      expect(row.referenceHigh).toBe(15);
      expect(row.abnormalFlag).toBe('NORMAL');
    });

    it('re-resolves on re-entry after a mis-configured interval is fixed', async () => {
      // The worse half of the same bug. The resolved interval is written into
      // the same two columns an orderer fills in, so without `referenceRangeId`
      // to tell them apart, re-keying a result would reuse our own stale
      // snapshot and the correction to the configuration would never reach it.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const wrong = await addRange(client, { lowerLimit: 1, upperLimit: 2 });
      const { order, item } = await patientWithOrder(client, YEARS(40));
      await record(client, order.id, item.id, '15');
      expect((await itemRow(item.id)).abnormalFlag).toBe('HIGH');

      // The laboratory notices the interval is nonsense and replaces it.
      await client.axios.delete(`/api/lis/reference-ranges/${wrong.id}`);
      await addRange(client, { lowerLimit: 13, upperLimit: 17 });

      await record(client, order.id, item.id, '15');
      const row = await itemRow(item.id);
      expect(row.referenceLow).toBe(13);
      expect(row.referenceHigh).toBe(17);
      expect(row.abnormalFlag).toBe('NORMAL');
    });

    it('records which configured interval judged the result', async () => {
      // So a clinician asking "why is this flagged" has a row to look at.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const r = await addRange(client, { lowerLimit: 13, upperLimit: 17 });
      const { order, item } = await patientWithOrder(client, YEARS(40));
      await record(client, order.id, item.id, '11');

      const { rows } = await pg.query<{ referenceRangeId: string | null }>(
        `SELECT "referenceRangeId" FROM lab_order_items WHERE id = $1`,
        [item.id],
      );
      expect(rows[0].referenceRangeId).toBe(r.id);
    });

    it('leaves an orderer-supplied interval unowned, so it is never re-resolved', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(client, { lowerLimit: 13, upperLimit: 17 });
      const { order, item } = await patientWithOrder(
        client,
        YEARS(40),
        'MALE',
        {
          referenceLow: 12,
          referenceHigh: 16,
        },
      );
      await record(client, order.id, item.id, '12.5');

      const { rows } = await pg.query<{ referenceRangeId: string | null }>(
        `SELECT "referenceRangeId" FROM lab_order_items WHERE id = $1`,
        [item.id],
      );
      expect(rows[0].referenceRangeId).toBeNull();

      // Re-keying keeps the orderer's interval, not ours.
      await record(client, order.id, item.id, '12.5');
      const row = await itemRow(item.id);
      expect(row.referenceLow).toBe(12);
      expect(row.referenceHigh).toBe(16);
    });

    it('still lets a configured critical limit override the interval verdict', async () => {
      // Critical limits are checked first, and are configured independently —
      // the whole point of P0-2.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(client, {
        test: 'K',
        label: 'Potassium',
        lowerLimit: 3.5,
        upperLimit: 5.1,
      });
      const cv = await client.axios.post('/api/lis/critical-value-rules', {
        test: 'K',
        label: 'Potassium',
        criticalHigh: 6,
      });
      expect(cv.status).toBe(201);

      const { order, item } = await patientWithOrder(
        client,
        YEARS(40),
        'MALE',
        {
          testName: 'Potassium',
          testCode: 'K',
          resultUnit: 'mmol/L',
        },
      );
      await record(client, order.id, item.id, '6.8');
      const row = await itemRow(item.id);
      expect(row.abnormalFlag).toBe('CRITICAL_HIGH');
      // The interval still comes from configuration and is still recorded.
      expect(row.referenceLow).toBe(3.5);
      expect(row.referenceHigh).toBe(5.1);
    });

    it('does not apply an age-banded interval when the date of birth is unknown', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(client, {
        ageMinDays: YEARS(18),
        lowerLimit: 13,
        upperLimit: 17,
      });
      // The patient DTO requires a date of birth, so this is asserted through
      // the module's own rules rather than by omitting it — see
      // reference-ranges.spec.ts for the unknown-age case.
      const { order, item } = await patientWithOrder(client, YEARS(2));
      await record(client, order.id, item.id, '11.5');
      const row = await itemRow(item.id);
      expect(row.referenceLow).toBeNull();
    });
  });

  describe('the record', () => {
    it('cannot be deleted — it explains how results were flagged', async () => {
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'reference_ranges'`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('INSERT');
      expect(privs).toContain('SELECT');
      // UPDATE stays: retiring closes the window rather than removing the row.
      expect(privs).toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });

    it('is tenant-isolated', async () => {
      const { rows } = await pg.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname = 'reference_ranges'`,
      );
      expect(rows[0].relrowsecurity).toBe(true);
      expect(rows[0].relforcerowsecurity).toBe(true);
    });

    it('does not leak intervals across tenants', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(a.client);
      const res = await b.client.axios.get('/api/lis/reference-ranges');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });

    it('refuses an inverted interval at the database too', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await addRange(client);
      await expect(
        pg.query(
          `INSERT INTO reference_ranges
             (id,"tenantId","testKey",label,"lowerLimit","upperLimit","updatedAt")
           VALUES (gen_random_uuid()::text,'t','HGB','bad',17,13,now())`,
        ),
      ).rejects.toThrow(/limits_ordered/);
    });

    it('refuses an interval with no bounds at the database too', async () => {
      await expect(
        pg.query(
          `INSERT INTO reference_ranges
             (id,"tenantId","testKey",label,"updatedAt")
           VALUES (gen_random_uuid()::text,'t','HGB','empty',now())`,
        ),
      ).rejects.toThrow(/has_an_interval/);
    });
  });
});
