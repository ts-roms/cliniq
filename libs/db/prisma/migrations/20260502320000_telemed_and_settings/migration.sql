-- Telemedicine + clinic settings.
-- Telemed: 1:1 doctor↔patient WebRTC sessions, signaling relayed via short-poll
-- HTTP. Patient joins via one-shot joinToken (no portal account required).
-- Settings: free-form JSON on the tenant for branding + operating hours.

-- ── tenants.settings JSON column ──
ALTER TABLE "tenants" ADD COLUMN "settings" JSONB;

-- ── enums ──
CREATE TYPE "TeleSessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "TeleSignalKind"    AS ENUM ('OFFER', 'ANSWER', 'ICE', 'JOIN', 'LEAVE', 'CHAT');
CREATE TYPE "TeleRole"          AS ENUM ('DOCTOR', 'PATIENT');

-- ── tele_sessions ──
CREATE TABLE "tele_sessions" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "appointmentId"  TEXT,
    "consultationId" TEXT,
    "patientId"      TEXT NOT NULL,
    "providerId"     TEXT NOT NULL,
    "joinToken"      TEXT NOT NULL,
    "patientToken"   TEXT NOT NULL,
    "status"         "TeleSessionStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt"      TIMESTAMP(3),
    "endedAt"        TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tele_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tele_sessions_tenantId_joinToken_key" ON "tele_sessions"("tenantId", "joinToken");
CREATE INDEX "tele_sessions_tenantId_status_idx" ON "tele_sessions"("tenantId", "status");
CREATE INDEX "tele_sessions_tenantId_providerId_idx" ON "tele_sessions"("tenantId", "providerId");
ALTER TABLE "tele_sessions"
  ADD CONSTRAINT "tele_sessions_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tele_sessions"
  ADD CONSTRAINT "tele_sessions_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── tele_signals ──
CREATE TABLE "tele_signals" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq"       INTEGER NOT NULL,
    "fromRole"  "TeleRole" NOT NULL,
    "kind"      "TeleSignalKind" NOT NULL,
    "payload"   JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tele_signals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tele_signals_sessionId_seq_key" ON "tele_signals"("sessionId", "seq");
CREATE INDEX "tele_signals_sessionId_createdAt_idx" ON "tele_signals"("sessionId", "createdAt");
ALTER TABLE "tele_signals"
  ADD CONSTRAINT "tele_signals_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "tele_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS + grants ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tele_sessions', 'tele_signals'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO cliniq_app', t);
  END LOOP;
END $$;
