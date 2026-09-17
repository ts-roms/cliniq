-- Phase 2.1 — Manufacturing phase tracker. Each row is a phase entry
-- on a LabCase; the row with `exitedAt IS NULL` is the current phase.
--
-- Visibility inherits from the parent case (lab and clinic both read).
-- Writes are lab-only — enforced in service code, not RLS, since the
-- column doesn't carry a "who wrote it" tenant claim. RLS still gates
-- access to existence/reads to the two sides.

CREATE TABLE "lab_case_phase_events" (
  "id"              TEXT         NOT NULL,
  "caseId"          TEXT         NOT NULL,
  "phase"           TEXT         NOT NULL,
  "enteredAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enteredByUserId" TEXT         NOT NULL,
  "exitedAt"        TIMESTAMP(3),
  "notes"           TEXT,

  CONSTRAINT "lab_case_phase_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lab_case_phase_events_case_fkey"
    FOREIGN KEY ("caseId")
    REFERENCES "lab_cases" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lab_case_phase_events_case_entered_idx"
  ON "lab_case_phase_events" ("caseId", "enteredAt");

-- Partial unique index — one OPEN phase per case at any time. Closed
-- phases (exitedAt set) are unconstrained.
CREATE UNIQUE INDEX "lab_case_phase_events_open_per_case_uniq"
  ON "lab_case_phase_events" ("caseId")
  WHERE "exitedAt" IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE "lab_case_phase_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_case_phase_events" FORCE  ROW LEVEL SECURITY;

CREATE POLICY lab_case_phase_events_via_case ON "lab_case_phase_events"
  FOR ALL TO cliniq_app
  USING (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_case_phase_events"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "lab_cases" c
      WHERE c."id" = "lab_case_phase_events"."caseId"
        AND (c."labTenantId" = current_tenant_id() OR c."clinicTenantId" = current_tenant_id())
    )
  );

CREATE POLICY lab_case_phase_events_platform_all ON "lab_case_phase_events"
  FOR ALL TO cliniq_app
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());
