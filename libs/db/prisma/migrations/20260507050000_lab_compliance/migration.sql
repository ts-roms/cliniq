-- Phase 3.3 / 3.4 — Conformity declarations + consent capture.

CREATE TABLE "lab_conformity_doc_templates" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "productId" TEXT,
  "name"      TEXT         NOT NULL,
  "body"      TEXT         NOT NULL,
  "isDefault" BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "lab_conformity_doc_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_conformity_doc_templates_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_conformity_doc_templates_product_fkey"
    FOREIGN KEY ("productId") REFERENCES "lab_products" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "lab_conformity_doc_templates_tenant_product_idx"
  ON "lab_conformity_doc_templates" ("tenantId", "productId");

CREATE TABLE "lab_consent_templates" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "productId" TEXT,
  "name"      TEXT         NOT NULL,
  "body"      TEXT         NOT NULL,
  "isDefault" BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "lab_consent_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_consent_templates_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_consent_templates_product_fkey"
    FOREIGN KEY ("productId") REFERENCES "lab_products" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "lab_consent_templates_tenant_product_idx"
  ON "lab_consent_templates" ("tenantId", "productId");

CREATE TABLE "lab_consent_signatures" (
  "id"               TEXT         NOT NULL,
  "caseId"           TEXT         NOT NULL,
  "templateId"       TEXT         NOT NULL,
  "signedByName"     TEXT         NOT NULL,
  "signedByRole"     TEXT,
  "signatureFileKey" TEXT         NOT NULL,
  "ipAddress"        TEXT,
  "userAgent"        TEXT,
  "signedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bodySnapshot"     TEXT         NOT NULL,

  CONSTRAINT "lab_consent_signatures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_consent_signatures_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_consent_signatures_template_fkey"
    FOREIGN KEY ("templateId") REFERENCES "lab_consent_templates" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "lab_consent_signatures_case_idx"     ON "lab_consent_signatures" ("caseId");
CREATE INDEX "lab_consent_signatures_template_idx" ON "lab_consent_signatures" ("templateId");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Templates are lab-owned. Signatures are visible to either side of the
-- case (clinic confirms what was signed on the patient's behalf).
ALTER TABLE "lab_conformity_doc_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_conformity_doc_templates" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_consent_templates"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_consent_templates"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_consent_signatures"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_consent_signatures"       FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_conformity_doc_templates_owner ON "lab_conformity_doc_templates"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY lab_consent_templates_owner ON "lab_consent_templates"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Linked-clinic SELECT for consent templates: clinic needs to display the
-- template body before capturing the signature.
CREATE POLICY lab_consent_templates_linked_clinic_read ON "lab_consent_templates"
  FOR SELECT TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_clinic_links" l
      WHERE l."labTenantId"    = "lab_consent_templates"."tenantId"
        AND l."clinicTenantId" = current_tenant_id()
        AND l."status"         = 'ACTIVE'
        AND l."deletedAt"      IS NULL
    )
  );

CREATE POLICY lab_consent_signatures_via_case ON "lab_consent_signatures"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_consent_signatures"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_consent_signatures"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  );

CREATE POLICY lab_conformity_doc_templates_platform_all ON "lab_conformity_doc_templates"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_consent_templates_platform_all ON "lab_consent_templates"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_consent_signatures_platform_all ON "lab_consent_signatures"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
