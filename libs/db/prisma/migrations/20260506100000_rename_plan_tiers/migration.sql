-- Renames the Plan enum to STARTER/PRO/PREMIUM and remaps existing rows:
--   GOLD       -> STARTER
--   PREMIUM    -> PRO         (old PREMIUM was the mid tier)
--   DIAMOND    -> PREMIUM     (old DIAMOND becomes the new top tier)
--   ENTERPRISE -> PREMIUM     (consolidated; bespoke contracts now flagged via Tenant.settings)
--
-- Postgres can't drop or rename enum values in place once they're referenced,
-- so we use the canonical type-swap pattern: build the new enum, ALTER the
-- column with an explicit CASE remap, then drop the old enum and rename.

-- 1. New enum.
CREATE TYPE "Plan_new" AS ENUM ('STARTER', 'PRO', 'PREMIUM');

-- 2. Drop the existing default so we can swap the column type cleanly.
ALTER TABLE "tenants" ALTER COLUMN "plan" DROP DEFAULT;

-- 3. Migrate the column to the new enum, mapping old values explicitly.
ALTER TABLE "tenants"
  ALTER COLUMN "plan" TYPE "Plan_new" USING (
    CASE "plan"::text
      WHEN 'GOLD'       THEN 'STARTER'::"Plan_new"
      WHEN 'PREMIUM'    THEN 'PRO'::"Plan_new"
      WHEN 'DIAMOND'    THEN 'PREMIUM'::"Plan_new"
      WHEN 'ENTERPRISE' THEN 'PREMIUM'::"Plan_new"
      ELSE 'STARTER'::"Plan_new"
    END
  );

-- 4. Retire the old enum and promote the new one.
DROP TYPE "Plan";
ALTER TYPE "Plan_new" RENAME TO "Plan";

-- 5. Restore the default with the new tier name.
ALTER TABLE "tenants" ALTER COLUMN "plan" SET DEFAULT 'STARTER';
