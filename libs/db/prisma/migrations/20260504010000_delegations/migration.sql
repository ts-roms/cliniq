-- Delegations: doctor → assistant temporary acting authority.
-- Audit trail extension: who-on-behalf-of-whom.

CREATE TYPE "DelegationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "delegations" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "delegatorId"  TEXT NOT NULL,
    "delegateeId"  TEXT NOT NULL,
    "startsAt"     TIMESTAMP(3) NOT NULL,
    "endsAt"       TIMESTAMP(3) NOT NULL,
    "reason"       TEXT,
    "scope"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"       "DelegationStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt"    TIMESTAMP(3),
    "revokedById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delegations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delegations_tenantId_delegateeId_status_startsAt_endsAt_idx"
  ON "delegations"("tenantId", "delegateeId", "status", "startsAt", "endsAt");
CREATE INDEX "delegations_tenantId_delegatorId_status_idx"
  ON "delegations"("tenantId", "delegatorId", "status");

ALTER TABLE "delegations"
  ADD CONSTRAINT "delegations_delegatorId_fkey"
  FOREIGN KEY ("delegatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delegations"
  ADD CONSTRAINT "delegations_delegateeId_fkey"
  FOREIGN KEY ("delegateeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE "delegations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delegations" FORCE ROW LEVEL SECURITY;
CREATE POLICY delegations_isolation ON "delegations"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "delegations" TO cliniq_app;

-- ── Audit log: who-on-behalf-of-whom ────────────────────────
ALTER TABLE "audit_logs"
  ADD COLUMN IF NOT EXISTS "onBehalfOfUserId" TEXT;
CREATE INDEX IF NOT EXISTS "audit_logs_onBehalfOfUserId_idx"
  ON "audit_logs"("onBehalfOfUserId");
