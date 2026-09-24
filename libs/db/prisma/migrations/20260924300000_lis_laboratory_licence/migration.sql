-- The licensed laboratory and what it is authorized to perform.
-- DOH AO 2021-0037.
--
-- Nothing modelled the facility as distinct from the tenant. A tenant is an
-- account; a laboratory is a facility with a Licence to Operate, a category,
-- a head and a pathologist of record. The LTO number and the head of
-- laboratory belong on every issued report, and a laboratory may not perform
-- examinations beyond its authorized service capability — none of which
-- could be recorded, let alone checked.

CREATE TYPE "LtoCategory" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY');

CREATE TABLE "laboratories" (
  "id"                       TEXT          NOT NULL,
  "tenantId"                 TEXT          NOT NULL,
  "locationId"               TEXT,
  "name"                     TEXT          NOT NULL,
  "dohLtoNumber"             TEXT,
  "category"                 "LtoCategory" NOT NULL DEFAULT 'PRIMARY',
  "classification"           TEXT,
  "validFrom"                TIMESTAMP(3),
  "validUntil"               TIMESTAMP(3),
  "headName"                 TEXT,
  "headLicenseNumber"        TEXT,
  "pathologistName"          TEXT,
  "pathologistLicenseNumber" TEXT,
  "createdAt"                TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "laboratories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "laboratories"
  ADD CONSTRAINT "laboratories_name_present"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "laboratories"
  ADD CONSTRAINT "laboratories_validity_window"
  CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validUntil" >= "validFrom");

-- One laboratory per tenant for now. A multi-site group with an LTO per
-- branch needs this keyed to locationId instead, which is why the column is
-- here already even though nothing reads it yet.
CREATE UNIQUE INDEX "laboratories_tenantId_key" ON "laboratories"("tenantId");

-- ── service capability ────────────────────────────────────────
CREATE TABLE "lab_service_capabilities" (
  "id"           TEXT         NOT NULL,
  "tenantId"     TEXT         NOT NULL,
  "laboratoryId" TEXT         NOT NULL,
  "sectionId"    TEXT,
  "testId"       TEXT,
  "isEnabled"    BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lab_service_capabilities_pkey" PRIMARY KEY ("id")
);

-- Exactly one of sectionId / testId. A row naming both would be ambiguous
-- about which one the precedence rule should follow; a row naming neither
-- says nothing at all.
ALTER TABLE "lab_service_capabilities"
  ADD CONSTRAINT "lab_service_capabilities_section_xor_test"
  CHECK (("sectionId" IS NULL) <> ("testId" IS NULL));

-- Partial uniques, not a single composite one: Postgres treats NULLs as
-- distinct, so a plain UNIQUE (laboratoryId, sectionId, testId) would happily
-- accept the same section twice with testId NULL in both rows — and then the
-- precedence rule would depend on which one the query happened to return.
CREATE UNIQUE INDEX "lab_service_capabilities_section_key"
  ON "lab_service_capabilities"("tenantId", "laboratoryId", "sectionId")
  WHERE "testId" IS NULL;
CREATE UNIQUE INDEX "lab_service_capabilities_test_key"
  ON "lab_service_capabilities"("tenantId", "laboratoryId", "testId")
  WHERE "testId" IS NOT NULL;

CREATE INDEX "lab_service_capabilities_tenantId_laboratoryId_idx"
  ON "lab_service_capabilities"("tenantId", "laboratoryId");

ALTER TABLE "lab_service_capabilities"
  ADD CONSTRAINT "lab_service_capabilities_laboratoryId_fkey"
  FOREIGN KEY ("laboratoryId") REFERENCES "laboratories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── tenant isolation ──────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['laboratories', 'lab_service_capabilities'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "laboratories" TO cliniq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "lab_service_capabilities" TO cliniq_app;
