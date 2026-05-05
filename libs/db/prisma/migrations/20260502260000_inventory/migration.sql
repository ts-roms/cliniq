-- Inventory module: catalog (inventory_items) → batches (stock_batches, lot+expiry)
-- → immutable ledger (stock_movements). On-hand qty is derived from
-- SUM(stock_batches.remainingQty); the ledger is the audit trail.

-- ── enum ──
CREATE TYPE "StockMovementKind" AS ENUM ('RECEIVE', 'DISPENSE', 'ADJUST', 'EXPIRE', 'RETURN');

-- ── inventory_items ──
CREATE TABLE "inventory_items" (
    "id"                   TEXT NOT NULL,
    "tenantId"             TEXT NOT NULL,
    "sku"                  TEXT NOT NULL,
    "name"                 TEXT NOT NULL,
    "category"             TEXT,
    "unit"                 TEXT NOT NULL DEFAULT 'each',
    "reorderLevel"         INTEGER NOT NULL DEFAULT 0,
    "defaultPriceCentavos" INTEGER NOT NULL DEFAULT 0,
    "isControlled"         BOOLEAN NOT NULL DEFAULT false,
    "active"               BOOLEAN NOT NULL DEFAULT true,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    "deletedAt"            TIMESTAMP(3),
    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inventory_items_tenantId_sku_key" ON "inventory_items"("tenantId", "sku");
CREATE INDEX "inventory_items_tenantId_active_name_idx" ON "inventory_items"("tenantId", "active", "name");

-- ── stock_batches ──
CREATE TABLE "stock_batches" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "itemId"           TEXT NOT NULL,
    "lotNumber"        TEXT,
    "expiresOn"        TIMESTAMP(3),
    "receivedQty"      INTEGER NOT NULL,
    "remainingQty"     INTEGER NOT NULL,
    "unitCostCentavos" INTEGER NOT NULL DEFAULT 0,
    "supplierName"     TEXT,
    "receivedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy"       TEXT,
    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_batches_tenantId_itemId_expiresOn_idx" ON "stock_batches"("tenantId", "itemId", "expiresOn");
CREATE INDEX "stock_batches_tenantId_itemId_remainingQty_idx" ON "stock_batches"("tenantId", "itemId", "remainingQty");
ALTER TABLE "stock_batches"
  ADD CONSTRAINT "stock_batches_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── stock_movements ──
CREATE TABLE "stock_movements" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "itemId"         TEXT NOT NULL,
    "batchId"        TEXT,
    "kind"           "StockMovementKind" NOT NULL,
    "quantity"       INTEGER NOT NULL,
    "reason"         TEXT,
    "prescriptionId" TEXT,
    "performedBy"    TEXT,
    "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_movements_tenantId_itemId_occurredAt_idx" ON "stock_movements"("tenantId", "itemId", "occurredAt");
CREATE INDEX "stock_movements_tenantId_prescriptionId_idx" ON "stock_movements"("tenantId", "prescriptionId");
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "stock_batches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RLS + grants ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_items', 'stock_batches', 'stock_movements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO cliniq_app', t);
  END LOOP;
END $$;
