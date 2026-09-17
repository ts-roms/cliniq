-- Phase 5 — Treatment plans (MVP, no 3D viewer integration).

CREATE TYPE "LabTreatmentPlanStatus" AS ENUM (
  'DRAFT',
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED'
);

CREATE TYPE "LabTreatmentPlanFileKind" AS ENUM (
  'STL',
  'IMAGE',
  'REPORT',
  'IPR_TABLE',
  'OTHER'
);

CREATE TYPE "LabTreatmentPlanDecision" AS ENUM (
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED'
);

CREATE TABLE "lab_treatment_plans" (
  "id"              TEXT                     NOT NULL,
  "caseId"          TEXT                     NOT NULL,
  "labTenantId"     TEXT                     NOT NULL,
  "clinicTenantId"  TEXT                     NOT NULL,
  "revision"        INTEGER,
  "title"           TEXT                     NOT NULL,
  "summary"         TEXT                     NOT NULL,
  "status"          "LabTreatmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "proposedAt"      TIMESTAMP(3),
  "decidedAt"       TIMESTAMP(3),
  "decidedByUserId" TEXT,
  "createdByUserId" TEXT                     NOT NULL,
  "createdAt"       TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)             NOT NULL,
  "deletedAt"       TIMESTAMP(3),

  CONSTRAINT "lab_treatment_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_treatment_plans_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lab_treatment_plans_case_revision_uniq"
  ON "lab_treatment_plans" ("caseId", "revision");
CREATE INDEX "lab_treatment_plans_lab_status_idx"
  ON "lab_treatment_plans" ("labTenantId", "status");
CREATE INDEX "lab_treatment_plans_clinic_status_idx"
  ON "lab_treatment_plans" ("clinicTenantId", "status");
CREATE INDEX "lab_treatment_plans_case_idx" ON "lab_treatment_plans" ("caseId");

CREATE TABLE "lab_treatment_plan_files" (
  "id"                 TEXT                       NOT NULL,
  "planId"             TEXT                       NOT NULL,
  "s3Key"              TEXT                       NOT NULL,
  "filename"           TEXT                       NOT NULL,
  "mimeType"           TEXT                       NOT NULL,
  "sizeBytes"          INTEGER                    NOT NULL,
  "kind"               "LabTreatmentPlanFileKind" NOT NULL DEFAULT 'OTHER',
  "uploadedByUserId"   TEXT                       NOT NULL,
  "uploadedByTenantId" TEXT                       NOT NULL,
  "createdAt"          TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"          TIMESTAMP(3),

  CONSTRAINT "lab_treatment_plan_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_treatment_plan_files_plan_fkey"
    FOREIGN KEY ("planId") REFERENCES "lab_treatment_plans" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "lab_treatment_plan_files_plan_idx" ON "lab_treatment_plan_files" ("planId");

CREATE TABLE "lab_treatment_plan_approvals" (
  "id"                TEXT                       NOT NULL,
  "planId"            TEXT                       NOT NULL,
  "decision"          "LabTreatmentPlanDecision" NOT NULL,
  "decidedByUserId"   TEXT                       NOT NULL,
  "decidedByTenantId" TEXT                       NOT NULL,
  "notes"             TEXT,
  "summarySnapshot"   TEXT                       NOT NULL,
  "decidedAt"         TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lab_treatment_plan_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_treatment_plan_approvals_plan_fkey"
    FOREIGN KEY ("planId") REFERENCES "lab_treatment_plans" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "lab_treatment_plan_approvals_plan_idx"
  ON "lab_treatment_plan_approvals" ("planId");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Both lab and clinic see plans on their own cases. Plan + files are
-- written by the lab; approvals are written by the clinic.
ALTER TABLE "lab_treatment_plans"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_treatment_plans"          FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_treatment_plan_files"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_treatment_plan_files"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_treatment_plan_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_treatment_plan_approvals" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_treatment_plans_either_side ON "lab_treatment_plans"
  FOR ALL TO cliniq_app
  USING (
    "labTenantId"    = current_tenant_id() OR
    "clinicTenantId" = current_tenant_id()
  )
  WITH CHECK (
    -- Lab owns plan composition. Clinic actions (approve/reject) go through
    -- LabTreatmentPlanApproval, which has its own policy.
    "labTenantId" = current_tenant_id()
  );

CREATE POLICY lab_treatment_plan_files_via_plan ON "lab_treatment_plan_files"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_treatment_plans" p
      WHERE p."id" = "lab_treatment_plan_files"."planId"
        AND (p."labTenantId" = current_tenant_id() OR p."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_treatment_plans" p
      WHERE p."id" = "lab_treatment_plan_files"."planId"
        AND p."labTenantId" = current_tenant_id()
    )
  );

CREATE POLICY lab_treatment_plan_approvals_via_plan ON "lab_treatment_plan_approvals"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_treatment_plans" p
      WHERE p."id" = "lab_treatment_plan_approvals"."planId"
        AND (p."labTenantId" = current_tenant_id() OR p."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_treatment_plans" p
      WHERE p."id" = "lab_treatment_plan_approvals"."planId"
        AND p."clinicTenantId" = current_tenant_id()
    )
  );

CREATE POLICY lab_treatment_plans_platform_all ON "lab_treatment_plans"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_treatment_plan_files_platform_all ON "lab_treatment_plan_files"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_treatment_plan_approvals_platform_all ON "lab_treatment_plan_approvals"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
