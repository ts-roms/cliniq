/**
 * push_tokens tenant isolation.
 *
 * This was the one tenant-scoped table without row-level security. Every
 * other table carrying a tenantId got ENABLE + FORCE RLS and an isolation
 * policy in the migration that created it; `push_tokens` got none, and
 * PushService queried it on the bare client rather than through withTenant:
 *
 *     sendToUser(userId) -> SELECT ... WHERE "userId" = $1
 *
 * which returned every device that user had registered, in ANY tenant. A
 * clinician working at two clinics on one phone would get clinic A's payload
 * — patient name in the title, on a lock screen — while acting for clinic B.
 *
 * Two things are asserted here, because the fix has two halves:
 *   1. the database enforces isolation (RLS on, forced, policy present)
 *   2. the deliberately cross-tenant device bookkeeping still works, which
 *      is the part RLS could plausibly have broken
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

describe('@org/api-e2e push_tokens RLS', () => {
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

  async function register(
    client: E2EClient,
    body: { deviceId: string; token: string; platform?: string },
  ) {
    return client.axios.post('/api/notifications/push-tokens', {
      platform: 'ios',
      ...body,
    });
  }

  describe('the database enforces it', () => {
    it('has RLS enabled AND forced', async () => {
      const { rows } = await pg.query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity
           FROM pg_class WHERE relname = 'push_tokens'`,
      );
      expect(rows).toHaveLength(1);
      // FORCE matters as much as ENABLE: without it the table owner — which
      // is what migrations and any superuser connection run as — silently
      // bypasses every policy.
      expect(rows[0].relrowsecurity).toBe(true);
      expect(rows[0].relforcerowsecurity).toBe(true);
    });

    it('carries an isolation policy keyed on current_tenant_id()', async () => {
      const { rows } = await pg.query<{ polname: string; qual: string }>(
        `SELECT polname, pg_get_expr(polqual, polrelid) AS qual
           FROM pg_policy
          WHERE polrelid = 'push_tokens'::regclass
          ORDER BY polname`,
      );
      const names = rows.map((r) => r.polname);
      expect(names).toContain('push_tokens_isolation');
      const isolation = rows.find(
        (r) => r.polname === 'push_tokens_isolation',
      )!;
      expect(isolation.qual).toContain('current_tenant_id()');
    });

    it('no tenant-scoped table is left without RLS', async () => {
      // The generalisation of this bug: push_tokens was missed because
      // nothing checked. Every table with a tenantId column should be
      // isolated, so assert the whole set rather than just this one table.
      const { rows } = await pg.query<{ table_name: string }>(
        `SELECT c.relname AS table_name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN information_schema.columns col
             ON col.table_name = c.relname
            AND col.table_schema = n.nspname
          WHERE n.nspname = 'public'
            AND c.relkind = 'r'
            AND col.column_name = 'tenantId'
            AND c.relrowsecurity = false`,
      );
      expect(rows.map((r) => r.table_name)).toEqual([]);
    });
  });

  describe('cross-tenant device bookkeeping still works', () => {
    let a: { tenant: E2ETenant; client: E2EClient };
    let b: { tenant: E2ETenant; client: E2EClient };

    beforeAll(async () => {
      a = await env.makeTenant({ plan: 'PREMIUM' });
      b = await env.makeTenant({ plan: 'PREMIUM' });
    });

    it('moves a device when the same token re-registers in another tenant', async () => {
      // The scenario RLS could have broken: `token` is globally unique, so
      // the insert for tenant B collides with tenant A's row — a row B
      // cannot see, so Prisma's upsert cannot turn it into an update. If the
      // stale-row cleanup were tenant-scoped this would be a 500 on the
      // unique constraint.
      const token = `ExponentPushToken[rls-${Date.now()}]`;
      const deviceId = `device-${Math.random().toString(36).slice(2, 10)}`;

      const inA = await register(a.client, { deviceId, token });
      expect(inA.status).toBe(200);

      const inB = await register(b.client, { deviceId, token });
      expect(inB.status).toBe(200);

      const { rows } = await pg.query<{ tenantId: string }>(
        `SELECT "tenantId" FROM "push_tokens" WHERE "token" = $1`,
        [token],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].tenantId).toBe(b.tenant.id);
    });

    it('re-registering in the same tenant updates in place', async () => {
      const deviceId = `device-${Math.random().toString(36).slice(2, 10)}`;
      const first = `ExponentPushToken[one-${Date.now()}]`;
      const second = `ExponentPushToken[two-${Date.now()}]`;

      expect(
        (await register(a.client, { deviceId, token: first })).status,
      ).toBe(200);
      expect(
        (await register(a.client, { deviceId, token: second })).status,
      ).toBe(200);

      const { rows } = await pg.query<{ token: string }>(
        `SELECT "token" FROM "push_tokens"
          WHERE "tenantId" = $1 AND "deviceId" = $2`,
        [a.tenant.id, deviceId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].token).toBe(second);
    });

    it('unregister does not reach into another tenant', async () => {
      const deviceId = `shared-${Math.random().toString(36).slice(2, 10)}`;
      const tokenA = `ExponentPushToken[a-${Date.now()}]`;
      const tokenB = `ExponentPushToken[b-${Date.now()}]`;

      await register(a.client, { deviceId: `${deviceId}-a`, token: tokenA });
      await register(b.client, { deviceId: `${deviceId}-b`, token: tokenB });

      const gone = await a.client.axios.post(
        '/api/notifications/push-tokens/unregister',
        { deviceId: `${deviceId}-a` },
      );
      expect(gone.status).toBe(200);

      const { rows: left } = await pg.query(
        `SELECT 1 FROM "push_tokens" WHERE "token" = $1`,
        [tokenA],
      );
      expect(left).toHaveLength(0);

      const { rows: kept } = await pg.query(
        `SELECT 1 FROM "push_tokens" WHERE "token" = $1`,
        [tokenB],
      );
      expect(kept).toHaveLength(1);
    });
  });
});
