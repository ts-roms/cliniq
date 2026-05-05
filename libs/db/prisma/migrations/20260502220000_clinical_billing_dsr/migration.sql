-- Appointments + Vitals + clinical history + billing + DSR

-- ── enums ──
CREATE TYPE "AppointmentType" AS ENUM ('CONSULT', 'FOLLOWUP', 'PROCEDURE', 'TELEMED');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "AllergyType" AS ENUM ('DRUG', 'FOOD', 'ENVIRONMENTAL', 'OTHER');
CREATE TYPE "Severity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING');
CREATE TYPE "MedStatus" AS ENUM ('ACTIVE', 'STOPPED', 'COMPLETED');
CREATE TYPE "ConditionStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CHRONIC');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'CARD', 'HMO', 'INSURANCE', 'OTHER');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "DsrType" AS ENUM ('ACCESS', 'CORRECTION', 'ERASURE', 'OBJECTION', 'PORTABILITY');
CREATE TYPE "DsrStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- ── appointments ──
CREATE TABLE "appointments" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "patientId"      TEXT NOT NULL,
    "providerId"     TEXT NOT NULL,
    "startsAt"       TIMESTAMP(3) NOT NULL,
    "endsAt"         TIMESTAMP(3) NOT NULL,
    "type"           "AppointmentType" NOT NULL DEFAULT 'CONSULT',
    "status"         "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason"         TEXT,
    "notes"          TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "deletedAt"      TIMESTAMP(3),
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointments_tenantId_startsAt_idx" ON "appointments"("tenantId", "startsAt");
CREATE INDEX "appointments_tenantId_providerId_startsAt_idx" ON "appointments"("tenantId", "providerId", "startsAt");
CREATE INDEX "appointments_tenantId_status_startsAt_idx" ON "appointments"("tenantId", "status", "startsAt");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── vitals ──
CREATE TABLE "vitals" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "patientId"      TEXT NOT NULL,
    "consultationId" TEXT,
    "measuredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "systolic"       INTEGER,
    "diastolic"      INTEGER,
    "heartRate"      INTEGER,
    "respRate"       INTEGER,
    "tempC"          DECIMAL(4,2),
    "spo2"           INTEGER,
    "weightKg"       DECIMAL(5,2),
    "heightCm"       DECIMAL(5,2),
    "bmi"            DECIMAL(4,2),
    "painScore"      INTEGER,
    CONSTRAINT "vitals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vitals_tenantId_patientId_measuredAt_idx" ON "vitals"("tenantId", "patientId", "measuredAt");
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── allergies ──
CREATE TABLE "allergies" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "type"      "AllergyType" NOT NULL,
    "severity"  "Severity" NOT NULL,
    "reaction"  TEXT,
    "notedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "allergies_tenantId_patientId_idx" ON "allergies"("tenantId", "patientId");
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── medications ──
CREATE TABLE "medications" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "drugName"  TEXT NOT NULL,
    "dose"      TEXT,
    "frequency" TEXT,
    "startedOn" TIMESTAMP(3),
    "stoppedOn" TIMESTAMP(3),
    "status"    "MedStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "medications_tenantId_patientId_status_idx" ON "medications"("tenantId", "patientId", "status");
ALTER TABLE "medications" ADD CONSTRAINT "medications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── conditions ──
CREATE TABLE "conditions" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "patientId"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "icd10Code"   TEXT,
    "status"      "ConditionStatus" NOT NULL DEFAULT 'ACTIVE',
    "diagnosedOn" TIMESTAMP(3),
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conditions_tenantId_patientId_status_idx" ON "conditions"("tenantId", "patientId", "status");
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── services ──
CREATE TABLE "services" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "code"          TEXT,
    "name"          TEXT NOT NULL,
    "category"      TEXT,
    "priceCentavos" INTEGER NOT NULL,
    "currency"      TEXT NOT NULL DEFAULT 'PHP',
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "services_tenantId_active_idx" ON "services"("tenantId", "active");

-- ── invoices ──
CREATE TABLE "invoices" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "patientId"        TEXT NOT NULL,
    "number"           TEXT NOT NULL,
    "issuedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt"            TIMESTAMP(3),
    "subtotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "discountCentavos" INTEGER NOT NULL DEFAULT 0,
    "taxCentavos"      INTEGER NOT NULL DEFAULT 0,
    "totalCentavos"    INTEGER NOT NULL DEFAULT 0,
    "paidCentavos"     INTEGER NOT NULL DEFAULT 0,
    "currency"         TEXT NOT NULL DEFAULT 'PHP',
    "status"           "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes"            TEXT,
    "createdById"      TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "deletedAt"        TIMESTAMP(3),
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_tenantId_number_key" ON "invoices"("tenantId", "number");
CREATE INDEX "invoices_tenantId_patientId_issuedAt_idx" ON "invoices"("tenantId", "patientId", "issuedAt");
CREATE INDEX "invoices_tenantId_status_idx" ON "invoices"("tenantId", "status");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── invoice_items ──
CREATE TABLE "invoice_items" (
    "id"                TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "invoiceId"         TEXT NOT NULL,
    "serviceId"         TEXT,
    "description"       TEXT NOT NULL,
    "quantity"          INTEGER NOT NULL DEFAULT 1,
    "unitPriceCentavos" INTEGER NOT NULL,
    "totalCentavos"     INTEGER NOT NULL,
    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "invoice_items_tenantId_invoiceId_idx" ON "invoice_items"("tenantId", "invoiceId");
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── payments ──
CREATE TABLE "payments" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "invoiceId"      TEXT NOT NULL,
    "amountCentavos" INTEGER NOT NULL,
    "currency"       TEXT NOT NULL DEFAULT 'PHP',
    "method"         "PaymentMethod" NOT NULL,
    "reference"      TEXT,
    "paidAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"         "PaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "metadata"       JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payments_tenantId_paidAt_idx" ON "payments"("tenantId", "paidAt");
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── dsr_requests ──
CREATE TABLE "dsr_requests" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "patientId"  TEXT NOT NULL,
    "type"       "DsrType" NOT NULL,
    "status"     "DsrStatus" NOT NULL DEFAULT 'OPEN',
    "details"    TEXT,
    "resolution" TEXT,
    "filedBy"    TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dsr_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "dsr_requests_tenantId_status_createdAt_idx" ON "dsr_requests"("tenantId", "status", "createdAt");
CREATE INDEX "dsr_requests_tenantId_patientId_idx" ON "dsr_requests"("tenantId", "patientId");
ALTER TABLE "dsr_requests" ADD CONSTRAINT "dsr_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointments','vitals','allergies','medications','conditions',
    'services','invoices','invoice_items','payments','dsr_requests'
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
