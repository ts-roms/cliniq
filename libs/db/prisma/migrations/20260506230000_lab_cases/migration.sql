-- Phase 1.4 — Lab cases (dental lab manufacturing orders) + file attachments.
-- Distinct from the clinical `lab_orders` table (blood-work test orders).
-- Both sides (lab and clinic) read/write their own row via RLS. File rows
-- inherit visibility from the parent case.

CREATE TYPE "LabCaseUrgency" AS ENUM ('STANDARD', 'URGENT');

CREATE TYPE "LabCaseStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'IN_PROGRESS',
  'AWAITING_PICKUP',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REJECTED'
);

CREATE TYPE "LabCaseFileStatus" AS ENUM ('PENDING', 'READY');

CREATE TABLE "lab_cases" (
  "id"               TEXT             NOT NULL,
  "refNumber"        INTEGER,
  "labTenantId"      TEXT             NOT NULL,
  "clinicTenantId"   TEXT             NOT NULL,
  "productId"        TEXT             NOT NULL,
  "unitPrice"        INTEGER,
  "currency"         TEXT             NOT NULL DEFAULT 'PHP',
  "status"           "LabCaseStatus"  NOT NULL DEFAULT 'DRAFT',
  "urgency"          "LabCaseUrgency" NOT NULL DEFAULT 'STANDARD',
  "dueAt"            TIMESTAMP(3),
  "formData"         JSONB,
  "patientLabel"     TEXT,
  "doctorLabel"      TEXT,
  "deliveryCenter"   TEXT,
  "notes"            TEXT,
  "createdByUserId"  TEXT             NOT NULL,
  "acceptedByUserId" TEXT,
  "submittedAt"      TIMESTAMP(3),
  "acceptedAt"       TIMESTAMP(3),
  "completedAt"      TIMESTAMP(3),
  "shippedAt"        TIMESTAMP(3),
  "deliveredAt"      TIMESTAMP(3),
  "cancelledAt"      TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)     NOT NULL,
  "deletedAt"        TIMESTAMP(3),

  CONSTRAINT "lab_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_cases_lab_fkey"
    FOREIGN KEY ("labTenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_cases_clinic_fkey"
    FOREIGN KEY ("clinicTenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_cases_product_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "lab_products" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lab_cases_lab_ref_key"
  ON "lab_cases" ("labTenantId", "refNumber");
CREATE INDEX "lab_cases_lab_status_idx"
  ON "lab_cases" ("labTenantId", "status");
CREATE INDEX "lab_cases_clinic_status_idx"
  ON "lab_cases" ("clinicTenantId", "status");
CREATE INDEX "lab_cases_lab_created_idx"
  ON "lab_cases" ("labTenantId", "createdAt");

CREATE TABLE "lab_case_files" (
  "id"                 TEXT                NOT NULL,
  "caseId"             TEXT                NOT NULL,
  "s3Key"              TEXT                NOT NULL,
  "filename"           TEXT                NOT NULL,
  "mimeType"           TEXT                NOT NULL,
  "sizeBytes"          INTEGER             NOT NULL,
  "uploadedByUserId"   TEXT                NOT NULL,
  "uploadedByTenantId" TEXT                NOT NULL,
  "status"             "LabCaseFileStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"          TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt"        TIMESTAMP(3),
  "deletedAt"          TIMESTAMP(3),

  CONSTRAINT "lab_case_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_case_files_case_fkey"
    FOREIGN KEY ("caseId")
    REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lab_case_files_s3key_key" ON "lab_case_files" ("s3Key");
CREATE INDEX "lab_case_files_case_idx"        ON "lab_case_files" ("caseId");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Either side (lab or clinic) can read/write their own cases. Files
-- inherit visibility via a subquery that checks the owning case.
ALTER TABLE "lab_cases"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_cases"      FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_case_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_case_files" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_cases_either_side ON "lab_cases"
  FOR ALL TO cliniq_app
  USING (
    "labTenantId"    = current_tenant_id() OR
    "clinicTenantId" = current_tenant_id()
  )
  WITH CHECK (
    "labTenantId"    = current_tenant_id() OR
    "clinicTenantId" = current_tenant_id()
  );

CREATE POLICY lab_case_files_via_case ON "lab_case_files"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_case_files"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_case_files"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  );

CREATE POLICY lab_cases_platform_all ON "lab_cases"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY lab_case_files_platform_all ON "lab_case_files"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
