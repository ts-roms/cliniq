-- AuditLog + FileObject

-- ── audit_logs ──────────────────────────────────────────
CREATE TABLE "audit_logs" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT,
    "userId"     TEXT,
    "actorEmail" TEXT,
    "action"     TEXT NOT NULL,
    "entityType" TEXT,
    "entityId"   TEXT,
    "ip"         TEXT,
    "userAgent"  TEXT,
    "metadata"   JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_tenantId_occurredAt_idx"
  ON "audit_logs"("tenantId", "occurredAt");
CREATE INDEX "audit_logs_entityType_entityId_idx"
  ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_action_idx"
  ON "audit_logs"("action");

-- RLS — tenant-scoped read; null tenantId rows are system events visible to admins only.
-- Insert is allowed for any cliniq_app session because the actor's tenantId
-- is supplied by the app from the JWT-bound context (validated server-side).
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_read_isolation ON "audit_logs"
  FOR SELECT TO cliniq_app
  USING ("tenantId" = current_tenant_id());

CREATE POLICY audit_logs_insert_self_tenant ON "audit_logs"
  FOR INSERT TO cliniq_app
  WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_tenant_id());

GRANT SELECT, INSERT ON "audit_logs" TO cliniq_app;
-- intentionally NOT granting UPDATE or DELETE — audit log is append-only.

-- ── files ──────────────────────────────────────────────
CREATE TYPE "FileCategory" AS ENUM (
  'PATIENT_DOC',
  'CONSULT_ATTACHMENT',
  'CONSULT_AUDIO',
  'RX_PDF',
  'INVOICE_PDF',
  'RECEIPT_PDF',
  'AVATAR',
  'CLINIC_LOGO',
  'SIGNATURE',
  'OTHER'
);

CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'READY', 'DELETED');

CREATE TABLE "files" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "s3Key"      TEXT NOT NULL,
    "filename"   TEXT NOT NULL,
    "mimeType"   TEXT NOT NULL,
    "sizeBytes"  INTEGER NOT NULL DEFAULT 0,
    "category"   "FileCategory" NOT NULL,
    "isPhi"      BOOLEAN NOT NULL DEFAULT true,
    "uploadedBy" TEXT,
    "status"     "FileStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"  TIMESTAMP(3),
    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "files_s3Key_key" ON "files"("s3Key");
CREATE INDEX "files_tenantId_category_createdAt_idx"
  ON "files"("tenantId", "category", "createdAt");

ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
CREATE POLICY files_isolation ON "files"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "files" TO cliniq_app;
