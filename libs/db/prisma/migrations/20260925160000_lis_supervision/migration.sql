-- Pathologist supervision of released results. RA 5527.
--
-- The Philippine Medical Technology Act requires a medical technologist to
-- practise under the supervision of a pathologist, or of a DOH-authorized
-- physician where no pathologist is available. Practising without it is
-- penalised, and it is the technologist who is penalised.
--
-- CLINIQ already had the MEDICAL_TECHNOLOGIST and PATHOLOGIST roles. What it
-- could not express was the relationship between them: a technologist could
-- release a result to the chart and sign the report, and nothing recorded
-- under whose authority. An inspector asking "who supervised this result" had
-- no answer, and neither did the technologist.
--
-- The supervising pathologist is SNAPSHOTTED onto each act rather than read
-- through a relation, for the same reason `Prescription.providerLicense` and
-- `LabReportSignature.signerLicense` are: editing the laboratory profile next
-- year must not retroactively change who supervised a result last year.
--
-- Both tables below are already append-only for the application role (no
-- UPDATE, no DELETE), so once written these columns cannot be revised —
-- which is the property that makes them evidence.
--
-- The rules are a pure module in apps/api/src/labs/supervision.ts with 24
-- unit tests, for the same reason the Westgard rules are.

-- Each release, on the append-only history of the result ------
ALTER TABLE "lab_result_versions"
  ADD COLUMN "supervisorName"    TEXT,
  ADD COLUMN "supervisorLicense" TEXT;

-- A licence with no name attached is not a supervision record, it is a
-- loose string. Nothing can read it and nothing can act on it.
ALTER TABLE "lab_result_versions"
  ADD CONSTRAINT "lab_result_versions_supervisor_named"
  CHECK ("supervisorLicense" IS NULL OR "supervisorName" IS NOT NULL);

-- An empty-string name would satisfy the constraint above while naming
-- nobody, and would print as a blank supervisor on the report.
ALTER TABLE "lab_result_versions"
  ADD CONSTRAINT "lab_result_versions_supervisor_not_blank"
  CHECK ("supervisorName" IS NULL OR length(btrim("supervisorName")) > 0);

-- The question an inspection actually asks is "show me the results released
-- without a supervising pathologist", so it gets an index rather than a
-- sequential scan over every result the laboratory has ever produced. Partial,
-- because in a compliant laboratory almost every row is supervised and
-- indexing those would be dead weight.
CREATE INDEX "lab_result_versions_unsupervised_idx"
  ON "lab_result_versions"("tenantId", "recordedAt")
  WHERE "supervisorName" IS NULL;

-- And on the signed document ----------------------------------
ALTER TABLE "lab_report_signatures"
  ADD COLUMN "supervisorName"    TEXT,
  ADD COLUMN "supervisorLicense" TEXT;

ALTER TABLE "lab_report_signatures"
  ADD CONSTRAINT "lab_report_signatures_supervisor_named"
  CHECK ("supervisorLicense" IS NULL OR "supervisorName" IS NOT NULL);

ALTER TABLE "lab_report_signatures"
  ADD CONSTRAINT "lab_report_signatures_supervisor_not_blank"
  CHECK ("supervisorName" IS NULL OR length(btrim("supervisorName")) > 0);

-- No GRANT or REVOKE here on purpose. Adding a column does not change table
-- privileges, and both tables were already stripped of UPDATE and DELETE by
-- 20260924220000_lis_result_verification and 20260924240000_lis_lab_reports
-- respectively. privilege-coverage.spec.ts asserts that still holds.
