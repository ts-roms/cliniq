-- The laboratory test catalogue: what the lab offers, and what each test
-- actually reports.
--
-- Until now an order item carried `testName TEXT` and an optional `testCode`,
-- both free text. Nothing could be reported on, and a panel had no identity:
-- the schema's own comment admitted a CBC was entered as ~7 sibling order
-- items with no parent, no shared reference set, and no way to render a CBC
-- report AS a CBC. That is the inversion of "don't store a CBC as one simple
-- result" — it stored a CBC as seven unrelated ones.
--
-- A panel is now a laboratory_test whose test_components are its analytes.

CREATE TYPE "LabResultType" AS ENUM ('NUMERIC', 'TEXT', 'CODED', 'TITER');

-- ── sections ──────────────────────────────────────────────────
-- Tenant-scoped and configurable rather than an enum: DOH licenses a
-- laboratory for a specific service capability, and not every laboratory
-- offers every section. A hard-coded list would misrepresent what a given
-- lab is licensed to do.
CREATE TABLE "lab_sections" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "code"      TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "sortOrder" INTEGER      NOT NULL DEFAULT 0,
  "isActive"  BOOLEAN      NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "lab_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_sections_tenantId_code_key"
  ON "lab_sections"("tenantId", "code");
CREATE INDEX "lab_sections_tenantId_isActive_sortOrder_idx"
  ON "lab_sections"("tenantId", "isActive", "sortOrder");

-- ── tests ─────────────────────────────────────────────────────
CREATE TABLE "laboratory_tests" (
  "id"                     TEXT         NOT NULL,
  "tenantId"               TEXT         NOT NULL,
  "code"                   TEXT         NOT NULL,
  "loincCode"              TEXT,
  "name"                   TEXT         NOT NULL,
  "shortName"              TEXT,
  "sectionId"              TEXT         NOT NULL,
  "isPanel"                BOOLEAN      NOT NULL DEFAULT false,
  "specimenType"           TEXT,
  "container"              TEXT,
  "minVolumeMl"            DOUBLE PRECISION,
  "collectionInstructions" TEXT,
  "processingInstructions" TEXT,
  "method"                 TEXT,
  "targetTatMinutes"       INTEGER,
  "statTatMinutes"         INTEGER,
  "isActive"               BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  "deletedAt"              TIMESTAMP(3),
  CONSTRAINT "laboratory_tests_pkey" PRIMARY KEY ("id")
);

-- A turnaround target of zero or less is not a target.
ALTER TABLE "laboratory_tests"
  ADD CONSTRAINT "laboratory_tests_tat_positive"
  CHECK (
    ("targetTatMinutes" IS NULL OR "targetTatMinutes" > 0)
    AND ("statTatMinutes" IS NULL OR "statTatMinutes" > 0)
  );

-- STAT is the urgent path; a STAT target slower than the routine one is a
-- transposition.
ALTER TABLE "laboratory_tests"
  ADD CONSTRAINT "laboratory_tests_stat_faster_than_routine"
  CHECK (
    "statTatMinutes" IS NULL
    OR "targetTatMinutes" IS NULL
    OR "statTatMinutes" <= "targetTatMinutes"
  );

ALTER TABLE "laboratory_tests"
  ADD CONSTRAINT "laboratory_tests_min_volume_positive"
  CHECK ("minVolumeMl" IS NULL OR "minVolumeMl" > 0);

CREATE UNIQUE INDEX "laboratory_tests_tenantId_code_key"
  ON "laboratory_tests"("tenantId", "code");
CREATE INDEX "laboratory_tests_tenantId_sectionId_isActive_idx"
  ON "laboratory_tests"("tenantId", "sectionId", "isActive");

-- RESTRICT: retiring a section that still has tests on it should be refused,
-- not silently cascade the catalogue away.
ALTER TABLE "laboratory_tests"
  ADD CONSTRAINT "laboratory_tests_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "lab_sections"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── components ────────────────────────────────────────────────
CREATE TABLE "test_components" (
  "id"           TEXT            NOT NULL,
  "tenantId"     TEXT            NOT NULL,
  "testId"       TEXT            NOT NULL,
  "code"         TEXT            NOT NULL,
  "loincCode"    TEXT,
  "name"         TEXT            NOT NULL,
  "resultType"   "LabResultType" NOT NULL DEFAULT 'NUMERIC',
  "unit"         TEXT,
  "decimals"     INTEGER         NOT NULL DEFAULT 1,
  "displayOrder" INTEGER         NOT NULL DEFAULT 0,
  "isActive"     BOOLEAN         NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)    NOT NULL,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "test_components_pkey" PRIMARY KEY ("id")
);

-- Reporting haemoglobin to four places is false precision; to minus one is
-- nonsense.
ALTER TABLE "test_components"
  ADD CONSTRAINT "test_components_decimals_sane"
  CHECK ("decimals" >= 0 AND "decimals" <= 6);

CREATE UNIQUE INDEX "test_components_tenantId_testId_code_key"
  ON "test_components"("tenantId", "testId", "code");
CREATE INDEX "test_components_tenantId_testId_displayOrder_idx"
  ON "test_components"("tenantId", "testId", "displayOrder");

-- CASCADE: a component has no meaning without its test.
ALTER TABLE "test_components"
  ADD CONSTRAINT "test_components_testId_fkey"
  FOREIGN KEY ("testId") REFERENCES "laboratory_tests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── link existing orders to the catalogue ─────────────────────
-- Nullable and NOT backfilled: rows written before the catalogue existed
-- cannot be matched to it reliably (their testName is free text, and guessing
-- would attach a historical result to a test it was never ordered from), and
-- a laboratory may still order something ad hoc.
--
-- SET NULL rather than RESTRICT: retiring a catalogue entry must not be
-- blocked by, or destroy, the orders placed from it. The order keeps its
-- snapshotted name/code/unit and simply loses the back-reference.
ALTER TABLE "lab_order_items" ADD COLUMN "testId" TEXT;

CREATE INDEX "lab_order_items_tenantId_testId_idx"
  ON "lab_order_items"("tenantId", "testId");

ALTER TABLE "lab_order_items"
  ADD CONSTRAINT "lab_order_items_testId_fkey"
  FOREIGN KEY ("testId") REFERENCES "laboratory_tests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── tenant isolation, in the migration that creates the tables ─
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_sections', 'laboratory_tests', 'test_components'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO cliniq_app', t);
  END LOOP;
END
$$;
