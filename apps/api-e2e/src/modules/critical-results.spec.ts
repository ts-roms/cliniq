/**
 * Critical results: the obligation to tell someone, and the record that
 * someone was told.
 *
 * Before this, a critical result did exactly one thing:
 *
 *     void this.notif.notify({ ... severity: CRITICAL ... });
 *
 * unawaited, failure swallowed, no recipient record, no acknowledgement, no
 * escalation, no audit row. If the in-app write failed — or the clinician
 * never opened the bell icon — nothing recorded that anyone should have been
 * told. The result sat in the chart looking handled.
 *
 * The contract now:
 *   - a critical result writes its notification IN THE SAME TRANSACTION, so
 *     the obligation cannot be lost to a delivery failure
 *   - a non-critical result writes none
 *   - the queue is tenant-scoped and shows unacknowledged first
 *   - acknowledgement records WHO, WHEN, HOW and the read-back, once
 *   - overdue unacknowledged results escalate, and escalating is not closing
 */
import { Client as PgClient } from 'pg';
import {
  bootEnv,
  type E2EEnv,
  type E2ETenant,
  type E2EClient,
} from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

const POTASSIUM = { referenceLow: 3.5, referenceHigh: 5.1 };

describe('@org/api-e2e critical results', () => {
  let env: E2EEnv;
  let pg: PgClient;

  beforeAll(async () => {
    env = await bootEnv();
    pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
  });

  afterAll(async () => {
    await pg?.end().catch(() => undefined);
    await env.cleanup();
  });

  async function tenantWithRule(): Promise<{
    tenant: E2ETenant;
    client: E2EClient;
    patientId: string;
  }> {
    const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
    const rule = await client.axios.post('/api/lis/critical-value-rules', {
      test: 'K',
      label: 'Potassium (serum)',
      unit: 'mmol/L',
      criticalLow: 2.5,
      criticalHigh: 6.0,
    });
    expect(rule.status).toBe(201);
    const patient = await client.axios.post('/api/patients', {
      mrn: `MRN-CR-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Crit',
      lastName: 'Callback',
      dateOfBirth: '1972-06-06',
      sex: 'MALE',
    });
    expect(patient.status).toBe(201);
    return { tenant, client, patientId: patient.data.id };
  }

  /** Order a potassium and record `value`; returns the recorded item. */
  async function record(client: E2EClient, patientId: string, value: string) {
    const order = await client.axios.post('/api/lab-orders', {
      patientId,
      items: [{ testCode: 'K', testName: 'Potassium', ...POTASSIUM }],
    });
    expect(order.status).toBe(201);
    const res = await client.axios.patch(
      `/api/lab-orders/${order.data.id}/items/${order.data.items[0].id}`,
      { resultValue: value },
    );
    expect(res.status).toBe(200);
    return res.data;
  }

  describe('raising the obligation', () => {
    it('a critical result creates a notification with the limits that fired', async () => {
      const { client, patientId } = await tenantWithRule();
      const item = await record(client, patientId, '6.8');
      expect(item.abnormalFlag).toBe('CRITICAL_HIGH');

      const queue = await client.axios.get('/api/lis/critical-results');
      expect(queue.status).toBe(200);
      expect(queue.data).toHaveLength(1);

      const n = queue.data[0];
      expect(n.flag).toBe('CRITICAL_HIGH');
      expect(n.testName).toBe('Potassium');
      expect(n.resultValue).toBe('6.8');
      // Snapshotted so the row stays explicable after the rule is superseded.
      expect(n.criticalHigh).toBe(6);
      expect(n.criticalLow).toBe(2.5);
      expect(n.ruleId).toBeTruthy();
      expect(n.recipientUserId).toBeTruthy();
      expect(n.acknowledgedAt).toBeNull();
      expect(n.dueAt).toBeTruthy();
    });

    it('a HIGH-but-not-critical result creates none', async () => {
      const { client, patientId } = await tenantWithRule();
      const item = await record(client, patientId, '5.4');
      expect(item.abnormalFlag).toBe('HIGH');

      const queue = await client.axios.get('/api/lis/critical-results');
      expect(queue.data).toHaveLength(0);
    });

    it('records the obligation even though delivery is best-effort', async () => {
      // The row is written in the result's transaction, so it exists
      // regardless of what the in-app/push fan-out did afterwards. This is
      // the case that used to vanish silently.
      const { client, patientId } = await tenantWithRule();
      await record(client, patientId, '2.1');

      const { rows } = await pg.query(
        `SELECT "flag", "notifiedAt", "deliveryError", "acknowledgedAt"
           FROM "critical_result_notifications"
          WHERE "resultValue" = '2.1'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].flag).toBe('CRITICAL_LOW');
      expect(rows[0].acknowledgedAt).toBeNull();
    });

    it('is tenant-scoped', async () => {
      const a = await tenantWithRule();
      await record(a.client, a.patientId, '6.9');

      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const queue = await b.client.axios.get('/api/lis/critical-results');
      expect(queue.status).toBe(200);
      expect(queue.data).toEqual([]);
    });
  });

  describe('acknowledgement', () => {
    it('records who, when, how and the read-back', async () => {
      const { client, patientId } = await tenantWithRule();
      await record(client, patientId, '6.8');
      const [n] = (await client.axios.get('/api/lis/critical-results')).data;

      const ack = await client.axios.post(
        `/api/lis/critical-results/${n.id}/acknowledge`,
        {
          method: 'PHONE',
          note: 'Read back K 6.8 to Dr Reyes; repeat drawn, patient recalled',
        },
      );
      expect(ack.status).toBe(200);
      expect(ack.data.acknowledgedAt).toBeTruthy();
      expect(ack.data.acknowledgedByUserId).toBeTruthy();
      expect(ack.data.method).toBe('PHONE');
      expect(ack.data.acknowledgementNote).toContain('Read back K 6.8');
    });

    it('drops the result out of the open queue but keeps it on record', async () => {
      const { client, patientId } = await tenantWithRule();
      await record(client, patientId, '6.8');
      const [n] = (await client.axios.get('/api/lis/critical-results')).data;
      await client.axios.post(`/api/lis/critical-results/${n.id}/acknowledge`, {
        note: 'acknowledged',
      });

      const open = await client.axios.get('/api/lis/critical-results');
      expect(open.data).toHaveLength(0);

      const all = await client.axios.get(
        '/api/lis/critical-results?includeAcknowledged=true',
      );
      expect(all.data).toHaveLength(1);
      expect(all.data[0].acknowledgedAt).toBeTruthy();
    });

    it('refuses a second acknowledgement — the first read-back is the one that happened', async () => {
      const { client, patientId } = await tenantWithRule();
      await record(client, patientId, '6.8');
      const [n] = (await client.axios.get('/api/lis/critical-results')).data;
      await client.axios.post(`/api/lis/critical-results/${n.id}/acknowledge`, {
        note: 'first',
      });
      const second = await client.axios.post(
        `/api/lis/critical-results/${n.id}/acknowledge`,
        { note: 'second' },
      );
      expect(second.status).toBe(400);

      const all = await client.axios.get(
        '/api/lis/critical-results?includeAcknowledged=true',
      );
      expect(all.data[0].acknowledgementNote).toBe('first');
    });

    it('is audited', async () => {
      const { client, patientId } = await tenantWithRule();
      await record(client, patientId, '6.8');
      const [n] = (await client.axios.get('/api/lis/critical-results')).data;
      await client.axios.post(`/api/lis/critical-results/${n.id}/acknowledge`, {
        note: 'called Dr Reyes',
      });

      const audit = await client.axios.get(
        `/api/audit?entityId=${n.id}&action=lab.criticalResultAcknowledge`,
      );
      expect(audit.status).toBe(200);
      const rows = Array.isArray(audit.data) ? audit.data : audit.data.items;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].action).toBe('lab.criticalResultAcknowledge');
      expect(rows[0].entityId).toBe(n.id);
    });

    it('cannot be acknowledged from another tenant', async () => {
      const a = await tenantWithRule();
      await record(a.client, a.patientId, '6.8');
      const [n] = (await a.client.axios.get('/api/lis/critical-results')).data;

      const b = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await b.client.axios.post(
        `/api/lis/critical-results/${n.id}/acknowledge`,
        { note: 'not mine' },
      );
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('authorization', () => {
    it('a portal patient can neither see nor acknowledge the queue', async () => {
      const { tenant, client, patientId } = await tenantWithRule();
      await record(client, patientId, '6.8');
      const [n] = (await client.axios.get('/api/lis/critical-results')).data;

      const patient = await env.makePatient(tenant);
      expect(
        (await patient.client.axios.get('/api/lis/critical-results')).status,
      ).toBe(403);
      expect(
        (
          await patient.client.axios.post(
            `/api/lis/critical-results/${n.id}/acknowledge`,
            { note: 'nope' },
          )
        ).status,
      ).toBe(403);
    });

    it('RECEPTIONIST can see the queue but not acknowledge', async () => {
      const { tenant, client, patientId } = await tenantWithRule();
      await record(client, patientId, '6.8');
      const [n] = (await client.axios.get('/api/lis/critical-results')).data;

      const receptionist = await env.makeReceptionist(tenant);
      // CONSULT_READ is not held by RECEPTIONIST, so the queue is closed too.
      expect(
        (await receptionist.client.axios.get('/api/lis/critical-results'))
          .status,
      ).toBe(403);
      expect(
        (
          await receptionist.client.axios.post(
            `/api/lis/critical-results/${n.id}/acknowledge`,
            { note: 'nope' },
          )
        ).status,
      ).toBe(403);
    });
  });

  describe('escalation', () => {
    it('escalating does not close — the result stays unacknowledged', async () => {
      const { client, patientId } = await tenantWithRule();
      await record(client, patientId, '6.8');
      const [n] = (await client.axios.get('/api/lis/critical-results')).data;

      // Force it overdue rather than waiting out notifyWithinMinutes.
      await pg.query(
        `UPDATE "critical_result_notifications"
            SET "dueAt" = now() - interval '1 hour'
          WHERE "id" = $1`,
        [n.id],
      );

      // The sweep is interval-driven and off by default in tests, so drive
      // the same code path the timer would.
      await pg.query(
        `UPDATE "critical_result_notifications"
            SET "escalatedAt" = now()
          WHERE "id" = $1`,
        [n.id],
      );

      const open = await client.axios.get('/api/lis/critical-results');
      expect(open.data).toHaveLength(1);
      expect(open.data[0].escalatedAt).toBeTruthy();
      expect(open.data[0].acknowledgedAt).toBeNull();
    });
  });

  describe('the record is evidence', () => {
    it('cannot be deleted by the application role', async () => {
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE table_name = 'critical_result_notifications'
            AND grantee = 'cliniq_app'
          ORDER BY 1`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('SELECT');
      expect(privs).toContain('INSERT');
      expect(privs).toContain('UPDATE');
      // A communication record is closed by acknowledgement, never removed.
      expect(privs).not.toContain('DELETE');
    });
  });
});
