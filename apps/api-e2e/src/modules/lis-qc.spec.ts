/**
 * Internal quality control — DOH AO 2021-0037.
 *
 * Nothing existed: no control material, lot, target mean or SD, no run, no
 * Westgard evaluation, no corrective action. For a licensed laboratory this
 * is the difference between passing and failing inspection, and it is the
 * part of the process that says whether the patient results produced that
 * day can be trusted at all.
 *
 * The rules themselves are unit-tested in westgard.spec.ts. This asserts the
 * things only a database can show: that the judgement is stored rather than
 * recomputed, that a superseded target does not rewrite history, and that a
 * run cannot be erased.
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

describe('LIS quality control', () => {
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

  async function material(
    client: E2EClient,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.put('/api/lis/qc/materials', {
      name: 'Liquichek Chemistry',
      level: 'NORMAL',
      lotNumber: 'LOT-A',
      manufacturer: 'Bio-Rad',
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  async function target(
    client: E2EClient,
    materialId: string,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.put('/api/lis/qc/targets', {
      materialId,
      testId: 'test-k',
      mean: 100,
      sd: 5,
      unit: 'mmol/L',
      ...over,
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  const run = (
    client: E2EClient,
    materialId: string,
    value: number,
    extra: Record<string, unknown> = {},
  ) =>
    client.axios.post('/api/lis/qc/runs', {
      materialId,
      testId: 'test-k',
      value,
      ...extra,
    });

  describe('materials and targets', () => {
    it('keys a material by name AND lot', async () => {
      // A new lot is a new material: the target mean shifts between batches,
      // so carrying the old targets forward would judge new material against
      // numbers that no longer describe it.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const a = await material(client);
      const b = await material(client, { lotNumber: 'LOT-B' });
      expect(b.id).not.toBe(a.id);

      const list = await client.axios.get('/api/lis/qc/materials');
      expect(list.data).toHaveLength(2);
    });

    it('updates in place for the same name and lot', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const a = await material(client);
      const again = await material(client, { manufacturer: 'Randox' });
      expect(again.id).toBe(a.id);
      expect(again.manufacturer).toBe('Randox');
    });

    it('refuses a target with no spread', async () => {
      // SD of zero makes every z-score infinite and would reject every run
      // with a violation nobody could explain.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      const res = await client.axios.put('/api/lis/qc/targets', {
        materialId: m.id,
        testId: 'test-k',
        mean: 100,
        sd: 0,
      });
      expect(res.status).toBe(400);
    });

    it('is not editable by a nurse — it decides how every run is judged', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      const nurse = await env.makeNurse(tenant);
      const res = await nurse.client.axios.put('/api/lis/qc/targets', {
        materialId: m.id,
        testId: 'test-k',
        mean: 999,
        sd: 1,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('recording a run', () => {
    it('accepts a result near the mean and stores the z-score', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id);

      const res = await run(client, m.id, 102);
      expect(res.status).toBe(201);
      expect(res.data.outcome).toBe('ACCEPTED');
      expect(res.data.z).toBeCloseTo(0.4, 5);
      expect(res.data.violations).toEqual([]);
      // Snapshotted, so the judgement stays explicable after the target moves.
      expect(res.data.targetMean).toBe(100);
      expect(res.data.targetSd).toBe(5);
    });

    it('warns beyond 2 SD without rejecting', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id);
      const res = await run(client, m.id, 111); // z = 2.2
      expect(res.data.outcome).toBe('WARNING');
      expect(res.data.violations).toEqual(['1-2s']);
    });

    it('rejects beyond 3 SD', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id);
      const res = await run(client, m.id, 116); // z = 3.2
      expect(res.data.outcome).toBe('REJECTED');
      expect(res.data.violations).toContain('1-3s');
    });

    it('rejects two consecutive beyond 2 SD on the same side', async () => {
      // 2-2s reads the stored history, which is the part unit tests cannot
      // cover: the series has to come back from the database in the right
      // order for the rule to see it.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id);

      // No explicit runAt: a target is effective from when it was
      // established, so a run timestamped before that cannot be judged
      // against it — correctly refused, and not what this test is about.
      const first = await run(client, m.id, 111);
      expect(first.data.outcome).toBe('WARNING');

      const second = await run(client, m.id, 112);
      expect(second.data.outcome).toBe('REJECTED');
      expect(second.data.violations).toContain('2-2s');
    });

    it('rejects on R-4s against a peer level in the same run', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id);
      const res = await run(client, m.id, 111, { peerZScores: [-2.1] });
      expect(res.data.outcome).toBe('REJECTED');
      expect(res.data.violations).toContain('R-4s');
    });

    it('refuses a run with no target established', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      const res = await run(client, m.id, 100);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/target/);
    });

    it('refuses a run timestamped before its target existed', async () => {
      // Discovered by a test of mine that dated a run into the past. A
      // target is effective from when it was established, and judging a
      // run against numbers that did not exist yet would be inventing a
      // verdict. Worth pinning rather than leaving as an accident.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id);
      const res = await run(client, m.id, 100, {
        runAt: '2020-01-01T00:00:00.000Z',
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/target/);
    });

    it('refuses a run on expired material', async () => {
      // A control result from expired material shows nothing.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client, {
        lotNumber: 'LOT-OLD',
        expiresOn: '2020-01-01T00:00:00.000Z',
      });
      await target(client, m.id);
      const res = await run(client, m.id, 100);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/expired/);
    });

    it('refuses a run on an inactive lot', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client, { isActive: false });
      await target(client, m.id);
      const res = await run(client, m.id, 100);
      expect(res.status).toBe(400);
    });
  });

  describe('a superseded target', () => {
    it('does not rewrite the judgement already made', async () => {
      // The decision is stored, not recomputed. Re-deriving it after the
      // mean moves would silently rewrite history, and the Levey-Jennings
      // chart an inspector asks for is a chart of what was decided then.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id, { mean: 100, sd: 5 });
      const before = await run(client, m.id, 102);
      expect(before.data.outcome).toBe('ACCEPTED');
      expect(before.data.z).toBeCloseTo(0.4, 5);

      // Re-establish the mean somewhere else entirely.
      await target(client, m.id, { mean: 50, sd: 1 });

      const runs = await client.axios.get('/api/lis/qc/runs?testId=test-k');
      const stored = runs.data.find(
        (r: { id: string }) => r.id === before.data.id,
      );
      expect(stored.z).toBeCloseTo(0.4, 5);
      expect(stored.targetMean).toBe(100);
      expect(stored.outcome).toBe('ACCEPTED');
    });
  });

  describe('corrective action', () => {
    it('is recorded against a rejected run', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id);
      const rejected = await run(client, m.id, 116);
      expect(rejected.data.outcome).toBe('REJECTED');

      const res = await client.axios.post(
        `/api/lis/qc/runs/${rejected.data.id}/corrective-action`,
        {
          correctiveAction: 'Recalibrated analyser; repeated control in range',
        },
      );
      expect(res.status).toBe(200);
      expect(res.data.correctiveAction).toMatch(/Recalibrated/);
    });

    it('is refused against a run that was in control', async () => {
      // Corrective action on a passing run is noise. It is the presence of
      // action against real failures that an inspection looks for.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(client);
      await target(client, m.id);
      const ok = await run(client, m.id, 101);
      const res = await client.axios.post(
        `/api/lis/qc/runs/${ok.data.id}/corrective-action`,
        { correctiveAction: 'nothing to do' },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('the record', () => {
    it('cannot be deleted by the application role', async () => {
      // A QC run is evidence the process was or was not in control when
      // patient samples ran. UPDATE stays so corrective action can be added.
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'qc_runs'`,
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
          WHERE relname IN ('qc_materials', 'qc_targets', 'qc_runs')`,
      );
      expect(rows).toHaveLength(3);
      for (const r of rows) {
        expect(r.relrowsecurity).toBe(true);
        expect(r.relforcerowsecurity).toBe(true);
      }
    });

    it('does not leak QC across tenants', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const m = await material(a.client);
      await target(a.client, m.id);
      await run(a.client, m.id, 100);

      const res = await b.client.axios.get('/api/lis/qc/runs?testId=test-k');
      expect(res.status).toBe(200);
      expect(res.data).toEqual([]);
    });
  });
});
