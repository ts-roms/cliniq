-- Patient consents + AI budget

-- ── patient_consents ──────────────────────────────────────
CREATE TYPE "ConsentType" AS ENUM (
  'TREATMENT',
  'AI_PROCESSING',
  'REMINDERS',
  'MARKETING',
  'RESEARCH'
);

CREATE TABLE "patient_consents" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "patientId"        TEXT NOT NULL,
    "type"             "ConsentType" NOT NULL,
    "granted"          BOOLEAN NOT NULL,
    "version"          TEXT NOT NULL DEFAULT 'v1',
    "acceptedAt"       TIMESTAMP(3),
    "withdrawnAt"      TIMESTAMP(3),
    "withdrawalReason" TEXT,
    "recordedBy"       TEXT,
    "ip"               TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_consents_tenantId_patientId_type_key"
  ON "patient_consents"("tenantId", "patientId", "type");

CREATE INDEX "patient_consents_tenantId_patientId_idx"
  ON "patient_consents"("tenantId", "patientId");

ALTER TABLE "patient_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY patient_consents_isolation ON "patient_consents"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "patient_consents" TO cliniq_app;

-- ── ai_budgets ────────────────────────────────────────────
CREATE TABLE "ai_budgets" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "monthYear"      TEXT NOT NULL,
    "budgetCentavos" INTEGER NOT NULL,
    "spentCentavos"  INTEGER NOT NULL DEFAULT 0,
    "alertsSent"     INTEGER NOT NULL DEFAULT 0,
    "hardStopped"    BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_budgets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_budgets_tenantId_monthYear_key"
  ON "ai_budgets"("tenantId", "monthYear");

CREATE INDEX "ai_budgets_tenantId_idx" ON "ai_budgets"("tenantId");

ALTER TABLE "ai_budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_budgets" FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_budgets_isolation ON "ai_budgets"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_budgets" TO cliniq_app;
