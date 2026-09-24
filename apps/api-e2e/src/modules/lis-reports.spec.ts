/**
 * Signed laboratory reports — the release path.
 *
 * Verified results had nowhere to go: no report, no signature, no artifact a
 * patient or referring doctor could hold, while invoices and prescriptions
 * both had one.
 *
 * The contract:
 *   - a report cannot be issued until every result is released
 *   - signing snapshots the signer's name and PRC licence, as prescriptions do
 *   - correcting a result afterwards makes the report stale, visibly
 *   - a stale report is superseded by a new version, never edited
 *   - signatures are append-only at the grant level
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

describe('LIS lab reports', () => {
  let env: E2EEnv;
  let pg: PgClient | undefined;

  beforeAll(async () => {
    env = await bootEnv();
    pg = new PgClient({
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

  async function orderWithResults(
    client: E2EClient,
    values: Array<string | null> = ['4.1'],
  ) {
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-REP-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Rep',
      lastName: 'Ort',
      dateOfBirth: '1979-04-04',
      sex: 'MALE',
    });
    expect(patient.status).toBe(201);
    const order = await client.axios.post('/api/lab-orders', {
      patientId: patient.data.id,
      items: values.map((_, i) => ({
        testName: i === 0 ? 'Potassium' : `Analyte ${i}`,
        testCode: i === 0 ? 'K' : `A${i}`,
        resultUnit: 'mmol/L',
      })),
    });
    expect(order.status).toBe(201);

    for (const [i, value] of values.entries()) {
      if (value === null) continue;
      const res = await client.axios.patch(
        `/api/lab-orders/${order.data.id}/items/${order.data.items[i].id}`,
        { resultValue: value },
      );
      expect(res.status).toBe(200);
    }
    return { patientId: patient.data.id, order: order.data };
  }

  describe('issuing', () => {
    it('issues a numbered, signed report and records who signed it', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const doctor = await env.makeDoctor(tenant);
      const { order } = await orderWithResults(client);

      const res = await doctor.client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(res.status).toBe(201);
      expect(res.data.number).toMatch(/^LR-\d{6}-\d{4,}$/);
      expect(res.data.version).toBe(1);
      expect(res.data.status).toBe('ISSUED');
      expect(res.data.isCurrent).toBe(true);
      expect(res.data.contentHash).toMatch(/^[0-9a-f]{64}$/);

      expect(res.data.signatures).toHaveLength(1);
      const sig = res.data.signatures[0];
      expect(sig.signerId).toBe(doctor.userId);
      expect(sig.signerRole).toBe('DOCTOR');
      // Snapshotted, as Prescription.providerLicense is: a later edit to the
      // user's licence must not change a signed document.
      expect(sig.signerName).toBeTruthy();
      expect(sig.contentHash).toBe(res.data.contentHash);
    });

    it('refuses while any result is unreleased', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const setting = await client.axios.patch('/api/tenants/me/settings', {
        labVerification: { required: true },
      });
      expect(setting.status).toBe(200);
      const { order } = await orderWithResults(client, ['4.1']);

      // The value is PRELIMINARY — nobody has stood behind it.
      const res = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/Potassium/);
    });

    it('refuses an order with no results at all', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await orderWithResults(client, [null]);
      const res = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(res.status).toBe(400);
    });

    it('refuses a duplicate report when nothing has changed', async () => {
      // A second identical report under a different number is just confusing.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await orderWithResults(client);
      const first = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(first.status).toBe(201);
      const again = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(again.status).toBe(400);
      expect(JSON.stringify(again.data)).toMatch(/already covers/);
    });

    it('is refused to a nurse — signing is not nursing scope', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const nurse = await env.makeNurse(tenant);
      const { order } = await orderWithResults(client);
      const res = await nurse.client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(res.status).toBe(403);
    });
  });

  describe('countersigning', () => {
    it('lets a pathologist endorse what a technologist issued', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const tech = await env.makeMedTech(tenant);
      const path = await env.makePathologist(tenant);
      const { order } = await orderWithResults(client);

      const issued = await tech.client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(issued.status).toBe(201);

      const signed = await path.client.axios.post(
        `/api/lis/reports/${issued.data.id}/sign`,
        {},
      );
      expect(signed.status).toBe(200);
      expect(signed.data.signatures).toHaveLength(2);
      const roles = signed.data.signatures.map(
        (sig: { signerRole: string }) => sig.signerRole,
      );
      expect(roles).toContain('MEDICAL_TECHNOLOGIST');
      expect(roles).toContain('PATHOLOGIST');
    });

    it('refuses the same person signing twice', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const tech = await env.makeMedTech(tenant);
      const { order } = await orderWithResults(client);
      const issued = await tech.client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      const again = await tech.client.axios.post(
        `/api/lis/reports/${issued.data.id}/sign`,
        {},
      );
      expect(again.status).toBe(400);
    });
  });

  describe('a correction after issue', () => {
    it('makes the report visibly stale rather than silently wrong', async () => {
      // This is the property the content hash exists for: a signed document
      // asserting 6.8 when the result now says 4.2 is not out of date, it is
      // untrue, and nothing in the row itself would show that.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await orderWithResults(client, ['6.8']);
      const issued = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(issued.data.isCurrent).toBe(true);

      const corrected = await client.axios.post(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}/amend`,
        { resultValue: '4.2', reason: 'transcribed from the wrong tube' },
      );
      expect(corrected.status).toBe(200);

      const after = await client.axios.get(
        `/api/lis/reports/${issued.data.id}`,
      );
      expect(after.status).toBe(200);
      expect(after.data.isCurrent).toBe(false);
    });

    it('refuses a countersignature on a stale report', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const path = await env.makePathologist(tenant);
      const { order } = await orderWithResults(client, ['6.8']);
      const issued = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      await client.axios.post(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}/amend`,
        { resultValue: '4.2', reason: 'wrong tube' },
      );

      const res = await path.client.axios.post(
        `/api/lis/reports/${issued.data.id}/sign`,
        {},
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/changed since/);
    });

    it('supersedes the old report rather than editing it', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await orderWithResults(client, ['6.8']);
      const v1 = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      await client.axios.post(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}/amend`,
        { resultValue: '4.2', reason: 'wrong tube' },
      );
      const v2 = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(v2.status).toBe(201);
      expect(v2.data.version).toBe(2);
      expect(v2.data.supersedesId).toBe(v1.data.id);
      expect(v2.data.isCurrent).toBe(true);
      expect(v2.data.number).not.toBe(v1.data.number);

      // The original is kept, marked superseded — it was genuinely issued and
      // someone may be holding a copy.
      const old = await client.axios.get(`/api/lis/reports/${v1.data.id}`);
      expect(old.data.status).toBe('SUPERSEDED');
      expect(old.data.contentHash).not.toBe(v2.data.contentHash);

      const all = await client.axios.get(`/api/lis/orders/${order.id}/reports`);
      expect(all.data).toHaveLength(2);
    });

    it('refuses to sign a superseded report', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const path = await env.makePathologist(tenant);
      const { order } = await orderWithResults(client, ['6.8']);
      const v1 = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      await client.axios.post(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}/amend`,
        { resultValue: '4.2', reason: 'wrong tube' },
      );
      await client.axios.post(`/api/lis/orders/${order.id}/reports`, {});

      const res = await path.client.axios.post(
        `/api/lis/reports/${v1.data.id}/sign`,
        {},
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/superseded/);
    });
  });

  describe('the record', () => {
    it('keeps signatures append-only and reports un-deletable', async () => {
      const { rows } = await pg!.query<{
        table_name: string;
        privilege_type: string;
      }>(
        `SELECT table_name, privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app'
            AND table_name IN ('lab_reports', 'lab_report_signatures')`,
      );
      const privs = (t: string) =>
        rows.filter((r) => r.table_name === t).map((r) => r.privilege_type);

      // A signature is a record of who put their licence to what.
      expect(privs('lab_report_signatures')).toContain('INSERT');
      expect(privs('lab_report_signatures')).toContain('SELECT');
      expect(privs('lab_report_signatures')).not.toContain('UPDATE');
      expect(privs('lab_report_signatures')).not.toContain('DELETE');

      // Reports keep UPDATE — superseding flips a status — but an issued
      // report cannot be unissued.
      expect(privs('lab_reports')).toContain('UPDATE');
      expect(privs('lab_reports')).not.toContain('DELETE');
    });

    it('is tenant-isolated', async () => {
      const { rows } = await pg!.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname IN ('lab_reports', 'lab_report_signatures')`,
      );
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.relrowsecurity).toBe(true);
        expect(r.relforcerowsecurity).toBe(true);
      }
    });

    it('does not leak a report to another tenant', async () => {
      const a = await env.makeTenant({ plan: 'PREMIUM' });
      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const { order } = await orderWithResults(a.client);
      const issued = await a.client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      const res = await b.client.axios.get(
        `/api/lis/reports/${issued.data.id}`,
      );
      expect(res.status).toBe(404);
    });
  });
});
