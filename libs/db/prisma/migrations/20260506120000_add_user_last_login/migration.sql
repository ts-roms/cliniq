-- User.lastLogin: present in schema.prisma since the initial commit but never
-- emitted into a migration (pilot_readiness added the other late User fields
-- but skipped this one). Without the column, every prisma.user.findUnique()
-- fails because Prisma SELECTs all scalars by default.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3);
