-- Consultations + AI suggestions

-- CreateEnum
CREATE TYPE "ConsultStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiSuggestionKind" AS ENUM ('SOAP_DRAFT', 'TRIAGE', 'INTERACTION_CHECK', 'DERM_DIFFERENTIAL', 'SUMMARY');

-- CreateEnum
CREATE TYPE "AiSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED_ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "consultations" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "patientId"      TEXT NOT NULL,
    "providerId"     TEXT NOT NULL,
    "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"        TIMESTAMP(3),
    "subjective"     JSONB,
    "objective"      JSONB,
    "assessment"     JSONB,
    "plan"           JSONB,
    "diagnosisCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status"         "ConsultStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "lockedAt"       TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "deletedAt"      TIMESTAMP(3),

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consultations_tenantId_patientId_startedAt_idx"
  ON "consultations"("tenantId", "patientId", "startedAt");

-- CreateIndex
CREATE INDEX "consultations_tenantId_providerId_startedAt_idx"
  ON "consultations"("tenantId", "providerId", "startedAt");

-- AddForeignKey
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "kind"           "AiSuggestionKind" NOT NULL,
    "promptVersion"  TEXT NOT NULL,
    "model"          TEXT NOT NULL,
    "draftJson"      JSONB NOT NULL,
    "status"         "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt"     TIMESTAMP(3),
    "acceptedBy"     TEXT,
    "editDistance"   INTEGER,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_suggestions_tenantId_consultationId_kind_idx"
  ON "ai_suggestions"("tenantId", "consultationId", "kind");

-- AddForeignKey
ALTER TABLE "ai_suggestions"
  ADD CONSTRAINT "ai_suggestions_consultationId_fkey"
  FOREIGN KEY ("consultationId") REFERENCES "consultations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS ──────────────────────────────────────────
ALTER TABLE "consultations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consultations" FORCE ROW LEVEL SECURITY;
CREATE POLICY consultations_isolation ON "consultations"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

ALTER TABLE "ai_suggestions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_suggestions" FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_suggestions_isolation ON "ai_suggestions"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "consultations", "ai_suggestions" TO cliniq_app;
