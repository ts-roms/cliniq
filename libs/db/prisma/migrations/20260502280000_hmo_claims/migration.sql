-- HMO claims (PH market). Three-table model: providers (carriers) → memberships
-- (patient cards) → claims (per-invoice submissions). Approved/PARTIAL claims
-- are reconciled into Invoice via a Payment row with method='HMO' so the
-- existing billing flow recomputes paidCentavos + status.

CREATE TYPE "HmoClaimStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIAL', 'DENIED', 'PAID', 'CANCELLED'
);

-- ── hmo_providers ──
CREATE TABLE "hmo_providers" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "payerCode"    TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "active"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hmo_providers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "hmo_providers_tenantId_name_key" ON "hmo_providers"("tenantId", "name");
CREATE INDEX "hmo_providers_tenantId_active_idx" ON "hmo_providers"("tenantId", "active");

-- ── hmo_memberships ──
CREATE TABLE "hmo_memberships" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "patientId"  TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "memberId"   TEXT NOT NULL,
    "validFrom"  TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hmo_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "hmo_memberships_tenantId_patientId_providerId_key"
  ON "hmo_memberships"("tenantId", "patientId", "providerId");
CREATE INDEX "hmo_memberships_tenantId_patientId_idx" ON "hmo_memberships"("tenantId", "patientId");
ALTER TABLE "hmo_memberships"
  ADD CONSTRAINT "hmo_memberships_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hmo_memberships"
  ADD CONSTRAINT "hmo_memberships_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "hmo_providers"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── hmo_claims ──
CREATE TABLE "hmo_claims" (
    "id"                            TEXT NOT NULL,
    "tenantId"                      TEXT NOT NULL,
    "invoiceId"                     TEXT NOT NULL,
    "patientId"                     TEXT NOT NULL,
    "providerId"                    TEXT NOT NULL,
    "membershipId"                  TEXT,
    "number"                        TEXT NOT NULL,
    "status"                        "HmoClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "authNumber"                    TEXT,
    "claimedCentavos"               INTEGER NOT NULL DEFAULT 0,
    "approvedCentavos"              INTEGER NOT NULL DEFAULT 0,
    "patientResponsibilityCentavos" INTEGER NOT NULL DEFAULT 0,
    "denialReason"                  TEXT,
    "notes"                         TEXT,
    "submittedAt"                   TIMESTAMP(3),
    "resolvedAt"                    TIMESTAMP(3),
    "createdById"                   TEXT,
    "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                     TIMESTAMP(3) NOT NULL,
    "deletedAt"                     TIMESTAMP(3),
    CONSTRAINT "hmo_claims_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "hmo_claims_tenantId_number_key" ON "hmo_claims"("tenantId", "number");
CREATE INDEX "hmo_claims_tenantId_status_createdAt_idx" ON "hmo_claims"("tenantId", "status", "createdAt");
CREATE INDEX "hmo_claims_tenantId_invoiceId_idx" ON "hmo_claims"("tenantId", "invoiceId");
CREATE INDEX "hmo_claims_tenantId_patientId_idx" ON "hmo_claims"("tenantId", "patientId");
ALTER TABLE "hmo_claims"
  ADD CONSTRAINT "hmo_claims_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hmo_claims"
  ADD CONSTRAINT "hmo_claims_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hmo_claims"
  ADD CONSTRAINT "hmo_claims_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "hmo_providers"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "hmo_claims"
  ADD CONSTRAINT "hmo_claims_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "hmo_memberships"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RLS + grants ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hmo_providers', 'hmo_memberships', 'hmo_claims'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_isolation ON %I FOR ALL TO cliniq_app USING ("tenantId" = current_tenant_id()) WITH CHECK ("tenantId" = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO cliniq_app', t);
  END LOOP;
END $$;
