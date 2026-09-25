/**
 * Pathologist supervision of released results — RA 5527.
 *
 * The Philippine Medical Technology Act requires a medical technologist to
 * practise under the supervision of a pathologist, or of a DOH-authorized
 * physician where no pathologist is available. Practising without it is
 * penalised, and it is the technologist who is penalised.
 *
 * CLINIQ already had both roles. What it could not express was the
 * relationship between them: a technologist could release a result to the
 * chart and sign the report, and nothing anywhere recorded under whose
 * authority. An inspector asking "who supervised this result" had no answer.
 *
 * The rules are unit-tested in supervision.spec.ts. This covers what only a
 * database and a running API show: that the supervisor is snapshotted onto
 * the append-only history, that a later edit to the laboratory profile cannot
 * rewrite it, and that enforcement refuses the right releases and never the
 * pathologist's own.
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

describe('LIS pathologist supervision', () => {
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

  /** Name a pathologist of record on the laboratory profile. */
  async function setPathologist(
    client: E2EClient,
    pathologistName: string | undefined,
    pathologistLicenseNumber?: string,
  ) {
    const res = await client.axios.put('/api/lis/laboratory', {
      name: 'Supervision Test Laboratory',
      category: 'PRIMARY',
      ...(pathologistName ? { pathologistName } : {}),
      ...(pathologistLicenseNumber ? { pathologistLicenseNumber } : {}),
    });
    expect(res.status).toBe(200);
    return res.data;
  }

  async function enforce(client: E2EClient, required: boolean) {
    const res = await client.axios.patch('/api/tenants/me/settings', {
      labSupervision: { required },
    });
    expect(res.status).toBe(200);
  }

  async function orderWithItem(client: E2EClient) {
    const p = await client.axios.post('/api/patients', {
      mrn: `MRN-SUP-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Sup',
      lastName: 'Ervision',
      dateOfBirth: '1979-06-11',
      sex: 'MALE',
    });
    expect(p.status).toBe(201);
    const order = await client.axios.post('/api/lab-orders', {
      patientId: p.data.id,
      items: [{ testName: 'Sodium', testCode: 'NA', resultUnit: 'mmol/L' }],
    });
    expect(order.status).toBe(201);
    return {
      patientId: p.data.id,
      order: order.data,
      item: order.data.items[0],
    };
  }

  /** The supervision stamped on the append-only history of a result. */
  async function versionsOf(itemId: string) {
    const { rows } = await pg.query<{
      version: number;
      status: string;
      supervisorName: string | null;
      supervisorLicense: string | null;
    }>(
      `SELECT version, status, "supervisorName", "supervisorLicense"
         FROM lab_result_versions WHERE "orderItemId" = $1 ORDER BY version`,
      [itemId],
    );
    return rows;
  }

  describe('the stamp on a release', () => {
    it('records the supervising pathologist when a technologist releases', async () => {
      // This is the case RA 5527 is actually about.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPathologist(client, 'Dr. Maria Santos', '0123456');
      const { order, item } = await orderWithItem(client);

      const tech = await env.makeMedTech(tenant);
      const res = await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '140' },
      );
      expect(res.status).toBe(200);

      const [v] = await versionsOf(item.id);
      expect(v.status).toBe('FINAL');
      expect(v.supervisorName).toBe('Dr. Maria Santos');
      expect(v.supervisorLicense).toBe('0123456');
    });

    it('records no supervisor when a pathologist releases', async () => {
      // Naming a supervisor for a pathologist's own release would misstate
      // what happened — they are the supervision.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPathologist(client, 'Dr. Maria Santos', '0123456');
      const { order, item } = await orderWithItem(client);

      // A pathologist holds no LAB_RESULT_ENTER, so the value is keyed in by
      // the technologist and released by the pathologist.
      await enforceSeparateEntry(client, order.id, item.id, tenant);

      const rows = await versionsOf(item.id);
      const released = rows.find((r) => r.status === 'FINAL');
      expect(released).toBeDefined();
      expect(released?.supervisorName).toBeNull();
    });

    it('records no supervisor when a doctor releases', async () => {
      // RA 5527's own exception: a physician may act where no pathologist is
      // available, so a doctor releasing in their own clinic is the
      // authorised person rather than someone needing authorisation.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPathologist(client, 'Dr. Maria Santos', '0123456');
      const { order, item } = await orderWithItem(client);

      const doc = await env.makeDoctor(tenant);
      await doc.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '138' },
      );
      const [v] = await versionsOf(item.id);
      expect(v.supervisorName).toBeNull();
    });

    it('leaves a preliminary entry unstamped, because it released nothing', async () => {
      // Demanding a supervising pathologist for a value nobody has put their
      // name to yet would refuse ordinary bench work.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPathologist(client, 'Dr. Maria Santos', '0123456');
      await client.axios.patch('/api/tenants/me/settings', {
        labVerification: { required: true },
      });
      const { order, item } = await orderWithItem(client);

      const tech = await env.makeMedTech(tenant);
      await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '141' },
      );
      const [entry] = await versionsOf(item.id);
      expect(entry.status).toBe('PRELIMINARY');
      expect(entry.supervisorName).toBeNull();

      // Releasing it later is the act that carries the supervision.
      const rel = await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}/verify`,
        {},
      );
      expect(rel.status).toBe(200);
      const rows = await versionsOf(item.id);
      expect(rows.at(-1)?.status).toBe('FINAL');
      expect(rows.at(-1)?.supervisorName).toBe('Dr. Maria Santos');
    });

    it('stamps a correction with who is answerable now, not who was then', async () => {
      // A correction puts a new value on the chart under the corrector's
      // name. Inheriting the original's supervisor would name someone who
      // never saw the corrected value.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPathologist(client, 'Dr. First', '1111111');
      const { order, item } = await orderWithItem(client);

      const tech = await env.makeMedTech(tenant);
      await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '140' },
      );

      await setPathologist(client, 'Dr. Second', '2222222');
      const corr = await tech.client.axios.post(
        `/api/lab-orders/${order.id}/items/${item.id}/amend`,
        { resultValue: '144', reason: 'Transcription error on first entry' },
      );
      expect(corr.status).toBe(200);

      const rows = await versionsOf(item.id);
      // The original release still names who was answerable for it.
      expect(rows[0].supervisorName).toBe('Dr. First');
      // The correction names who is answerable for the corrected value.
      expect(rows.at(-1)?.status).toBe('CORRECTED');
      expect(rows.at(-1)?.supervisorName).toBe('Dr. Second');
    });

    it('cannot be rewritten by editing the laboratory profile afterwards', async () => {
      // The whole point of snapshotting. A laboratory that changes
      // pathologists must not thereby change who supervised last year's
      // results — and the table holds no UPDATE for the app role either.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPathologist(client, 'Dr. Original', '0000001');
      const { order, item } = await orderWithItem(client);

      const tech = await env.makeMedTech(tenant);
      await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '139' },
      );
      await setPathologist(client, 'Dr. Replacement', '0000002');

      const [v] = await versionsOf(item.id);
      expect(v.supervisorName).toBe('Dr. Original');
      expect(v.supervisorLicense).toBe('0000001');
    });
  });

  describe('enforcement', () => {
    it('records an unsupervised release rather than refusing it, by default', async () => {
      // Most clinics run on the default. Refusing here would mean results
      // never reach the ordering doctor, which is the worse failure.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order, item } = await orderWithItem(client);

      const tech = await env.makeMedTech(tenant);
      const res = await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '137' },
      );
      expect(res.status).toBe(200);
      const [v] = await versionsOf(item.id);
      expect(v.status).toBe('FINAL');
      expect(v.supervisorName).toBeNull();
    });

    it('refuses an unsupervised release once the clinic turns it on', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await enforce(client, true);
      const { order, item } = await orderWithItem(client);

      const tech = await env.makeMedTech(tenant);
      const res = await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '137' },
      );
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.data)).toMatch(/RA 5527/);
      expect(await versionsOf(item.id)).toHaveLength(0);
    });

    it('permits it once a pathologist of record is named', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await enforce(client, true);
      await setPathologist(client, 'Dr. Maria Santos', '0123456');
      const { order, item } = await orderWithItem(client);

      const tech = await env.makeMedTech(tenant);
      const res = await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '137' },
      );
      expect(res.status).toBe(200);
      expect((await versionsOf(item.id))[0].supervisorName).toBe(
        'Dr. Maria Santos',
      );
    });

    it('never locks out the pathologist it exists to involve', async () => {
      // A laboratory whose pathologist has an account but has not typed
      // their own name into the profile must still be able to release, or
      // turning the setting on would be unsafe.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await enforce(client, true);
      const { order, item } = await orderWithItem(client);

      // The doctor keys the value in (a technologist would be refused), and
      // that entry is itself a release by a physician, which is permitted.
      const doc = await env.makeDoctor(tenant);
      const res = await doc.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '140' },
      );
      expect(res.status).toBe(200);
    });
  });

  describe('the signed report', () => {
    it('carries the supervising pathologist on the signature', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      await setPathologist(client, 'Dr. Maria Santos', '0123456');
      const { order, item } = await orderWithItem(client);

      const tech = await env.makeMedTech(tenant);
      await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '140' },
      );
      const issued = await tech.client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(issued.status).toBe(201);

      const { rows } = await pg.query<{
        signerRole: string;
        supervisorName: string | null;
        supervisorLicense: string | null;
      }>(
        `SELECT "signerRole", "supervisorName", "supervisorLicense"
           FROM lab_report_signatures WHERE "reportId" = $1`,
        [issued.data.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].signerRole).toBe('MEDICAL_TECHNOLOGIST');
      expect(rows[0].supervisorName).toBe('Dr. Maria Santos');
      expect(rows[0].supervisorLicense).toBe('0123456');
    });

    it('still renders a PDF when the release was unsupervised', async () => {
      // The notice is printed rather than omitted, and the document must not
      // fail to render because of it.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { order, item } = await orderWithItem(client);
      const tech = await env.makeMedTech(tenant);
      await tech.client.axios.patch(
        `/api/lab-orders/${order.id}/items/${item.id}`,
        { resultValue: '140' },
      );
      const issued = await tech.client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(issued.status).toBe(201);

      const pdf = await client.axios.get(
        `/api/lis/reports/${issued.data.id}/pdf`,
        { responseType: 'arraybuffer' },
      );
      expect(pdf.status).toBe(200);
      expect(Buffer.from(pdf.data).subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('the record', () => {
    it('refuses a licence with no name behind it', async () => {
      // A loose licence string nothing can act on. There is a CHECK
      // constraint for this because the column is written by more than one
      // code path.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { item } = await orderWithItem(client);
      await expect(
        pg.query(
          `INSERT INTO lab_result_versions
             (id,"tenantId","orderItemId",version,status,"recordedById","supervisorLicense")
           VALUES (gen_random_uuid()::text,'t',$1,99,'FINAL','u','0123456')`,
          [item.id],
        ),
      ).rejects.toThrow(/supervisor_named/);
    });

    it('refuses a blank supervisor name', async () => {
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const { item } = await orderWithItem(client);
      await expect(
        pg.query(
          `INSERT INTO lab_result_versions
             (id,"tenantId","orderItemId",version,status,"recordedById","supervisorName")
           VALUES (gen_random_uuid()::text,'t',$1,98,'FINAL','u','   ')`,
          [item.id],
        ),
      ).rejects.toThrow(/supervisor_not_blank/);
    });

    it('keeps the supervision history append-only', async () => {
      // Recording who supervised a result is worth nothing if it can be
      // edited afterwards.
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'lab_result_versions'`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('INSERT');
      expect(privs).toContain('SELECT');
      expect(privs).not.toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });
  });

  /**
   * Key a value in as the technologist and release it as the pathologist.
   *
   * A pathologist holds no LAB_RESULT_ENTER on purpose — the role exists to
   * separate keying a value in from putting a name to it — so releasing as one
   * takes two people and the clinic's verification switch turned on.
   */
  async function enforceSeparateEntry(
    client: E2EClient,
    orderId: string,
    itemId: string,
    tenant: Parameters<E2EEnv['makeMedTech']>[0],
  ) {
    await client.axios.patch('/api/tenants/me/settings', {
      labVerification: { required: true },
    });
    const tech = await env.makeMedTech(tenant);
    const entered = await tech.client.axios.patch(
      `/api/lab-orders/${orderId}/items/${itemId}`,
      { resultValue: '140' },
    );
    expect(entered.status).toBe(200);

    const path = await env.makePathologist(tenant);
    const released = await path.client.axios.patch(
      `/api/lab-orders/${orderId}/items/${itemId}/verify`,
      {},
    );
    expect(released.status).toBe(200);
  }
});
