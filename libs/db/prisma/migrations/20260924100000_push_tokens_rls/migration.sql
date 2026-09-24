-- push_tokens was the one tenant-scoped table without row-level security.
--
-- Every other table carrying a tenantId got ENABLE + FORCE ROW LEVEL SECURITY
-- and an isolation policy in the migration that created it. `push_tokens`
-- (20260506000000_push_tokens) got none, and inherited SELECT/INSERT/UPDATE/
-- DELETE from the schema-wide ALTER DEFAULT PRIVILEGES. PushService then
-- queried it on the bare client rather than through withTenant, so:
--
--     sendToUser(userId)  ->  SELECT ... FROM push_tokens WHERE "userId" = $1
--
-- returned every device that user had registered, in ANY tenant. A clinician
-- who works at two clinics on one phone would receive clinic A's notification
-- payload — patient name in the title, on the lock screen — while acting for
-- clinic B. Low blast radius, but it is PHI crossing a tenant boundary, and
-- it was the last hole in an otherwise uniform isolation model.
--
-- The service is being routed through withTenant in the same change; this
-- makes the database enforce it rather than trusting that.

ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_tokens" FORCE ROW LEVEL SECURITY;

CREATE POLICY push_tokens_isolation ON "push_tokens"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Two operations on this table are legitimately cross-tenant, and both are
-- device bookkeeping rather than reads of anyone's data:
--
--   1. Registration. `token` is globally unique and Expo re-issues the same
--      token across reinstalls, so a device that moves between users — or
--      between tenants, for a clinician working at two clinics — must have
--      its stale row removed before the new one is written, or the insert
--      dies on the unique constraint. The row being removed belongs to the
--      OTHER tenant by definition.
--
--   2. Reaping. When Expo answers a send with DeviceNotRegistered, that
--      token is dead everywhere, and the batch it came from may span
--      tenants.
--
-- Both now run under withPlatformContext, which trips this policy. That is
-- deliberately noisier than the previous no-RLS state: the cross-tenant
-- intent has to be declared at the call site instead of being the default.
CREATE POLICY push_tokens_platform_all ON "push_tokens"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
