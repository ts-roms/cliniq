/**
 * Lab report PDFs, and the patient's access to their own.
 *
 * The report existed but never left the system: no PDF, and nothing in the
 * portal. This closes that.
 *
 * The part worth guarding is the portal scoping. `GET /api/me/lab-reports/
 * :id/pdf` takes an id from the URL, which is exactly the shape of the
 * original portal BOLA — a patient reaching another patient's record through
 * a route that only checked RLS. Here the lookup is additionally scoped by
 * the patientId from the JWT, and the test below is what keeps it that way.
 */
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

/** Every PDF starts with these bytes. */
const PDF_MAGIC = '%PDF-';

describe('LIS report PDF + portal access', () => {
  let env: E2EEnv;

  beforeAll(async () => {
    env = await bootEnv();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  /** An order for `patientId` with one released result, plus its report. */
  async function issuedReport(
    client: E2EClient,
    patientId: string,
    value = '4.1',
  ) {
    const order = await client.axios.post('/api/lab-orders', {
      patientId,
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
    expect(order.status).toBe(201);
    const res = await client.axios.patch(
      `/api/lab-orders/${order.data.id}/items/${order.data.items[0].id}`,
      { resultValue: value },
    );
    expect(res.status).toBe(200);
    const report = await client.axios.post(
      `/api/lis/orders/${order.data.id}/reports`,
      {},
    );
    expect(report.status).toBe(201);
    return { order: order.data, report: report.data };
  }

  describe('staff', () => {
    it('serves a real PDF', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const { report } = await issuedReport(client, patient.patientId);

      const res = await client.axios.get(`/api/lis/reports/${report.id}/pdf`, {
        responseType: 'arraybuffer',
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      const body = Buffer.from(res.data);
      expect(body.subarray(0, 5).toString('latin1')).toBe(PDF_MAGIC);
      // A one-result report still has a header, table and signature block.
      expect(body.length).toBeGreaterThan(1000);
    });

    it('still serves a superseded report, because copies exist', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const { order, report } = await issuedReport(
        client,
        patient.patientId,
        '6.8',
      );
      await client.axios.post(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}/amend`,
        { resultValue: '4.2', reason: 'wrong tube' },
      );
      await client.axios.post(`/api/lis/orders/${order.id}/reports`, {});

      // The old one is still fetchable — it is a document that was issued.
      // Its PDF carries the superseded banner (unit-tested in reporting.spec).
      const res = await client.axios.get(`/api/lis/reports/${report.id}/pdf`, {
        responseType: 'arraybuffer',
      });
      expect(res.status).toBe(200);
      expect(Buffer.from(res.data).subarray(0, 5).toString('latin1')).toBe(
        PDF_MAGIC,
      );
    });
  });

  describe('the patient portal', () => {
    it('lists the patient their own current reports', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const { report } = await issuedReport(client, patient.patientId);

      const res = await patient.client.axios.get('/api/me/lab-reports');
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe(report.id);
      expect(res.data[0].number).toBe(report.number);
      // The signature is the point of the document reaching them.
      expect(res.data[0].signatures.length).toBeGreaterThan(0);
    });

    it('serves the patient their own PDF', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const { report } = await issuedReport(client, patient.patientId);

      const res = await patient.client.axios.get(
        `/api/me/lab-reports/${report.id}/pdf`,
        { responseType: 'arraybuffer' },
      );
      expect(res.status).toBe(200);
      expect(Buffer.from(res.data).subarray(0, 5).toString('latin1')).toBe(
        PDF_MAGIC,
      );
    });

    it('does NOT serve one patient another patient’s report', async () => {
      // The original portal BOLA in one sentence: an id in the URL, and only
      // RLS between it and someone else's chart. RLS passes here — both
      // patients are in the same tenant — so ownership scoping is the only
      // thing standing in the way.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const mine = await env.makePatient(tenant);
      const theirs = await env.makePatient(tenant);
      const { report } = await issuedReport(client, theirs.patientId);

      const res = await mine.client.axios.get(
        `/api/me/lab-reports/${report.id}/pdf`,
        { responseType: 'arraybuffer' },
      );
      expect(res.status).toBe(404);
    });

    it('does not list another patient’s report either', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const mine = await env.makePatient(tenant);
      const theirs = await env.makePatient(tenant);
      await issuedReport(client, theirs.patientId);

      const res = await mine.client.axios.get('/api/me/lab-reports');
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(0);
    });

    it('withholds a report a correction has invalidated', async () => {
      // Staff keep the history; a patient reading their own results is better
      // served by the one document that is true. The replacement appears as
      // soon as it is issued.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const patient = await env.makePatient(tenant);
      const { order } = await issuedReport(client, patient.patientId, '6.8');

      let list = await patient.client.axios.get('/api/me/lab-reports');
      expect(list.data).toHaveLength(1);

      await client.axios.post(
        `/api/lab-orders/${order.id}/items/${order.items[0].id}/amend`,
        { resultValue: '4.2', reason: 'wrong tube' },
      );

      // Stale: issued, not yet replaced, and no longer true.
      list = await patient.client.axios.get('/api/me/lab-reports');
      expect(list.data).toHaveLength(0);

      const reissued = await client.axios.post(
        `/api/lis/orders/${order.id}/reports`,
        {},
      );
      expect(reissued.status).toBe(201);

      list = await patient.client.axios.get('/api/me/lab-reports');
      expect(list.data).toHaveLength(1);
      expect(list.data[0].id).toBe(reissued.data.id);
      expect(list.data[0].version).toBe(2);
    });

    it('is closed to a staff account', async () => {
      // /api/me/* derives the patient from the JWT `pid` claim, which a staff
      // token does not carry.
      const { client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.get('/api/me/lab-reports');
      expect(res.status).toBe(403);
    });
  });
});
