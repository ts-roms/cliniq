-- Platform-admin auth hardening (docs/audit-checklist.md, P0 follow-up:
-- "Platform-admin login has no lockout / refresh-session table (only the
-- throttle bucket). Mirror the tenant-side treatment.")
--
-- These accounts can change any tenant's plan and status, so they were the
-- weakest control on the strongest credential in the system:
--   * unlimited password guesses behind an ip-keyed throttle
--   * refresh tokens that were bare JWTs — unrevocable for their full TTL,
--     with `logout` only clearing the cookie client-side
--
-- No RLS here: platform_admins is deliberately not tenant-scoped, and neither
-- is its session table. Access is gated by the cliniq-platform JWT audience
-- (PlatformAuthGuard), not by row policies.

ALTER TABLE "platform_admins"
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil"      TIMESTAMP(3);

CREATE TABLE "platform_refresh_sessions" (
  "id"           TEXT         NOT NULL,
  "adminId"      TEXT         NOT NULL,
  "tokenHash"    TEXT         NOT NULL,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "revokedAt"    TIMESTAMP(3),
  "replacedById" TEXT,
  "userAgent"    TEXT,
  "ip"           TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_refresh_sessions_tokenHash_key"
  ON "platform_refresh_sessions"("tokenHash");
CREATE INDEX "platform_refresh_sessions_adminId_idx"
  ON "platform_refresh_sessions"("adminId");
CREATE INDEX "platform_refresh_sessions_expiresAt_idx"
  ON "platform_refresh_sessions"("expiresAt");

-- CASCADE: deleting an admin must not leave usable sessions behind.
ALTER TABLE "platform_refresh_sessions"
  ADD CONSTRAINT "platform_refresh_sessions_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
