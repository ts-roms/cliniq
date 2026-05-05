-- Prescriptions + items

CREATE TYPE "RxStatus" AS ENUM ('ISSUED', 'DISPENSED', 'CANCELLED');

CREATE TABLE "prescriptions" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "patientId"      TEXT NOT NULL,
    "providerId"     TEXT NOT NULL,
    "consultationId" TEXT,
    "number"         TEXT NOT NULL,
    "issuedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil"     TIMESTAMP(3),
    "status"         "RxStatus" NOT NULL DEFAULT 'ISSUED',
    "notes"          TEXT,
    "pdfUrl"         TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "deletedAt"      TIMESTAMP(3),
    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prescriptions_tenantId_number_key"
  ON "prescriptions"("tenantId", "number");

CREATE INDEX "prescriptions_tenantId_patientId_issuedAt_idx"
  ON "prescriptions"("tenantId", "patientId", "issuedAt");

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "prescriptions"
  ADD CONSTRAINT "prescriptions_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "prescription_items" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "drugName"       TEXT NOT NULL,
    "strength"       TEXT,
    "form"           TEXT,
    "dose"           TEXT NOT NULL,
    "frequency"      TEXT NOT NULL,
    "durationDays"   INTEGER,
    "quantity"       TEXT,
    "instructions"   TEXT,
    "refills"        INTEGER NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prescription_items_tenantId_prescriptionId_idx"
  ON "prescription_items"("tenantId", "prescriptionId");

ALTER TABLE "prescription_items"
  ADD CONSTRAINT "prescription_items_prescriptionId_fkey"
  FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS ──────────────────────────────────────────
ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY prescriptions_isolation ON "prescriptions"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

ALTER TABLE "prescription_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescription_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY prescription_items_isolation ON "prescription_items"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "prescriptions", "prescription_items" TO cliniq_app;
