-- Platform operators (SaaS-side admins). Separate identity table from `users`
-- for blast-radius isolation, distinct auth surface, no tenant coupling.

CREATE TABLE "platform_admins" (
  "id"             TEXT         NOT NULL,
  "email"          TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "passwordHash"   TEXT         NOT NULL,
  "mfaEnabled"     BOOLEAN      NOT NULL DEFAULT false,
  "mfaSecret"      TEXT,
  "mfaBackupCodes" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lastLogin"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),

  CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");
CREATE INDEX "platform_admins_email_idx"        ON "platform_admins"("email");
