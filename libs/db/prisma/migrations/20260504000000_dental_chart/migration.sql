-- Dental odontogram: per-consultation chart of tooth status + surface findings.
-- Tooth codes use FDI/ISO numbering ("11"-"48" adult permanent, "51"-"85" deciduous).

-- CreateEnum
CREATE TYPE "Dentition" AS ENUM ('ADULT', 'DECIDUOUS', 'MIXED');

-- CreateEnum
CREATE TYPE "ToothStatus" AS ENUM (
  'PRESENT', 'MISSING', 'EXTRACTED', 'IMPLANT',
  'CROWNED', 'ROOT_CANAL', 'EXTRACTION_NEEDED', 'UNERUPTED'
);

-- CreateEnum
CREATE TYPE "ToothSurface" AS ENUM ('M', 'O', 'D', 'B', 'L');

-- CreateEnum
CREATE TYPE "SurfaceFinding" AS ENUM (
  'CARIES', 'RESTORATION_AMALGAM', 'RESTORATION_COMPOSITE',
  'SEALANT', 'FRACTURE', 'WEAR'
);

-- CreateTable
CREATE TABLE "dental_charts" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "patientId"      TEXT NOT NULL,
    "consultationId" TEXT,
    "dentition"      "Dentition" NOT NULL DEFAULT 'ADULT',
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "deletedAt"      TIMESTAMP(3),

    CONSTRAINT "dental_charts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dental_charts_tenantId_patientId_createdAt_idx"
  ON "dental_charts"("tenantId", "patientId", "createdAt");
CREATE INDEX "dental_charts_tenantId_consultationId_idx"
  ON "dental_charts"("tenantId", "consultationId");

ALTER TABLE "dental_charts"
  ADD CONSTRAINT "dental_charts_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dental_charts"
  ADD CONSTRAINT "dental_charts_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "dental_tooth_entries" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "chartId"   TEXT NOT NULL,
    "toothCode" TEXT NOT NULL,
    "status"    "ToothStatus" NOT NULL DEFAULT 'PRESENT',
    "notes"     TEXT,

    CONSTRAINT "dental_tooth_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dental_tooth_entries_chartId_toothCode_key"
  ON "dental_tooth_entries"("chartId", "toothCode");
CREATE INDEX "dental_tooth_entries_tenantId_chartId_idx"
  ON "dental_tooth_entries"("tenantId", "chartId");

ALTER TABLE "dental_tooth_entries"
  ADD CONSTRAINT "dental_tooth_entries_chartId_fkey"
  FOREIGN KEY ("chartId") REFERENCES "dental_charts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "dental_surface_findings" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "toothEntryId" TEXT NOT NULL,
    "surface"      "ToothSurface" NOT NULL,
    "finding"      "SurfaceFinding" NOT NULL,
    "notes"        TEXT,

    CONSTRAINT "dental_surface_findings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dental_surface_findings_tenantId_toothEntryId_idx"
  ON "dental_surface_findings"("tenantId", "toothEntryId");

ALTER TABLE "dental_surface_findings"
  ADD CONSTRAINT "dental_surface_findings_toothEntryId_fkey"
  FOREIGN KEY ("toothEntryId") REFERENCES "dental_tooth_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE "dental_charts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dental_charts" FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_charts_isolation ON "dental_charts"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

ALTER TABLE "dental_tooth_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dental_tooth_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_tooth_entries_isolation ON "dental_tooth_entries"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

ALTER TABLE "dental_surface_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dental_surface_findings" FORCE ROW LEVEL SECURITY;
CREATE POLICY dental_surface_findings_isolation ON "dental_surface_findings"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON "dental_charts", "dental_tooth_entries", "dental_surface_findings"
  TO cliniq_app;
