-- Queueing pack + OB/GYN + Ultrasound. All tenant-scoped, RLS via the
-- standard `tenantId = current_tenant_id()` pattern.

-- ── Queueing ────────────────────────────────────────────────────────

CREATE TYPE "QueueKind" AS ENUM ('WALK_IN', 'APPOINTMENT', 'DRIVE_THRU', 'PRIORITY');
CREATE TYPE "QueueTicketStatus" AS ENUM ('WAITING', 'CALLED', 'SERVED', 'NO_SHOW', 'CANCELLED');

CREATE TABLE "queues" (
  "id"           TEXT        NOT NULL,
  "tenantId"     TEXT        NOT NULL,
  "locationId"   TEXT,
  "kind"         "QueueKind" NOT NULL DEFAULT 'WALK_IN',
  "name"         TEXT,
  "numberPrefix" TEXT        NOT NULL DEFAULT 'A',
  "isActive"     BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "queues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "queues_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- A tenant can have at most one queue per (location, kind). Multiple
-- locations or kinds give multiple queues.
CREATE UNIQUE INDEX "queues_tenant_location_kind_uniq"
  ON "queues" ("tenantId", "locationId", "kind");
CREATE INDEX "queues_tenant_active_idx" ON "queues" ("tenantId", "isActive");

CREATE TABLE "queue_tickets" (
  "id"             TEXT                NOT NULL,
  "queueId"        TEXT                NOT NULL,
  "tenantId"       TEXT                NOT NULL,
  "patientId"      TEXT,
  "serviceDate"    DATE                NOT NULL,
  "number"         INTEGER             NOT NULL,
  "numberLabel"    TEXT                NOT NULL,
  "status"         "QueueTicketStatus" NOT NULL DEFAULT 'WAITING',
  "label"          TEXT,
  "priority"       INTEGER             NOT NULL DEFAULT 0,
  "phone"          TEXT,
  "issuedAt"       TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "calledAt"       TIMESTAMP(3),
  "servedAt"       TIMESTAMP(3),
  "closedAt"       TIMESTAMP(3),
  "issuedByUserId" TEXT,
  "createdAt"      TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "queue_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "queue_tickets_queue_fkey"
    FOREIGN KEY ("queueId") REFERENCES "queues" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "queue_tickets_patient_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- Numbers reset per (queue, day) so the unique index reflects that.
CREATE UNIQUE INDEX "queue_tickets_queue_date_number_uniq"
  ON "queue_tickets" ("queueId", "serviceDate", "number");
CREATE INDEX "queue_tickets_tenant_date_status_idx"
  ON "queue_tickets" ("tenantId", "serviceDate", "status");
-- Lets the "next ticket" picker do an efficient ORDER BY over the open
-- portion of the queue (priority first, then number ascending).
CREATE INDEX "queue_tickets_pickup_idx"
  ON "queue_tickets" ("queueId", "status", "priority", "number");

ALTER TABLE "queues"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "queues"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "queue_tickets"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "queue_tickets"  FORCE  ROW LEVEL SECURITY;

CREATE POLICY queues_isolation ON "queues"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY queue_tickets_isolation ON "queue_tickets"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Platform admin bypass for all four (matches the pattern from
-- 20260506110000_platform_rls_bypass for cross-tenant tooling).
CREATE POLICY queues_platform_all ON "queues"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY queue_tickets_platform_all ON "queue_tickets"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ── OB/GYN + Ultrasound ─────────────────────────────────────────────

CREATE TYPE "ObPregnancyStatus" AS ENUM (
  'ACTIVE', 'DELIVERED', 'MISCARRIED', 'TERMINATED', 'ECTOPIC'
);
CREATE TYPE "UltrasoundKind" AS ENUM (
  'OB_2D', 'OB_3D_4D', 'GENERAL_ABDOMINAL', 'GENERAL_PELVIC', 'GENERAL_OTHER'
);

CREATE TABLE "ob_pregnancies" (
  "id"             TEXT                NOT NULL,
  "tenantId"       TEXT                NOT NULL,
  "patientId"      TEXT                NOT NULL,
  "status"         "ObPregnancyStatus" NOT NULL DEFAULT 'ACTIVE',
  "lmp"            DATE,
  "edd"            DATE,
  "eddSource"      TEXT,
  "gravida"        INTEGER,
  "para"           INTEGER,
  "termCount"      INTEGER,
  "pretermCount"   INTEGER,
  "abortionCount"  INTEGER,
  "livingCount"    INTEGER,
  "bloodType"      TEXT,
  "rhFactor"       TEXT,
  "notes"          TEXT,
  "outcomeAt"      TIMESTAMP(3),
  "outcomeNotes"   TEXT,
  "createdAt"      TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)        NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "ob_pregnancies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ob_pregnancies_patient_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ob_pregnancies_tenant_patient_status_idx"
  ON "ob_pregnancies" ("tenantId", "patientId", "status");

CREATE TABLE "ob_visits" (
  "id"             TEXT          NOT NULL,
  "tenantId"       TEXT          NOT NULL,
  "pregnancyId"    TEXT          NOT NULL,
  "consultationId" TEXT,
  "visitDate"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "gaWeeks"        INTEGER,
  "gaDays"         INTEGER,
  "fundalHeightCm" DECIMAL(4,1),
  "fetalHeartRate" INTEGER,
  "presentation"   TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "ob_visits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ob_visits_pregnancy_fkey"
    FOREIGN KEY ("pregnancyId") REFERENCES "ob_pregnancies" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ob_visits_tenant_pregnancy_date_idx"
  ON "ob_visits" ("tenantId", "pregnancyId", "visitDate");

CREATE TABLE "ultrasound_reports" (
  "id"                    TEXT             NOT NULL,
  "tenantId"              TEXT             NOT NULL,
  "patientId"             TEXT             NOT NULL,
  "pregnancyId"           TEXT,
  "consultationId"        TEXT,
  "performedAt"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "performedByUserId"     TEXT,
  "kind"                  "UltrasoundKind" NOT NULL DEFAULT 'GENERAL_OTHER',
  "indication"            TEXT,
  "bpdMm"                 DECIMAL(5,1),
  "hcMm"                  DECIMAL(5,1),
  "acMm"                  DECIMAL(5,1),
  "flMm"                  DECIMAL(5,1),
  "estimatedFetalWeightG" INTEGER,
  "amnioticFluidIndexCm"  DECIMAL(4,1),
  "fetalHeartRate"        INTEGER,
  "presentation"          TEXT,
  "placentaLocation"      TEXT,
  "fetalSex"              TEXT,
  "findings"              TEXT,
  "impression"            TEXT,
  "createdAt"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3)     NOT NULL,
  "deletedAt"             TIMESTAMP(3),
  CONSTRAINT "ultrasound_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ultrasound_reports_patient_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ultrasound_reports_pregnancy_fkey"
    FOREIGN KEY ("pregnancyId") REFERENCES "ob_pregnancies" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ultrasound_reports_tenant_patient_idx"
  ON "ultrasound_reports" ("tenantId", "patientId", "performedAt");
CREATE INDEX "ultrasound_reports_tenant_pregnancy_idx"
  ON "ultrasound_reports" ("tenantId", "pregnancyId");

CREATE TABLE "ultrasound_files" (
  "id"               TEXT         NOT NULL,
  "reportId"         TEXT         NOT NULL,
  "s3Key"            TEXT         NOT NULL,
  "filename"         TEXT         NOT NULL,
  "mimeType"         TEXT         NOT NULL,
  "sizeBytes"        INTEGER      NOT NULL,
  "caption"          TEXT,
  "sortOrder"        INTEGER      NOT NULL DEFAULT 0,
  "uploadedByUserId" TEXT         NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "ultrasound_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ultrasound_files_report_fkey"
    FOREIGN KEY ("reportId") REFERENCES "ultrasound_reports" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ultrasound_files_report_idx" ON "ultrasound_files" ("reportId");

ALTER TABLE "ob_pregnancies"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ob_pregnancies"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "ob_visits"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ob_visits"          FORCE  ROW LEVEL SECURITY;
ALTER TABLE "ultrasound_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ultrasound_reports" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "ultrasound_files"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ultrasound_files"   FORCE  ROW LEVEL SECURITY;

CREATE POLICY ob_pregnancies_isolation ON "ob_pregnancies"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY ob_visits_isolation ON "ob_visits"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY ultrasound_reports_isolation ON "ultrasound_reports"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Files inherit visibility from their report.
CREATE POLICY ultrasound_files_via_report ON "ultrasound_files"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "ultrasound_reports" r
       WHERE r."id" = "ultrasound_files"."reportId"
         AND r."tenantId" = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ultrasound_reports" r
       WHERE r."id" = "ultrasound_files"."reportId"
         AND r."tenantId" = current_tenant_id()
    )
  );

-- Platform-admin bypass.
CREATE POLICY ob_pregnancies_platform_all ON "ob_pregnancies"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY ob_visits_platform_all ON "ob_visits"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY ultrasound_reports_platform_all ON "ultrasound_reports"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY ultrasound_files_platform_all ON "ultrasound_files"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- Grant cliniq_app DML on the new tables (the standard ALTER DEFAULT
-- PRIVILEGES from the original RLS migration may not cover newly-owned
-- tables on managed Postgres; explicit grants are safe to repeat).
GRANT SELECT, INSERT, UPDATE, DELETE
  ON "queues", "queue_tickets",
     "ob_pregnancies", "ob_visits",
     "ultrasound_reports", "ultrasound_files"
  TO cliniq_app;
