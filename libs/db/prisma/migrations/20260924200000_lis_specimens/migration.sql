-- Specimens, accession numbers and rejections.
--
-- A lab order carried three nullable timestamps (collectedAt / receivedAt /
-- reportedAt) and nothing else. No collector, no container, no volume, no
-- rejection, and no way to tell one tube from another when an order needed
-- two. The accession number is the specimen's identity for the rest of its
-- life — it goes on the label, the worklist and the report, and it is what
-- makes "which tube produced this result" answerable.

CREATE TYPE "SpecimenStatus" AS ENUM (
  'ORDERED', 'COLLECTED', 'RECEIVED', 'PROCESSING',
  'COMPLETED', 'REJECTED', 'CANCELLED', 'REFERRED'
);

-- A closed list rather than free text: rejection rate BY REASON is a quality
-- indicator a laboratory is expected to track and act on, and "other, see
-- note" for everything makes that impossible.
CREATE TYPE "SpecimenRejectionReason" AS ENUM (
  'HEMOLYZED', 'INSUFFICIENT_QUANTITY', 'WRONG_CONTAINER', 'WRONG_SPECIMEN',
  'LEAKING', 'CLOTTED', 'IMPROPER_TRANSPORT', 'UNLABELED', 'MISLABELED',
  'DELAYED', 'OTHER'
);

-- ── gap-free, race-free numbering ─────────────────────────────
-- The old nextOrderNumber did count-then-format inside a transaction:
--
--     SELECT count(*) ... WHERE number LIKE 'LAB-202609%'
--     -> LAB-202609-<count + 1>
--
-- At READ COMMITTED two concurrent callers read the same count and format the
-- same number; the unique index then fails one insert and it surfaces as a
-- 500. Accessions are allocated far more often than order slips and would hit
-- this routinely.
--
-- Allocation is now a single atomic INSERT ... ON CONFLICT DO UPDATE ...
-- RETURNING, so concurrent callers serialise on the row instead of racing.
CREATE TABLE "document_sequences" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "kind"      TEXT         NOT NULL,
  "period"    TEXT         NOT NULL,
  "nextValue" INTEGER      NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_sequences_tenantId_kind_period_key"
  ON "document_sequences"("tenantId", "kind", "period");

-- ── specimens ─────────────────────────────────────────────────
CREATE TABLE "specimens" (
  "id"              TEXT             NOT NULL,
  "tenantId"        TEXT             NOT NULL,
  "accessionNumber" TEXT             NOT NULL,
  "orderId"         TEXT             NOT NULL,
  "patientId"       TEXT             NOT NULL,
  "specimenType"    TEXT,
  "container"       TEXT,
  "volumeMl"        DOUBLE PRECISION,
  "collectedAt"     TIMESTAMP(3),
  "collectedById"   TEXT,
  "collectionSite"  TEXT,
  "receivedAt"      TIMESTAMP(3),
  "receivedById"    TEXT,
  "status"          "SpecimenStatus" NOT NULL DEFAULT 'ORDERED',
  "storageLocation" TEXT,
  "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "specimens_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "specimens"
  ADD CONSTRAINT "specimens_volume_positive"
  CHECK ("volumeMl" IS NULL OR "volumeMl" > 0);

-- A specimen cannot be received before it was collected. Clock skew between
-- a phlebotomy tablet and the lab bench is real, so this catches transposed
-- entries rather than enforcing exact ordering.
ALTER TABLE "specimens"
  ADD CONSTRAINT "specimens_received_after_collected"
  CHECK (
    "receivedAt" IS NULL
    OR "collectedAt" IS NULL
    OR "receivedAt" >= "collectedAt"
  );

-- Being received means having been collected. A RECEIVED row with no
-- collection time is a specimen nobody can account for.
ALTER TABLE "specimens"
  ADD CONSTRAINT "specimens_received_implies_collected"
  CHECK (
    "status" NOT IN ('RECEIVED', 'PROCESSING', 'COMPLETED')
    OR "collectedAt" IS NOT NULL
  );

CREATE UNIQUE INDEX "specimens_tenantId_accessionNumber_key"
  ON "specimens"("tenantId", "accessionNumber");
CREATE INDEX "specimens_tenantId_status_receivedAt_idx"
  ON "specimens"("tenantId", "status", "receivedAt");
CREATE INDEX "specimens_tenantId_orderId_idx"
  ON "specimens"("tenantId", "orderId");
CREATE INDEX "specimens_tenantId_patientId_createdAt_idx"
  ON "specimens"("tenantId", "patientId", "createdAt");

ALTER TABLE "specimens"
  ADD CONSTRAINT "specimens_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "lab_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── rejections ────────────────────────────────────────────────
CREATE TABLE "specimen_rejections" (
  "id"           TEXT                      NOT NULL,
  "tenantId"     TEXT                      NOT NULL,
  "specimenId"   TEXT                      NOT NULL,
  "reason"       "SpecimenRejectionReason" NOT NULL,
  "remarks"      TEXT,
  "rejectedById" TEXT                      NOT NULL,
  "rejectedAt"   TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "specimen_rejections_pkey" PRIMARY KEY ("id")
);

-- OTHER without an explanation is not a reason.
ALTER TABLE "specimen_rejections"
  ADD CONSTRAINT "specimen_rejections_other_needs_remarks"
  CHECK ("reason" <> 'OTHER' OR length(btrim(coalesce("remarks", ''))) > 0);

CREATE INDEX "specimen_rejections_tenantId_specimenId_idx"
  ON "specimen_rejections"("tenantId", "specimenId");
-- The quality indicator: rejections by reason over time.
CREATE INDEX "specimen_rejections_tenantId_reason_rejectedAt_idx"
  ON "specimen_rejections"("tenantId", "reason", "rejectedAt");

ALTER TABLE "specimen_rejections"
  ADD CONSTRAINT "specimen_rejections_specimenId_fkey"
  FOREIGN KEY ("specimenId") REFERENCES "specimens"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── link order items to the tube they run from ────────────────
ALTER TABLE "lab_order_items" ADD COLUMN "specimenId" TEXT;

CREATE INDEX "lab_order_items_tenantId_specimenId_idx"
  ON "lab_order_items"("tenantId", "specimenId");

-- SET NULL: a cancelled specimen must not take the ordered tests with it —
-- they get re-collected onto a new one.
ALTER TABLE "lab_order_items"
  ADD CONSTRAINT "lab_order_items_specimenId_fkey"
  FOREIGN KEY ("specimenId") REFERENCES "specimens"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── tenant isolation, in the migration that creates the tables ─
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['specimens', 'specimen_rejections', 'document_sequences'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "specimens" TO cliniq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "document_sequences" TO cliniq_app;

-- No UPDATE, no DELETE on rejections: a rejection is a record of what happened
-- to a patient's sample. A tube rejected twice has two rows; a mistaken
-- rejection is explained by the next attempt, not erased.
--
-- REVOKE, not a narrow GRANT — the schema-wide ALTER DEFAULT PRIVILEGES in
-- 20260501000001_rls_policies already granted all four. See 20260924090100.
REVOKE UPDATE, DELETE ON "specimen_rejections" FROM cliniq_app;
