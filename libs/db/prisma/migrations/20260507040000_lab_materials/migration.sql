-- Phase 3.1 / 3.2 — Materials + LOT inventory + per-case usage.

CREATE TYPE "LabMaterialLotStatus" AS ENUM (
  'ACTIVE',
  'WAREHOUSE',
  'FINISHED',
  'DEFECTIVE',
  'EXPIRED'
);

CREATE TABLE "lab_materials" (
  "id"              TEXT         NOT NULL,
  "tenantId"        TEXT         NOT NULL,
  "sku"             TEXT,
  "name"            TEXT         NOT NULL,
  "category"        TEXT,
  "unitOfMeasure"   TEXT         NOT NULL DEFAULT 'g',
  "description"     TEXT,
  "defaultSupplier" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "deletedAt"       TIMESTAMP(3),

  CONSTRAINT "lab_materials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_materials_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "lab_materials_tenant_sku_uniq"
  ON "lab_materials" ("tenantId", "sku");
CREATE INDEX "lab_materials_tenant_name_idx"
  ON "lab_materials" ("tenantId", "name");

CREATE TABLE "lab_material_lots" (
  "id"             TEXT                   NOT NULL,
  "materialId"     TEXT                   NOT NULL,
  "lotNumber"      TEXT                   NOT NULL,
  "manufacturer"   TEXT,
  "supplier"       TEXT,
  "initialQty"     DOUBLE PRECISION       NOT NULL,
  "remainingQty"   DOUBLE PRECISION       NOT NULL,
  "unitPriceCents" INTEGER,
  "receivedAt"     TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3),
  "status"         "LabMaterialLotStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)           NOT NULL,
  "deletedAt"      TIMESTAMP(3),

  CONSTRAINT "lab_material_lots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_material_lots_material_fkey"
    FOREIGN KEY ("materialId") REFERENCES "lab_materials" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "lab_material_lots_material_lotnum_uniq"
  ON "lab_material_lots" ("materialId", "lotNumber");
CREATE INDEX "lab_material_lots_material_status_idx"
  ON "lab_material_lots" ("materialId", "status");
CREATE INDEX "lab_material_lots_expires_idx"
  ON "lab_material_lots" ("expiresAt");

CREATE TABLE "lab_material_usages" (
  "id"           TEXT             NOT NULL,
  "caseId"       TEXT             NOT NULL,
  "lotId"        TEXT             NOT NULL,
  "qty"          DOUBLE PRECISION NOT NULL,
  "usedAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedByUserId" TEXT             NOT NULL,

  CONSTRAINT "lab_material_usages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_material_usages_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lab_material_usages_lot_fkey"
    FOREIGN KEY ("lotId") REFERENCES "lab_material_lots" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "lab_material_usages_case_idx" ON "lab_material_usages" ("caseId");
CREATE INDEX "lab_material_usages_lot_idx"  ON "lab_material_usages" ("lotId");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Materials + LOTs are lab-only; usages are visible to either side of the
-- owning case (so the clinic could see a future "materials used" report).
ALTER TABLE "lab_materials"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_materials"        FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_material_lots"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_material_lots"    FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_material_usages"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_material_usages"  FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_materials_owner ON "lab_materials"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY lab_material_lots_via_material ON "lab_material_lots"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_materials" m
      WHERE m."id" = "lab_material_lots"."materialId"
        AND m."tenantId" = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_materials" m
      WHERE m."id" = "lab_material_lots"."materialId"
        AND m."tenantId" = current_tenant_id()
    )
  );

CREATE POLICY lab_material_usages_via_case ON "lab_material_usages"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_material_usages"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_material_usages"."caseId"
        AND c."labTenantId" = current_tenant_id()
    )
  );

CREATE POLICY lab_materials_platform_all ON "lab_materials"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_material_lots_platform_all ON "lab_material_lots"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
CREATE POLICY lab_material_usages_platform_all ON "lab_material_usages"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
