-- Phase 2.2 / 2.3 — Internal notes (lab-only) and per-case chat (both sides).

-- ── Notes (lab-only) ─────────────────────────────────────────
CREATE TABLE "lab_case_notes" (
  "id"           TEXT         NOT NULL,
  "caseId"       TEXT         NOT NULL,
  "authorUserId" TEXT         NOT NULL,
  "body"         TEXT         NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "deletedAt"    TIMESTAMP(3),

  CONSTRAINT "lab_case_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_case_notes_case_fkey"
    FOREIGN KEY ("caseId")
    REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lab_case_notes_case_created_idx"
  ON "lab_case_notes" ("caseId", "createdAt");

ALTER TABLE "lab_case_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_case_notes" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_case_notes_lab_only ON "lab_case_notes"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_case_notes"."caseId"
        AND c."labTenantId" = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_case_notes"."caseId"
        AND c."labTenantId" = current_tenant_id()
    )
  );

CREATE POLICY lab_case_notes_platform_all ON "lab_case_notes"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ── Messages (per-case chat, both sides) ─────────────────────
CREATE TABLE "lab_case_messages" (
  "id"             TEXT         NOT NULL,
  "caseId"         TEXT         NOT NULL,
  "senderUserId"   TEXT         NOT NULL,
  "senderTenantId" TEXT         NOT NULL,
  "body"           TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP(3),

  CONSTRAINT "lab_case_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_case_messages_case_fkey"
    FOREIGN KEY ("caseId")
    REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lab_case_messages_case_created_idx"
  ON "lab_case_messages" ("caseId", "createdAt");

ALTER TABLE "lab_case_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_case_messages" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_case_messages_via_case ON "lab_case_messages"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_case_messages"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_case_messages"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
    -- Also enforce sender attribution: senderTenantId must match the caller's
    -- active tenant. Without this, a clinic user could forge a message tagged
    -- as "from the lab" by setting senderTenantId at insert time.
    AND "senderTenantId" = current_tenant_id()
  );

CREATE POLICY lab_case_messages_platform_all ON "lab_case_messages"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
