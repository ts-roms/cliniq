-- Platform admin RLS bypass.
--
-- The base RLS policies (20260501000001_rls_policies) lock cliniq_app to
-- rows where tenantId = current_tenant_id(). Platform admins legitimately
-- need cross-tenant reads/writes (list every tenant, change their plan,
-- create new ones). Rather than swap to a different DB role, we add a
-- per-transaction session var `app.platform_admin = '1'` and matching
-- permissive RLS policies on tenants + users.
--
-- Set via PrismaService.withPlatformContext, which wraps every platform
-- query in a transaction with `SET LOCAL app.platform_admin = '1'`.
-- SET LOCAL means the flag dies with the transaction — a forgotten flag
-- can't leak into subsequent queries on the same connection.

CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS boolean AS $$
  SELECT COALESCE(current_setting('app.platform_admin', true), '') = '1';
$$ LANGUAGE sql STABLE;

-- tenants: full CRUD when platform mode is active.
CREATE POLICY tenants_platform_read ON "tenants"
  FOR SELECT TO cliniq_app
  USING (is_platform_admin());

CREATE POLICY tenants_platform_insert ON "tenants"
  FOR INSERT TO cliniq_app
  WITH CHECK (is_platform_admin());

CREATE POLICY tenants_platform_update ON "tenants"
  FOR UPDATE TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY tenants_platform_delete ON "tenants"
  FOR DELETE TO cliniq_app
  USING (is_platform_admin());

-- users + tenant_users: cross-tenant reads + the new-owner provisioning
-- path in PlatformTenantsService.create.
CREATE POLICY users_platform_all ON "users"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY tenant_users_platform_all ON "tenant_users"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- locations / patients counts shown in the tenant detail card go through
-- _count which Prisma compiles to subqueries on the related tables. RLS
-- on those tables is gated by current_tenant_id; in platform mode we want
-- raw counts, so allow read-when-platform too.
CREATE POLICY locations_platform_read ON "locations"
  FOR SELECT TO cliniq_app
  USING (is_platform_admin());

CREATE POLICY patients_platform_read ON "patients"
  FOR SELECT TO cliniq_app
  USING (is_platform_admin());
