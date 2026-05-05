-- Row-Level Security setup for multi-tenant isolation.
-- See docs/05-data-model-prisma.md §4 for the full strategy.

-- Application role: all app traffic uses this. Subject to RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cliniq_app') THEN
    CREATE ROLE cliniq_app NOLOGIN;
  END IF;
END
$$;

-- Helper functions to read the per-request tenant/user GUC
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.current_user', true), '');
$$ LANGUAGE sql STABLE;

-- Grant the app role usage on schema + tables created by the init migration
GRANT USAGE ON SCHEMA public TO cliniq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cliniq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cliniq_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cliniq_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cliniq_app;

-- ──────────────────────────────────────────────
-- Tenant-scoped tables: enable + force RLS
-- ──────────────────────────────────────────────

-- tenant_users
ALTER TABLE "tenant_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_users_isolation ON "tenant_users"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- patients
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patients" FORCE ROW LEVEL SECURITY;
CREATE POLICY patients_isolation ON "patients"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- tenants: a session may only read its own tenant row
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_self_read ON "tenants"
  FOR SELECT TO cliniq_app
  USING ("id" = current_tenant_id());

-- users: global, but a session may only read users that share at least one tenant
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY users_visible_in_tenant ON "users"
  FOR SELECT TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "tenant_users" tu
      WHERE tu."userId" = "users"."id"
        AND tu."tenantId" = current_tenant_id()
    )
  );
