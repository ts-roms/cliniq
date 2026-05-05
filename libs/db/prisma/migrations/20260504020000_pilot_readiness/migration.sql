-- Pilot-readiness: clinic specialty + locations, drug catalog, ICD-10 catalog,
-- provider PRC fields, MFA TOTP fields, Rx provider snapshot.

-- ── Tenant.type + ClinicType enum ────────────────────────────────────────
CREATE TYPE "ClinicType" AS ENUM (
  'GENERAL', 'DENTAL', 'PEDIATRIC', 'DERMATOLOGY',
  'OBGYN', 'CARDIOLOGY', 'PSYCH', 'OTHER'
);
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "type" "ClinicType" NOT NULL DEFAULT 'GENERAL';

-- ── User: PRC license + signature + MFA TOTP fields ──────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "prcLicenseNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "prcLicenseExpiry" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "prcSpecialty" TEXT,
  ADD COLUMN IF NOT EXISTS "signatureFileId" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaBackupCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ── Prescription provider snapshot fields ────────────────────────────────
ALTER TABLE "prescriptions"
  ADD COLUMN IF NOT EXISTS "providerName" TEXT,
  ADD COLUMN IF NOT EXISTS "providerLicense" TEXT,
  ADD COLUMN IF NOT EXISTS "providerSpecialty" TEXT;

-- ── PrescriptionItem.drugId ──────────────────────────────────────────────
ALTER TABLE "prescription_items"
  ADD COLUMN IF NOT EXISTS "drugId" TEXT;

-- ── Drug catalog (global rows have tenantId NULL) ────────────────────────
CREATE TABLE "drugs" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT,
  "generic"     TEXT NOT NULL,
  "brand"       TEXT,
  "strength"    TEXT,
  "form"        TEXT,
  "atcCode"     TEXT,
  "rxnormCode"  TEXT,
  "classes"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "controlled"  BOOLEAN NOT NULL DEFAULT FALSE,
  "active"      BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drugs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drugs_tenantId_generic_idx" ON "drugs"("tenantId", "generic");
CREATE INDEX "drugs_tenantId_brand_idx"   ON "drugs"("tenantId", "brand");
-- Trigram indexes for ILIKE '%foo%' search:
CREATE INDEX "drugs_generic_trgm_idx" ON "drugs" USING GIN ("generic" gin_trgm_ops);
CREATE INDEX "drugs_brand_trgm_idx"   ON "drugs" USING GIN ("brand"   gin_trgm_ops);

-- FK from prescription_items
ALTER TABLE "prescription_items"
  ADD CONSTRAINT "prescription_items_drugId_fkey"
  FOREIGN KEY ("drugId") REFERENCES "drugs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "prescription_items_drugId_idx" ON "prescription_items"("drugId");

-- RLS: app role can SELECT global rows (tenantId IS NULL) plus its own.
-- INSERT/UPDATE/DELETE only on its own tenant rows.
ALTER TABLE "drugs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "drugs" FORCE ROW LEVEL SECURITY;
CREATE POLICY drugs_read_global_or_own ON "drugs"
  FOR SELECT TO cliniq_app
  USING ("tenantId" IS NULL OR "tenantId" = current_tenant_id());
CREATE POLICY drugs_mutate_own ON "drugs"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "drugs" TO cliniq_app;

-- ── ICD-10 catalog (global, read-only seed) ──────────────────────────────
CREATE TABLE "icd_codes" (
  "code"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "chapter"     TEXT,
  "billable"    BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "icd_codes_pkey" PRIMARY KEY ("code")
);
CREATE INDEX "icd_codes_description_idx"    ON "icd_codes"("description");
CREATE INDEX "icd_codes_description_trgm_idx" ON "icd_codes" USING GIN ("description" gin_trgm_ops);
-- ICD codes are public knowledge — no RLS needed; readable by all sessions.
GRANT SELECT ON "icd_codes" TO cliniq_app;

-- ── Locations (per-tenant clinic branches) ───────────────────────────────
CREATE TABLE "locations" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city"         TEXT,
  "province"     TEXT,
  "postalCode"   TEXT,
  "country"      TEXT NOT NULL DEFAULT 'PH',
  "phone"        TEXT,
  "isPrimary"    BOOLEAN NOT NULL DEFAULT FALSE,
  "active"       BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "locations_tenantId_name_key" ON "locations"("tenantId", "name");
CREATE INDEX "locations_tenantId_isPrimary_idx"   ON "locations"("tenantId", "isPrimary");
ALTER TABLE "locations"
  ADD CONSTRAINT "locations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
CREATE POLICY locations_isolation ON "locations"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "locations" TO cliniq_app;
