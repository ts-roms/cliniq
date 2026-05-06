-- Phase 1.3 — Lab product catalog. Categories are tenant-scoped and
-- self-referential for hierarchy. Products belong to one category and
-- carry a dynamic form schema rendered at order time.

CREATE TYPE "LabProductPricingMode" AS ENUM (
  'FIXED',
  'PER_RATE_PROFILE',
  'ADJUST_ON_ORDER',
  'VARIABLE_PER_TIER'
);

CREATE TABLE "lab_product_categories" (
  "id"          TEXT         NOT NULL,
  "tenantId"    TEXT         NOT NULL,
  "parentId"    TEXT,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "deletedAt"   TIMESTAMP(3),
  CONSTRAINT "lab_product_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_product_categories_parent_fkey"
    FOREIGN KEY ("parentId")
    REFERENCES "lab_product_categories" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "lab_product_categories_tenant_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lab_product_categories_tenant_parent_idx"
  ON "lab_product_categories" ("tenantId", "parentId");

CREATE TABLE "lab_products" (
  "id"           TEXT                    NOT NULL,
  "tenantId"     TEXT                    NOT NULL,
  "categoryId"   TEXT,
  "sku"          TEXT,
  "name"         TEXT                    NOT NULL,
  "description"  TEXT,
  "defaultPrice" INTEGER,
  "currency"     TEXT                    NOT NULL DEFAULT 'PHP',
  "pricingMode"  "LabProductPricingMode" NOT NULL DEFAULT 'FIXED',
  "formSchema"   JSONB,
  "phases"       TEXT[]                  NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tags"         TEXT[]                  NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive"     BOOLEAN                 NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)            NOT NULL,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "lab_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_products_category_fkey"
    FOREIGN KEY ("categoryId")
    REFERENCES "lab_product_categories" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "lab_products_tenant_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "tenants" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lab_products_tenant_sku_key"
  ON "lab_products" ("tenantId", "sku");
CREATE INDEX "lab_products_tenant_category_idx"
  ON "lab_products" ("tenantId", "categoryId");
CREATE INDEX "lab_products_tenant_active_idx"
  ON "lab_products" ("tenantId", "isActive");

-- ── RLS ─────────────────────────────────────────────────────────────
-- Categories + products are owned by one lab. Lab tenant sees their own.
-- Linked clinics need read-only access (so they can browse the lab's
-- catalog when placing orders) — we handle that via a SELECT policy that
-- joins through lab_clinic_links.
ALTER TABLE "lab_product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_product_categories" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "lab_products"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_products"           FORCE  ROW LEVEL SECURITY;

-- Owning-lab policies: full CRUD when tenantId matches.
CREATE POLICY lab_product_categories_owner ON "lab_product_categories"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY lab_products_owner ON "lab_products"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Linked-clinic SELECT: a clinic with an ACTIVE link to the owning lab can
-- read the catalog. Used when the clinic browses to place an order.
CREATE POLICY lab_product_categories_linked_clinic_read ON "lab_product_categories"
  FOR SELECT TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_clinic_links" l
      WHERE l."labTenantId"    = "lab_product_categories"."tenantId"
        AND l."clinicTenantId" = current_tenant_id()
        AND l."status"         = 'ACTIVE'
        AND l."deletedAt"      IS NULL
    )
  );

CREATE POLICY lab_products_linked_clinic_read ON "lab_products"
  FOR SELECT TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_clinic_links" l
      WHERE l."labTenantId"    = "lab_products"."tenantId"
        AND l."clinicTenantId" = current_tenant_id()
        AND l."status"         = 'ACTIVE'
        AND l."deletedAt"      IS NULL
    )
  );

-- Platform admin bypass.
CREATE POLICY lab_product_categories_platform_all ON "lab_product_categories"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY lab_products_platform_all ON "lab_products"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
