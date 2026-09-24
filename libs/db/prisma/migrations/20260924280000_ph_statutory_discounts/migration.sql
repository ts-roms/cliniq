-- Philippine statutory discounts: RA 9994 (senior citizens) and RA 10754 (PWD).
--
-- Billing had one `discountCentavos` column and nothing else. A clinic that
-- bills a senior citizen has a legal obligation to give 20% and exempt the
-- sale from VAT, to show the VAT-exempt sale and the discount separately on
-- the invoice, and to record the ID number presented. None of that could be
-- expressed, so every clinic using CLINIQ was either doing it by hand in the
-- notes field or not at all.
--
-- The arithmetic is in apps/api/src/billing/ph-statutory.ts with its
-- reasoning; the short version is that VAT comes off BEFORE the 20%, because
-- that determines the deductible amount even though both orderings collect
-- the same money.

CREATE TYPE "EntitlementType" AS ENUM ('SENIOR_CITIZEN', 'PWD');

CREATE TABLE "patient_entitlements" (
  "id"           TEXT              NOT NULL,
  "tenantId"     TEXT              NOT NULL,
  "patientId"    TEXT              NOT NULL,
  "type"         "EntitlementType" NOT NULL,
  "idNumber"     TEXT              NOT NULL,
  "validFrom"    TIMESTAMP(3),
  "validUntil"   TIMESTAMP(3),
  "verifiedAt"   TIMESTAMP(3),
  "verifiedById" TEXT,
  "createdAt"    TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)      NOT NULL,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "patient_entitlements_pkey" PRIMARY KEY ("id")
);

-- An ID number is what substantiates the claim. Blank is not a claim.
ALTER TABLE "patient_entitlements"
  ADD CONSTRAINT "patient_entitlements_id_number_present"
  CHECK (length(btrim("idNumber")) > 0);

ALTER TABLE "patient_entitlements"
  ADD CONSTRAINT "patient_entitlements_valid_window"
  CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validUntil" >= "validFrom");

-- One live entitlement of each type per patient: a replacement ID updates the
-- row rather than accumulating duplicates that disagree about the number.
CREATE UNIQUE INDEX "patient_entitlements_tenantId_patientId_type_key"
  ON "patient_entitlements"("tenantId", "patientId", "type");
CREATE INDEX "patient_entitlements_tenantId_patientId_idx"
  ON "patient_entitlements"("tenantId", "patientId");

ALTER TABLE "patient_entitlements"
  ADD CONSTRAINT "patient_entitlements_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── what an entitlement is worth ──────────────────────────────
CREATE TABLE "discount_rules" (
  "id"            TEXT              NOT NULL,
  "tenantId"      TEXT              NOT NULL,
  "type"          "EntitlementType" NOT NULL,
  "percent"       INTEGER           NOT NULL,
  "vatExempt"     BOOLEAN           NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)      NOT NULL,
  CONSTRAINT "discount_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "discount_rules"
  ADD CONSTRAINT "discount_rules_percent_range"
  CHECK ("percent" >= 0 AND "percent" <= 100);

ALTER TABLE "discount_rules"
  ADD CONSTRAINT "discount_rules_effective_window"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

CREATE INDEX "discount_rules_tenantId_type_effectiveFrom_idx"
  ON "discount_rules"("tenantId", "type", "effectiveFrom");

-- No rows are seeded. A tenant with no rule configured gets the statutory
-- default from PH_DEFAULT_RULES, so a clinic that never touches this still
-- complies with the law — and seeding would make the defaults look like a
-- choice someone made rather than what the statute says.

-- ── the invoice records what was claimed ──────────────────────
ALTER TABLE "invoices"
  ADD COLUMN "entitlementId"             TEXT,
  ADD COLUMN "statutoryIdNumber"         TEXT,
  ADD COLUMN "statutoryDiscountCentavos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "vatExemptSaleCentavos"     INTEGER NOT NULL DEFAULT 0;

-- The statutory part cannot exceed the total discount shown to the patient.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_statutory_within_discount"
  CHECK ("statutoryDiscountCentavos" >= 0
     AND "statutoryDiscountCentavos" <= "discountCentavos");

-- A statutory discount without the ID number that substantiates it is not a
-- claim the BIR would accept.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_statutory_needs_id"
  CHECK ("statutoryDiscountCentavos" = 0
     OR length(btrim(coalesce("statutoryIdNumber", ''))) > 0);

-- ── tenant isolation ──────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_entitlements', 'discount_rules'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "patient_entitlements" TO cliniq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "discount_rules" TO cliniq_app;
