-- Result verification chain.
--
-- `recordResult` wrote the value straight onto lab_order_items and set
-- reportedAt. Three things followed from that:
--
--   1. A value keyed in by a technologist was indistinguishable from one a
--      qualified person had released to the chart.
--   2. Correcting a result overwrote the previous value, so a clinician who
--      had already acted on it had no way to see what they saw.
--   3. Nobody's name was attached to either act.
--
-- This adds the status, the two identities, and the append-only history.

-- ── laboratory roles ──────────────────────────────────────────
-- Releasing a result is a professional act tied to a licence (RA 5527), and
-- "entered by" vs "verified by" is only meaningful if the two can be
-- different people holding different privileges.
--
-- PG12+ allows ADD VALUE inside a transaction as long as the new value is not
-- USED in the same transaction. Nothing below references them.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MEDICAL_TECHNOLOGIST';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PATHOLOGIST';

-- ── result status ─────────────────────────────────────────────
-- HL7's vocabulary (P/F/C), because that is what a laboratory already reads
-- it as.
CREATE TYPE "LabResultStatus" AS ENUM (
  'PENDING', 'PRELIMINARY', 'FINAL', 'CORRECTED'
);

ALTER TABLE "lab_order_items"
  ADD COLUMN "resultStatus" "LabResultStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "enteredById"  TEXT,
  ADD COLUMN "enteredAt"    TIMESTAMP(3),
  ADD COLUMN "verifiedById" TEXT,
  ADD COLUMN "verifiedAt"   TIMESTAMP(3);

-- Backfill. Every existing result was already visible on the chart under the
-- old behaviour, so calling it anything other than FINAL would retroactively
-- un-report results clinicians have already acted on. `enteredAt` is set from
-- reportedAt where we have it; the two identities stay null because we do not
-- know them and inventing one would be worse than an honest gap.
UPDATE "lab_order_items"
   SET "resultStatus" = 'FINAL',
       "enteredAt"    = COALESCE("reportedAt", "updatedAt")
 WHERE "resultValue" IS NOT NULL AND "resultValue" <> '';

CREATE INDEX "lab_order_items_tenantId_resultStatus_idx"
  ON "lab_order_items"("tenantId", "resultStatus");

-- ── result history ────────────────────────────────────────────
CREATE TABLE "lab_result_versions" (
  "id"           TEXT              NOT NULL,
  "tenantId"     TEXT              NOT NULL,
  "orderItemId"  TEXT              NOT NULL,
  "version"      INTEGER           NOT NULL,
  "resultValue"  TEXT,
  "resultUnit"   TEXT,
  "abnormalFlag" "LabAbnormalFlag",
  "comment"      TEXT,
  "status"       "LabResultStatus" NOT NULL,
  "reason"       TEXT,
  "recordedById" TEXT              NOT NULL,
  "recordedAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lab_result_versions_pkey" PRIMARY KEY ("id")
);

-- A correction with no stated reason is not reviewable. Conversely a reason
-- on a non-correction is noise, so it is refused rather than silently kept.
ALTER TABLE "lab_result_versions"
  ADD CONSTRAINT "lab_result_versions_reason_iff_corrected"
  CHECK (
    ("status" = 'CORRECTED' AND length(btrim(coalesce("reason", ''))) > 0)
    OR ("status" <> 'CORRECTED' AND "reason" IS NULL)
  );

ALTER TABLE "lab_result_versions"
  ADD CONSTRAINT "lab_result_versions_version_positive"
  CHECK ("version" >= 1);

-- The allocator relies on this: two concurrent corrections cannot both claim
-- the same version, because the second insert fails rather than interleaving.
CREATE UNIQUE INDEX "lab_result_versions_tenantId_orderItemId_version_key"
  ON "lab_result_versions"("tenantId", "orderItemId", "version");
CREATE INDEX "lab_result_versions_tenantId_orderItemId_recordedAt_idx"
  ON "lab_result_versions"("tenantId", "orderItemId", "recordedAt");

ALTER TABLE "lab_result_versions"
  ADD CONSTRAINT "lab_result_versions_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "lab_order_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── tenant isolation ──────────────────────────────────────────
ALTER TABLE "lab_result_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_result_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lab_result_versions_isolation" ON "lab_result_versions"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT ON "lab_result_versions" TO cliniq_app;

-- Append-only: the history of what a chart said is not editable. A wrong
-- entry is superseded by the next version, never rewritten.
--
-- REVOKE, not a narrow GRANT — the schema-wide ALTER DEFAULT PRIVILEGES in
-- 20260501000001_rls_policies already granted all four. See 20260924090100.
REVOKE UPDATE, DELETE ON "lab_result_versions" FROM cliniq_app;
