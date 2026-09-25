/**
 * Equipment, calibration and reagent lots — DOH AO 2021-0037, §6.13.
 *
 * The gap analysis states the point plainly: link the equipment and reagent
 * lot to the result "so a recalled lot can be traced to every result it
 * produced. That traceability is the whole point." The recall query at the
 * bottom of this file is that, and everything else exists to make it worth
 * having.
 *
 * The fitness rules themselves are unit-tested in fitness.spec.ts. This
 * covers what only a database shows: that the link survives, that it cannot
 * be severed by deleting a lot, and that a laboratory which records none of
 * this is unaffected.
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe('LIS equipment and reagent lots', () => {
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

  async function analyser(
    client: E2EClient,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.put('/api/lis/equipment', {
      name: 'Cobas c311',
      status: 'ACTIVE',
      manufacturer: 'Roche',
      calibrationIntervalDays: 90,
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  async function lot(client: E2EClient, over: Record<string, unknown> = {}) {
    const res = await client.axios.put('/api/lis/reagent-lots', {
      name: 'Potassium reagent',
      lotNumber: 'R-77',
      expiresOn: days(90),
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  /** A patient with one lab order, ready for a result. */
  async function orderFor(client: E2EClient) {
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-EQ-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Equip',
      lastName: 'Ment',
      dateOfBirth: '1970-07-07',
      sex: 'MALE',
    });
    expect(patient.status).toBe(201);
    const order = await client.axios.post('/api/lab-orders', {
      patientId: patient.data.id,
      items: [{ testName: 'Potassium', testCode: 'K' }],
    });
    expect(order.status).toBe(201);
    return order.data;
  }

  describe('equipment and calibration', () => {
    it('records an instrument and reports it has no calibration yet', async () => {
      // Distinct from "not due". An instrument with nothing on record is a
      // finding; one calibrated last week is not.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await analyser(client);
      const list = await client.axios.get('/api/lis/equipment');
      expect(list.data).toHaveLength(1);
      expect(list.data[0].calibration.never).toBe(true);
    });

    it('counts down to the next calibration once one is recorded', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const eq = await analyser(client);
      const cal = await client.axios.post('/api/lis/equipment/calibrations', {
        equipmentId: eq.id,
        calibratorLot: 'CAL-1',
      });
      expect(cal.status).toBe(201);

      const list = await client.axios.get('/api/lis/equipment');
      expect(list.data[0].calibration.never).toBe(false);
      expect(list.data[0].calibration.daysRemaining).toBe(89);
    });

    it('keeps calibrations append-only at the grant level', async () => {
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'calibrations'`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('INSERT');
      expect(privs).toContain('SELECT');
      expect(privs).not.toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });
  });

  describe('reagent lots', () => {
    it('resolves both clocks and reports the earlier limit', async () => {
      // Opened 25 days ago with 30-day stability: 5 days left, not the 90
      // the printed date would suggest. This is the case the inventory model
      // cannot express.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await lot(client, {
        expiresOn: days(90),
        openedOn: days(-25),
        openStabilityDays: 30,
      });
      const list = await client.axios.get('/api/lis/reagent-lots');
      expect(list.data[0].status.expired).toBe(false);
      expect(list.data[0].status.daysRemaining).toBe(4);
    });

    it('refuses a vial opened before it arrived', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.put('/api/lis/reagent-lots', {
        name: 'Impossible',
        lotNumber: 'X-1',
        receivedOn: days(-1),
        openedOn: days(-10),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('fitness at result entry', () => {
    it('refuses a result produced on an expired lot', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const eq = await analyser(client);
      const expired = await lot(client, {
        lotNumber: 'R-OLD',
        expiresOn: days(-1),
      });
      const order = await orderFor(client);

      const res = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}`,
        { resultValue: '4.1', equipmentId: eq.id, reagentLotId: expired.id },
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/expired/);
    });

    it('refuses a result produced on equipment out of service', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const eq = await analyser(client, { status: 'MAINTENANCE' });
      const order = await orderFor(client);
      const res = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}`,
        { resultValue: '4.1', equipmentId: eq.id },
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/maintenance/);
    });

    it('only WARNS on an overdue calibration', async () => {
      // The deliberate asymmetry. An expired reagent produces a number that
      // means nothing; an overdue calibration produces one that is probably
      // fine and possibly drifting. Blocking the second would leave a
      // laboratory unable to report anything the morning a service visit
      // slips.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const eq = await analyser(client, { calibrationIntervalDays: 30 });
      await client.axios.post('/api/lis/equipment/calibrations', {
        equipmentId: eq.id,
        calibratedAt: days(-100),
      });
      const order = await orderFor(client);

      const res = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}`,
        { resultValue: '4.1', equipmentId: eq.id },
      );
      expect(res.status).toBe(200);
      expect(res.data.warnings.join(' ')).toMatch(/overdue/);
    });

    it('is unaffected when nothing is recorded', async () => {
      // A laboratory that has not catalogued its instruments must be able to
      // report exactly as before.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const order = await orderFor(client);
      const res = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}`,
        { resultValue: '4.1' },
      );
      expect(res.status).toBe(200);
      expect(res.data.warnings).toEqual([]);
    });
  });

  describe('the recall query', () => {
    it('finds every result a lot produced', async () => {
      // The whole point of §6.13. When a lot is recalled this turns "which
      // results are affected" from unanswerable into a query.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const eq = await analyser(client);
      const r = await lot(client);

      const a = await orderFor(client);
      const b = await orderFor(client);
      for (const o of [a, b]) {
        const res = await client.axios.patch(
          `/api/lab-orders/${o.id}/items/${o.items[0].id}`,
          { resultValue: '4.1', equipmentId: eq.id, reagentLotId: r.id },
        );
        expect(res.status).toBe(200);
      }
      // A third result produced without recording the lot must not appear.
      const c = await orderFor(client);
      await client.axios.patch(
        `/api/lab-orders/${c.id}/items/${c.items[0].id}`,
        { resultValue: '4.1' },
      );

      const trace = await client.axios.get(
        `/api/lis/reagent-lots/${r.id}/results`,
      );
      expect(trace.status).toBe(200);
      expect(trace.data.lot.lotNumber).toBe('R-77');
      expect(trace.data.items).toHaveLength(2);
      expect(trace.data.items[0].order.number).toBeTruthy();
    });

    it('cannot have the link severed by deleting the lot', async () => {
      // RESTRICT, not SET NULL. Deleting a lot must not quietly erase which
      // results it produced — that link is the reason the table exists.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const eq = await analyser(client);
      const r = await lot(client);
      const order = await orderFor(client);
      await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}`,
        { resultValue: '4.1', equipmentId: eq.id, reagentLotId: r.id },
      );

      await expect(
        pg.query(`DELETE FROM reagent_lots WHERE id = $1`, [r.id]),
      ).rejects.toThrow(/foreign key|violates/i);
    });

    it('does not leak a trace across tenants', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const r = await lot(a.client);
      const res = await b.client.axios.get(
        `/api/lis/reagent-lots/${r.id}/results`,
      );
      expect(res.status).toBe(404);
    });
  });

  it('keeps all three tables tenant-isolated', async () => {
    const { rows } = await pg.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname IN ('equipment', 'calibrations', 'reagent_lots')`,
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.relrowsecurity).toBe(true);
      expect(r.relforcerowsecurity).toBe(true);
    }
  });
});
