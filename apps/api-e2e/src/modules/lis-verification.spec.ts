import { Client } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

/**
 * The result verification chain.
 *
 * Before this, recording a result wrote the value onto the order item and
 * flipped the order to REPORTED. A technologist's keystroke was
 * indistinguishable from a released result, correcting a value destroyed the
 * one a clinician may have acted on, and neither act carried a name.
 */
describe('LIS result verification', () => {
  let env: E2EEnv;
  let pg: Client | undefined;

  beforeAll(async () => {
    env = await bootEnv();
    pg = new Client({
      connectionString:
        process.env['DATABASE_URL'] ??
        'postgresql://postgres:postgres@localhost:5432/cliniq?schema=public',
    });
    await pg.connect();
  });

  afterAll(async () => {
    await pg?.end().catch(() => undefined);
    await env.cleanup();
  });

  /** An order with one item, ready for a result. */
  async function orderWithItem(client: E2EClient) {
    const p = await client.axios.post('/api/patients', {
      mrn: `MRN-VER-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Ver',
      lastName: 'Ification',
      dateOfBirth: '1985-03-02',
      sex: 'FEMALE',
    });
    expect(p.status).toBe(201);
    const order = await client.axios.post('/api/lab-orders', {
      patientId: p.data.id,
      items: [{ testName: 'Potassium', testCode: 'K', resultUnit: 'mmol/L' }],
    });
    expect(order.status).toBe(201);
    return {
      patientId: p.data.id,
      order: order.data,
      item: order.data.items[0],
    };
  }

  async function setPolicy(
    client: E2EClient,
    labVerification: Record<string, boolean>,
  ) {
    const res = await client.axios.patch('/api/tenants/me/settings', {
      labVerification,
    });
    expect(res.status).toBe(200);
  }

  // ── default: verification off ────────────────────

  describe('with verification off (the default)', () => {
    it('releases a result on entry and records who did it', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const doctor = await env.makeDoctor(tenant);
      const { order, item } = await orderWithItem(client);

      const res = await doctor.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '4.1' },
      );
      expect(res.status).toBe(200);
      expect(res.data.resultStatus).toBe('FINAL');
      // Both stamps name the same person rather than leaving the releaser
      // blank: one person did both, and that is what the record should say.
      expect(res.data.enteredById).toBe(doctor.userId);
      expect(res.data.verifiedById).toBe(doctor.userId);
      expect(res.data.reportedAt).not.toBeNull();
    });

    it('reports the order once every item is released', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order, item } = await orderWithItem(client);
      await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
        resultValue: '4.1',
      });
      const detail = await client.axios.get(`/api/lab-orders/${order.id}`);
      expect(detail.data.status).toBe('REPORTED');
    });
  });

  // ── verification on ──────────────────────────────

  describe('with verification required', () => {
    it('holds the result at PRELIMINARY and does not report the order', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPolicy(client, { required: true });
      const { order, item } = await orderWithItem(client);

      const res = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '4.1' },
      );
      expect(res.status).toBe(200);
      expect(res.data.resultStatus).toBe('PRELIMINARY');
      expect(res.data.verifiedById).toBeNull();
      expect(res.data.reportedAt).toBeNull();

      // This is the behaviour change: an unreleased value used to report the
      // order the moment it was keyed in.
      const detail = await client.axios.get(`/api/lab-orders/${order.id}`);
      expect(detail.data.status).not.toBe('REPORTED');
    });

    it('reports the order only once the result is released', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPolicy(client, { required: true });
      const { order, item } = await orderWithItem(client);
      await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
        resultValue: '4.1',
      });

      const verify = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      expect(verify.status).toBe(200);
      expect(verify.data.resultStatus).toBe('FINAL');

      const detail = await client.axios.get(`/api/lab-orders/${order.id}`);
      expect(detail.data.status).toBe('REPORTED');
    });

    it('refuses to release a result that has no value yet', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPolicy(client, { required: true });
      const { order, item } = await orderWithItem(client);

      const res = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      expect(res.status).toBe(400);
    });

    it('refuses to re-release an already released result', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPolicy(client, { required: true });
      const { order, item } = await orderWithItem(client);
      await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
        resultValue: '4.1',
      });
      await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      const again = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      expect(again.status).toBe(400);
    });
  });

  // ── separation of duties ─────────────────────────

  describe('separation of duties', () => {
    it('allows self-verification unless the clinic asked for four eyes', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPolicy(client, { required: true });
      const { order, item } = await orderWithItem(client);
      await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
        resultValue: '4.1',
      });
      const res = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      expect(res.status).toBe(200);
    });

    it('refuses self-verification when it did', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPolicy(client, {
        required: true,
        requireSeparateVerifier: true,
      });
      const tech = await env.makeMedTech(tenant);
      const { order, item } = await orderWithItem(client);

      const entered = await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '4.1' },
      );
      expect(entered.status).toBe(200);

      const self = await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      expect(self.status).toBe(400);
    });

    it('lets a pathologist release what the technologist entered', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPolicy(client, {
        required: true,
        requireSeparateVerifier: true,
      });
      const tech = await env.makeMedTech(tenant);
      const path = await env.makePathologist(tenant);
      const { order, item } = await orderWithItem(client);

      await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '4.1' },
      );
      const released = await path.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      expect(released.status).toBe(200);
      expect(released.data.verifiedById).toBe(path.userId);
      expect(released.data.enteredById).toBe(tech.userId);
    });

    it('does not let a pathologist key a value in', async () => {
      // The role exists to be the second pair of eyes. One that could also
      // enter results would defeat the separation it provides.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const path = await env.makePathologist(tenant);
      const { order, item } = await orderWithItem(client);

      const res = await path.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '4.1' },
      );
      expect(res.status).toBe(403);
    });

    it('does not let a nurse release one', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const nurse = await env.makeNurse(tenant);
      const { order, item } = await orderWithItem(client);

      // A nurse may key in a referred-in report …
      const entered = await nurse.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '4.1' },
      );
      expect(entered.status).toBe(200);

      // … but releasing it to the chart is not nursing scope.
      const released = await nurse.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      expect(released.status).toBe(403);
    });

    it('closes the chain to the front desk entirely', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const recep = await env.makeReceptionist(tenant);
      const { order, item } = await orderWithItem(client);

      const entered = await recep.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '4.1' },
      );
      expect(entered.status).toBe(403);
    });
  });

  // ── corrections ──────────────────────────────────

  describe('corrections', () => {
    it('keeps the superseded value readable', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order, item } = await orderWithItem(client);
      await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
        resultValue: '4.1',
      });

      const amended = await client.axios.post(
        `/api/lab-orders/${order.id}/items/${item.id}/amend`,
        { resultValue: '6.8', reason: 'transcribed from the wrong tube' },
      );
      expect(amended.status).toBe(200);
      expect(amended.data.resultValue).toBe('6.8');
      expect(amended.data.resultStatus).toBe('CORRECTED');

      const history = await client.axios.get(
        `/api/lab-orders/${order.id}/items/${item.id}/history`,
      );
      expect(history.status).toBe(200);
      const values = history.data.map(
        (v: { resultValue: string }) => v.resultValue,
      );
      // The whole point: the value a clinician may have acted on survives.
      expect(values).toEqual(['4.1', '6.8']);
      expect(history.data[1].reason).toBe('transcribed from the wrong tube');
      expect(history.data.map((v: { version: number }) => v.version)).toEqual([
        1, 2,
      ]);
    });

    it('requires a reason', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order, item } = await orderWithItem(client);
      await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
        resultValue: '4.1',
      });
      const res = await client.axios.post(
        `/api/lab-orders/${order.id}/items/${item.id}/amend`,
        { resultValue: '6.8' },
      );
      expect(res.status).toBe(400);
    });

    it('does not accept whitespace as a reason', async () => {
      // Trimmed before the length check — otherwise "   " passes validation
      // and the CHECK constraint rejects it as a 500.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order, item } = await orderWithItem(client);
      await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
        resultValue: '4.1',
      });
      const res = await client.axios.post(
        `/api/lab-orders/${order.id}/items/${item.id}/amend`,
        { resultValue: '6.8', reason: '    ' },
      );
      expect(res.status).toBe(400);
    });

    it('refuses to "correct" a result nobody has released', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPolicy(client, { required: true });
      const { order, item } = await orderWithItem(client);
      await client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
        resultValue: '4.1',
      });
      const res = await client.axios.post(
        `/api/lab-orders/${order.id}/items/${item.id}/amend`,
        { resultValue: '6.8', reason: 'typo' },
      );
      expect(res.status).toBe(400);
    });

    it('re-flags a correction instead of keeping the old flag', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await client.axios.post('/api/patients', {
        mrn: `MRN-FLG-${Math.random().toString(36).slice(2, 10)}`,
        firstName: 'Flag',
        lastName: 'Case',
        dateOfBirth: '1980-01-01',
        sex: 'MALE',
      });
      const order = await client.axios.post('/api/lab-orders', {
        patientId: p.data.id,
        items: [
          {
            testName: 'Potassium',
            testCode: 'K',
            resultUnit: 'mmol/L',
            referenceLow: 3.5,
            referenceHigh: 5.1,
          },
        ],
      });
      const item = order.data.items[0];
      const first = await client.axios.patch(
        `/api/lab-orders/${order.data.id}/items/${item.id}`,
        { resultValue: '6.8' },
      );
      expect(first.data.abnormalFlag).toBe('HIGH');

      const corrected = await client.axios.post(
        `/api/lab-orders/${order.data.id}/items/${item.id}/amend`,
        { resultValue: '4.2', reason: 'wrong patient' },
      );
      // The flag is re-derived, not carried over: a corrected in-range value
      // must not still read "4.2  HIGH".
      expect(corrected.data.abnormalFlag).toBe('NORMAL');
    });
  });

  // ── history is a record, not a draft ─────────────

  describe('the version history', () => {
    it('cannot be edited or deleted by the application role', async () => {
      const { rows } = await pg!.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'lab_result_versions'`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('SELECT');
      expect(privs).toContain('INSERT');
      // What the chart said is not a draft.
      expect(privs).not.toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });

    it('is tenant-isolated', async () => {
      const { rows } = await pg!.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'lab_result_versions'`,
      );
      expect(rows[0]?.relrowsecurity).toBe(true);
      expect(rows[0]?.relforcerowsecurity).toBe(true);
    });
  });

  // ── specimen linkage ─────────────────────────────

  describe('specimen linkage', () => {
    it('frees the test when its specimen is rejected, rather than stranding it', async () => {
      // Rejection detaches the items so they can be re-collected onto a new
      // tube. That is why the "rejected specimen" guard in recordResult is
      // belt-and-braces: by this point the link is already gone, and the
      // item looks exactly like one that was never collected.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order, item } = await orderWithItem(client);

      const spc = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        { specimenType: 'Whole blood (EDTA)' },
      );
      expect(spc.status).toBe(201);
      const rejected = await client.axios.post(
        `/api/lis/specimens/${spc.data.id}/reject`,
        { reason: 'HEMOLYZED' },
      );
      expect(rejected.status).toBe(200);

      const redraw = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        { specimenType: 'Whole blood (EDTA)' },
      );
      expect(redraw.status).toBe(201);
      expect(redraw.data.accessionNumber).not.toBe(spc.data.accessionNumber);
      expect(redraw.data.items.map((i: { id: string }) => i.id)).toContain(
        item.id,
      );
    });

    it('refuses a result on a cancelled specimen', async () => {
      // CANCELLED does not detach its items, so this is the case where an
      // item really can still point at a tube nobody is going to run.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order, item } = await orderWithItem(client);

      const spc = await client.axios.post(
        `/api/lis/orders/${order.id}/specimens`,
        { specimenType: 'Whole blood (EDTA)' },
      );
      expect(spc.status).toBe(201);
      const cancelled = await client.axios.patch(
        `/api/lis/specimens/${spc.data.id}/status`,
        { status: 'CANCELLED' },
      );
      expect(cancelled.status).toBe(200);

      const res = await client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '4.1' },
      );
      expect(res.status).toBe(400);
    });

    it('drives the specimen through PROCESSING to COMPLETED', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await client.axios.post('/api/patients', {
        mrn: `MRN-LNK-${Math.random().toString(36).slice(2, 10)}`,
        firstName: 'Spec',
        lastName: 'Link',
        dateOfBirth: '1990-06-06',
        sex: 'FEMALE',
      });
      const order = await client.axios.post('/api/lab-orders', {
        patientId: p.data.id,
        items: [
          { testName: 'Sodium', testCode: 'NA' },
          { testName: 'Potassium', testCode: 'K' },
        ],
      });
      const spc = await client.axios.post(
        `/api/lis/orders/${order.data.id}/specimens`,
        { specimenType: 'Serum' },
      );
      await client.axios.patch(`/api/lis/specimens/${spc.data.id}/receive`, {});

      // First result puts the tube on the bench …
      await client.axios.patch(
        `/api/lab-orders/${order.data.id}/items/${order.data.items[0].id}`,
        { resultValue: '140' },
      );
      let detail = await client.axios.get(`/api/lis/specimens/${spc.data.id}`);
      expect(detail.data.status).toBe('PROCESSING');

      // … and the last one finishes it, with no manual status push.
      await client.axios.patch(
        `/api/lab-orders/${order.data.id}/items/${order.data.items[1].id}`,
        { resultValue: '4.1' },
      );
      detail = await client.axios.get(`/api/lis/specimens/${spc.data.id}`);
      expect(detail.data.status).toBe('COMPLETED');
    });
  });

  // ── isolation ────────────────────────────────────

  it('does not leak result history across tenants', async () => {
    const a = await env.makeTenant({ plan: 'PREMIUM' });
    const b = await env.makeTenant({ plan: 'PREMIUM' });
    const { order, item } = await orderWithItem(a.client);
    await a.client.axios.patch(`/api/lab-orders/${order.id}/items/${item.id}`, {
      resultValue: '4.1',
    });

    const res = await b.client.axios.get(
      `/api/lab-orders/${order.id}/items/${item.id}/history`,
    );
    expect(res.status).toBe(404);
  });
});
