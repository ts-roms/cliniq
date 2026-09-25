/**
 * What the audit log says changed.
 *
 * The trail was already append-only and complete about the act — who, when,
 * from where, which entity id. It recorded nothing about the content of the
 * change. "patient.update on p_123" does not answer the question an audit
 * trail exists to answer, which is whether a particular value was altered and
 * by whom; reconstructing that meant diffing database backups.
 *
 * The diff and redaction rules are unit-tested exhaustively in
 * apps/api/src/audit/changes.spec.ts. This covers what only a running API
 * shows: that the changes reach the row through the request-scoped collector,
 * that a failed request records none, and that the table still cannot be
 * edited afterwards.
 */
import { Client as PgClient } from 'pg';
import { bootEnv, type E2EEnv, type E2EClient } from '../support/harness.js';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

interface Change {
  field: string;
  before: unknown;
  after: unknown;
}

describe('audit change detail', () => {
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

  /**
   * The newest audit row for an action in one tenant.
   *
   * Scoped to the tenant on purpose: the suite shares a database, so an
   * action-only query would happily return another test's row and pass for
   * the wrong reason.
   */
  async function latest(tenantId: string, action: string, entityId?: string) {
    // The interceptor writes the row fire-and-forget, so that an audit
    // failure can never break the request it describes — which means the
    // response can arrive before the row exists. Poll rather than assume.
    for (let attempt = 0; attempt < 40; attempt++) {
      const { rows } = await pg.query<{
        action: string;
        entityId: string | null;
        changes: Change[] | null;
        reason: string | null;
      }>(
        `SELECT action, "entityId", changes, reason FROM audit_logs
          WHERE "tenantId" = $1 AND action = $2
            ${entityId ? 'AND "entityId" = $3' : ''}
          ORDER BY "occurredAt" DESC LIMIT 1`,
        entityId ? [tenantId, action, entityId] : [tenantId, action],
      );
      if (rows[0]) return rows[0];
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(
      `no audit row for action=${action} tenant=${tenantId}${entityId ? ` entity=${entityId}` : ''}`,
    );
  }

  async function makePatient(
    client: E2EClient,
    over: Record<string, unknown> = {},
  ) {
    const res = await client.axios.post('/api/patients', {
      mrn: `MRN-AUD-${Math.random().toString(36).slice(2, 10)}`,
      firstName: 'Aud',
      lastName: 'Itable',
      dateOfBirth: '1990-04-05',
      sex: 'FEMALE',
      ...over,
    });
    expect(res.status).toBe(201);
    return res.data;
  }

  describe('a patient update', () => {
    it('records the field that changed, with its previous value', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await makePatient(client, { firstName: 'Ana' });

      const res = await client.axios.patch(`/api/patients/${p.id}`, {
        firstName: 'Anna',
      });
      expect(res.status).toBe(200);

      const row = await latest(tenant.id, 'patient.update', p.id);
      expect(row.changes).toEqual([
        { field: 'firstName', before: 'Ana', after: 'Anna' },
      ]);
    });

    it('does not report fields the request never sent', async () => {
      // A request that sends firstName alone is not an assertion that every
      // other column should read as cleared.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await makePatient(client, { firstName: 'Ana' });
      await client.axios.patch(`/api/patients/${p.id}`, { firstName: 'Anna' });

      const row = await latest(tenant.id, 'patient.update', p.id);
      expect(row.changes?.map((c) => c.field)).toEqual(['firstName']);
    });

    it('does not report an unchanged date of birth', async () => {
      // Prisma hands back a Date where the DTO carries an ISO string. Without
      // normalisation this reports dateOfBirth as changed on every update,
      // and a trail that cries wolf on every row is worse than silence.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await makePatient(client);

      await client.axios.patch(`/api/patients/${p.id}`, {
        dateOfBirth: '1990-04-05',
        firstName: 'Renamed',
      });
      const row = await latest(tenant.id, 'patient.update', p.id);
      expect(row.changes?.map((c) => c.field)).toEqual(['firstName']);
    });

    it('writes no changes at all when nothing actually differs', async () => {
      // An empty diff is stored as NULL, not [], which the CHECK constraint
      // refuses — an empty array reads the same as no diff and clutters every
      // query for rows that changed something.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await makePatient(client, { firstName: 'Ana' });

      await client.axios.patch(`/api/patients/${p.id}`, { firstName: 'Ana' });
      const row = await latest(tenant.id, 'patient.update', p.id);
      expect(row.changes).toBeNull();
    });

    it('records nothing when the request fails', async () => {
      // The transaction rolled back, so nothing changed. Attaching a diff
      // computed before the failure would assert a change that never happened.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const a = await makePatient(client, { firstName: 'Ana' });
      const b = await makePatient(client);

      // Colliding MRN — refused with 409 after the diff would have been taken.
      const res = await client.axios.patch(`/api/patients/${b.id}`, {
        firstName: 'Blocked',
        mrn: a.mrn,
      });
      expect(res.status).toBe(409);

      const failed = await latest(tenant.id, 'patient.update.failed', b.id);
      expect(failed).toBeDefined();
      expect(failed.changes).toBeNull();
    });

    it('does not leak one request’s changes into the next', async () => {
      // The collector is drained on read, so a later audited action cannot
      // inherit an earlier one's diff and report it a second time.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await makePatient(client, { firstName: 'Ana' });
      await client.axios.patch(`/api/patients/${p.id}`, { firstName: 'Anna' });

      const q = await makePatient(client, { firstName: 'Bea' });
      const created = await latest(tenant.id, 'patient.create', q.id);
      // Creating carries no before/after diff, and must not pick up the
      // rename that happened on the previous request.
      expect(created.changes).toBeNull();
    });
  });

  describe('actions that change nothing', () => {
    it('still get an audit row, with a real SQL NULL in changes', async () => {
      // Regression. Handing JS `null` to a Prisma `Json?` field writes JSON
      // `null` ('null'::jsonb), not SQL NULL, so the CHECK constraint on this
      // column rejected every audit row that had no changes — every login,
      // register and create. AuditService swallows write failures by design,
      // so the only symptom was rows quietly not being there.
      //
      // Asserted in SQL rather than in JS: both SQL NULL and JSON null come
      // back as `null` over the wire, so a JS assertion cannot tell the two
      // apart and would have passed while the bug was live.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await makePatient(client);
      await latest(tenant.id, 'patient.create', p.id);

      const { rows } = await pg.query<{
        sql_null: boolean;
        typ: string | null;
      }>(
        `SELECT changes IS NULL AS sql_null, jsonb_typeof(changes) AS typ
           FROM audit_logs
          WHERE "tenantId" = $1 AND action = 'patient.create' AND "entityId" = $2`,
        [tenant.id, p.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].sql_null).toBe(true);
      expect(rows[0].typ).toBeNull();
    });

    it('records a login, which has no tenant and no changes', async () => {
      // The widest blast radius of the same bug: auth events carry a null
      // tenant and never any changes.
      const { rows } = await pg.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_logs
          WHERE action = 'auth.login' AND changes IS NULL`,
      );
      expect(Number(rows[0].n)).toBeGreaterThan(0);
    });
  });

  describe('a role change', () => {
    it('records the previous role, which is otherwise unrecoverable', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const nurse = await env.makeNurse(tenant);

      const members = await client.axios.get('/api/members');
      expect(members.status).toBe(200);
      const member = (members.data.items ?? members.data).find(
        (m: { user: { id: string } }) => m.user.id === nurse.userId,
      );
      expect(member).toBeDefined();

      const res = await client.axios.patch(`/api/members/${member.id}/role`, {
        role: 'MEDICAL_TECHNOLOGIST',
      });
      expect(res.status).toBe(200);

      const row = await latest(tenant.id, 'member.roleChange', member.id);
      expect(row.changes).toEqual([
        { field: 'role', before: 'NURSE', after: 'MEDICAL_TECHNOLOGIST' },
      ]);
    });
  });

  describe('a settings change', () => {
    it('names the switch that moved rather than the whole blob', async () => {
      // settings is one JSON column. Diffing the column would record the
      // entire blob as a single change on every edit and say nothing about
      // which switch moved.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.patch('/api/tenants/me/settings', {
        labVerification: { required: true },
      });
      expect(res.status).toBe(200);

      const row = await latest(tenant.id, 'tenant.settingsUpdate');
      expect(row.changes?.map((c) => c.field)).toContain('labVerification');
      const c = row.changes?.find((x) => x.field === 'labVerification');
      expect(c?.after).toMatchObject({ required: true });
    });
  });

  describe('a corrected result', () => {
    it('records the previous value and why it was changed', async () => {
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const p = await makePatient(client);
      const order = await client.axios.post('/api/lab-orders', {
        patientId: p.id,
        items: [{ testName: 'Potassium', testCode: 'K', resultUnit: 'mmol/L' }],
      });
      expect(order.status).toBe(201);
      const item = order.data.items[0];

      await client.axios.patch(
        `/api/lab-orders/${order.data.id}/items/${item.id}`,
        { resultValue: '6.8' },
      );
      const res = await client.axios.post(
        `/api/lab-orders/${order.data.id}/items/${item.id}/amend`,
        { resultValue: '4.2', reason: 'Haemolysed sample; repeat drawn' },
      );
      expect(res.status).toBe(200);

      const row = await latest(tenant.id, 'lab.resultAmend', item.id);
      expect(row.changes).toEqual(
        expect.arrayContaining([
          { field: 'resultValue', before: '6.8', after: '4.2' },
        ]),
      );
      expect(row.reason).toBe('Haemolysed sample; repeat drawn');
    });
  });

  describe('what must never be written down', () => {
    it('redacts a secret a tenant put in free-form settings', async () => {
      // The real path, not a hypothetical: `extras` is free-form JSON and the
      // diff is taken one level down, so the field name is "extras" and the
      // value is the whole object. Matching only the top-level name would
      // write whatever a tenant keeps in there, verbatim, into a table that
      // holds no UPDATE and no DELETE.
      const { tenant, client } = await env.makeTenant({ plan: 'PREMIUM' });
      const res = await client.axios.patch('/api/tenants/me/settings', {
        extras: { clinicNote: 'keep', apiKey: 'sk_live_MUSTNOTPERSIST' },
      });
      expect(res.status).toBe(200);

      const row = await latest(tenant.id, 'tenant.settingsUpdate');
      const extras = row.changes?.find((c) => c.field === 'extras');
      expect(extras).toBeDefined();
      // The shape survives; only the secret is replaced.
      expect(extras?.after).toMatchObject({
        clinicNote: 'keep',
        apiKey: '[redacted]',
      });
      expect(JSON.stringify(row.changes)).not.toContain(
        'sk_live_MUSTNOTPERSIST',
      );
    });

    it('has no secret anywhere in the changes column', async () => {
      // A sweep over whatever the whole suite did, not a targeted case — the
      // targeted one is above. Scoped to values, not keys: the field NAME is
      // supposed to be recorded.
      const { rows } = await pg.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_logs
          WHERE changes IS NOT NULL
            AND changes::text ~* '"(password|mfaSecret|refreshToken|apiKey|totpSecret)[^"]*"\s*:\s*"(?!\[redacted\])'`,
      );
      expect(rows[0].n).toBe('0');
    });
  });

  describe('the record', () => {
    it('refuses an empty changes array', async () => {
      await expect(
        pg.query(
          `INSERT INTO audit_logs (id, action, changes)
           VALUES (gen_random_uuid()::text, 'test.empty', '[]'::jsonb)`,
        ),
      ).rejects.toThrow(/changes_not_empty/);
    });

    it('refuses a changes value that is not an array', async () => {
      await expect(
        pg.query(
          `INSERT INTO audit_logs (id, action, changes)
           VALUES (gen_random_uuid()::text, 'test.obj', '{"a":1}'::jsonb)`,
        ),
      ).rejects.toThrow(/changes_is_array/);
    });

    it('keeps the trail append-only', async () => {
      // Recording what changed is worth nothing if the record can be edited.
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'audit_logs'`,
      );
      const privs = rows.map((r) => r.privilege_type);
      expect(privs).toContain('INSERT');
      expect(privs).toContain('SELECT');
      expect(privs).not.toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });
  });
});
