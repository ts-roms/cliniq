-- Adds the `joinedAt` column to tenant_users. The Prisma schema declared
-- this field for a while but no migration ever issued the DDL — it was
-- created in dev environments via `prisma db push` and never tracked.
-- Production never had the column, so AuthService.register failed with a
-- "column does not exist" error when trying to set it.
--
-- ADD COLUMN IF NOT EXISTS makes this idempotent: safe to run on dev DBs
-- that already have the column AND on production DBs that don't.

ALTER TABLE "tenant_users"
  ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- For environments that DID have the column but allowed NULL, normalize:
-- backfill any nulls with createdAt and lock to NOT NULL.
UPDATE "tenant_users"
SET "joinedAt" = COALESCE("joinedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "joinedAt" IS NULL;

ALTER TABLE "tenant_users" ALTER COLUMN "joinedAt" SET NOT NULL;
ALTER TABLE "tenant_users" ALTER COLUMN "joinedAt" SET DEFAULT CURRENT_TIMESTAMP;
