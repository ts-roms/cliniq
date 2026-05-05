-- In-app notifications. Per-user, per-tenant feed. Email/SMS stay separate.

CREATE TYPE "NotificationKind" AS ENUM (
  'APPOINTMENT_REMINDER',
  'HMO_CLAIM_UPDATE',
  'LAB_REPORTED',
  'LAB_ABNORMAL',
  'INVENTORY_LOW',
  'DSR_FILED',
  'DSR_RESOLVED',
  'AI_BUDGET_ALERT',
  'GENERAL'
);
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE "notifications" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "kind"      "NotificationKind" NOT NULL,
    "severity"  "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title"     TEXT NOT NULL,
    "body"      TEXT,
    "link"      TEXT,
    "entityId"  TEXT,
    "readAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_tenantId_userId_readAt_createdAt_idx"
  ON "notifications"("tenantId", "userId", "readAt", "createdAt");
CREATE INDEX "notifications_tenantId_userId_kind_idx"
  ON "notifications"("tenantId", "userId", "kind");

-- ── RLS + grants ──
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_isolation ON "notifications"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO cliniq_app;
