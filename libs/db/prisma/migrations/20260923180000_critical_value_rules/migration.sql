-- Critical value limits become configured data instead of arithmetic.
--
-- Until now LabsService derived them from the reference interval:
--
--     criticalHigh = referenceHigh * 1.5
--     criticalLow  = referenceLow  * 0.5
--
-- which under-flags. Serum potassium (reference 3.5–5.1 mmol/L) derived a
-- critical top of 7.65 against a clinically accepted ~6.0, so a potassium of
-- 6.8 was reported as merely HIGH. Limits now come from this table, or from
-- a per-order override on the item, or not at all — never from a formula.

-- ── per-order overrides ───────────────────────────────────────
-- Null means "use the tenant's rule". These exist for the one-off case where
-- a specific order needs different limits (an oncology protocol, a referral
-- lab's own thresholds) without editing the tenant-wide rule.
ALTER TABLE "lab_order_items" ADD COLUMN "criticalLow"  DOUBLE PRECISION;
ALTER TABLE "lab_order_items" ADD COLUMN "criticalHigh" DOUBLE PRECISION;

-- ── configured rules ──────────────────────────────────────────
CREATE TABLE "critical_value_rules" (
  "id"            TEXT         NOT NULL,
  "tenantId"      TEXT         NOT NULL,
  "testKey"       TEXT         NOT NULL,
  "label"         TEXT         NOT NULL,
  "unit"          TEXT,
  "ageMinDays"    INTEGER,
  "ageMaxDays"    INTEGER,
  "sex"           "Sex",
  "criticalLow"   DOUBLE PRECISION,
  "criticalHigh"  DOUBLE PRECISION,
  "note"          TEXT,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo"   TIMESTAMP(3),
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "deletedAt"     TIMESTAMP(3),

  CONSTRAINT "critical_value_rules_pkey" PRIMARY KEY ("id")
);

-- A rule with neither limit set would silently never fire, which is worse
-- than refusing it: staff would believe the analyte is covered when it is not.
ALTER TABLE "critical_value_rules"
  ADD CONSTRAINT "critical_value_rules_has_a_limit"
  CHECK ("criticalLow" IS NOT NULL OR "criticalHigh" IS NOT NULL);

-- An inverted pair (low above high) makes every result critical on one side
-- and is always a typo.
ALTER TABLE "critical_value_rules"
  ADD CONSTRAINT "critical_value_rules_limits_ordered"
  CHECK (
    "criticalLow" IS NULL
    OR "criticalHigh" IS NULL
    OR "criticalLow" < "criticalHigh"
  );

ALTER TABLE "critical_value_rules"
  ADD CONSTRAINT "critical_value_rules_age_band_ordered"
  CHECK (
    "ageMinDays" IS NULL
    OR "ageMaxDays" IS NULL
    OR "ageMinDays" < "ageMaxDays"
  );

ALTER TABLE "critical_value_rules"
  ADD CONSTRAINT "critical_value_rules_age_non_negative"
  CHECK (
    ("ageMinDays" IS NULL OR "ageMinDays" >= 0)
    AND ("ageMaxDays" IS NULL OR "ageMaxDays" > 0)
  );

ALTER TABLE "critical_value_rules"
  ADD CONSTRAINT "critical_value_rules_effective_window_ordered"
  CHECK ("effectiveTo" IS NULL OR "effectiveFrom" < "effectiveTo");

-- Result flagging reads by (tenant, testKey) and filters on the effective
-- window, so this is the lookup index.
CREATE INDEX "critical_value_rules_tenantId_testKey_effectiveFrom_idx"
  ON "critical_value_rules"("tenantId", "testKey", "effectiveFrom");

-- Standard tenant isolation. Every tenant-scoped table gets this in the same
-- migration that creates it — `push_tokens` is the one that did not, and it
-- is the one hole in the model.
ALTER TABLE "critical_value_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "critical_value_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY critical_value_rules_isolation ON "critical_value_rules"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "critical_value_rules" TO cliniq_app;

-- ── existing data ─────────────────────────────────────────────
-- Historical CRITICAL_HIGH / CRITICAL_LOW flags were produced by the derived
-- rule, so they are not trustworthy. They are deliberately LEFT AS THEY ARE:
-- a released result is a clinical record and must not be silently rewritten
-- by a migration. Re-flagging one is a clinical act — record it as a result
-- amendment once that exists. New results flag against configured limits from
-- the moment this lands.
