-- Visit types — what a patient is coming in FOR.
--
-- Distinct from AppointmentType (the modality: consult / follow-up /
-- procedure / telemed, which says nothing about clinical domain) and from
-- `services` (a billing price list with no clinical meaning).
--
-- Each row names the ClinicModule ids it focuses, so selecting one at booking
-- or check-in tells the consult screen which clinical forms to open instead
-- of showing every form the product ships.
--
-- Tenant-scoped with the standard isolation policy.

CREATE TABLE "visit_types" (
  "id"          TEXT         NOT NULL,
  "tenantId"    TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "code"        TEXT,
  "modules"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isDefault"   BOOLEAN      NOT NULL DEFAULT false,
  "active"      BOOLEAN      NOT NULL DEFAULT true,
  "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "deletedAt"   TIMESTAMP(3),

  CONSTRAINT "visit_types_pkey" PRIMARY KEY ("id")
);

-- Names are how staff pick one, so they must be unambiguous per tenant.
CREATE UNIQUE INDEX "visit_types_tenantId_name_key"
  ON "visit_types"("tenantId", "name");

CREATE INDEX "visit_types_tenantId_active_sortOrder_idx"
  ON "visit_types"("tenantId", "active", "sortOrder");

ALTER TABLE "visit_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "visit_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY visit_types_isolation ON "visit_types"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Link from the two places a visit is recorded. ON DELETE SET NULL: retiring
-- a visit type must never cascade away appointments or clinical records.
ALTER TABLE "appointments"  ADD COLUMN "visitTypeId" TEXT;
ALTER TABLE "consultations" ADD COLUMN "visitTypeId" TEXT;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_visitTypeId_fkey"
  FOREIGN KEY ("visitTypeId") REFERENCES "visit_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_visitTypeId_fkey"
  FOREIGN KEY ("visitTypeId") REFERENCES "visit_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "appointments_tenantId_visitTypeId_idx"
  ON "appointments"("tenantId", "visitTypeId");
CREATE INDEX "consultations_tenantId_visitTypeId_idx"
  ON "consultations"("tenantId", "visitTypeId");
