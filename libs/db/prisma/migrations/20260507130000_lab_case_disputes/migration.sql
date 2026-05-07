-- Lab case disputes (LAB_DISPUTE_MANAGER feature). Either side can open;
-- the messages thread is shared. Two-sided RLS like LabInvoice.

CREATE TYPE "LabCaseDisputeStatus" AS ENUM (
  'OPEN',
  'RESOLVED',
  'REJECTED',
  'WITHDRAWN'
);

CREATE TYPE "LabCaseDisputeKind" AS ENUM (
  'QUALITY',
  'BILLING',
  'DELIVERY',
  'OTHER'
);

CREATE TABLE "lab_case_disputes" (
  "id"               TEXT                   NOT NULL,
  "caseId"           TEXT                   NOT NULL,
  "labTenantId"      TEXT                   NOT NULL,
  "clinicTenantId"   TEXT                   NOT NULL,
  "openedByUserId"   TEXT                   NOT NULL,
  "openedByTenantId" TEXT                   NOT NULL,
  "kind"             "LabCaseDisputeKind"   NOT NULL DEFAULT 'OTHER',
  "reason"           TEXT                   NOT NULL,
  "status"           "LabCaseDisputeStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedByUserId" TEXT,
  "resolvedAt"       TIMESTAMP(3),
  "resolutionNotes"  TEXT,
  "createdAt"        TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)           NOT NULL,
  "deletedAt"        TIMESTAMP(3),

  CONSTRAINT "lab_case_disputes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_case_disputes_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "lab_case_disputes_lab_status_idx"
  ON "lab_case_disputes" ("labTenantId", "status");
CREATE INDEX "lab_case_disputes_clinic_status_idx"
  ON "lab_case_disputes" ("clinicTenantId", "status");
CREATE INDEX "lab_case_disputes_case_idx" ON "lab_case_disputes" ("caseId");

CREATE TABLE "lab_case_dispute_messages" (
  "id"             TEXT         NOT NULL,
  "disputeId"      TEXT         NOT NULL,
  "senderUserId"   TEXT         NOT NULL,
  "senderTenantId" TEXT         NOT NULL,
  "body"           TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP(3),

  CONSTRAINT "lab_case_dispute_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_case_dispute_messages_dispute_fkey"
    FOREIGN KEY ("disputeId") REFERENCES "lab_case_disputes" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "lab_case_dispute_messages_dispute_idx"
  ON "lab_case_dispute_messages" ("disputeId");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Either side can read + write (messages from both sides; either can open
-- and either can resolve once the OTHER side has had a chance to respond).
ALTER TABLE "lab_case_disputes"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_case_disputes"         FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_case_dispute_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_case_dispute_messages" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_case_disputes_either_side ON "lab_case_disputes"
  FOR ALL TO cliniq_app
  USING (
    "labTenantId"    = current_tenant_id() OR
    "clinicTenantId" = current_tenant_id()
  )
  WITH CHECK (
    "labTenantId"    = current_tenant_id() OR
    "clinicTenantId" = current_tenant_id()
  );

CREATE POLICY lab_case_dispute_messages_via_dispute ON "lab_case_dispute_messages"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_case_disputes" d
      WHERE d."id" = "lab_case_dispute_messages"."disputeId"
        AND (d."labTenantId" = current_tenant_id() OR d."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    -- Sender must be on the dispute's lab or clinic side AND match the
    -- caller's tenant. Service-layer also enforces this defensively.
    "senderTenantId" = current_tenant_id() AND
    EXISTS (
      SELECT 1 FROM "lab_case_disputes" d
      WHERE d."id" = "lab_case_dispute_messages"."disputeId"
        AND (d."labTenantId" = current_tenant_id() OR d."clinicTenantId" = current_tenant_id())
    )
  );

CREATE POLICY lab_case_disputes_platform_all ON "lab_case_disputes"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_case_dispute_messages_platform_all ON "lab_case_dispute_messages"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
