-- Signed laboratory reports.
--
-- Verified results had nowhere to go. There was no report, no signature and
-- no PDF, so a laboratory could release a result and still issue nothing a
-- patient or a referring doctor could hold. Invoices and prescriptions both
-- had a signed artifact; the laboratory did not.
--
-- The hard part is not producing the document. It is keeping it honest after
-- results change: a report signed on Tuesday asserts what the results said on
-- Tuesday, and if one is corrected on Wednesday the report is not merely out
-- of date — it is a signed document stating something untrue, with nothing in
-- the row to reveal it. Hence contentHash.

CREATE TYPE "LabReportStatus" AS ENUM ('ISSUED', 'SUPERSEDED');

CREATE TABLE "lab_reports" (
  "id"           TEXT              NOT NULL,
  "tenantId"     TEXT              NOT NULL,
  "orderId"      TEXT              NOT NULL,
  "patientId"    TEXT              NOT NULL,
  "number"       TEXT              NOT NULL,
  "version"      INTEGER           NOT NULL DEFAULT 1,
  "status"       "LabReportStatus" NOT NULL DEFAULT 'ISSUED',
  "contentHash"  TEXT              NOT NULL,
  "issuedAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedById"   TEXT              NOT NULL,
  "supersedesId" TEXT,
  CONSTRAINT "lab_reports_pkey" PRIMARY KEY ("id")
);

-- A SHA-256 hex digest, or the integrity check is meaningless.
ALTER TABLE "lab_reports"
  ADD CONSTRAINT "lab_reports_content_hash_shape"
  CHECK ("contentHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "lab_reports"
  ADD CONSTRAINT "lab_reports_version_positive" CHECK ("version" >= 1);

-- A report cannot supersede itself.
ALTER TABLE "lab_reports"
  ADD CONSTRAINT "lab_reports_no_self_supersede"
  CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id");

CREATE UNIQUE INDEX "lab_reports_tenantId_number_key"
  ON "lab_reports"("tenantId", "number");
-- One report may be superseded by at most one successor, so the chain cannot
-- fork into two "current" reports.
CREATE UNIQUE INDEX "lab_reports_supersedesId_key"
  ON "lab_reports"("supersedesId");
CREATE UNIQUE INDEX "lab_reports_tenantId_orderId_version_key"
  ON "lab_reports"("tenantId", "orderId", "version");
CREATE INDEX "lab_reports_tenantId_patientId_issuedAt_idx"
  ON "lab_reports"("tenantId", "patientId", "issuedAt");

ALTER TABLE "lab_reports"
  ADD CONSTRAINT "lab_reports_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "lab_orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lab_reports"
  ADD CONSTRAINT "lab_reports_supersedesId_fkey"
  FOREIGN KEY ("supersedesId") REFERENCES "lab_reports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── signatures ────────────────────────────────────────────────
CREATE TABLE "lab_report_signatures" (
  "id"            TEXT         NOT NULL,
  "tenantId"      TEXT         NOT NULL,
  "reportId"      TEXT         NOT NULL,
  "signerId"      TEXT         NOT NULL,
  "signerRole"    "Role"       NOT NULL,
  "signerName"    TEXT         NOT NULL,
  "signerLicense" TEXT,
  "contentHash"   TEXT         NOT NULL,
  "signedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lab_report_signatures_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lab_report_signatures"
  ADD CONSTRAINT "lab_report_signatures_content_hash_shape"
  CHECK ("contentHash" ~ '^[0-9a-f]{64}$');

-- Signing twice is a no-op, not a second endorsement.
CREATE UNIQUE INDEX "lab_report_signatures_tenantId_reportId_signerId_key"
  ON "lab_report_signatures"("tenantId", "reportId", "signerId");
CREATE INDEX "lab_report_signatures_tenantId_reportId_signedAt_idx"
  ON "lab_report_signatures"("tenantId", "reportId", "signedAt");

ALTER TABLE "lab_report_signatures"
  ADD CONSTRAINT "lab_report_signatures_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "lab_reports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── tenant isolation ──────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_reports', 'lab_report_signatures'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON "lab_reports" TO cliniq_app;
-- UPDATE stays: superseding a report flips its status. DELETE does not — an
-- issued report may be in someone's hands and cannot be unissued.
REVOKE DELETE ON "lab_reports" FROM cliniq_app;

-- A signature is a record of who put their licence to what. Neither editable
-- nor erasable; withdrawing an endorsement means superseding the report.
--
-- REVOKE, not a narrow GRANT — the schema-wide ALTER DEFAULT PRIVILEGES in
-- 20260501000001_rls_policies already granted all four. See 20260924090100.
REVOKE UPDATE, DELETE ON "lab_report_signatures" FROM cliniq_app;
