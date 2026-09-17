-- Tele module platform-context bypass.
--
-- Patient join flows hit the api WITHOUT a JWT — the patient's URL contains
-- a 24-byte joinToken that authenticates the (tenant, session) pair. To
-- look up the session by joinToken alone (we don't yet know the tenantId)
-- we need to bypass the tenant-scoped RLS for that one read, then re-enter
-- the right tenant context for follow-up operations.
--
-- These policies mirror the pattern in 20260506110000_platform_rls_bypass:
-- gated by `is_platform_admin()`, which is set via
-- `PrismaService.withPlatformContext`. The tele service calls that helper
-- ONLY around the initial joinToken lookup and the patient-token signal
-- writes; once the tenantId is known it switches back to `withTenant`.
CREATE POLICY tele_sessions_platform_all ON "tele_sessions"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY tele_signals_platform_all ON "tele_signals"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
