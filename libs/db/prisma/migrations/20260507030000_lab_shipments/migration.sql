-- Phase 2.5 — Shipment record per case (1:1).

CREATE TABLE "lab_shipments" (
  "id"             TEXT         NOT NULL,
  "caseId"         TEXT         NOT NULL,
  "carrier"        TEXT,
  "trackingNumber" TEXT,
  "shippedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt"    TIMESTAMP(3),
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lab_shipments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_shipments_case_fkey"
    FOREIGN KEY ("caseId")
    REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lab_shipments_case_uniq" ON "lab_shipments" ("caseId");
CREATE INDEX "lab_shipments_case_idx"        ON "lab_shipments" ("caseId");

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE "lab_shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_shipments" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_shipments_via_case ON "lab_shipments"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_shipments"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_shipments"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  );

CREATE POLICY lab_shipments_platform_all ON "lab_shipments"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
