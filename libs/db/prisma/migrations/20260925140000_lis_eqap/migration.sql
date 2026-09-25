-- External Quality Assessment (proficiency testing). DOH AO 2021-0037.
--
-- Internal QC shows an analytical process is stable against its own
-- established mean. It cannot show the mean is right. A laboratory can be
-- beautifully in control around a value that is systematically wrong, and
-- internal QC will say nothing -- every run agrees with every other run.
--
-- EQAP closes that: a provider sends the same unknown specimen to every
-- enrolled laboratory and reports back how far each sat from the peer
-- consensus. It is the only routine check that catches a whole-laboratory
-- bias, and participation is what an inspection asks to see evidence of.
--
-- The evaluation rules are a pure module in apps/api/src/labs/eqap.ts with
-- 24 unit tests, for the same reason the Westgard rules are.

CREATE TABLE "eqap_providers" (
  "id"            TEXT         NOT NULL,
  "tenantId"      TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "contactPerson" TEXT,
  "email"         TEXT,
  "website"       TEXT,
  "isActive"      BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "deletedAt"     TIMESTAMP(3),
  CONSTRAINT "eqap_providers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "eqap_providers"
  ADD CONSTRAINT "eqap_providers_name_present"
  CHECK (length(btrim("name")) > 0);

CREATE UNIQUE INDEX "eqap_providers_tenantId_name_key"
  ON "eqap_providers"("tenantId", "name");
CREATE INDEX "eqap_providers_tenantId_isActive_idx"
  ON "eqap_providers"("tenantId", "isActive");

-- Enrolment ---------------------------------------------------
CREATE TABLE "eqap_enrolments" (
  "id"              TEXT         NOT NULL,
  "tenantId"        TEXT         NOT NULL,
  "providerId"      TEXT         NOT NULL,
  "programme"       TEXT         NOT NULL,
  "enrolmentNumber" TEXT,
  "sectionId"       TEXT,
  "validFrom"       TIMESTAMP(3),
  "validUntil"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "eqap_enrolments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "eqap_enrolments"
  ADD CONSTRAINT "eqap_enrolments_programme_present"
  CHECK (length(btrim("programme")) > 0);

ALTER TABLE "eqap_enrolments"
  ADD CONSTRAINT "eqap_enrolments_validity_window"
  CHECK ("validFrom" IS NULL OR "validUntil" IS NULL OR "validUntil" >= "validFrom");

CREATE UNIQUE INDEX "eqap_enrolments_tenantId_providerId_programme_key"
  ON "eqap_enrolments"("tenantId", "providerId", "programme");
CREATE INDEX "eqap_enrolments_tenantId_validUntil_idx"
  ON "eqap_enrolments"("tenantId", "validUntil");

-- RESTRICT: retiring a provider must not erase the enrolments under it.
ALTER TABLE "eqap_enrolments"
  ADD CONSTRAINT "eqap_enrolments_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "eqap_providers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Survey rounds -----------------------------------------------
CREATE TABLE "eqap_submissions" (
  "id"               TEXT             NOT NULL,
  "tenantId"         TEXT             NOT NULL,
  "enrolmentId"      TEXT             NOT NULL,
  "roundRef"         TEXT             NOT NULL,
  "testId"           TEXT,
  "dueOn"            TIMESTAMP(3),
  "submittedAt"      TIMESTAMP(3),
  "submittedById"    TEXT,
  "reportedValue"    DOUBLE PRECISION,
  "peerMean"         DOUBLE PRECISION,
  "peerSd"           DOUBLE PRECISION,
  "sdi"              DOUBLE PRECISION,
  "reportFileId"     TEXT,
  "correctiveAction" TEXT,
  "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "eqap_submissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "eqap_submissions"
  ADD CONSTRAINT "eqap_submissions_round_present"
  CHECK (length(btrim("roundRef")) > 0);

-- A peer SD of zero makes the SDI infinite and would fail every laboratory
-- in the survey with a number nobody can explain.
ALTER TABLE "eqap_submissions"
  ADD CONSTRAINT "eqap_submissions_peer_sd_positive"
  CHECK ("peerSd" IS NULL OR "peerSd" > 0);

-- A score without a submission is not possible: the provider scores what was
-- sent to it.
ALTER TABLE "eqap_submissions"
  ADD CONSTRAINT "eqap_submissions_scored_implies_submitted"
  CHECK ("sdi" IS NULL OR "submittedAt" IS NOT NULL);

-- One row per round per analyte. NULLs compare distinct in Postgres, so the
-- whole-panel case (testId NULL) needs its own partial index or the same
-- round could be recorded twice.
CREATE UNIQUE INDEX "eqap_submissions_round_test_key"
  ON "eqap_submissions"("tenantId", "enrolmentId", "roundRef", "testId")
  WHERE "testId" IS NOT NULL;
CREATE UNIQUE INDEX "eqap_submissions_round_panel_key"
  ON "eqap_submissions"("tenantId", "enrolmentId", "roundRef")
  WHERE "testId" IS NULL;

CREATE INDEX "eqap_submissions_tenantId_enrolmentId_dueOn_idx"
  ON "eqap_submissions"("tenantId", "enrolmentId", "dueOn");

ALTER TABLE "eqap_submissions"
  ADD CONSTRAINT "eqap_submissions_enrolmentId_fkey"
  FOREIGN KEY ("enrolmentId") REFERENCES "eqap_enrolments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation --------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eqap_providers', 'eqap_enrolments', 'eqap_submissions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "eqap_providers" TO cliniq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "eqap_enrolments" TO cliniq_app;

-- A submission is the evidence of participation an inspection asks for.
-- UPDATE stays so the provider's score and any corrective action can be
-- recorded after the fact; DELETE does not.
GRANT SELECT, INSERT, UPDATE ON "eqap_submissions" TO cliniq_app;
REVOKE DELETE ON "eqap_submissions" FROM cliniq_app;
