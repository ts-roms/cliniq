-- Backfills two columns that the Prisma schema declared but no earlier
-- migration ever issued the DDL for: `joinedAt` and `patientId`. Both
-- existed in dev DBs only (via `prisma db push`), never tracked.
-- Production never had them, so AuthService.register and the patient
-- self-registration flow both failed with "column does not exist".
--
-- ADD COLUMN IF NOT EXISTS makes everything idempotent: safe on dev DBs
-- that already have these columns AND on prod that doesn't.

-- ── joinedAt ────────────────────────────────────────────────
ALTER TABLE "tenant_users"
  ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- For environments that DID have the column but allowed NULL, normalize:
UPDATE "tenant_users"
SET "joinedAt" = COALESCE("joinedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "joinedAt" IS NULL;

ALTER TABLE "tenant_users" ALTER COLUMN "joinedAt" SET NOT NULL;
ALTER TABLE "tenant_users" ALTER COLUMN "joinedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- ── patientId ───────────────────────────────────────────────
-- For PATIENT-role memberships, links the portal account to its Patient.
ALTER TABLE "tenant_users"
  ADD COLUMN IF NOT EXISTS "patientId" TEXT;

-- Foreign key — only added if it doesn't exist yet. Postgres has no
-- IF NOT EXISTS for constraints, so we wrap in a DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_users_patientId_fkey'
  ) THEN
    ALTER TABLE "tenant_users"
      ADD CONSTRAINT "tenant_users_patientId_fkey"
      FOREIGN KEY ("patientId")
      REFERENCES "patients" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Unique on (tenantId, patientId) — Postgres treats NULLs as distinct, so
-- multiple staff rows with NULL patientId for the same tenant are fine.
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_users_tenantId_patientId_key"
  ON "tenant_users" ("tenantId", "patientId");
