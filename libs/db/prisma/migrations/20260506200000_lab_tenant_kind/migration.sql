-- Phase 1.1 of the lab module — adds the TenantKind discriminator and the
-- parallel LabPlan / LabSpecialty enums. See docs/lab-module-plan.md.
--
-- Existing tenants stay on kind=CLINIC with their current `plan` value.
-- The `plan` column becomes nullable because LAB tenants don't carry a
-- ClinicPlan. New `labPlan` and `labSpecialty` are added nullable for the
-- same reason on CLINIC tenants.

CREATE TYPE "TenantKind" AS ENUM ('CLINIC', 'LAB');

CREATE TYPE "LabSpecialty" AS ENUM (
  'CROWN_BRIDGE',
  'ORTHODONTICS',
  'IMPLANTOLOGY',
  'REMOVABLE_PROSTHESIS',
  'CLEAR_ALIGNERS',
  'FULL_SERVICE',
  'OTHER'
);

CREATE TYPE "LabPlan" AS ENUM ('LAB_BASIC', 'LAB_STANDARD', 'LAB_PREMIUM');

-- Tenant: add kind + lab fields, make `plan` nullable.
ALTER TABLE "tenants"
  ADD COLUMN "kind"         "TenantKind"  NOT NULL DEFAULT 'CLINIC',
  ADD COLUMN "labSpecialty" "LabSpecialty",
  ADD COLUMN "labPlan"      "LabPlan";

ALTER TABLE "tenants" ALTER COLUMN "plan" DROP NOT NULL;

-- Index for fast filtering by kind (e.g., platform admin lists "all labs").
CREATE INDEX "tenants_kind_idx" ON "tenants" ("kind");
