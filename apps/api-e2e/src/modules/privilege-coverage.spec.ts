/**
 * Standing assertions about the privileges of the database the tests run
 * against — not the one the migrations describe.
 *
 * That distinction is the whole point. Three separate defects have now come
 * from assuming a migration's text was the state of the world:
 *
 *   1. `20260501000001_rls_policies` ran ALTER DEFAULT PRIVILEGES granting
 *      SELECT, INSERT, UPDATE, DELETE on every table created afterwards. A
 *      later, narrower `GRANT SELECT` does not subtract — only REVOKE does —
 *      so audit_logs was modifiable and deletable while being documented as
 *      append-only.
 *   2. CI's `Provision cliniq_app role` step ran the same blanket GRANT
 *      *after* `prisma migrate deploy`, silently re-granting what the
 *      migrations had revoked. CI was exercising weaker privileges than
 *      production, and nothing noticed because nothing asserted it.
 *   3. `icd_codes` — global, no tenantId, therefore no RLS — held all four
 *      privileges despite its migration granting only SELECT. Any tenant
 *      session could have deleted the ICD-10 reference data for every
 *      tenant on the instance.
 *
 * Each was found by hand, late. These tests find the next one.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Client as PgClient } from 'pg';

jest.setTimeout(120_000);

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://cliniq:cliniq@localhost:5432/cliniq_test?schema=public';

/**
 * Tables with neither a `tenantId` column nor row-level security, and so
 * fully readable by any tenant session.
 *
 * This list is a decision, not an inventory. Adding a table here means
 * someone consciously accepted that every tenant can see all of it — so the
 * test fails when a new one appears, rather than letting it arrive unnoticed
 * the way `push_tokens` did.
 */
const UNPROTECTED_BY_DESIGN = new Set([
  // Prisma's own bookkeeping. Written by migrations as the owner, never by
  // the application role at runtime.
  '_prisma_migrations',
  // Global ICD-10 reference data, shared by every tenant on purpose.
  // Read-only for the app role — see 20260924260000_icd_codes_read_only.
  'icd_codes',
  // The platform-admin identity tables live outside the tenant model
  // deliberately: they are reached through withPlatformContext, never a
  // tenant session. No current code path exposes them to one, which makes
  // this a defence-in-depth gap rather than a live hole — it is recorded in
  // the gap analysis under P0-6 and is not closed.
  'platform_admins',
  'platform_refresh_sessions',
]);

/** Walk up from here until the migrations directory turns up. */
function migrationsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'libs', 'db', 'prisma', 'migrations');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error('could not locate libs/db/prisma/migrations from __dirname');
}

interface RevokeExpectation {
  table: string;
  privileges: string[];
  migration: string;
}

/**
 * Every `REVOKE ... ON "<table>" FROM cliniq_app` the migrations contain.
 *
 * Read from the migrations rather than listed here so the next append-only
 * table is covered the moment it lands, without anyone remembering to add it.
 */
function revokesFromMigrations(): RevokeExpectation[] {
  const root = migrationsDir();
  const out: RevokeExpectation[] = [];
  const pattern =
    /^REVOKE\s+([A-Z,\s]+?)\s+ON\s+"([^"]+)"\s+FROM\s+cliniq_app\s*;/gim;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, 'migration.sql');
    if (!existsSync(file)) continue;
    const sql = readFileSync(file, 'utf8');
    for (const m of sql.matchAll(pattern)) {
      out.push({
        table: m[2],
        privileges: m[1]
          .split(',')
          .map((p) => p.trim().toUpperCase())
          .filter(Boolean),
        migration: entry.name,
      });
    }
  }
  return out;
}

