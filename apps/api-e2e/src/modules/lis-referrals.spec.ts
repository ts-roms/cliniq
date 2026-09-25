/**
 * Referral laboratories — DOH AO 2021-0037.
 *
 * §6.10 landed capability as advice: an out-of-scope test was reported and
 * nothing more, because refusing it with no referral path would leave a
 * clinic unable to order something it is entitled to send out. This is that
 * path, and with it the refusal becomes defensible.
 *
 * Two rules shape what is asserted here:
 *   1. Referral is permitted only to a LICENSED laboratory — a destination
 *      with no LTO on file cannot be referred to.
 *   2. The report must state which tests were referred and to which.
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

describe('LIS referral laboratories', () => {
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

  /** A tenant with a laboratory profile, a section and one catalogue test. */
  async function labWithTest(client: E2EClient) {
    const lab = await client.axios.put('/api/lis/laboratory', {
      name: 'CLINIQ Lab',
      category: 'PRIMARY',
      dohLtoNumber: 'LTO-1',
    });
    expect(lab.status).toBe(200);
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-REF-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Ref',
      lastName: 'Erral',
      dateOfBirth: '1975-05-05',
      sex: 'FEMALE',
    });
    const section = await client.axios.post('/api/lis/sections', {
      code: 'CHEMISTRY',
      name: 'Clinical Chemistry',
    });
    const test = await client.axios.post('/api/lis/tests', {
      code: 'HBA1C',
      name: 'HbA1c',
      sectionId: section.data.id,
      components: [{ code: 'HBA1C', name: 'HbA1c', displayOrder: 0 }],
    });
    expect(test.status).toBe(201);
    return {
      patientId: patient.data.id as string,
      sectionId: section.data.id as string,
      testId: test.data.id as string,
    };
  }

  async function destination(
    client: E2EClient,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.put('/api/lis/referrals/laboratories', {
      name: 'Hi-Precision',
      dohLtoNumber: 'LTO-REF-777',
      courier: 'Their driver collects at 3pm',
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  /** Declare the test as NOT performed here, optionally with a destination. */
  async function sendOut(
    client: E2EClient,
    testId: string,
    referralLaboratoryId?: string,
  ) {
    const res = await client.axios.post('/api/lis/laboratory/capabilities', {
      testId,
      isEnabled: false,
      ...(referralLaboratoryId ? { referralLaboratoryId } : {}),
    });
    expect(res.status).toBe(200);
  }

  async function order(client: E2EClient, patientId: string, testId: string) {
    return client.axios.post('/api/lab-orders', {
      patientId,
      items: [{ testId }],
    });
  }

  describe('destinations', () => {
    it('records one, and lists it', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const lab = await destination(client);
      expect(lab.dohLtoNumber).toBe('LTO-REF-777');

      const list = await client.axios.get('/api/lis/referrals/laboratories');
      expect(list.status).toBe(200);
      expect(list.data).toHaveLength(1);
    });

    it('updates by name rather than accumulating duplicates', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const first = await destination(client);
      const again = await destination(client, { phone: '0917-000-0000' });
      expect(again.id).toBe(first.id);
      const list = await client.axios.get('/api/lis/referrals/laboratories');
      expect(list.data).toHaveLength(1);
    });

    it('is not editable by a nurse', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await destination(client);
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.put(
        '/api/lis/referrals/laboratories',
        { name: 'Nope' },
      );
      expect(res.status).toBe(403);
    });

    it('retires rather than deletes, because referrals point at it', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const lab = await destination(client);
      const res = await client.axios.delete(
        `/api/lis/referrals/laboratories/${lab.id}`,
      );
      expect(res.status).toBe(204);
      const list = await client.axios.get('/api/lis/referrals/laboratories');
      expect(list.data).toHaveLength(0);

      // Still there, soft-deleted: the record of where a specimen went has
      // to stay explicable.
      const { rows } = await pg.query(
        `SELECT "deletedAt" FROM referral_laboratories WHERE id = $1`,
        [lab.id],
      );
      expect(rows[0].deletedAt).not.toBeNull();
    });
  });

  describe('routing an order', () => {
    it('refers an out-of-scope test that has a destination', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, testId } = await labWithTest(client);
      const dest = await destination(client);
      await sendOut(client, testId, dest.id);

      const res = await order(client, patientId, testId);
      expect(res.status).toBe(201);
      expect(res.data.referred).toHaveLength(1);
      expect(res.data.referred[0].laboratory).toBe('Hi-Precision');
      // Referred, so not also flagged — it has somewhere to go.
      expect(res.data.outOfScope).toEqual([]);

      const worklist = await client.axios.get('/api/lis/referrals');
      expect(worklist.data).toHaveLength(1);
      expect(worklist.data[0].status).toBe('PENDING');
    });

    it('flags, not refuses, when there is nowhere to send it', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, testId } = await labWithTest(client);
      await sendOut(client, testId);

      const res = await order(client, patientId, testId);
      expect(res.status).toBe(201);
      expect(res.data.outOfScope).toHaveLength(1);
      expect(res.data.referred).toEqual([]);
    });

    it('refuses once the clinic turns enforcement on', async () => {
      // The whole point of the referral slice: with a lawful route
      // available, refusing an order that has none becomes defensible.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, testId } = await labWithTest(client);
      await sendOut(client, testId);
      const setting = await client.axios.patch('/api/tenants/me/settings', {
        labCapability: { enforce: true },
      });
      expect(setting.status).toBe(200);

      const res = await order(client, patientId, testId);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/no referral laboratory/);
    });

    it('still succeeds under enforcement when a destination is on file', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, testId } = await labWithTest(client);
      const dest = await destination(client);
      await sendOut(client, testId, dest.id);
      await client.axios.patch('/api/tenants/me/settings', {
        labCapability: { enforce: true },
      });

      const res = await order(client, patientId, testId);
      expect(res.status).toBe(201);
      expect(res.data.referred).toHaveLength(1);
    });

    it('does not refer to a laboratory with no LTO on file', async () => {
      // AO 2021-0037 permits referral only to a licensed laboratory.
      // Referring to one we cannot evidence is licensed is indefensible.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, testId } = await labWithTest(client);
      const dest = await destination(client, {
        name: 'Unlicensed Lab',
        dohLtoNumber: undefined,
      });
      await sendOut(client, testId, dest.id);

      const res = await order(client, patientId, testId);
      // The order still succeeds — a misconfigured standing arrangement must
      // not break ordering — but nothing was referred, and it is flagged.
      expect(res.status).toBe(201);
      expect(res.data.referred).toEqual([]);
      expect(res.data.outOfScope).toHaveLength(1);
    });

    it('refers nothing when the clinic declared no capability', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, testId } = await labWithTest(client);
      await destination(client);

      const res = await order(client, patientId, testId);
      expect(res.status).toBe(201);
      expect(res.data.referred).toEqual([]);
      expect(res.data.outOfScope).toEqual([]);
    });
  });

  describe('the send-out worklist', () => {
    async function pendingReferral(client: E2EClient) {
      const { patientId, testId } = await labWithTest(client);
      const dest = await destination(client);
      await sendOut(client, testId, dest.id);
      const res = await order(client, patientId, testId);
      expect(res.status).toBe(201);
      const worklist = await client.axios.get('/api/lis/referrals');
      return worklist.data[0];
    }

    it('walks PENDING to SENT to RECEIVED', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const ref = await pendingReferral(client);

      const sent = await client.axios.patch(
        `/api/lis/referrals/${ref.id}/sent`,
        { externalRef: 'HP-2026-0001', courier: 'LBC' },
      );
      expect(sent.status).toBe(200);
      expect(sent.data.status).toBe('SENT');
      expect(sent.data.externalRef).toBe('HP-2026-0001');
      expect(sent.data.sentAt).not.toBeNull();

      const received = await client.axios.patch(
        `/api/lis/referrals/${ref.id}/received`,
        { conditionOnArrival: 'Intact' },
      );
      expect(received.status).toBe(200);
      expect(received.data.status).toBe('RECEIVED');
    });

    it('does not let a specimen arrive before it was sent', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const ref = await pendingReferral(client);
      const res = await client.axios.patch(
        `/api/lis/referrals/${ref.id}/received`,
        {},
      );
      // PENDING -> RECEIVED skips SENT.
      expect(res.status).toBe(400);
    });

    it('does not let a sent specimen un-leave the building', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const ref = await pendingReferral(client);
      await client.axios.patch(`/api/lis/referrals/${ref.id}/sent`, {});
      await client.axios.patch(`/api/lis/referrals/${ref.id}/received`, {});
      const again = await client.axios.patch(
        `/api/lis/referrals/${ref.id}/sent`,
        {},
      );
      expect(again.status).toBe(400);
    });

    it('rejects a received time earlier than the sent time', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const ref = await pendingReferral(client);
      await client.axios.patch(`/api/lis/referrals/${ref.id}/sent`, {});
      const res = await client.axios.patch(
        `/api/lis/referrals/${ref.id}/received`,
        { at: '2020-01-01T00:00:00.000Z' },
      );
      expect(res.status).toBe(400);
    });

    it('filters by status', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const ref = await pendingReferral(client);
      await client.axios.patch(`/api/lis/referrals/${ref.id}/sent`, {});

      const sent = await client.axios.get('/api/lis/referrals?status=SENT');
      expect(sent.data).toHaveLength(1);
      const pending = await client.axios.get(
        '/api/lis/referrals?status=PENDING',
      );
      expect(pending.data).toHaveLength(0);
    });
  });

  describe('the report', () => {
    /** Refer a test, get it back, record and release the result. */
    async function referredAndResulted(client: E2EClient) {
      const { patientId, testId } = await labWithTest(client);
      const dest = await destination(client);
      await sendOut(client, testId, dest.id);
      const ord = await order(client, patientId, testId);
      expect(ord.status).toBe(201);
      expect(ord.data.referred).toHaveLength(1);

      const worklist = await client.axios.get('/api/lis/referrals');
      const ref = worklist.data[0];
      await client.axios.patch(`/api/lis/referrals/${ref.id}/sent`, {});
      await client.axios.patch(`/api/lis/referrals/${ref.id}/received`, {
        externalRef: 'HP-9',
      });

      const res = await client.axios.patch(
        `/api/lab-orders/${ord.data.id}/items/${ord.data.items[0].id}`,
        { resultValue: '5.4' },
      );
      expect(res.status).toBe(200);
      return ord.data;
    }

    it('issues, and stays current after issue', async () => {
      // The assertion that matters. The content hash now includes the
      // referral destination, and it is computed independently at issue and
      // on read. If either query forgot to load the referral the two would
      // disagree and every referred report would read as stale the moment
      // someone opened it.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const ord = await referredAndResulted(client);

      const report = await client.axios.post(
        `/api/lis/orders/${ord.id}/reports`,
        {},
      );
      expect(report.status).toBe(201);
      expect(report.data.isCurrent).toBe(true);

      const reread = await client.axios.get(
        `/api/lis/reports/${report.data.id}`,
      );
      expect(reread.data.isCurrent).toBe(true);
    });

    it('produces a PDF naming the referral laboratory', async () => {
      // AO 2021-0037 requires the report to state which tests were referred
      // and to which. The PDF is compressed, so this asserts a real document
      // comes back; the block's wording is unit-tested.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const ord = await referredAndResulted(client);
      const report = await client.axios.post(
        `/api/lis/orders/${ord.id}/reports`,
        {},
      );
      const pdf = await client.axios.get(
        `/api/lis/reports/${report.data.id}/pdf`,
        { responseType: 'arraybuffer' },
      );
      expect(pdf.status).toBe(200);
      expect(Buffer.from(pdf.data).subarray(0, 5).toString('latin1')).toBe(
        '%PDF-',
      );
    });

    it('cannot be issued while the referred test is still out', async () => {
      // Nothing has come back, so the result is PENDING and there is nothing
      // to sign for.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { patientId, testId } = await labWithTest(client);
      const dest = await destination(client);
      await sendOut(client, testId, dest.id);
      const ord = await order(client, patientId, testId);

      const report = await client.axios.post(
        `/api/lis/orders/${ord.data.id}/reports`,
        {},
      );
      expect(report.status).toBe(400);
    });
  });

  describe('the record', () => {
    it('cannot be deleted by the application role', async () => {
      // A referral records a specimen leaving the building. It can be
      // cancelled, which is a status, but not erased.
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'lab_referrals'`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('INSERT');
      expect(privs).toContain('SELECT');
      expect(privs).toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });

    it('is tenant-isolated', async () => {
      const { rows } = await pg.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname IN ('referral_laboratories', 'lab_referrals')`,
      );
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.relrowsecurity).toBe(true);
        expect(r.relforcerowsecurity).toBe(true);
      }
    });

    it('does not leak destinations across tenants', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      await destination(a.client);
      const res = await b.client.axios.get('/api/lis/referrals/laboratories');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });
  });
});
