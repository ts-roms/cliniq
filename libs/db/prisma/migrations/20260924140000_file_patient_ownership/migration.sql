-- Give every file an owner, so a download can be authorized.
--
-- FilesService implemented presign (PUT) and confirm, and nothing else: there
-- was no download route at all, so uploaded PHI was effectively write-only
-- through the API. That hid a modelling gap — `files` had no patientId, so the
-- only question answerable about a file was "is it in your tenant?".
--
-- Tenant scope is not enough for a download. Staff may see any patient in
-- their clinic, but a portal account may see exactly one, and with no owner
-- column there was nothing to compare against. Adding the route without this
-- column would have shipped the patient-portal BOLA of #30 a second time, in
-- a place where the payload is a PDF.
--
-- Nullable on purpose, and NOT backfilled:
--   * not every file has a patient (clinic logo, clinician signature image)
--   * ownership of rows written before this cannot be inferred after the
--     fact, and guessing it would be worse than leaving it null
--
-- A null patientId is therefore staff-only by construction: a portal caller
-- compares its own patient id against the column and can never match null.

ALTER TABLE "files" ADD COLUMN "patientId"      TEXT;
ALTER TABLE "files" ADD COLUMN "consultationId" TEXT;

-- The download check reads (tenant, patient); a portal "my documents"
-- listing would read the same index.
CREATE INDEX "files_tenantId_patientId_createdAt_idx"
  ON "files"("tenantId", "patientId", "createdAt");

-- SET NULL, not CASCADE: erasing a patient under a data-subject request must
-- not silently destroy the record that a file existed. The DSR erase path
-- owns that decision explicitly.
ALTER TABLE "files"
  ADD CONSTRAINT "files_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "files"
  ADD CONSTRAINT "files_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "consultations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
