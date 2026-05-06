-- Expo push tokens registered by mobile clients. Dedup'd by token globally;
-- one row per (user, deviceId) so a single account can have many devices.

CREATE TABLE "push_tokens" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "deviceId"  TEXT         NOT NULL,
  "token"     TEXT         NOT NULL,
  "platform"  TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsed"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_tokens_token_key"        ON "push_tokens"("token");
CREATE UNIQUE INDEX "push_tokens_userId_deviceId"  ON "push_tokens"("userId","deviceId");
CREATE INDEX        "push_tokens_tenant_user_idx" ON "push_tokens"("tenantId","userId");
