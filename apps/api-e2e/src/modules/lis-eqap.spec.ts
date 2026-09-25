/**
 * External quality assessment — DOH AO 2021-0037.
 *
 * Internal QC shows an analytical process is stable against its own mean. It
 * cannot show the mean is right: a laboratory can be beautifully in control
 * around a value that is systematically wrong, and every run will agree with
 * every other run. EQAP is the only routine check that catches that, and
 * participation is what an inspection asks to see evidence of.
 *
 * The rules are unit-tested in eqap.spec.ts. This covers what only a
 * database shows: that a round cannot be recorded twice, that a score
 * without a submission is refused, and that the participation summary an
 * inspector would read is assembled correctly.
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe('LIS external quality assessment', () => {
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

  async function provider(
    client: E2EClient,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.put('/api/lis/eqap/providers', {
      name: 'NRL Philippines',
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  async function enrolment(
    client: E2EClient,
    providerId: string,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.put('/api/lis/eqap/enrolments', {
      providerId,
      programme: 'Clinical Chemistry',
      enrolmentNumber: 'NRL-2026-001',
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  async function submit(
    client: E2EClient,
    enrolmentId: string,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.post('/api/lis/eqap/submissions', {
      enrolmentId,
      roundRef: '2026-R1',
      reportedValue: 102,
      dueOn: days(7),
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  describe('enrolment', () => {
    it('records a provider and a programme with its participant number', async () => {
      // The participant number is what an inspector matches against the
      // certificate on the wall.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);
      expect(e.enrolmentNumber).toBe('NRL-2026-001');

      const list = await client.axios.get('/api/lis/eqap/enrolments');
      expect(list.data).toHaveLength(1);
      expect(list.data[0].provider.name).toBe('NRL Philippines');
      expect(list.data[0].active).toBe(true);
    });

    it('reports a lapsed enrolment as inactive', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      await enrolment(client, p.id, { validUntil: days(-1) });
      const list = await client.axios.get('/api/lis/eqap/enrolments');
      expect(list.data[0].active).toBe(false);
    });

    it('is not editable by a nurse', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await provider(client);
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.put('/api/lis/eqap/providers', {
        name: 'Nope',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('a survey round', () => {
    it('records what we sent, then what came back', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);
      const s = await submit(client, e.id);
      expect(s.submittedAt).not.toBeNull();

      const scored = await client.axios.post(
        `/api/lis/eqap/submissions/${s.id}/result`,
        { sdi: 0.6 },
      );
      expect(scored.status).toBe(200);
      expect(scored.data.performance).toBe('ACCEPTABLE');
      expect(scored.data.state).toBe('SCORED');
    });

    it('derives the SDI from the peer mean and SD when that is what the provider gives', async () => {
      // Providers report differently. Reported 110 against a peer mean of
      // 100 with SD 5 is exactly 2 SD out — acceptable, at the limit.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);
      const s = await submit(client, e.id, { reportedValue: 110 });

      const scored = await client.axios.post(
        `/api/lis/eqap/submissions/${s.id}/result`,
        { peerMean: 100, peerSd: 5 },
      );
      expect(scored.data.sdi).toBeCloseTo(2, 5);
      expect(scored.data.performance).toBe('ACCEPTABLE');
    });

    it('marks a result beyond two SD unacceptable', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);
      const s = await submit(client, e.id);
      const scored = await client.axios.post(
        `/api/lis/eqap/submissions/${s.id}/result`,
        { sdi: 3.4 },
      );
      expect(scored.data.performance).toBe('UNACCEPTABLE');
    });

    it('refuses to score a round that was never submitted', async () => {
      // A provider scores what was sent to it. There is a CHECK constraint
      // behind this too.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);
      const { rows } = await pg.query<{ id: string }>(
        `INSERT INTO eqap_submissions (id,"tenantId","enrolmentId","roundRef","updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'UNSENT', now()) RETURNING id`,
        [e.tenantId, e.id],
      );
      const res = await client.axios.post(
        `/api/lis/eqap/submissions/${rows[0].id}/result`,
        { sdi: 1.0 },
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/not been submitted/);
    });

    it('updates the same round rather than recording it twice', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);
      const first = await submit(client, e.id, { reportedValue: 100 });
      const again = await submit(client, e.id, { reportedValue: 101 });
      expect(again.id).toBe(first.id);
      expect(again.reportedValue).toBe(101);

      const list = await client.axios.get(
        `/api/lis/eqap/enrolments/${e.id}/submissions`,
      );
      expect(list.data).toHaveLength(1);
    });
  });

  describe('the participation record', () => {
    it('is what an inspector reads: failures matter less than unexamined ones', async () => {
      // Failing a survey is not itself a finding — laboratories fail
      // surveys. Failing one and recording nothing is, because it says
      // nobody looked into it.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);

      const pass = await submit(client, e.id, { roundRef: 'R1' });
      await client.axios.post(`/api/lis/eqap/submissions/${pass.id}/result`, {
        sdi: 0.5,
      });

      const fail = await submit(client, e.id, { roundRef: 'R2' });
      await client.axios.post(`/api/lis/eqap/submissions/${fail.id}/result`, {
        sdi: 3.5,
      });

      let list = await client.axios.get('/api/lis/eqap/enrolments');
      expect(list.data[0].participation).toMatchObject({
        total: 2,
        scored: 2,
        acceptable: 1,
        unacceptable: 1,
        unresolved: 1,
      });

      // Investigate it, and the unresolved count clears while the failure
      // itself stays on the record.
      await client.axios.post(`/api/lis/eqap/submissions/${fail.id}/result`, {
        correctiveAction: 'Recalibrated; repeat survey in range',
      });
      list = await client.axios.get('/api/lis/eqap/enrolments');
      expect(list.data[0].participation).toMatchObject({
        unacceptable: 1,
        unresolved: 0,
      });
    });

    it('does not erase the score when corrective action is recorded', async () => {
      // Regression: this endpoint records both the provider's result and the
      // corrective action, and an earlier version recomputed the SDI from
      // the request alone — so documenting a failure wiped the evidence of
      // it. Caught by the summary above going from 1 unacceptable to 0.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);
      const s = await submit(client, e.id);
      await client.axios.post(`/api/lis/eqap/submissions/${s.id}/result`, {
        sdi: 3.5,
        peerMean: 100,
        peerSd: 4,
      });

      const after = await client.axios.post(
        `/api/lis/eqap/submissions/${s.id}/result`,
        { correctiveAction: 'Investigated; instrument recalibrated' },
      );
      expect(after.data.sdi).toBeCloseTo(3.5, 5);
      expect(after.data.peerMean).toBe(100);
      expect(after.data.performance).toBe('UNACCEPTABLE');
      expect(after.data.correctiveAction).toMatch(/Investigated/);
    });

    it('counts a round nobody submitted as missed', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(client);
      const e = await enrolment(client, p.id);
      await pg.query(
        `INSERT INTO eqap_submissions (id,"tenantId","enrolmentId","roundRef","dueOn","updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'MISSED', now() - interval '10 days', now())`,
        [e.tenantId, e.id],
      );
      const list = await client.axios.get('/api/lis/eqap/enrolments');
      expect(list.data[0].participation.missedOrLate).toBe(1);
    });
  });

  describe('the record', () => {
    it('cannot delete a submission — it is evidence of participation', async () => {
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'eqap_submissions'`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('INSERT');
      expect(privs).toContain('SELECT');
      // UPDATE stays: the score and corrective action arrive later.
      expect(privs).toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });

    it('keeps all three tables tenant-isolated', async () => {
      const { rows } = await pg.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname IN ('eqap_providers','eqap_enrolments','eqap_submissions')`,
      );
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.relrowsecurity).toBe(true);
        expect(r.relforcerowsecurity).toBe(true);
      }
    });

    it('does not leak enrolments across tenants', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await provider(a.client);
      await enrolment(a.client, p.id);
      const res = await b.client.axios.get('/api/lis/eqap/enrolments');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });
  });
});
