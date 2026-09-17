-- Auth hardening (P0 from docs/audit-checklist.md):
--   * users.failedLoginCount / lockedUntil — brute-force lockout
--   * tenant_invites          — staff join a tenant ONLY via invite
--   * refresh_sessions        — server-side refresh state (rotate / revoke)
--   * password_reset_tokens   — forgot-password flow
--
-- RLS: invites + refresh sessions are tenant-scoped (isolation policy) but
-- the auth paths that consume them run before any tenant context exists,
-- so each table also gets the platform bypass policy — AuthService wraps
-- those reads/writes in withPlatformContext, mirroring how it already
-- treats `users` / `tenant_users`. Reset tokens are user-scoped with no
-- tenant column; platform-only access.

ALTER TABLE "users"
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil"      TIMESTAMP(3);

-- ── tenant_invites ──────────────────────────────────────────────────
CREATE TABLE "tenant_invites" (
  "id"              TEXT         NOT NULL,
  "tenantId"        TEXT         NOT NULL,
  "email"           TEXT         NOT NULL,
  "role"            "Role"       NOT NULL,
  "tokenHash"       TEXT         NOT NULL,
  "invitedByUserId" TEXT         NOT NULL,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "acceptedAt"      TIMESTAMP(3),
  "acceptedUserId"  TEXT,
  "revokedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_invites_tokenHash_key"    ON "tenant_invites"("tokenHash");
CREATE INDEX        "tenant_invites_tenantId_email_idx" ON "tenant_invites"("tenantId", "email");

ALTER TABLE "tenant_invites"
  ADD CONSTRAINT "tenant_invites_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_invites"
  ADD CONSTRAINT "tenant_invites_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_invites" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_invites_isolation ON "tenant_invites"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
CREATE POLICY tenant_invites_platform_all ON "tenant_invites"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ── refresh_sessions ────────────────────────────────────────────────
CREATE TABLE "refresh_sessions" (
  "id"           TEXT         NOT NULL,
  "userId"       TEXT         NOT NULL,
  "tenantId"     TEXT         NOT NULL,
  "tokenHash"    TEXT         NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "revokedAt"    TIMESTAMP(3),
  "replacedById" TEXT,
  "userAgent"    TEXT,
  "ip"           TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_sessions_tokenHash_key"      ON "refresh_sessions"("tokenHash");
CREATE INDEX        "refresh_sessions_userId_tenantId_idx" ON "refresh_sessions"("userId", "tenantId");
CREATE INDEX        "refresh_sessions_expiresAt_idx"       ON "refresh_sessions"("expiresAt");

ALTER TABLE "refresh_sessions"
  ADD CONSTRAINT "refresh_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_sessions"
  ADD CONSTRAINT "refresh_sessions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refresh_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_sessions_isolation ON "refresh_sessions"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
CREATE POLICY refresh_sessions_platform_all ON "refresh_sessions"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ── password_reset_tokens ───────────────────────────────────────────
CREATE TABLE "password_reset_tokens" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "tokenHash" TEXT         NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX        "password_reset_tokens_userId_idx"    ON "password_reset_tokens"("userId");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY password_reset_tokens_platform_all ON "password_reset_tokens"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
