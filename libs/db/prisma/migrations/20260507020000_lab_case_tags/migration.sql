-- Phase 2.4 — Tags. Lab-owned tag definitions + M:N assignment to cases.

CREATE TABLE "lab_case_tags" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "color"     TEXT         NOT NULL DEFAULT '64748b',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "lab_case_tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_case_tags_tenant_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lab_case_tags_tenant_name_uniq"
  ON "lab_case_tags" ("tenantId", "name");
CREATE INDEX "lab_case_tags_tenant_idx" ON "lab_case_tags" ("tenantId");

CREATE TABLE "lab_case_tag_assignments" (
  "caseId"         TEXT         NOT NULL,
  "tagId"          TEXT         NOT NULL,
  "taggedByUserId" TEXT         NOT NULL,
  "taggedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lab_case_tag_assignments_pkey" PRIMARY KEY ("caseId", "tagId"),
  CONSTRAINT "lab_case_tag_assignments_case_fkey"
    FOREIGN KEY ("caseId")
    REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_case_tag_assignments_tag_fkey"
    FOREIGN KEY ("tagId")
    REFERENCES "lab_case_tags" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lab_case_tag_assignments_tag_idx"
  ON "lab_case_tag_assignments" ("tagId");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Tags are lab-only (the clinic doesn't see them at all). Assignments
-- inherit visibility through the tag.
ALTER TABLE "lab_case_tags"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_case_tags"            FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_case_tag_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_case_tag_assignments" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_case_tags_owner ON "lab_case_tags"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY lab_case_tag_assignments_via_tag ON "lab_case_tag_assignments"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_case_tags" t
      WHERE t."id" = "lab_case_tag_assignments"."tagId"
        AND t."tenantId" = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_case_tags" t
      WHERE t."id" = "lab_case_tag_assignments"."tagId"
        AND t."tenantId" = current_tenant_id()
    )
  );

CREATE POLICY lab_case_tags_platform_all ON "lab_case_tags"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY lab_case_tag_assignments_platform_all ON "lab_case_tag_assignments"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
