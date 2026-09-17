-- Appointment status machine (docs/audit-checklist.md P0 #2).
--
--   * lifecycle timestamps + cancelReason on appointments
--   * consultations.appointmentId — the consult opened from a booked slot;
--     completing it completes the appointment
--   * provider double-booking is refused at the DB: an exclusion constraint
--     over (providerId, [startsAt, endsAt)) for appointments that are still
--     live (SCHEDULED / CHECKED_IN / IN_PROGRESS, not soft-deleted).
--     btree_gist lets the gist index compare the text providerId with `=`.
--     AppointmentsService checks the same overlap first and returns a
--     friendly 409; this is the belt for the race two receptionists can win
--     at once.

CREATE EXTENSION IF NOT EXISTS "btree_gist";

ALTER TABLE "appointments"
  ADD COLUMN "checkedInAt"             TIMESTAMP(3),
  ADD COLUMN "startedAt"               TIMESTAMP(3),
  ADD COLUMN "completedAt"             TIMESTAMP(3),
  ADD COLUMN "cancelledAt"             TIMESTAMP(3),
  ADD COLUMN "noShowAt"                TIMESTAMP(3),
  ADD COLUMN "cancelReason"            TEXT,
  ADD COLUMN "rescheduledFromStartsAt" TIMESTAMP(3);

ALTER TABLE "consultations"
  ADD COLUMN "appointmentId" TEXT;

CREATE UNIQUE INDEX "consultations_appointmentId_key" ON "consultations"("appointmentId");

ALTER TABLE "consultations"
  ADD CONSTRAINT "consultations_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Provider double-booking guard. tsrange (not tstzrange) because the
-- columns are TIMESTAMP(3) WITHOUT TIME ZONE. Half-open [start, end) so a
-- 09:00-09:30 slot does not collide with 09:30-10:00.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_provider_no_overlap"
  EXCLUDE USING gist (
    "providerId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" IN ('SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS') AND "deletedAt" IS NULL);

-- The reminder + auto-no-show sweeps are system jobs that span tenants.
-- Under cliniq_app the isolation policy hides every row when no tenant GUC
-- is set, so the sweeps ran against an empty table. Give the platform
-- context (SET LOCAL app.platform_admin = '1') read + update here, matching
-- the bypass pattern from 20260506110000_platform_rls_bypass. The
-- `patients` join in the reminder query is already platform-readable.
CREATE POLICY appointments_platform_read ON "appointments"
  FOR SELECT TO cliniq_app
  USING (is_platform_admin());

CREATE POLICY appointments_platform_update ON "appointments"
  FOR UPDATE TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
