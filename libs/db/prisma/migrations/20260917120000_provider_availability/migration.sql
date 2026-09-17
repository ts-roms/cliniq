-- Provider availability rules (docs/audit-checklist.md P1, plan wk 6).
--
--   provider_availability — weekly recurring ranges ("HH:mm" in the tenant
--                           timezone); several per weekday = breaks
--   provider_time_off     — dated blocks that override the weekly rules
--
-- Both are tenant-scoped with the standard isolation policy. The overlap
-- and slot maths live in apps/api/src/availability.

CREATE TABLE "provider_availability" (
  "id"          TEXT         NOT NULL,
  "tenantId"    TEXT         NOT NULL,
  "providerId"  TEXT         NOT NULL,
  "weekday"     INTEGER      NOT NULL,
  "startTime"   TEXT         NOT NULL,
  "endTime"     TEXT         NOT NULL,
  "slotMinutes" INTEGER      NOT NULL DEFAULT 30,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_availability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_availability_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "provider_availability_slot_check" CHECK ("slotMinutes" BETWEEN 5 AND 480)
);

CREATE INDEX "provider_availability_tenantId_providerId_weekday_idx"
  ON "provider_availability"("tenantId", "providerId", "weekday");

ALTER TABLE "provider_availability"
  ADD CONSTRAINT "provider_availability_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provider_availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_availability" FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_availability_isolation ON "provider_availability"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE TABLE "provider_time_off" (
  "id"              TEXT         NOT NULL,
  "tenantId"        TEXT         NOT NULL,
  "providerId"      TEXT         NOT NULL,
  "startsAt"        TIMESTAMP(3) NOT NULL,
  "endsAt"          TIMESTAMP(3) NOT NULL,
  "reason"          TEXT,
  "createdByUserId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "provider_time_off_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_time_off_range_check" CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "provider_time_off_tenantId_providerId_startsAt_idx"
  ON "provider_time_off"("tenantId", "providerId", "startsAt");

ALTER TABLE "provider_time_off"
  ADD CONSTRAINT "provider_time_off_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provider_time_off" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_time_off" FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_time_off_isolation ON "provider_time_off"
  FOR ALL TO cliniq_app
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- A clinic must be able to save its own settings (operating hours are the
-- availability fallback). Only `tenants_self_read` + the platform bypass
-- existed, so PATCH /tenants/me/settings matched zero rows under cliniq_app.
CREATE POLICY tenants_self_update ON "tenants"
  FOR UPDATE TO cliniq_app
  USING ("id" = current_tenant_id())
  WITH CHECK ("id" = current_tenant_id());
