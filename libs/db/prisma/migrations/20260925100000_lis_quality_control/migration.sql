-- Internal quality control. DOH AO 2021-0037.
--
-- Nothing existed: no control material, lot, level, target mean or SD, no
-- run, no Westgard evaluation, no corrective action. For a licensed
-- laboratory this is the difference between passing and failing inspection,
-- and it is the one part of the analytical process that says whether the
-- patient results produced that day can be trusted at all.
--
-- The rules themselves are a pure evaluator in apps/api/src/labs/westgard.ts
-- with 25 unit tests, rather than logic scattered through a service: these
-- are exactly what an inspector asks you to demonstrate, and a rule that
-- cannot be demonstrated in isolation cannot be defended.

CREATE TYPE "QcLevel" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "QcOutcome" AS ENUM ('ACCEPTED', 'WARNING', 'REJECTED');

CREATE TABLE "qc_materials" (
  "id"           TEXT         NOT NULL,
  "tenantId"     TEXT         NOT NULL,
  "name"         TEXT         NOT NULL,
  "level"        "QcLevel"    NOT NULL,
  "lotNumber"    TEXT         NOT NULL,
  "manufacturer" TEXT,
  "expiresOn"    TIMESTAMP(3),
  "isActive"     BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "qc_materials_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "qc_materials"
  ADD CONSTRAINT "qc_materials_lot_present"
  CHECK (length(btrim("lotNumber")) > 0);

-- Lot is part of the identity, not an attribute: control material is made in
-- batches and the target mean shifts between them, so the same product on a
-- new lot is a different material needing new targets.
CREATE UNIQUE INDEX "qc_materials_tenantId_name_lotNumber_key"
  ON "qc_materials"("tenantId", "name", "lotNumber");
CREATE INDEX "qc_materials_tenantId_isActive_idx"
  ON "qc_materials"("tenantId", "isActive");

-- ── targets ───────────────────────────────────────────────────
CREATE TABLE "qc_targets" (
  "id"            TEXT         NOT NULL,
  "tenantId"      TEXT         NOT NULL,
  "materialId"    TEXT         NOT NULL,
  "testId"        TEXT         NOT NULL,
  "mean"          DOUBLE PRECISION NOT NULL,
  "sd"            DOUBLE PRECISION NOT NULL,
  "unit"          TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "qc_targets_pkey" PRIMARY KEY ("id")
);

-- A target with no spread makes every z-score infinite and would reject
-- every run with a violation nobody could explain.
ALTER TABLE "qc_targets"
  ADD CONSTRAINT "qc_targets_sd_positive" CHECK ("sd" > 0);

ALTER TABLE "qc_targets"
  ADD CONSTRAINT "qc_targets_effective_window"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

CREATE INDEX "qc_targets_tenantId_materialId_testId_effectiveFrom_idx"
  ON "qc_targets"("tenantId", "materialId", "testId", "effectiveFrom");

ALTER TABLE "qc_targets"
  ADD CONSTRAINT "qc_targets_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "qc_materials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── runs ──────────────────────────────────────────────────────
CREATE TABLE "qc_runs" (
  "id"               TEXT             NOT NULL,
  "tenantId"         TEXT             NOT NULL,
  "materialId"       TEXT             NOT NULL,
  "testId"           TEXT             NOT NULL,
  "value"            DOUBLE PRECISION NOT NULL,
  "z"                DOUBLE PRECISION NOT NULL,
  "targetMean"       DOUBLE PRECISION NOT NULL,
  "targetSd"         DOUBLE PRECISION NOT NULL,
  "outcome"          "QcOutcome"      NOT NULL,
  "violations"       TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
  "correctiveAction" TEXT,
  "runAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "performedById"    TEXT             NOT NULL,
  "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "qc_runs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "qc_runs"
  ADD CONSTRAINT "qc_runs_target_sd_positive" CHECK ("targetSd" > 0);

-- An accepted run has nothing to have violated. Catches an evaluator that
-- records rules without acting on them.
ALTER TABLE "qc_runs"
  ADD CONSTRAINT "qc_runs_accepted_has_no_violations"
  CHECK ("outcome" <> 'ACCEPTED' OR cardinality("violations") = 0);

-- A rejection has to say which rule rejected it, or the record explains
-- nothing to the person who has to act on it.
ALTER TABLE "qc_runs"
  ADD CONSTRAINT "qc_runs_rejected_names_a_rule"
  CHECK ("outcome" <> 'REJECTED' OR cardinality("violations") > 0);

CREATE INDEX "qc_runs_tenantId_testId_runAt_idx"
  ON "qc_runs"("tenantId", "testId", "runAt");
CREATE INDEX "qc_runs_tenantId_materialId_testId_runAt_idx"
  ON "qc_runs"("tenantId", "materialId", "testId", "runAt");
CREATE INDEX "qc_runs_tenantId_outcome_runAt_idx"
  ON "qc_runs"("tenantId", "outcome", "runAt");

-- RESTRICT: deleting a control material must not erase the record of the
-- runs performed with it.
ALTER TABLE "qc_runs"
  ADD CONSTRAINT "qc_runs_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "qc_materials"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── tenant isolation ──────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qc_materials', 'qc_targets', 'qc_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "qc_materials" TO cliniq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "qc_targets" TO cliniq_app;

-- A QC run is evidence that the analytical process was or was not in control
-- when patient samples were run. UPDATE stays so corrective action can be
-- recorded against a rejection; DELETE does not.
GRANT SELECT, INSERT, UPDATE ON "qc_runs" TO cliniq_app;
REVOKE DELETE ON "qc_runs" FROM cliniq_app;
