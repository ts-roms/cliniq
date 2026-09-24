-- Referral laboratories — the lawful route for a test this laboratory may
-- not perform. DOH AO 2021-0037.
--
-- 20260924300000 landed service capability as advice: an out-of-scope test
-- was reported on the order and nothing more, because refusing it with no
-- referral path would leave a clinic unable to order something it is
-- perfectly entitled to send out. This is that path, and with it the
-- refusal becomes defensible — behind a setting the clinic turns on when it
-- has finished declaring its capability and destinations.
--
-- Two rules shape the model:
--   1. Referral is permitted only to a LICENSED laboratory, so the
--      destination's own LTO number is part of the record.
--   2. The report must state which tests were referred and to which
--      laboratory. A referred result that reads as though it were produced
--      in-house misrepresents who is answerable for it.

CREATE TABLE "referral_laboratories" (
  "id"            TEXT         NOT NULL,
  "tenantId"      TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "dohLtoNumber"  TEXT,
  "contactPerson" TEXT,
  "phone"         TEXT,
  "email"         TEXT,
  "address"       TEXT,
  "courier"       TEXT,
  "isActive"      BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "deletedAt"     TIMESTAMP(3),
  CONSTRAINT "referral_laboratories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "referral_laboratories"
  ADD CONSTRAINT "referral_laboratories_name_present"
  CHECK (length(btrim("name")) > 0);

CREATE UNIQUE INDEX "referral_laboratories_tenantId_name_key"
  ON "referral_laboratories"("tenantId", "name");
CREATE INDEX "referral_laboratories_tenantId_isActive_idx"
  ON "referral_laboratories"("tenantId", "isActive");

-- ── the standing send-out arrangement ─────────────────────────
ALTER TABLE "lab_service_capabilities" ADD COLUMN "referralLaboratoryId" TEXT;

ALTER TABLE "lab_service_capabilities"
  ADD CONSTRAINT "lab_service_capabilities_referralLaboratoryId_fkey"
  FOREIGN KEY ("referralLaboratoryId") REFERENCES "referral_laboratories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── one test sent out ─────────────────────────────────────────
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'SENT', 'RECEIVED', 'CANCELLED');

CREATE TABLE "lab_referrals" (
  "id"                   TEXT             NOT NULL,
  "tenantId"             TEXT             NOT NULL,
  "orderItemId"          TEXT             NOT NULL,
  "referralLaboratoryId" TEXT             NOT NULL,
  "status"               "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "externalRef"          TEXT,
  "sentAt"               TIMESTAMP(3),
  "sentById"             TEXT,
  "courier"              TEXT,
  "receivedAt"           TIMESTAMP(3),
  "conditionOnArrival"   TEXT,
  "notes"                TEXT,
  "createdAt"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "lab_referrals_pkey" PRIMARY KEY ("id")
);

-- A specimen cannot arrive before it left.
ALTER TABLE "lab_referrals"
  ADD CONSTRAINT "lab_referrals_received_after_sent"
  CHECK ("receivedAt" IS NULL OR "sentAt" IS NULL OR "receivedAt" >= "sentAt");

-- Being received means having been sent.
ALTER TABLE "lab_referrals"
  ADD CONSTRAINT "lab_referrals_received_implies_sent"
  CHECK ("status" <> 'RECEIVED' OR "sentAt" IS NOT NULL);

-- One live referral per item: the same test at two laboratories would leave
-- two answers to "whose result is this".
CREATE UNIQUE INDEX "lab_referrals_orderItemId_key"
  ON "lab_referrals"("orderItemId");
CREATE INDEX "lab_referrals_tenantId_status_sentAt_idx"
  ON "lab_referrals"("tenantId", "status", "sentAt");
CREATE INDEX "lab_referrals_tenantId_referralLaboratoryId_idx"
  ON "lab_referrals"("tenantId", "referralLaboratoryId");

ALTER TABLE "lab_referrals"
  ADD CONSTRAINT "lab_referrals_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "lab_order_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, not CASCADE: deleting a referral laboratory must not silently
-- erase the record of what was sent there.
ALTER TABLE "lab_referrals"
  ADD CONSTRAINT "lab_referrals_referralLaboratoryId_fkey"
  FOREIGN KEY ("referralLaboratoryId") REFERENCES "referral_laboratories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── tenant isolation ──────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['referral_laboratories', 'lab_referrals'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "referral_laboratories" TO cliniq_app;
GRANT SELECT, INSERT, UPDATE ON "lab_referrals" TO cliniq_app;
-- A referral is a record of a specimen leaving the building. It can be
-- cancelled, which is a status, but not deleted.
REVOKE DELETE ON "lab_referrals" FROM cliniq_app;
