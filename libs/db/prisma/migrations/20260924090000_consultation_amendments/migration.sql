-- Signed consultations become amendable instead of frozen forever.
--
-- `complete` sets lockedAt, and `update` then refuses with
-- "Consultation is locked; create a revision instead" — while no revision
-- mechanism existed anywhere in the codebase. A clinician who signed with the
-- wrong diagnosis or a typo'd dose had no lawful way to correct the record,
-- so the workaround is to never complete a consult, which quietly destroys
-- the lock's value.
--
-- Each row is a COMPLETE snapshot of the note as amended, not a patch, so
-- "the note as of version N" is one row. The original consultation row is
-- never rewritten.

CREATE TABLE "consultation_amendments" (
  "id"             TEXT         NOT NULL,
  "tenantId"       TEXT         NOT NULL,
  "consultationId" TEXT         NOT NULL,
  "version"        INTEGER      NOT NULL,
  "authorId"       TEXT         NOT NULL,
  "authorName"     TEXT,
  "authorLicense"  TEXT,
  "reason"         TEXT         NOT NULL,
  "subjective"     JSONB,
  "objective"      JSONB,
  "assessment"     JSONB,
  "plan"           JSONB,
  "diagnosisCodes" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "signedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consultation_amendments_pkey" PRIMARY KEY ("id")
);

-- An amendment with a blank reason is unreviewable: the whole point of the
-- record is that someone can later ask why the note changed.
ALTER TABLE "consultation_amendments"
  ADD CONSTRAINT "consultation_amendments_reason_not_blank"
  CHECK (length(btrim("reason")) > 0);

ALTER TABLE "consultation_amendments"
  ADD CONSTRAINT "consultation_amendments_version_positive"
  CHECK ("version" > 0);

-- Serialises concurrent amendments: two clinicians correcting the same note
-- at once cannot both claim version N — the loser retries against N+1.
CREATE UNIQUE INDEX "consultation_amendments_consultationId_version_key"
  ON "consultation_amendments"("consultationId", "version");

CREATE INDEX "consultation_amendments_tenantId_consultationId_idx"
  ON "consultation_amendments"("tenantId", "consultationId");

-- CASCADE matches Consultation's other children (suggestions, prescriptions):
-- an amendment has no meaning without the note it amends.
ALTER TABLE "consultation_amendments"
  ADD CONSTRAINT "consultation_amendments_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "consultations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, not CASCADE: deleting a user must never erase the attribution on
-- a clinical record. Users are soft-deleted anyway.
ALTER TABLE "consultation_amendments"
  ADD CONSTRAINT "consultation_amendments_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Standard tenant isolation, in the same migration that creates the table.
ALTER TABLE "consultation_amendments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consultation_amendments" FORCE ROW LEVEL SECURITY;
CREATE POLICY consultation_amendments_isolation ON "consultation_amendments"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- No UPDATE and no DELETE: an amendment is itself part of the record. A
-- mistaken amendment is corrected by adding the next version, exactly as a
-- mistaken note is. Same reasoning as the append-only audit_logs grant.
GRANT SELECT, INSERT ON "consultation_amendments" TO cliniq_app;
