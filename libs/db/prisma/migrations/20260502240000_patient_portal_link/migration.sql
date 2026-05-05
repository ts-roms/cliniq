-- Patient portal: link a TenantUser (role=PATIENT) to its Patient record so
-- self-scoped /api/me/* endpoints derive the patient context from JWT alone.
--
-- Nullable because non-PATIENT staff rows don't have an associated patient.
-- ON DELETE SET NULL so deleting a patient doesn't cascade-kill the user row.

ALTER TABLE "tenant_users"
  ADD COLUMN "patientId" TEXT;

ALTER TABLE "tenant_users"
  ADD CONSTRAINT "tenant_users_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- One-to-one within a tenant: a Patient can only be tied to a single portal user.
CREATE UNIQUE INDEX "tenant_users_tenantId_patientId_key"
  ON "tenant_users"("tenantId", "patientId")
  WHERE "patientId" IS NOT NULL;
