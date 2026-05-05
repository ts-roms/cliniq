-- Lab orders + results. One LabOrder per slip, multiple LabOrderItems per
-- order. Results stored inline on items so panels (CBC, Chem) get one row
-- per analyte. Abnormal flags computed on result entry from ref ranges.

CREATE TYPE "LabOrderStatus" AS ENUM ('PENDING', 'COLLECTED', 'RECEIVED', 'REPORTED', 'CANCELLED');
CREATE TYPE "LabAbnormalFlag" AS ENUM ('NORMAL', 'HIGH', 'LOW', 'CRITICAL_HIGH', 'CRITICAL_LOW', 'ABNORMAL');

-- ── lab_orders ──
CREATE TABLE "lab_orders" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "consultationId" TEXT,
    "patientId"      TEXT NOT NULL,
    "providerId"     TEXT NOT NULL,
    "number"         TEXT NOT NULL,
    "vendor"         TEXT,
    "externalRef"    TEXT,
    "status"         "LabOrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes"          TEXT,
    "collectedAt"    TIMESTAMP(3),
    "receivedAt"     TIMESTAMP(3),
    "reportedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "deletedAt"      TIMESTAMP(3),
    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lab_orders_tenantId_number_key" ON "lab_orders"("tenantId", "number");
CREATE INDEX "lab_orders_tenantId_patientId_createdAt_idx" ON "lab_orders"("tenantId", "patientId", "createdAt");
CREATE INDEX "lab_orders_tenantId_status_createdAt_idx" ON "lab_orders"("tenantId", "status", "createdAt");
CREATE INDEX "lab_orders_tenantId_consultationId_idx" ON "lab_orders"("tenantId", "consultationId");
ALTER TABLE "lab_orders"
  ADD CONSTRAINT "lab_orders_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_orders"
  ADD CONSTRAINT "lab_orders_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "consultations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── lab_order_items ──
CREATE TABLE "lab_order_items" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "orderId"       TEXT NOT NULL,
    "testCode"      TEXT,
    "testName"      TEXT NOT NULL,
    "category"      TEXT,
    "resultValue"   TEXT,
    "resultUnit"    TEXT,
    "referenceLow"  DOUBLE PRECISION,
    "referenceHigh" DOUBLE PRECISION,
    "abnormalFlag"  "LabAbnormalFlag",
    "comment"       TEXT,
    "reportedAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lab_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lab_order_items_tenantId_orderId_idx" ON "lab_order_items"("tenantId", "orderId");
ALTER TABLE "lab_order_items"
  ADD CONSTRAINT "lab_order_items_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "lab_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS + grants ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_orders', 'lab_order_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO cliniq_app', t);
  END LOOP;
END $$;
