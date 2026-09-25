-- Reference intervals that know who the patient is. Gap analysis 6.5.
--
-- The reference interval lived as two nullable floats on the order item,
-- copied from whatever the orderer typed. It had no age, sex, or
-- effective-date dimension, which means a paediatric haemoglobin and an adult
-- male haemoglobin were flagged against the same numbers -- a 11 g/dL in a
-- two-year-old is normal and in an adult man is anaemia, and the software
-- could not tell the difference.
--
-- Keyed on `testKey`, the same normalised match key `critical_value_rules`
-- uses, NOT on a TestComponent id as the gap analysis sketched. Two reasons:
-- an order item may have no catalogue link at all (ad-hoc orders, and
-- referred-in results transcribed from another laboratory), and having the two
-- kinds of configured limit matched by different join keys would mean a result
-- could find its critical limits and miss its reference interval. The
-- selection logic is shared for the same reason -- see `NarrowedRule` in
-- apps/api/src/labs/flagging.ts.
--
-- Deliberately NOT modelled, though the sketch lists them: `condition`
-- (PREGNANT_T1, FASTING), `methodId` and `equipmentId`. Nothing supplies any
-- of those at result-entry time, so such a row could never be selected. A
-- configured interval that silently never applies is more dangerous than an
-- absent column, because the laboratory believes it is covered.

CREATE TABLE "reference_ranges" (
  "id"       TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,

  -- Normalised by normaliseTestKey(), exactly as critical_value_rules is.
  "testKey" TEXT NOT NULL,
  -- What staff see on the configuration screen, e.g. "Haemoglobin (female)".
  "label"   TEXT NOT NULL,
  "unit"    TEXT,

  -- Optional demographic narrowing. Null on all three = applies to any
  -- patient. ageMinDays is inclusive, ageMaxDays exclusive. Days, not years,
  -- because neonatal intervals change week to week.
  "ageMinDays" INTEGER,
  "ageMaxDays" INTEGER,
  "sex"        "Sex",

  "lowerLimit" DOUBLE PRECISION,
  "upperLimit" DOUBLE PRECISION,
  -- The interval as it reads for a result that is not a number: "Negative",
  -- "<1:40". Stored so the configuration and the report can show it; flagging
  -- does not consume it, because deriveFlag() is numeric-only by design (see
  -- the SCOPE note in flagging.ts).
  "textualRange" TEXT,

  "note" TEXT,

  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo"   TIMESTAMP(3),

  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "deletedAt"   TIMESTAMP(3),

  CONSTRAINT "reference_ranges_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reference_ranges"
  ADD CONSTRAINT "reference_ranges_test_key_present"
  CHECK (length(btrim("testKey")) > 0);

-- A row with no interval of any kind narrows nothing and can never flag
-- anything. It would sit on the configuration screen looking like coverage.
ALTER TABLE "reference_ranges"
  ADD CONSTRAINT "reference_ranges_has_an_interval"
  CHECK ("lowerLimit" IS NOT NULL OR "upperLimit" IS NOT NULL OR "textualRange" IS NOT NULL);

-- An inverted interval flags every result in range and nothing out of it.
ALTER TABLE "reference_ranges"
  ADD CONSTRAINT "reference_ranges_limits_ordered"
  CHECK ("lowerLimit" IS NULL OR "upperLimit" IS NULL OR "lowerLimit" <= "upperLimit");

ALTER TABLE "reference_ranges"
  ADD CONSTRAINT "reference_ranges_age_band_ordered"
  CHECK ("ageMinDays" IS NULL OR "ageMaxDays" IS NULL OR "ageMinDays" < "ageMaxDays");

ALTER TABLE "reference_ranges"
  ADD CONSTRAINT "reference_ranges_age_nonnegative"
  CHECK (("ageMinDays" IS NULL OR "ageMinDays" >= 0) AND ("ageMaxDays" IS NULL OR "ageMaxDays" > 0));

ALTER TABLE "reference_ranges"
  ADD CONSTRAINT "reference_ranges_window_ordered"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

-- The lookup resolveFlag() performs on every numeric result.
CREATE INDEX "reference_ranges_tenantId_testKey_effectiveFrom_idx"
  ON "reference_ranges"("tenantId", "testKey", "effectiveFrom");

-- Tenant isolation ---------------------------------------------
ALTER TABLE "reference_ranges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reference_ranges" FORCE ROW LEVEL SECURITY;
CREATE POLICY "reference_ranges_isolation" ON "reference_ranges"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- A reference range is the explanation for how a result was flagged, so it is
-- retired by closing its window and setting deletedAt, never removed. UPDATE
-- stays for that; DELETE does not.
GRANT SELECT, INSERT, UPDATE ON "reference_ranges" TO cliniq_app;
REVOKE DELETE ON "reference_ranges" FROM cliniq_app;

-- Which configured interval a result was judged against ---------
--
-- The resolved interval is written onto `lab_order_items.referenceLow/High`,
-- because the report prints the interval beside the value and must not drift
-- when the configuration is later revised. But those are the same two columns
-- an orderer fills in when transcribing a referred-in report, and once written
-- the two are indistinguishable -- so a result re-entered after a
-- mis-configured interval was fixed would silently keep the wrong one, and a
-- correction would be judged against a stale interval.
--
-- This column is what tells them apart: set means "we resolved this from
-- configuration and may resolve it again", null means "this came with the
-- order and is not ours to overwrite". It also answers "which configured
-- interval produced this flag", which is what a clinician asks.
ALTER TABLE "lab_order_items"
  ADD COLUMN "referenceRangeId" TEXT;

-- RESTRICT, matching equipmentId and reagentLotId: the link from a result to
-- the interval that judged it is the reason the column exists.
ALTER TABLE "lab_order_items"
  ADD CONSTRAINT "lab_order_items_referenceRangeId_fkey"
  FOREIGN KEY ("referenceRangeId") REFERENCES "reference_ranges"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "lab_order_items_tenantId_referenceRangeId_idx"
  ON "lab_order_items"("tenantId", "referenceRangeId");