describe('@org/api-e2e privilege coverage', () => {
  let pg: PgClient;

  beforeAll(async () => {
    pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
  });

  afterAll(async () => {
    await pg.end().catch(() => undefined);
  });

  describe('the application role', () => {
    it('cannot bypass row-level security', async () => {
      // PrismaService refuses to boot otherwise, but that check lives in the
      // app. This one holds even if someone removes it.
      const { rows } = await pg.query<{
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'cliniq_app'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].rolsuper).toBe(false);
      expect(rows[0].rolbypassrls).toBe(false);
    });
  });

  describe('tenant isolation', () => {
    it('has RLS enabled on every tenant-scoped table', async () => {
      const { rows } = await pg.query<{ table_name: string }>(
        `SELECT DISTINCT c.relname AS table_name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN information_schema.columns col
             ON col.table_name = c.relname AND col.table_schema = n.nspname
          WHERE n.nspname = 'public' AND c.relkind = 'r'
            AND col.column_name = 'tenantId'
            AND c.relrowsecurity = false`,
      );
      expect(rows.map((r) => r.table_name)).toEqual([]);
    });

    it('FORCES it, so the table owner is bound by it too', async () => {
      // ENABLE alone exempts the table owner. If the app role ever came to
      // own a table — a restore, a hand-run CREATE — isolation would quietly
      // stop applying with every policy still in place and looking correct.
      const { rows } = await pg.query<{ table_name: string }>(
        `SELECT DISTINCT c.relname AS table_name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN information_schema.columns col
             ON col.table_name = c.relname AND col.table_schema = n.nspname
          WHERE n.nspname = 'public' AND c.relkind = 'r'
            AND col.column_name = 'tenantId'
            AND c.relforcerowsecurity = false`,
      );
      expect(rows.map((r) => r.table_name)).toEqual([]);
    });

    it('gives every tenant-scoped table a policy that actually checks the tenant', async () => {
      // RLS on with no policy denies everything, which fails loudly. RLS on
      // with a policy that does not mention current_tenant_id() passes
      // everything, which does not.
      const { rows } = await pg.query<{ table_name: string }>(
        `SELECT t.relname AS table_name FROM (
            SELECT DISTINCT c.oid, c.relname
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              JOIN information_schema.columns col
                ON col.table_name = c.relname AND col.table_schema = n.nspname
             WHERE n.nspname = 'public' AND c.relkind = 'r'
               AND col.column_name = 'tenantId'
          ) t
          WHERE NOT EXISTS (
            SELECT 1 FROM pg_policy p
             WHERE p.polrelid = t.oid
               AND pg_get_expr(p.polqual, p.polrelid) LIKE '%current_tenant_id%'
          )`,
      );
      expect(rows.map((r) => r.table_name)).toEqual([]);
    });

    it('leaves nothing unprotected that is not on the accepted list', async () => {
      // The generalisation of the push_tokens bug. A table with neither a
      // tenantId nor RLS is readable in full by any tenant session; that can
      // be the right answer, but it has to be a decision someone made.
      const { rows } = await pg.query<{ table_name: string }>(
        `SELECT c.relname AS table_name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
            AND c.relrowsecurity = false
            AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns col
               WHERE col.table_name = c.relname
                 AND col.table_schema = 'public'
                 AND col.column_name = 'tenantId'
            )`,
      );
      const unexpected = rows
        .map((r) => r.table_name)
        .filter((t) => !UNPROTECTED_BY_DESIGN.has(t));
      expect(unexpected).toEqual([]);
    });
  });

  describe('append-only guarantees', () => {
    it('finds the REVOKEs to check', () => {
      // If the parser silently matched nothing, every assertion below would
      // pass vacuously — which is exactly the failure mode being guarded
      // against everywhere else in this file.
      const revokes = revokesFromMigrations();
      expect(revokes.length).toBeGreaterThan(0);
      expect(revokes.map((r) => r.table)).toContain('audit_logs');
    });

    it('holds every REVOKE the migrations declare', async () => {
      // CI re-granted these after migrating for weeks. Reading the
      // expectations out of the migrations means a new append-only table is
      // covered the moment it lands.
      const revokes = revokesFromMigrations();
      const { rows } = await pg.query<{
        table_name: string;
        privilege_type: string;
      }>(
        `SELECT table_name, privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_schema = 'public'`,
      );
      const held = new Map<string, Set<string>>();
      for (const r of rows) {
        if (!held.has(r.table_name)) held.set(r.table_name, new Set());
        held.get(r.table_name)!.add(r.privilege_type.toUpperCase());
      }

      const violations: string[] = [];
      for (const rev of revokes) {
        const have = held.get(rev.table) ?? new Set<string>();
        for (const priv of rev.privileges) {
          if (have.has(priv)) {
            violations.push(
              `${rev.table}.${priv} is granted but ${rev.migration} revoked it`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('keeps the audit log append-only, by name', async () => {
      // Named explicitly as well as covered generically: this one is quoted
      // as a control in the gap analysis, and a regression here is the sort
      // that gets discovered during an inspection.
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'audit_logs'`,
      );
      const privs = rows.map((r) => r.privilege_type.toUpperCase());
      expect(privs).toContain('INSERT');
      expect(privs).toContain('SELECT');
      expect(privs).not.toContain('UPDATE');
      expect(privs).not.toContain('DELETE');
    });

    it('keeps global reference data read-only', async () => {
      // icd_codes has no tenantId and no RLS, so there is nothing between a
      // tenant session and a DELETE that would wipe the reference data for
      // every tenant on the instance.
      const { rows } = await pg.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.table_privileges
          WHERE grantee = 'cliniq_app' AND table_name = 'icd_codes'`,
      );
      expect(rows.map((r) => r.privilege_type.toUpperCase())).toEqual([
        'SELECT',
      ]);
    });
  });
});
