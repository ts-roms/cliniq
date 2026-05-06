-- Aligns the schema declaration with the existing DB state. The column
-- has been NOT NULL since the original tenants migration; the Prisma
-- schema previously declared it as `DateTime?` which caused
-- AuthService/TenantsService to occasionally pass NULL and fail at insert.
-- The DDL below is effectively a no-op when the column is already NOT NULL,
-- but we issue it for symmetry on any environment that may have drifted.

-- Backfill any rows that somehow ended up NULL (defensive — should be 0).
UPDATE "tenant_users"
SET "joinedAt" = COALESCE("joinedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "joinedAt" IS NULL;

ALTER TABLE "tenant_users" ALTER COLUMN "joinedAt" SET NOT NULL;
ALTER TABLE "tenant_users" ALTER COLUMN "joinedAt" SET DEFAULT CURRENT_TIMESTAMP;
